import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

# A presence row older than this counts as gone (covers dropped sockets).
PRESENCE_TIMEOUT_SECONDS = 60


class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=80, unique=True, blank=True)
    description = models.TextField(max_length=280, blank=True, default="")
    art_url = models.URLField(max_length=500, blank=True, default="")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_rooms",
    )
    admins = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="admin_rooms"
    )
    favorited_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="favorite_rooms"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "room"
            slug = base
            counter = 2
            while Room.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    # -- helpers ------------------------------------------------------------
    def live_presences(self):
        cutoff = timezone.now() - timedelta(seconds=PRESENCE_TIMEOUT_SECONDS)
        return self.presences.filter(last_seen__gte=cutoff).select_related("user")

    @property
    def member_count(self):
        return self.live_presences().count()

    @property
    def is_active(self):
        return self.member_count > 0

    def can_moderate(self, user):
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or self.owner_id == user.id:
            return True
        return self.admins.filter(pk=user.pk).exists()


class Presence(models.Model):
    """One row per user currently standing in a room's lobby."""

    EXPRESSIONS = [
        ("neutral", "Neutral"),
        ("happy", "Happy"),
        ("surprised", "Surprised"),
        ("bop", "Bop"),
    ]

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="presences")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="presences"
    )
    x = models.FloatField(default=50)
    y = models.FloatField(default=50)
    expression = models.CharField(max_length=12, choices=EXPRESSIONS, default="neutral")
    connections = models.PositiveSmallIntegerField(default=1)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("room", "user")

    def __str__(self):
        return f"{self.user} @ {self.room}"


class DJSlot(models.Model):
    """
    A spot in the room's DJ line.

    The line decides whose personal queue plays next: when a track finishes the
    DJ who just played moves to the back, and the first person further down the
    line who actually has a track queued takes the decks.
    """

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="dj_slots")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="dj_slots"
    )
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("room", "user")
        ordering = ["position", "created_at"]

    def __str__(self):
        return f"{self.user} in line @ {self.room}"


class Message(models.Model):
    KINDS = [("text", "Text"), ("gif", "Gif")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="messages")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="messages",
    )
    author_name = models.CharField(max_length=40, default="")
    author_skin = models.PositiveSmallIntegerField(default=0)
    kind = models.CharField(max_length=8, choices=KINDS, default="text")
    text = models.TextField(max_length=280, blank=True, default="")
    gif_url = models.URLField(max_length=600, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["room", "created_at"])]

    def __str__(self):
        return f"{self.author_name}: {self.text[:24]}"

    def can_edit(self, user):
        return bool(user and user.is_authenticated and self.user_id == user.id)

    def can_delete(self, user):
        return self.can_edit(user) or self.room.can_moderate(user)


class Reaction(models.Model):
    message = models.ForeignKey(
        Message, on_delete=models.CASCADE, related_name="reactions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reactions"
    )
    emoji = models.CharField(max_length=8)

    class Meta:
        unique_together = ("message", "user", "emoji")


class QueueItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="queue_items")
    video_id = models.CharField(max_length=32)
    title = models.CharField(max_length=200)
    thumbnail = models.URLField(max_length=600, blank=True, default="")
    duration = models.PositiveIntegerField(default=0, help_text="seconds")
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="queued_items",
    )
    added_by_name = models.CharField(max_length=40, default="")
    position = models.IntegerField(default=0)
    played = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self):
        return self.title


