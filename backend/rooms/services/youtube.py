"""
YouTube search without an API key.

Order of attack:
  1. The official Data API, but only if YOUTUBE_API_KEY happens to be set.
  2. Public Piped instances (JSON, no key, no quota).
  3. Public Invidious instances (JSON, no key, no quota).
  4. Scraping youtube.com/results and reading `ytInitialData`.

Whatever answers first wins and is cached for a few minutes. Playback itself
never needs a key: the browser embeds the normal YouTube IFrame player.
"""

import hashlib
import json
import logging
import re

import requests
from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)

TIMEOUT = 6
CACHE_SECONDS = 300
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "en-US,en;q=0.9",
}


def format_duration(seconds):
    seconds = int(seconds or 0)
    if seconds <= 0:
        return "--:--"
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def parse_duration_text(text):
    """'4:13' or '1:02:03' -> seconds."""
    if not text:
        return 0
    parts = [p for p in str(text).strip().split(":") if p.strip().isdigit()]
    if not parts:
        return 0
    total = 0
    for part in parts:
        total = total * 60 + int(part)
    return total


def thumb(video_id):
    return f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"


def _result(video_id, title, author, seconds):
    return {
        "videoId": video_id,
        "title": (title or "Untitled").strip(),
        "author": (author or "").strip(),
        "thumbnail": thumb(video_id),
        "duration": int(seconds or 0),
        "durationText": format_duration(seconds),
    }


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
def _from_official_api(query, limit):
    key = settings.YOUTUBE_API_KEY
    if not key:
        return []
    response = requests.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": limit,
            "key": key,
        },
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    items = response.json().get("items", [])
    return [
        _result(
            item["id"]["videoId"],
            item["snippet"]["title"],
            item["snippet"].get("channelTitle"),
            0,
        )
        for item in items
        if item.get("id", {}).get("videoId")
    ]


