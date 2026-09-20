# vibe — synced music listening rooms

Drop into a room, walk your avatar around, queue songs from YouTube, and listen
together — everyone hears the exact same second of the exact same song, because
the **server** owns the clock.

- **Backend:** Django 5 + Django REST Framework + Channels (ASGI/WebSockets)
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 + Zustand
- **No API keys required.** YouTube search, YouTube playback and GIF search all
  work with zero keys and zero Redis.

---

## 1. Repository layout

```
vibe/
├── backend/            Django project (ASGI)
│   ├── config/         settings, urls, asgi
│   ├── accounts/       custom User, auth API, WS token auth
│   ├── rooms/          rooms, chat, queue, playback, WebSocket consumer
│   │   └── services/   keyless YouTube search + keyless GIF search
│   ├── requirements.txt
│   ├── build.sh        one-shot build command for Render
│   ├── Procfile        daphne entrypoint
│   └── render.yaml     free-tier deploy blueprint
├── frontend/           React app (Vite)
│   └── src/
│       ├── lib/        api.ts (REST), socket.ts (WS), appearance.ts (themes)
│       ├── pages/      Landing, Auth, Dashboard, Room, Profile, Settings
│       ├── store.ts    Zustand store — all app state + socket event handling
│       └── types.ts
├── README.md
└── DEPLOYMENT.md       free hosting + auto-deploy-on-push
```

---

## 2. Run it locally

### 2.1 Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env               # optional — sane defaults without it

# First run only: generate the migrations, then apply them.
python manage.py makemigrations accounts rooms
python manage.py migrate

python manage.py seed_rooms        # 12 starter rooms (idempotent)
python manage.py createsuperuser   # optional, for /admin

# IMPORTANT: use daphne, not `runserver`, so WebSockets work.
daphne -b 0.0.0.0 -p 8000 config.asgi:application
```

> **Commit the migration files** that `makemigrations` creates
> (`accounts/migrations/0001_initial.py`, `rooms/migrations/0001_initial.py`).
> They are not in the repo because they must be generated against your exact
> Django version.

Backend is now on `http://localhost:8000`:
`/api/…` REST, `/ws/rooms/<room_id>/` WebSocket, `/admin/` Django admin,
`/api/health/` health check.

### 2.2 Frontend

```bash
cd frontend
npm install
cp .env.example .env               # VITE_API_URL=http://localhost:8000
npm run dev
```

Open `http://localhost:5173`, register an account, enter a room. Open a second
browser (or an incognito window) with a second account to see the sync,
bubble chat and avatar movement in action.

---

## 3. Environment variables (backend)

Everything has a working default, so you can run with no `.env` at all.

| Variable | Default | What it does |
|---|---|---|
| `SECRET_KEY` | dev key | Set a real one in production |
| `DEBUG` | `True` | `False` in production |
| `ALLOWED_HOSTS` | `*` | Comma-separated hostnames |
| `CSRF_TRUSTED_ORIGINS` | – | Comma-separated `https://…` origins |
| `CORS_ALLOWED_ORIGINS` | all in DEBUG | Your frontend origin in production |
| `DATABASE_URL` | SQLite file | Postgres URL when deploying |
| `REDIS_URL` | – | Only needed for **more than one** backend worker |
| `YOUTUBE_API_KEY` | – | Optional; search works without it |
| `TENOR_API_KEY` | – | Optional; GIF search works without it |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | – | Real SMTP; otherwise mail prints to the console |
| `EXPOSE_VERIFY_LINK` | `True` when no SMTP | Returns the verify link in the API response so you can click it |
| `SERVE_FRONTEND` | `False` | Serve `backend/frontend_dist/` as the SPA (single-service deploy) |

---

## 4. How the sync actually works

This is the core of the app, so it's worth spelling out.

1. The server is the single source of truth. Each room has a `Playback` row:
   the current `QueueItem`, `started_at`, `is_playing`, `paused_position` and a
   `revision` counter.
2. `Playback.position()` computes elapsed seconds from `started_at` — it's
   derived from the wall clock, not from anything the clients report.
3. The room's WebSocket consumer runs a **tick loop** every 2.5s. It calls
   `ensure_current()`, which auto-advances to the next queued song when the
   current one runs past its duration (and loops the current song if the queue
   is empty), and it pushes the authoritative clock to every client every ~5s.
4. The browser stores `{ position, receivedAt }` and extrapolates with its own
   clock between pushes (`getPlaybackPosition()` in `store.ts`), so the
   progress bar is smooth rather than jumping every 5 seconds.
5. `Room.tsx` runs a **drift correction loop every 3 seconds**: it compares the
   YouTube IFrame player's `getCurrentTime()` against the extrapolated server
   position and calls `seekTo()` whenever the gap exceeds 1.5s.

