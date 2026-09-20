"""
GIF search without your own key.

Tries, in order: your Tenor key if you ever add one, Tenor's long-standing
anonymous demo key, then Giphy's public beta key. If every provider is blocked
the API returns an empty list plus a hint, and the UI falls back to letting
people paste an image/GIF URL directly — so chat never hard-depends on a key.
"""

import hashlib
import logging

import requests
from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)

TIMEOUT = 6
CACHE_SECONDS = 600
TENOR_ANON_KEY = "LIVDSRZULELA"  # public demo key, no signup
GIPHY_BETA_KEY = "dc6zaTOxFJmzC"  # public beta key, no signup

FEATURED_QUERIES = ["music", "dancing", "party", "vibe", "headphones"]


def _item(gif_url, preview_url=None):
    return {"url": gif_url, "preview": preview_url or gif_url}


def _from_tenor_v2(query, limit):
    key = settings.TENOR_API_KEY
    if not key:
        return []
    response = requests.get(
        "https://tenor.googleapis.com/v2/search",
        params={
            "q": query,
            "key": key,
            "limit": limit,
            "media_filter": "tinygif,gif",
            "client_key": "vibe",
        },
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    results = []
    for item in response.json().get("results", []):
        media = item.get("media_formats", {})
        url = (media.get("gif") or {}).get("url")
        preview = (media.get("tinygif") or {}).get("url")
        if url:
            results.append(_item(url, preview))
    return results


def _from_tenor_v1(query, limit):
    response = requests.get(
        "https://g.tenor.com/v1/search",
        params={"q": query, "key": TENOR_ANON_KEY, "limit": limit},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    results = []
    for item in response.json().get("results", []):
        media = (item.get("media") or [{}])[0]
        url = (media.get("gif") or {}).get("url")
        preview = (media.get("tinygif") or {}).get("url")
        if url:
            results.append(_item(url, preview))
    return results


def _from_giphy(query, limit):
    response = requests.get(
        "https://api.giphy.com/v1/gifs/search",
        params={"q": query, "api_key": GIPHY_BETA_KEY, "limit": limit, "rating": "pg"},
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
    ("tenor", _from_tenor_v2),
    ("tenor-anon", _from_tenor_v1),
    ("giphy-beta", _from_giphy),
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
