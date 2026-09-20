"""
WebSocket authentication.

Browsers can't set headers on a WebSocket handshake, so the client passes its
DRF token in the query string (?token=...) or as a subprotocol. This middleware
resolves it into scope["user"].
"""
from urllib.parse import parse_qs

from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def get_user_from_token(key):
    from rest_framework.authtoken.models import Token

    try:
        return Token.objects.select_related("user").get(key=key).user
    except Exception:
        return AnonymousUser()


class TokenAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        user = scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            key = None
            query = parse_qs((scope.get("query_string") or b"").decode())
            if query.get("token"):
                key = query["token"][0]
            if not key:
                for header, value in scope.get("headers", []):
                    if header == b"sec-websocket-protocol":
                        parts = [p.strip() for p in value.decode().split(",")]
                        if len(parts) == 2 and parts[0] == "vibe-token":
                            key = parts[1]
            if key:
                scope["user"] = await get_user_from_token(key)
            else:
                scope["user"] = AnonymousUser()
        return await self.inner(scope, receive, send)


def TokenAuthMiddlewareStack(inner):
    return TokenAuthMiddleware(AuthMiddlewareStack(inner))
