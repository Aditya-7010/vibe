from django.core.management.base import BaseCommand

from rooms.models import Playback, Room
from rooms.state import default_room_art

STARTER_ROOMS = [

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
