from django.urls import path

from . import views

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    path("username-available/", views.check_username, name="username-available"),
    path("change-email/", views.ChangeEmailView.as_view(), name="change-email"),
    path("resend-verification/", views.ResendVerificationView.as_view(), name="resend"),
    path("verify-email/", views.VerifyEmailView.as_view(), name="verify-email"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("delete-account/", views.DeleteAccountView.as_view(), name="delete-account"),
    path("friends/", views.FriendsView.as_view(), name="friends"),
]
