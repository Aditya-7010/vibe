"""
GIF search.

Tenor's public API was permanently shut down by Google on June 30, 2026 —
every key that worked against it, including anonymous demo keys, now
returns errors with no fix available. Giphy is the only provider here now.

Set GIPHY_API_KEY (Render -> Environment) to your own free key from
developers.giphy.com for a much higher rate limit than the shared public
beta key this falls back to. If no provider is reachable, the API returns
an empty list plus a hint, and the UI lets people paste an image/GIF URL
directly instead -- so chat never hard-depends on this working.
"""

import hashlib
import logging

import requests
from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)

TIMEOUT = 10
CACHE_SECONDS = 600
GIPHY_BETA_KEY = "dc6zaTOxFJmzC"  # Giphy's shared public beta key, no signup -- low rate limit

FEATURED_QUERIES = ["music", "dancing", "party", "vibe", "headphones"]


def _item(gif_url, preview_url=None):
    return {"url": gif_url, "preview": preview_url or gif_url}


def _from_giphy(query, limit):
    key = settings.GIPHY_API_KEY or GIPHY_BETA_KEY
    response = requests.get(
        "https://api.giphy.com/v1/gifs/search",
        params={"q": query, "api_key": key, "limit": limit, "rating": "pg"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    results = []
    for item in response.json().get("data", []):
        images = item.get("images", {})
        url = (images.get("downsized") or images.get("original") or {}).get("url")
        preview = (images.get("fixed_height_small") or {}).get("url")
        if url:
            results.append(_item(url, preview))
    return results


PROVIDERS = [
    ("giphy", _from_giphy),
]


def search(query, limit=18, featured=False):
    """Return (results, provider). Never raises."""
    query = (query or "").strip()
    if featured or not query:
        query = FEATURED_QUERIES[0] if not query else query

    digest = hashlib.sha1(f"{query}|{limit}".encode()).hexdigest()
    cache_key = f"gif:{digest}"
    cached = cache.get(cache_key)
    if cached:
        return cached["results"], cached["provider"]

    for name, provider in PROVIDERS:
        try:
            results = provider(query, limit)
        except Exception as exc:
            log.info("gif provider %s failed: %s", name, exc)
            continue
        if results:
            results = results[:limit]
            cache.set(cache_key, {"results": results, "provider": name}, CACHE_SECONDS)
            return results, name
    return [], "none"