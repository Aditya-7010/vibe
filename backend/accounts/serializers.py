import re

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Friendship, User

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,20}$")


class UserSerializer(serializers.ModelSerializer):
    avatarSkin = serializers.IntegerField(source="avatar_skin", required=False)
    likeEffect = serializers.CharField(source="like_effect", required=False)
    emailVerified = serializers.BooleanField(source="email_verified", read_only=True)
    pendingEmail = serializers.CharField(source="pending_email", read_only=True)
    accentColor = serializers.CharField(source="accent_color", required=False)
    fontSize = serializers.CharField(source="font_size", required=False)
    animationsEnabled = serializers.BooleanField(
        source="animations_enabled", required=False
    )
    bubbleChatEnabled = serializers.BooleanField(
        source="bubble_chat_enabled", required=False
    )
    friends = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "avatarSkin",
            "likeEffect",
            "theme",
            "accentColor",
            "fontSize",
            "animationsEnabled",
            "bubbleChatEnabled",
            "emailVerified",
            "pendingEmail",
            "friends",
        ]
        read_only_fields = ["id", "email"]

    def get_friends(self, obj):
        return [str(f.friend_id) for f in obj.friendships.all()]

    def validate_username(self, value):
        value = value.strip()
        if not USERNAME_RE.match(value):
            raise serializers.ValidationError(
                "3-20 characters, letters, numbers, dot, dash or underscore only."
            )
        qs = User.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("That username is already taken.")
        return value

    def validate_avatarSkin(self, value):
        return max(0, min(7, int(value)))

    def validate_theme(self, value):
        return value if value in {"light", "dark", "skeu"} else "dark"


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=6)

    def validate_username(self, value):
        value = value.strip()
        if not USERNAME_RE.match(value):
            raise serializers.ValidationError(
                "3-20 characters, letters, numbers, dot, dash or underscore only."
            )
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is already taken.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("That email is already registered.")
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        import random

        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        user.avatar_skin = random.randint(0, 7)
        user.save(update_fields=["avatar_skin"])
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = attrs["username"].strip()
        # Allow logging in with either the username or the email address.
        lookup = User.objects.filter(username__iexact=identifier).first()
        if lookup is None:
            lookup = User.objects.filter(email__iexact=identifier).first()
        user = None
        if lookup is not None:
            user = authenticate(
                request=self.context.get("request"),
                username=lookup.username,
                password=attrs["password"],
            )
        if user is None:
            raise serializers.ValidationError(
                {"detail": "Wrong username or password."}
            )
        attrs["user"] = user
        return attrs


class ChangeEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        value = value.strip().lower()
        user = self.context["request"].user
        if User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("That email is already registered.")
        return value

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Wrong password.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=6)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Wrong password.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Wrong password.")
        return value


class PublicUserSerializer(serializers.ModelSerializer):
    avatarSkin = serializers.IntegerField(source="avatar_skin")
    isFriend = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "avatarSkin", "isFriend"]

    def get_isFriend(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        return Friendship.objects.filter(user=request.user, friend=obj).exists()
