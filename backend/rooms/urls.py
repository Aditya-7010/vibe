from django.urls import path

from . import views

urlpatterns = [
    path("rooms/", views.RoomListView.as_view(), name="room-list"),
    path("rooms/<uuid:room_id>/", views.RoomDetailView.as_view(), name="room-detail"),
    path("rooms/<uuid:room_id>/favorite/", views.toggle_favorite, name="room-favorite"),
    path("rooms/<uuid:room_id>/messages/", views.room_messages, name="room-messages"),
    path("rooms/<uuid:room_id>/queue/", views.room_queue_view, name="room-queue"),
    path("search/youtube/", views.search_youtube, name="search-youtube"),
    path("search/gifs/", views.search_gifs, name="search-gifs"),
    path("feedback/", views.song_feedback, name="song-feedback"),
    path("health/", views.health, name="health"),
]
