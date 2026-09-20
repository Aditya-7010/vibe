from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PRESENCE_TIMEOUT_SECONDS, QueueItem, Room, SongFeedback
from .serializers import RoomWriteSerializer
from .services import gifs, youtube
from .state import (
    default_room_art,
    full_room_state,
    get_playback,
    room_queue,
    serialize_message,
    serialize_queue_item,
    serialize_room,
)


def _room_or_none(room_id):
    """Tolerate a missing or malformed room id instead of blowing up."""
    if not room_id:
        return None
    try:
        return Room.objects.filter(pk=room_id).first()
    except (ValueError, ValidationError):
        return None


def _rooms_with_counts():
    cutoff = timezone.now() - timedelta(seconds=PRESENCE_TIMEOUT_SECONDS)
    return Room.objects.select_related("owner").annotate(
        live_count=Count("presences", filter=Q(presences__last_seen__gte=cutoff))
    )


class RoomListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        search = request.query_params.get("q")
        rooms = _rooms_with_counts()
        if search:
            rooms = rooms.filter(
                Q(name__icontains=search) | Q(description__icontains=search)
            )
        rooms = rooms.order_by("-live_count", "-created_at")
        favorites = set(
            str(pk) for pk in request.user.favorite_rooms.values_list("id", flat=True)
        )
        payload = []
        for room in rooms:
            data = serialize_room(room, request.user, member_count=room.live_count)
            data["isFavorite"] = data["id"] in favorites
            payload.append(data)
        return Response({"results": payload, "count": len(payload)})

    def post(self, request):
        serializer = RoomWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        room = serializer.save(owner=request.user)
        if not room.art_url:
            room.art_url = default_room_art(room.name, room.slug)
            room.save(update_fields=["art_url"])
        get_playback(room)
        return Response(
            serialize_room(room, request.user, member_count=0),
            status=status.HTTP_201_CREATED,
        )


class RoomDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_room(self, room_id):
        return Room.objects.select_related("owner").filter(pk=room_id).first()

    def get(self, request, room_id):
        room = self.get_room(room_id)
        if room is None:
            return Response(
                {"detail": "Room not found."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(full_room_state(room, request.user))

    def patch(self, request, room_id):
        room = self.get_room(room_id)
        if room is None:
            return Response(
                {"detail": "Room not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if not room.can_moderate(request.user):
            return Response(
                {"detail": "Only the room owner can edit this."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RoomWriteSerializer(room, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serialize_room(room, request.user))

    def delete(self, request, room_id):
        room = self.get_room(room_id)
        if room is None:
            return Response(
                {"detail": "Room not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if room.owner_id != request.user.id and not request.user.is_staff:
            return Response(
                {"detail": "Only the room owner can delete this."},
                status=status.HTTP_403_FORBIDDEN,
            )
        room.delete()
        return Response({"detail": "Room deleted."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_favorite(request, room_id):
    room = Room.objects.filter(pk=room_id).first()
    if room is None:
        return Response({"detail": "Room not found."}, status=status.HTTP_404_NOT_FOUND)
    if room.favorited_by.filter(pk=request.user.pk).exists():
        room.favorited_by.remove(request.user)
        favorite = False
    else:
        room.favorited_by.add(request.user)
        favorite = True
    return Response({"roomId": str(room.id), "isFavorite": favorite})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def room_messages(request, room_id):
    room = Room.objects.filter(pk=room_id).first()
    if room is None:
        return Response({"detail": "Room not found."}, status=status.HTTP_404_NOT_FOUND)
    limit = min(int(request.query_params.get("limit", 60)), 200)
    messages = list(
        room.messages.order_by("-created_at").prefetch_related("reactions")[:limit]
    )
    messages.reverse()
    return Response(
        {"results": [serialize_message(m, request.user) for m in messages]}
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def room_queue_view(request, room_id):
    room = Room.objects.filter(pk=room_id).first()
    if room is None:
        return Response({"detail": "Room not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        playback = get_playback(room)
        playback.ensure_current()
        return Response({"results": room_queue(room, playback)})

    video_id = youtube.extract_video_id(
        request.data.get("videoId") or request.data.get("url") or ""
    )
    if not video_id:
        return Response(
            {"detail": "Need a YouTube video id or link."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    title = request.data.get("title") or ""
    duration = int(request.data.get("duration") or 0)
    thumbnail = request.data.get("thumbnail") or ""
    if not title or not duration:
        info = youtube.lookup(video_id) or {}
        title = title or info.get("title") or f"YouTube video {video_id}"
        duration = duration or int(info.get("duration") or 0)
        thumbnail = thumbnail or info.get("thumbnail") or ""

    last = room.queue_items.order_by("-position").first()
    item = QueueItem.objects.create(
        room=room,
        video_id=video_id,
        title=title[:200],
        thumbnail=thumbnail,
        duration=duration,
        added_by=request.user,
        added_by_name=request.user.username,
        position=(last.position + 1) if last else 0,
    )
    playback = get_playback(room)
    playback.ensure_current()
    return Response(serialize_queue_item(item), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def search_youtube(request):
    query = request.query_params.get("q", "")
    limit = min(int(request.query_params.get("limit", 10)), 20)
    results, provider = youtube.search(query, limit)
    return Response({"results": results, "provider": provider})


@api_view(["GET"])
@permission_classes([AllowAny])
def search_gifs(request):
    query = request.query_params.get("q", "")
    featured = request.query_params.get("featured") in {"1", "true", "yes"}
    limit = min(int(request.query_params.get("limit", 18)), 30)
    results, provider = gifs.search(query, limit, featured=featured)
    payload = {"results": results, "provider": provider}
    if not results:
        payload["detail"] = (
            "No GIF provider reachable right now — you can still paste a GIF "
            "or image URL straight into the picker."
        )
    return Response(payload)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def song_feedback(request):
    """Like / dislike / save the current track. POST toggles."""
    if request.method == "GET":
        kind = request.query_params.get("kind", "save")
        items = SongFeedback.objects.filter(user=request.user, kind=kind)
        return Response(
            {
                "results": [
                    {
                        "videoId": item.video_id,
                        "title": item.title,
                        "thumbnail": item.thumbnail,
                        "kind": item.kind,
                        "createdAt": int(item.created_at.timestamp() * 1000),
                    }
                    for item in items
                ]
            }
        )

    kind = request.data.get("kind")
    video_id = youtube.extract_video_id(request.data.get("videoId") or "")
    if kind not in {"like", "dislike", "save"} or not video_id:
        return Response(
            {"detail": "Need a videoId and kind of like/dislike/save."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    room = _room_or_none(request.data.get("roomId"))
    existing = SongFeedback.objects.filter(
        user=request.user, video_id=video_id, kind=kind
    ).first()
    if existing:
        existing.delete()
        return Response({"videoId": video_id, "kind": kind, "active": False})

    if kind in {"like", "dislike"}:
        # Liking clears a dislike and vice versa.
        opposite = "dislike" if kind == "like" else "like"
        SongFeedback.objects.filter(
            user=request.user, video_id=video_id, kind=opposite
        ).delete()

    SongFeedback.objects.create(
        user=request.user,
        room=room,
        video_id=video_id,
        title=(request.data.get("title") or "")[:200],
        thumbnail=request.data.get("thumbnail") or "",
        kind=kind,
    )
    return Response({"videoId": video_id, "kind": kind, "active": True})


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok", "time": timezone.now().isoformat()})
