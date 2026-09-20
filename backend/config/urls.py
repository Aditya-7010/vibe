from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.generic import TemplateView


def api_root(request):
    return JsonResponse(
        {
            "name": "vibe API",
            "endpoints": ["/api/auth/", "/api/rooms/", "/api/search/", "/ws/rooms/<id>/"],
        }
    )


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api_root),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("rooms.urls")),
]

# If the React build was copied into backend/frontend_dist, serve it from here
# too, so a single service can host the whole app. Otherwise the frontend runs
# separately (Vite in dev, Vercel/Netlify in production) and only hits /api/.
if settings.FRONTEND_DIST.exists():
    urlpatterns += [
        re_path(
            r"^(?!api/|admin/|ws/|static/).*$",
            TemplateView.as_view(template_name="index.html"),
            name="spa",
        ),
    ]
