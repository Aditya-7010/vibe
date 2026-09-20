from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Friendship, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "email_verified", "avatar_skin", "is_staff")
    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "Vibe profile",
            {
                "fields": (
                    "avatar_skin",
                    "like_effect",
                    "theme",
                    "accent_color",
                    "font_size",
                    "animations_enabled",
                    "bubble_chat_enabled",
                    "email_verified",
                    "pending_email",
                )
            },
        ),
    )


admin.site.register(Friendship)
