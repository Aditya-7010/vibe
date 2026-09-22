"""
The realtime half of a room.

Every client holds one socket. The server owns the truth for playback: it
stores when the current track started, advances the queue when a track runs
out, and pushes the clock to everyone every few seconds. Clients seek to match
it — which is why pausing locally never desynchronises you from the room.
"""

import asyncio
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import transaction
from django.utils import timezone

from .models import DJSlot, Message, Presence, QueueItem, Reaction, Room
from .services import youtube
from .state import (
    full_room_state,
    get_playback,
    room_djs,
    room_queue,
    serialize_message,
    serialize_playback,
    serialize_presence,
)

log = logging.getLogger(__name__)

TICK_SECONDS = 2.5
CLOCK_PUSH_EVERY = 2  # ticks, so roughly every 5s
MAX_CHAT_LENGTH = 280


class RoomConsumer(AsyncJsonWebsocketConsumer):
    # -- lifecycle ----------------------------------------------------------
    async def connect(self):
        self.user = self.scope.get("user")
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.group_name = f"room_{self.room_id}"
        self.ticker = None

        if not self.user or not self.user.is_authenticated:
            await self.close(code=4401)
            return

        room = await self.get_room()
        if room is None:
            await self.close(code=4404)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        presence = await self.join_presence()
        state = await self.get_state()
        await self.send_json({"type": "init", "payload": state})
        await self.group_broadcast(
            {"type": "presence_join", "payload": presence}, exclude_self=True
        )
        self.ticker = asyncio.create_task(self.tick_loop())

    async def disconnect(self, code):
        if self.ticker:
            self.ticker.cancel()
        if getattr(self, "group_name", None):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if getattr(self, "user", None) and self.user.is_authenticated:
            gone = await self.leave_presence()
            if gone:
                # Walking out of the room also gives up your spot in the line.
                await self.leave_line(str(self.user.id))
                await self.group_broadcast(
                    {
                        "type": "presence_leave",
                        "payload": {"id": str(self.user.id)},
                    }
                )
                await self.group_broadcast(
                    {"type": "djs", "payload": await self.get_djs()}
                )
                # If it was this person's track playing, don't wait for the
                # next tick — stop it (or hand off) right away.
                changed, playback = await self.advance_playback()
                if changed:
                    await self.group_broadcast(
                        {"type": "playback", "payload": playback}
                    )
                    await self.group_broadcast(
                        {"type": "queue", "payload": await self.get_queue()}
                    )

    async def tick_loop(self):
        counter = 0
        try:
            while True:
                await asyncio.sleep(TICK_SECONDS)
                counter += 1
                changed, playback = await self.advance_playback()
                if changed:
                    await self.group_broadcast(
                        {"type": "playback", "payload": playback}
                    )
                    await self.group_broadcast(
                        {"type": "queue", "payload": await self.get_queue()}
                    )
                    await self.group_broadcast(
                        {"type": "djs", "payload": await self.get_djs()}
                    )
                elif counter % CLOCK_PUSH_EVERY == 0:
                    await self.send_json({"type": "playback", "payload": playback})
                if counter % 8 == 0:
                    await self.touch_presence()
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # a dead ticker shouldn't kill the socket
            log.exception("room ticker crashed: %s", exc)

    # -- inbound ------------------------------------------------------------
    async def receive_json(self, content, **kwargs):
        action = content.get("type")
        handler = getattr(self, f"do_{action}", None) if action else None
        if handler is None:
            await self.send_json(
                {"type": "error", "payload": {"detail": f"Unknown action {action!r}"}}
            )
            return
        try:
            await handler(content.get("payload") or {})
        except Exception as exc:
            log.exception("action %s failed: %s", action, exc)
            await self.send_json(
                {"type": "error", "payload": {"detail": "That didn't work."}}
            )

    async def do_ping(self, payload):
        await self.send_json({"type": "pong", "payload": {"t": payload.get("t")}})

    async def do_sync(self, payload):
        _, playback = await self.advance_playback()
        await self.send_json({"type": "playback", "payload": playback})

    async def do_move(self, payload):
        try:
            x = float(payload.get("x", 50))
            y = float(payload.get("y", 50))
        except (TypeError, ValueError):
            return
        x = max(2.0, min(96.0, x))
        y = max(2.0, min(94.0, y))
        await self.set_position(x, y)
        await self.group_broadcast(
            {
                "type": "move",
                "payload": {"id": str(self.user.id), "x": x, "y": y},
            },
            exclude_self=True,
        )

    async def do_expression(self, payload):
        expression = payload.get("expression", "neutral")
        if expression not in {"neutral", "happy", "surprised", "bop"}:
            expression = "neutral"
        await self.set_expression(expression)
        await self.group_broadcast(
            {
                "type": "expression",
                "payload": {"id": str(self.user.id), "expression": expression},
            }
        )

    async def do_chat(self, payload):
        kind = "gif" if payload.get("gifUrl") else "text"
        text = (payload.get("text") or "").strip()[:MAX_CHAT_LENGTH]
        gif_url = (payload.get("gifUrl") or "").strip()[:600]
        if kind == "text" and not text:
            return
        message = await self.create_message(kind, text, gif_url, payload.get("replyTo"))
        await self.group_broadcast({"type": "chat", "payload": message})
        if kind == "text":
            await self.group_broadcast(
                {
                    "type": "bubble",
                    "payload": {
                        "id": str(self.user.id),
                        "text": text[:60],
                        "timestamp": message["timestamp"],
                    },
                }
            )

    async def do_chat_edit(self, payload):
        message = await self.edit_message(payload.get("id"), payload.get("text", ""))
        if message:
            await self.group_broadcast({"type": "chat_update", "payload": message})

    async def do_chat_delete(self, payload):
        message = await self.delete_message(payload.get("id"))
        if message:
            await self.group_broadcast({"type": "chat_update", "payload": message})

    async def do_reaction(self, payload):
        message = await self.toggle_reaction(payload.get("id"), payload.get("emoji"))
        if message:
            await self.group_broadcast({"type": "chat_update", "payload": message})

    async def do_queue_add(self, payload):
        item = await self.add_queue_item(payload)
        if item is None:
            await self.send_json(
                {"type": "error", "payload": {"detail": "Couldn't add that track."}}
            )
            return
        _, playback = await self.advance_playback()
        await self.group_broadcast({"type": "queue", "payload": await self.get_queue()})
        await self.group_broadcast({"type": "djs", "payload": await self.get_djs()})
        await self.group_broadcast({"type": "playback", "payload": playback})

    async def do_queue_remove(self, payload):
        removed = await self.remove_queue_item(payload.get("id"))
        if removed:
            await self.group_broadcast(
                {"type": "queue", "payload": await self.get_queue()}
            )
            await self.group_broadcast({"type": "djs", "payload": await self.get_djs()})

    async def do_queue_reorder(self, payload):
        order = payload.get("order") or []
        await self.reorder_queue(order)
        await self.group_broadcast({"type": "queue", "payload": await self.get_queue()})

    async def do_playback_skip(self, payload):
        playback = await self.skip_track()
        await self.group_broadcast({"type": "playback", "payload": playback})
        await self.group_broadcast({"type": "queue", "payload": await self.get_queue()})
        await self.group_broadcast({"type": "djs", "payload": await self.get_djs()})

    # -- DJ line ------------------------------------------------------------
    async def do_dj_join(self, payload):
        await self.join_line()
        await self.broadcast_line()

    async def do_dj_leave(self, payload):
        await self.leave_line(str(self.user.id))
        await self.broadcast_line()

    async def do_dj_kick(self, payload):
        """Remove somebody from the line — owner and admins only."""
        if not await self.is_moderator():
            await self.send_json(
                {
                    "type": "error",
                    "payload": {"detail": "Only the room owner can manage the line."},
                }
            )
            return
        await self.leave_line(payload.get("userId"))
        await self.broadcast_line()

    async def do_dj_reorder(self, payload):
        """Drag the line into a new order — owner and admins only."""
        if not await self.is_moderator():
            await self.send_json(
                {
                    "type": "error",
                    "payload": {"detail": "Only the room owner can reorder the line."},
                }
            )
            return
        await self.reorder_line(payload.get("order") or [])
        await self.broadcast_line()

    async def broadcast_line(self):
        await self.group_broadcast({"type": "djs", "payload": await self.get_djs()})

    async def do_playback_seek(self, payload):
        """Room-wide seek — moderators only, so nobody can yank the room around."""
        if not await self.is_moderator():
            await self.send_json(
                {
                    "type": "error",
                    "payload": {"detail": "Only the room owner can scrub the track."},
                }
            )
            return
        playback = await self.seek_track(payload.get("position", 0))
        await self.group_broadcast({"type": "playback", "payload": playback})

    # -- group plumbing -----------------------------------------------------
    async def group_broadcast(self, message, exclude_self=False):
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "room.event",
                "message": message,
                "sender": self.channel_name if exclude_self else None,
            },
        )

    async def room_event(self, event):
        if event.get("sender") and event["sender"] == self.channel_name:
            return
        await self.send_json(event["message"])

    # -- database helpers ---------------------------------------------------
    @database_sync_to_async
    def get_room(self):
        try:
            return Room.objects.filter(pk=self.room_id).first()
        except Exception:
            return None

    @database_sync_to_async
    def get_state(self):
        room = Room.objects.select_related("owner").get(pk=self.room_id)
        return full_room_state(room, self.user)

    @database_sync_to_async
    def get_queue(self):
        room = Room.objects.get(pk=self.room_id)
        return room_queue(room)

    @database_sync_to_async
    def join_presence(self):
        room = Room.objects.get(pk=self.room_id)
        presence, created = Presence.objects.get_or_create(
            room=room,
            user=self.user,
            defaults={"x": 50, "y": 50, "connections": 1},
        )
        if not created:
            presence.connections += 1
            presence.expression = "neutral"
            presence.save(update_fields=["connections", "expression", "last_seen"])
        presence.user = self.user
        return serialize_presence(presence)

    @database_sync_to_async
    def leave_presence(self):
        presence = Presence.objects.filter(
            room_id=self.room_id, user=self.user
        ).first()
        if presence is None:
            return True
        if presence.connections <= 1:
            presence.delete()
            return True
        presence.connections -= 1
        presence.save(update_fields=["connections", "last_seen"])
        return False

    @database_sync_to_async
    def touch_presence(self):
        Presence.objects.filter(room_id=self.room_id, user=self.user).update(
            last_seen=timezone.now()
        )

    @database_sync_to_async
    def set_position(self, x, y):
        Presence.objects.filter(room_id=self.room_id, user=self.user).update(
            x=x, y=y, last_seen=timezone.now()
        )

    @database_sync_to_async
    def set_expression(self, expression):
        Presence.objects.filter(room_id=self.room_id, user=self.user).update(
            expression=expression, last_seen=timezone.now()
        )

    @database_sync_to_async
    def is_moderator(self):
        room = Room.objects.filter(pk=self.room_id).first()
        return bool(room and room.can_moderate(self.user))

    @database_sync_to_async
    def create_message(self, kind, text, gif_url, reply_to_id=None):
        room = Room.objects.get(pk=self.room_id)
        reply_to = None
        if reply_to_id:
            reply_to = Message.objects.filter(
                pk=reply_to_id, room_id=self.room_id, deleted=False
            ).first()
        message = Message.objects.create(
            room=room,
            user=self.user,
            author_name=self.user.username,
            author_skin=self.user.avatar_skin,
            kind=kind,
            text=text,
            gif_url=gif_url,
            reply_to=reply_to,
        )
        return serialize_message(message, reactions={})

    @database_sync_to_async
    def edit_message(self, message_id, text):
        text = (text or "").strip()[:MAX_CHAT_LENGTH]
        if not text:
            return None
        message = (
            Message.objects.filter(pk=message_id, room_id=self.room_id)
            .select_related("room")
            .first()
        )
        if message is None or message.deleted or not message.can_edit(self.user):
            return None
        message.text = text
        message.edited_at = timezone.now()
        message.save(update_fields=["text", "edited_at"])
        return serialize_message(message)

    @database_sync_to_async
    def delete_message(self, message_id):
        message = (
            Message.objects.filter(pk=message_id, room_id=self.room_id)
            .select_related("room")
            .first()
        )
        if message is None or not message.can_delete(self.user):
            return None
        message.deleted = True
        message.text = ""
        message.gif_url = ""
        message.save(update_fields=["deleted", "text", "gif_url"])
        return serialize_message(message)

    @database_sync_to_async
    def toggle_reaction(self, message_id, emoji):
        emoji = (emoji or "")[:8]
        if not emoji:
            return None
        message = (
            Message.objects.filter(pk=message_id, room_id=self.room_id)
            .select_related("room")
            .first()
        )
        if message is None or message.deleted:
            return None
        existing = Reaction.objects.filter(
            message=message, user=self.user, emoji=emoji
        ).first()
        if existing:
            existing.delete()
        else:
            Reaction.objects.create(message=message, user=self.user, emoji=emoji)
        return serialize_message(message)

    @database_sync_to_async
    def add_queue_item(self, payload):
        video_id = youtube.extract_video_id(
            payload.get("videoId") or payload.get("url") or ""
        )
        if not video_id:
            return None
        title = (payload.get("title") or "").strip()
        duration = int(payload.get("duration") or 0)
        thumbnail = payload.get("thumbnail") or ""
        if not title or not duration:
            info = youtube.lookup(video_id) or {}
            title = title or info.get("title") or f"YouTube video {video_id}"
            duration = duration or int(info.get("duration") or 0)
            thumbnail = thumbnail or info.get("thumbnail") or ""
        room = Room.objects.get(pk=self.room_id)
        last = room.queue_items.order_by("-position").first()
        item = QueueItem.objects.create(
            room=room,
            video_id=video_id,
            title=title[:200],
            thumbnail=thumbnail,
            duration=duration,
            added_by=self.user,
            added_by_name=self.user.username,
            position=(last.position + 1) if last else 0,
        )
        return str(item.id)

    @database_sync_to_async
    def remove_queue_item(self, item_id):
        item = QueueItem.objects.filter(pk=item_id, room_id=self.room_id).first()
        if item is None:
            return False
        room = Room.objects.get(pk=self.room_id)
        if item.added_by_id != self.user.id and not room.can_moderate(self.user):
            return False
        item.delete()
        return True

    @database_sync_to_async
    def reorder_queue(self, order):
        items = {
            str(item.id): item
            for item in QueueItem.objects.filter(room_id=self.room_id, played=False)
        }
        position = 0
        with transaction.atomic():
            for item_id in order:
                item = items.pop(str(item_id), None)
                if item is None:
                    continue
                item.position = position
                item.save(update_fields=["position"])
                position += 1
            for item in items.values():  # anything not mentioned keeps trailing
                item.position = position
                item.save(update_fields=["position"])
                position += 1

    @database_sync_to_async
    def get_djs(self):
        room = Room.objects.get(pk=self.room_id)
        return room_djs(room)

    @database_sync_to_async
    def join_line(self):
        room = Room.objects.get(pk=self.room_id)
        if DJSlot.objects.filter(room=room, user=self.user).exists():
            return
        last = room.dj_slots.order_by("-position").first()
        DJSlot.objects.create(
            room=room, user=self.user, position=(last.position + 1) if last else 0
        )

    @database_sync_to_async
    def leave_line(self, user_id):
        if not user_id:
            return
        DJSlot.objects.filter(room_id=self.room_id, user_id=user_id).delete()

    @database_sync_to_async
    def reorder_line(self, order):
        slots = {
            str(slot.user_id): slot
            for slot in DJSlot.objects.filter(room_id=self.room_id)
        }
        position = 0
        with transaction.atomic():
            for user_id in order:
                slot = slots.pop(str(user_id), None)
                if slot is None:
                    continue
                slot.position = position
                slot.save(update_fields=["position"])
                position += 1
            for slot in slots.values():
                slot.position = position
                slot.save(update_fields=["position"])
                position += 1

    @database_sync_to_async
    def advance_playback(self):
        room = Room.objects.get(pk=self.room_id)
        with transaction.atomic():
            playback = get_playback(room)
            changed = playback.ensure_current()
        return changed, serialize_playback(playback)

    @database_sync_to_async
    def skip_track(self):
        room = Room.objects.get(pk=self.room_id)
        with transaction.atomic():
            playback = get_playback(room)
            playback.advance()
            playback.save()
        return serialize_playback(playback)

    @database_sync_to_async
    def seek_track(self, position):
        room = Room.objects.get(pk=self.room_id)
        with transaction.atomic():
            playback = get_playback(room)
            playback.seek(position)
            playback.save()
        return serialize_playback(playback)
