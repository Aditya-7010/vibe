from django.core.management.base import BaseCommand

from rooms.models import Playback, Room
from rooms.state import default_room_art

STARTER_ROOMS = [
    ("Lofi Chill Zone", "Relax and study with lo-fi beats. No explicit content, just pure vibes and focus music."),
    ("Indie Rock Hangout", "Best indie and alternative rock tracks. Discover hidden gems and classic bangers together."),
    ("Synthwave Dreams", "Neon lights and retrowave beats. 80s inspired electronic music for night owls."),
    ("Hip Hop Cypher", "The latest hip hop, trap and R&B drops. Queue a track and keep the energy high."),
    ("Jazz & Soul Cafe", "Smooth jazz, soul and neo-soul. Perfect for late nights and good conversations."),
    ("EDM Festival", "House, techno, trance and everything in between. Drop the bass and dance."),
    ("Classical & Ambient", "Orchestral masterpieces and ambient soundscapes for deep work or relaxation."),
    ("K-Pop Station", "The hottest K-pop hits and fandom discussions. All fandoms welcome here."),
    ("Metal Pit", "Heavy metal, death metal, black metal. No posers. Just riffs."),
    ("Country Roads", "Country and folk music for the soul. Stories told through song."),
    ("Pop Paradise", "All the chart-toppers and guilty pleasures. Zero judgment zone."),
    ("Reggae Island", "Bob Marley vibes and everything after. Chill, positive, irie."),
]


class Command(BaseCommand):
    help = "Create the starter public rooms (safe to run more than once)."

    def handle(self, *args, **options):
        created = 0
        for name, description in STARTER_ROOMS:
            room, made = Room.objects.get_or_create(
                name=name,
                defaults={
                    "description": description,
                    "art_url": default_room_art(name),
                },
            )
            Playback.objects.get_or_create(room=room)
            created += int(made)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {created} new room(s); {Room.objects.count()} total."
            )
        )