class Playback(models.Model):
    """
    Server-authoritative playback clock for a room.

    `started_at` is the wall-clock instant the current item was at position 0,
    so every client can compute the same position no matter when it joined or
    whether it paused locally.
    """

    room = models.OneToOneField(
        Room, on_delete=models.CASCADE, related_name="playback", primary_key=True
    )
    item = models.ForeignKey(
        QueueItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    dj = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text="Whose personal queue the current track came from.",
    )
    started_at = models.DateTimeField(default=timezone.now)
    is_playing = models.BooleanField(default=True)
    paused_position = models.FloatField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    revision = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Playback<{self.room.name}>"

    # -- clock --------------------------------------------------------------
    def position(self, now=None):
        if self.item_id is None:
            return 0.0
        if not self.is_playing:
            return max(0.0, self.paused_position)
        now = now or timezone.now()
        return max(0.0, (now - self.started_at).total_seconds())

    def start(self, item, offset=0.0):
        self.item = item
        self.started_at = timezone.now() - timedelta(seconds=offset)
        self.paused_position = offset
        self.is_playing = True
        self.revision += 1

    def pause(self):
        self.paused_position = self.position()
        self.is_playing = False
        self.revision += 1

    def resume(self):
        self.started_at = timezone.now() - timedelta(seconds=self.paused_position)
        self.is_playing = True
        self.revision += 1

    def seek(self, offset):
        offset = max(0.0, float(offset))
        self.paused_position = offset
        self.started_at = timezone.now() - timedelta(seconds=offset)
        self.revision += 1

    # -- queue progression --------------------------------------------------
    def next_item(self):
        """Next track ignoring the DJ line — used when nobody has joined it."""
        return (
            self.room.queue_items.filter(played=False)
            .exclude(pk=self.item_id)
            .order_by("position", "created_at")
            .first()
        )

    def _rotate_line(self, after_user_id):
        """Send the DJ who just played to the back and return the line."""
        slots = list(self.room.dj_slots.select_related("user"))
        slots.sort(key=lambda s: (s.position, s.created_at))
        if after_user_id:
            played = next((s for s in slots if s.user_id == after_user_id), None)
            if played is not None:
                slots = [s for s in slots if s.pk != played.pk] + [played]
        for index, slot in enumerate(slots):
            if slot.position != index:
                slot.position = index
                slot.save(update_fields=["position"])
        return slots

    def pick_next(self, after_user_id=None):
        """
        Choose what plays next.

        With a DJ line, the decks pass to the next person in it who has a
        track queued. With an empty line it's just the room queue in order.
        """
        slots = self._rotate_line(after_user_id)
        for slot in slots:
            item = (
                self.room.queue_items.filter(played=False, added_by_id=slot.user_id)
                .exclude(pk=self.item_id)
                .order_by("position", "created_at")
                .first()
            )
            if item is not None:
                return item, slot.user
        item = self.next_item()
        return (item, item.added_by if item else None)

    def advance(self):
        """Finish the current track and hand over to the next DJ."""
        previous_dj = self.dj_id
        if self.item_id is not None:
            QueueItem.objects.filter(pk=self.item_id).update(played=True)
        item, dj = self.pick_next(after_user_id=previous_dj)
        if item is not None:
            self.dj = dj
            self.start(item, 0)
        elif self.item_id is not None:
            # Nothing queued by anyone: loop the current track so the room
            # is never silent.
            self.start(self.item, 0)
        else:
            self.is_playing = False
            self.revision += 1
        return self.item

    def ensure_current(self):
        """
        Lazily keep the clock honest: pick up a song if idle, and roll over to
        the next one once the current track has run past its duration.
        Returns True when something changed.
        """
        changed = False
        if self.item_id is None:
            item, dj = self.pick_next()
            if item is not None:
                self.dj = dj
                self.start(item, 0)
                changed = True
        elif self.is_playing:
            duration = self.item.duration or 0
            if duration and self.position() >= duration:
                self.advance()
                changed = True
        if changed:
            self.save()
        return changed


class SongFeedback(models.Model):
    KINDS = [("like", "Like"), ("dislike", "Dislike"), ("save", "Save")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="song_feedback"
    )
    room = models.ForeignKey(
        Room, on_delete=models.CASCADE, null=True, blank=True, related_name="feedback"
    )
    video_id = models.CharField(max_length=32)
    title = models.CharField(max_length=200, blank=True, default="")
    thumbnail = models.URLField(max_length=600, blank=True, default="")
    kind = models.CharField(max_length=8, choices=KINDS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "video_id", "kind")
        ordering = ["-created_at"]
