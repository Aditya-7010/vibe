from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Friendship, User
from .serializers import (
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    DeleteAccountSerializer,
    LoginSerializer,
    PublicUserSerializer,
    RegisterSerializer,
    UserSerializer,
)


def _verify_link(token: str) -> str:
    return f"{settings.FRONTEND_URL}/profile?verify={token}"


def send_verification_email(user) -> str:
    """Issue a token, email the link, and return the link itself."""
    token = user.start_email_verification(user.pending_email or user.email)
    link = _verify_link(token)
    target = user.pending_email or user.email
    try:
        send_mail(
            subject="Verify your vibe email",
            message=(
                f"Hey {user.username},\n\n"
                f"Confirm this email address for your vibe account:\n{link}\n\n"
                "If you didn't ask for this, you can ignore the message."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[target],
            fail_silently=True,
        )
    except Exception:  # never block signup on a mail failure
        pass
    return link


def auth_payload(user, request, extra=None):
    token, _ = Token.objects.get_or_create(user=user)
    data = {
        "token": token.key,
        "user": UserSerializer(user, context={"request": request}).data,
    }
    if extra:
        data.update(extra)
    return data


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        link = send_verification_email(user)
        extra = {"verifyLink": link} if settings.EXPOSE_VERIFY_LINK else None
        return Response(
            auth_payload(user, request, extra), status=status.HTTP_201_CREATED
        )


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response(auth_payload(serializer.validated_data["user"], request))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({"detail": "Logged out."})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            UserSerializer(request.user, context={"request": request}).data
        )

    def patch(self, request):
        serializer = UserSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def check_username(request):
    username = (request.query_params.get("username") or "").strip()
    taken = bool(username) and User.objects.filter(username__iexact=username).exists()
    return Response({"username": username, "available": bool(username) and not taken})


class ChangeEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangeEmailSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.pending_email = serializer.validated_data["email"]
        user.save(update_fields=["pending_email"])
        link = send_verification_email(user)
        payload = {
            "detail": "Check the new address for a verification link.",
            "pendingEmail": user.pending_email,
        }
        if settings.EXPOSE_VERIFY_LINK:
            payload["verifyLink"] = link
        return Response(payload)


class ResendVerificationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        link = send_verification_email(request.user)
        payload = {"detail": "Verification email sent."}
        if settings.EXPOSE_VERIFY_LINK:
            payload["verifyLink"] = link
        return Response(payload)


class VerifyEmailView(APIView):
    """Works with or without the session: the token itself identifies the user."""

    permission_classes = [AllowAny]

    def post(self, request):
        token = (request.data.get("token") or "").strip()
        if not token:
            return Response(
                {"detail": "Missing token."}, status=status.HTTP_400_BAD_REQUEST
            )
        user = User.objects.filter(email_token=token).first()
        if user is None or not user.confirm_email(token):
            return Response(
                {"detail": "That link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "detail": "Email verified.",
                "user": UserSerializer(user, context={"request": request}).data,
            }
        )


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        Token.objects.filter(user=user).delete()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"detail": "Password updated.", "token": token.key})


class DeleteAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DeleteAccountSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        request.user.delete()
        return Response({"detail": "Account deleted."})


class FriendsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        friends = User.objects.filter(friend_of__user=request.user)
        return Response(
            PublicUserSerializer(friends, many=True, context={"request": request}).data
        )

    def post(self, request):
        friend_id = request.data.get("userId")
        if str(friend_id) == str(request.user.id):
            return Response(
                {"detail": "You can't friend yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            friend = User.objects.filter(pk=friend_id).first()
        except (ValueError, ValidationError):
            friend = None
        if friend is None:
            return Response(
                {"detail": "No such user."}, status=status.HTTP_404_NOT_FOUND
            )
        Friendship.objects.get_or_create(user=request.user, friend=friend)
        return Response(
            PublicUserSerializer(friend, context={"request": request}).data
        )

    def delete(self, request):
        friend_id = request.data.get("userId") or request.query_params.get("userId")
        try:
            Friendship.objects.filter(user=request.user, friend_id=friend_id).delete()
        except (ValueError, ValidationError):
            pass
        return Response({"detail": "Removed."})
