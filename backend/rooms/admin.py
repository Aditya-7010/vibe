from django.contrib import admin

from .models import (
    DJSlot,
    Message,
    Playback,
    Presence,
    QueueItem,
    Reaction,
    Room,
    SongFeedback,
)


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "created_at")
    search_fields = ("name", "description")


@admin.register(QueueItem)
class QueueItemAdmin(admin.ModelAdmin):
    list_display = ("title", "room", "added_by_name", "position", "played")
    list_filter = ("played",)


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("author_name", "room", "kind", "created_at", "deleted")
    list_filter = ("kind", "deleted")


admin.site.register([Presence, Reaction, Playback, SongFeedback, DJSlot])