def _from_piped(query, limit):
    results = []
    for base in settings.PIPED_INSTANCES:
        try:
            response = requests.get(
                f"{base.rstrip('/')}/search",
                params={"q": query, "filter": "videos"},
                headers=HEADERS,
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
            items = payload.get("items", payload if isinstance(payload, list) else [])
            for item in items:
                url = item.get("url") or ""
                video_id = url.split("v=")[-1].split("&")[0] if "v=" in url else ""
                if not video_id or item.get("type") not in (None, "stream"):
                    continue
                results.append(
                    _result(
                        video_id,
                        item.get("title"),
                        item.get("uploaderName") or item.get("uploader"),
                        item.get("duration") or 0,
                    )
                )
                if len(results) >= limit:
                    break
            if results:
                return results
        except Exception as exc:  # try the next instance
            log.debug("piped instance %s failed: %s", base, exc)
    return results


def _from_invidious(query, limit):
    for base in settings.INVIDIOUS_INSTANCES:
        try:
            response = requests.get(
                f"{base.rstrip('/')}/api/v1/search",
                params={"q": query, "type": "video"},
                headers=HEADERS,
                timeout=TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json()
            results = [
                _result(
                    item.get("videoId"),
                    item.get("title"),
                    item.get("author"),
                    item.get("lengthSeconds") or 0,
                )
                for item in payload
                if isinstance(item, dict) and item.get("videoId")
            ]
            if results:
                return results[:limit]
        except Exception as exc:
            log.debug("invidious instance %s failed: %s", base, exc)
    return []


def _walk(node, key):
    """Yield every value stored under `key` anywhere inside a nested structure."""
    if isinstance(node, dict):
        for name, value in node.items():
            if name == key:
                yield value
            else:
                yield from _walk(value, key)
    elif isinstance(node, list):
        for value in node:
            yield from _walk(value, key)


def _text_of(node):
    if not isinstance(node, dict):
        return ""
    if node.get("simpleText"):
        return node["simpleText"]
    runs = node.get("runs") or []
    return "".join(run.get("text", "") for run in runs if isinstance(run, dict))


def _from_scrape(query, limit):
    response = requests.get(
        "https://www.youtube.com/results",
        params={"search_query": query, "sp": "EgIQAQ%3D%3D"},  # videos only
        headers=HEADERS,
        cookies={"CONSENT": "YES+cb", "SOCS": "CAI"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    match = re.search(
        r"(?:var\s+ytInitialData\s*=|window\[[\"']ytInitialData[\"']\]\s*=)\s*(\{.*?\})\s*;\s*</script>",
        response.text,
        re.DOTALL,
    )
    if not match:
        match = re.search(r"ytInitialData\s*=\s*(\{.*?\});", response.text, re.DOTALL)
    if not match:
        return []
    data = json.loads(match.group(1))

    results = []
    for renderer in _walk(data, "videoRenderer"):
        if not isinstance(renderer, dict):
            continue
        video_id = renderer.get("videoId")
        if not video_id:
            continue
        title = _text_of(renderer.get("title"))
        author = _text_of(renderer.get("ownerText")) or _text_of(
            renderer.get("longBylineText")
        )
        length = _text_of(renderer.get("lengthText"))
        results.append(_result(video_id, title, author, parse_duration_text(length)))
        if len(results) >= limit:
            break
    return results


PROVIDERS = [
    ("youtube-api", _from_official_api),
    ("piped", _from_piped),
    ("invidious", _from_invidious),
    ("scrape", _from_scrape),
]


def search(query, limit=10):
    """Return (results, provider_name). Never raises."""
    query = (query or "").strip()
    if not query:
        return [], "none"

    digest = hashlib.sha1(f"{query}|{limit}".encode()).hexdigest()
    cache_key = f"yt:search:{digest}"
    cached = cache.get(cache_key)
    if cached:
        return cached["results"], cached["provider"]

    for name, provider in PROVIDERS:
        try:
            results = provider(query, limit)
        except Exception as exc:
            log.info("youtube provider %s failed: %s", name, exc)
            continue
        results = [r for r in results if r.get("videoId")][:limit]
        if results:
            cache.set(cache_key, {"results": results, "provider": name}, CACHE_SECONDS)
            return results, name
    return [], "none"


VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def extract_video_id(value):
    """Accept a bare id, a watch URL, a youtu.be link or an embed URL."""
    value = (value or "").strip()
    if VIDEO_ID_RE.match(value):
        return value
    match = re.search(r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})", value)
    return match.group(1) if match else ""


def lookup(video_id):
    """Best-effort metadata for a single video (used when adding by link)."""
    video_id = extract_video_id(video_id)
    if not video_id:
        return None
    cache_key = f"yt:video:{video_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    info = _result(video_id, "", "", 0)
    try:
        response = requests.get(
            "https://www.youtube.com/oembed",
            params={
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "format": "json",
            },
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        if response.ok:
            payload = response.json()
            info["title"] = payload.get("title") or info["title"]
            info["author"] = payload.get("author_name") or ""
    except Exception as exc:
        log.debug("oembed lookup failed for %s: %s", video_id, exc)

    if not info["duration"]:
        for base in settings.INVIDIOUS_INSTANCES:
            try:
                response = requests.get(
                    f"{base.rstrip('/')}/api/v1/videos/{video_id}",
                    headers=HEADERS,
                    timeout=TIMEOUT,
                )
                if response.ok:
                    payload = response.json()
                    info["duration"] = int(payload.get("lengthSeconds") or 0)
                    info["title"] = info["title"] or payload.get("title") or ""
                    info["author"] = info["author"] or payload.get("author") or ""
                    break
            except Exception:
                continue
    info["durationText"] = format_duration(info["duration"])
    if not info["title"]:
        info["title"] = f"YouTube video {video_id}"
    cache.set(cache_key, info, 60 * 60)
    return info
