"""
One place that turns models into the JSON shapes the React app expects.

Both the REST views and the WebSocket consumer use these, so an object never
looks different depending on which door it came through.
"""

import hashlib
from urllib.parse import quote

from django.utils import timezone

from .models import Message, Playback, Room

PALETTES = [
    ("#7c3aed", "#06b6d4"),
    ("#ec4899", "#f97316"),
    ("#22c55e", "#0ea5e9"),
    ("#eab308", "#ef4444"),
    ("#8b5cf6", "#ec4899"),
    ("#06b6d4", "#22c55e"),
]


def ms(dt):
    return int(dt.timestamp() * 1000) if dt else 0


def now_ms():
    return int(timezone.now().timestamp() * 1000)


def default_room_art(name, seed=""):
    """A deterministic gradient cover as a data URI — no image host required."""
    digest = hashlib.md5(f"{name}{seed}".encode()).hexdigest()
    start, end = PALETTES[int(digest[:2], 16) % len(PALETTES)]
    angle = int(digest[2:4], 16) % 360
    initials = "".join(word[0] for word in name.split()[:2]).upper() or "V"
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='250'>"
        f"<defs><linearGradient id='g' gradientTransform='rotate({angle})'>"
        f"<stop offset='0%' stop-color='{start}'/>"
        f"<stop offset='100%' stop-color='{end}'/></linearGradient></defs>"
        "<rect width='400' height='250' fill='url(#g)'/>"
        "<circle cx='320' cy='60' r='90' fill='rgba(255,255,255,0.10)'/>"
        "<circle cx='70' cy='210' r='70' fill='rgba(0,0,0,0.12)'/>"
        "<text x='34' y='150' font-family='Syne, Outfit, sans-serif' font-size='84' "
        "font-weight='800' fill='rgba(255,255,255,0.85)'>"
        f"{initials}</text></svg>"
    )
    return "data:image/svg+xml;utf8," + quote(svg)


def serialize_room(room: Room, user=None, member_count=None):
    count = room.member_count if member_count is None else member_count
    favorite = False
    if user is not None and getattr(user, "is_authenticated", False):
        favorite = room.favorited_by.filter(pk=user.pk).exists()
    return {
        "id": str(room.id),
        "name": room.name,
        "slug": room.slug,
        "description": room.description,
        "artUrl": room.art_url or default_room_art(room.name, room.slug),
        "isActive": count > 0,
        "memberCount": count,
        "ownerId": str(room.owner_id) if room.owner_id else "",
        "ownerName": room.owner.username if room.owner_id else "vibe",
        "isFavorite": favorite,
        "canModerate": room.can_moderate(user) if user is not None else False,
        "createdAt": ms(room.created_at),
    }


def serialize_presence(presence, current_user_id=None):
    return {
        "id": str(presence.user_id),
        "username": presence.user.username,
        "avatarSkin": presence.user.avatar_skin % 8,
        "x": presence.x,
        "y": presence.y,
        "expression": presence.expression,
        "isCurrentUser": str(presence.user_id) == str(current_user_id),
    }


def serialize_message(message: Message, user=None, reactions=None):
    if reactions is None:
        grouped = {}
        for reaction in message.reactions.all():
            grouped.setdefault(reaction.emoji, []).append(str(reaction.user_id))
    else:
        grouped = reactions
    reply_to = None
    if message.reply_to_id:
        parent = message.reply_to
        reply_to = {
            "id": str(parent.id),
            "username": parent.author_name,
            "text": "message deleted" if parent.deleted else (
                parent.text[:80] if parent.kind == "text" else "GIF"
            ),
            "deleted": parent.deleted,
        }
    return {
        "id": str(message.id),
        "userId": str(message.user_id) if message.user_id else "",
        "username": message.author_name,
        "avatarSkin": message.author_skin % 8,
        "text": "" if message.deleted else message.text,
        "type": message.kind,
        "gifUrl": "" if message.deleted else message.gif_url,
        "timestamp": ms(message.created_at),
        "edited": bool(message.edited_at),
        "deleted": message.deleted,
        "reactions": grouped,
        "replyTo": reply_to,
        "canEdit": message.can_edit(user) and not message.deleted,
        "canDelete": message.can_delete(user) and not message.deleted,
    }


