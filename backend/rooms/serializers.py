from rest_framework import serializers

from .models import Room


class RoomWriteSerializer(serializers.ModelSerializer):
    artUrl = serializers.CharField(
        source="art_url", required=False, allow_blank=True, max_length=500
    )

    class Meta:
        model = Room
        fields = ["name", "description", "artUrl"]

    def validate_name(self, value):
        value = " ".join(value.split())
        if len(value) < 3:
            raise serializers.ValidationError("Room name needs at least 3 characters.")
        queryset = Room.objects.filter(name__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A room with that name already exists.")
        return value

    def validate_description(self, value):
        return value.strip()[:280]
