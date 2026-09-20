import secrets
import uuid

from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models
from django.utils import timezone


class UserManager(DjangoUserManager):
    """Username lookups are case-insensitive so `Sam` and `sam` are one person."""

    def get_by_natural_key(self, username):
        return self.get(username__iexact=username)


class User(AbstractUser):
    LIKE_EFFECTS = [
        ("happy", "Happy"),
        ("surprised", "Surprised"),
        ("bop", "Head bop"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)

    # Appearance / gameplay preferences (mirrors the Settings page)
    avatar_skin = models.PositiveSmallIntegerField(default=0)
    like_effect = models.CharField(max_length=16, choices=LIKE_EFFECTS, default="happy")
    theme = models.CharField(max_length=8, default="dark")
    accent_color = models.CharField(max_length=16, default="purple")
    font_size = models.CharField(max_length=8, default="medium")
    animations_enabled = models.BooleanField(default=True)
    bubble_chat_enabled = models.BooleanField(default=True)

    # Email verification / email change flow
    email_verified = models.BooleanField(default=False)
    pending_email = models.EmailField(blank=True, default="")
    email_token = models.CharField(max_length=64, blank=True, default="")
    email_token_created = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    class Meta:
        db_table = "accounts_user"

    def __str__(self):
        return self.username

    # -- email verification -------------------------------------------------
    def start_email_verification(self, new_email=None):
        """Issue a fresh token; returns it so the caller can build a link."""
        self.pending_email = (new_email or self.email or "").strip().lower()
        self.email_token = secrets.token_urlsafe(32)
        self.email_token_created = timezone.now()
        self.save(
            update_fields=["pending_email", "email_token", "email_token_created"]
        )
        return self.email_token

    def confirm_email(self, token):
        if not self.email_token or not secrets.compare_digest(self.email_token, token):
            return False
        if self.email_token_created and (
            timezone.now() - self.email_token_created
        ).total_seconds() > 60 * 60 * 24 * 3:
            return False
        if self.pending_email:
            self.email = self.pending_email
        self.pending_email = ""
        self.email_token = ""
        self.email_token_created = None
        self.email_verified = True
        self.save(
            update_fields=[
                "email",
                "pending_email",
                "email_token",
                "email_token_created",
                "email_verified",
            ]
        )
        return True

    @property
    def avatar_skin_index(self):
        return self.avatar_skin % 8


class Friendship(models.Model):
    """A one-directional follow; `are_friends` treats a mutual pair as friends."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friendships")
    friend = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="friend_of"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "friend")

    def __str__(self):
        return f"{self.user} -> {self.friend}"