def serialize_queue_item(item):
    from .services.youtube import format_duration

    return {
        "id": str(item.id),
        "videoId": item.video_id,
        "title": item.title,
        "thumbnail": item.thumbnail
        or f"https://i.ytimg.com/vi/{item.video_id}/mqdefault.jpg",
        "duration": item.duration,
        "durationText": format_duration(item.duration),
        "addedBy": item.added_by_name or "someone",
        "addedById": str(item.added_by_id) if item.added_by_id else "",
        "position": item.position,
    }


def serialize_playback(playback: Playback):
    item = playback.item
    return {
        "revision": playback.revision,
        "djId": str(playback.dj_id) if playback.dj_id else "",
        "isPlaying": playback.is_playing,
        "position": round(playback.position(), 3),
        "serverTime": now_ms(),
        "startedAt": ms(playback.started_at),
        "current": serialize_queue_item(item) if item else None,
    }


def serialize_dj(slot, current_dj_id=None, track_count=0):
    return {
        "id": str(slot.user_id),
        "username": slot.user.username,
        "avatarSkin": slot.user.avatar_skin % 8,
        "position": slot.position,
        "trackCount": track_count,
        "isCurrent": str(slot.user_id) == str(current_dj_id or ""),
    }


def room_djs(room: Room, playback: Playback = None):
    """
    The DJ line, in display order, with how many tracks each person has left.

    Display order (not the same as the stored `position`, which is only the
    fair round-robin bookkeeping used to pick who's next):
      1. Whoever's track is currently playing always shows up first.
      2. Everyone else keeps their relative order, except that anyone sitting
         with an empty personal queue sinks to the bottom — they aren't
         holding anything up, so they shouldn't look like they're next.
    """
    playback = playback or get_playback(room)
    slots = list(
        room.dj_slots.select_related("user").order_by("position", "created_at")
    )
    counts = {}
    for item in room.queue_items.filter(played=False).values_list("added_by_id", flat=True):
        counts[item] = counts.get(item, 0) + 1

    current_id = playback.dj_id
    current_slot = None
    rest = []
    for slot in slots:
        if current_id and slot.user_id == current_id:
            current_slot = slot
        else:
            rest.append(slot)
    ready = [s for s in rest if counts.get(s.user_id, 0) > 0]
    empty = [s for s in rest if counts.get(s.user_id, 0) == 0]
    ordered = ([current_slot] if current_slot else []) + ready + empty

    return [
        serialize_dj(slot, playback.dj_id, counts.get(slot.user_id, 0))
        for slot in ordered
    ]


def get_playback(room: Room) -> Playback:
    playback, _ = Playback.objects.get_or_create(room=room)
    return playback


def room_queue(room: Room, playback: Playback = None):
    playback = playback or get_playback(room)
    items = room.queue_items.filter(played=False).order_by("position", "created_at")
    if playback.item_id:
        items = items.exclude(pk=playback.item_id)
    return [serialize_queue_item(item) for item in items]


def full_room_state(room: Room, user=None, message_limit=60):
    playback = get_playback(room)
    playback.ensure_current()
    presences = list(room.live_presences())
    user_id = getattr(user, "id", None)
    messages = list(
        room.messages.order_by("-created_at")
        .select_related("reply_to")
        .prefetch_related("reactions")[:message_limit]
    )
    messages.reverse()
    return {
        "room": serialize_room(room, user, member_count=len(presences)),
        "presences": [serialize_presence(p, user_id) for p in presences],
        "messages": [serialize_message(m, user) for m in messages],
        "queue": room_queue(room, playback),
        "djs": room_djs(room, playback),
        "playback": serialize_playback(playback),
    }