That last point is what satisfies "even if I have paused": pausing locally is
not a state the server cares about. The moment you press play again — or even
just leave it alone — the drift loop yanks you back to the server's position.
Nobody can drag the room off-beat. There's also a 🔄 button in the title bar to
force an immediate re-sync.

**Mute vs. pause.** Browsers won't autoplay audio, so the player starts muted
and shows a "Tap to join the audio" overlay. Unmuting never restarts playback —
it just unmutes a stream that was already at the server's position.

---

## 5. No-keys strategy

### YouTube search (`rooms/services/youtube.py`)
A provider chain, tried in order, with a 5-minute cache:

1. Official Data API — **only** if you set `YOUTUBE_API_KEY`.
2. Public **Piped** instances.
3. Public **Invidious** instances.
4. Direct scrape of `youtube.com/results`, parsing the `ytInitialData` JSON blob.

If one provider is down or rate-limited, the next one takes over. Step 4 needs
nothing but an outbound HTTPS connection, so search keeps working even if every
public instance disappears.

### YouTube playback
The **IFrame Player API** never required a key. The frontend loads it once and
drives it programmatically.

### GIFs (`rooms/services/gifs.py`)
Tenor v2 (if you happen to have a key) → Tenor v1 with the public anonymous key
→ Giphy's public beta key → and, as a last resort, the GIF picker lets you paste
any GIF/image URL directly.

### Redis
The Channels layer uses the **in-memory** backend by default, which is correct
and fast for a single worker process — exactly what free hosting gives you. Set
`REDIS_URL` only if you ever scale to more than one worker.

---

## 6. Feature map (against the plan)

| Requirement | Where |
|---|---|
| Login / register | `pages/Auth.tsx`, `accounts/views.py` |
| Landing page | `pages/Landing.tsx` |
| Profile: unique name, avatar, email + verification, delete account | `pages/Profile.tsx`, `/api/auth/username-available/`, `change-email`, `verify-email`, `delete-account` |
| Settings: appearance, light/dark, accent, font size, animations, like effect, bubble toggle | `pages/Settings.tsx`, `lib/appearance.ts` |
| Dashboard: room cards with art + 3-line description + Enter | `pages/Dashboard.tsx` |
| Max 10 active rooms/page, inactive category, numbered pagination | `pages/Dashboard.tsx` (activity from live presence counts) |
| Draggable sidebar with settings + profile | `pages/Dashboard.tsx` |
| Avatar lobby, WASD on desktop, tap-to-walk on mobile | `pages/Room.tsx` |
| Bubble chat, char-limited, 5s, smooth, toggleable | `Room.tsx` + `bubble` WS event + `bubbleChatEnabled` |
| Like effect: happy / surprised / head bop | `expression` WS event, chosen in Settings |
| Bottom bar: like, save, dislike, chat, leave | `Room.tsx`, `SongFeedback` model |
| Video / album swipe view | `Room.tsx` |
| Title bar: song title, mute, sync | `Room.tsx` |
| Add friend by clicking an avatar | `Room.tsx` popup → `/api/auth/friends/` |
| Chat: history, timestamps, avatar face, reactions, edit/delete with owner+admin rights | `Room.tsx`, `rooms/consumers.py` |
| GIF window with search + favorites tabs | `Room.tsx`, `/api/search/gifs/` |
| Queue: live search without pressing enter, add, drag-reorder, delete | `Room.tsx`, `/api/search/youtube/`, `queue_*` WS actions |
| Server-tracked synced playback | `rooms/models.py` `Playback`, `rooms/consumers.py` |
| Dark + light themes | `index.css` tokens + `applyAppearance()` |

---

## 7. API quick reference

**Auth** (`/api/auth/`) — `register`, `login`, `logout`, `me` (GET/PATCH),
`username-available`, `change-email`, `resend-verification`, `verify-email`,
`change-password`, `delete-account`, `friends` (GET/POST/DELETE).
Token auth: send `Authorization: Token <token>`.

**Rooms** (`/api/`) — `rooms/` (GET list, POST create), `rooms/<id>/`
(GET full state, PATCH, DELETE), `rooms/<id>/favorite/`, `rooms/<id>/messages/`,
`rooms/<id>/queue/`, `search/youtube/?q=`, `search/gifs/?q=`, `feedback/`,
`health/`.

**WebSocket** — `ws/rooms/<room_id>/?token=<token>`
Send: `ping`, `sync`, `move`, `expression`, `chat`, `chat_edit`, `chat_delete`,
`reaction`, `queue_add`, `queue_remove`, `queue_reorder`, `playback_skip`,
`playback_seek`.
Receive: `init`, `presence_join`, `presence_leave`, `move`, `expression`,
`chat`, `chat_update`, `bubble`, `queue`, `playback`, `error`, `pong`.

---

## 8. Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** — free hosting on Render + Neon +
Vercel, and the git-push-to-deploy setup so that saving locally updates the
live site.
