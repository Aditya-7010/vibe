# Deploying vibe for free (and auto-updating on save)

Total cost: **₹0 / $0**. No credit card needed for any of the three services.

**The stack**

| Piece | Service | Free tier |
|---|---|---|
| Django + WebSockets | **Render** web service | 750 hrs/month, sleeps after 15 min idle |
| Postgres | **Neon** | 0.5 GB, no expiry |
| React frontend | **Vercel** (or Netlify) | Generous hobby tier |

Render's free tier is the one that matters, because it's the rare free host that
supports **long-lived WebSocket connections** — which this app needs. Vercel and
Netlify cannot run the Django side; they're only for the static React build.

---

## Step 0 — Generate migrations and push to GitHub

Do this once, from your machine:

```bash
cd backend
python manage.py makemigrations accounts rooms
cd ..

git init
git add .
git commit -m "vibe: synced music rooms"
git branch -M main
git remote add origin https://github.com/<you>/vibe.git
git push -u origin main
```

Make sure `backend/accounts/migrations/0001_initial.py` and
`backend/rooms/migrations/0001_initial.py` are committed — the deploy will fail
without them.

---

## Step 1 — Database on Neon

1. Sign up at **https://neon.tech** with GitHub.
2. Create a project (any region near you — Singapore/Mumbai if you're in India).
3. Copy the **connection string**. It looks like:
   `postgresql://user:pass@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

Keep it handy. (Render's own free Postgres works too, but it expires after 30
days — Neon's doesn't, which is why we use it.)

---

## Step 2 — Backend on Render

1. Sign up at **https://render.com** with GitHub.
2. **New → Web Service** → connect your repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3
   - **Build Command:** `./build.sh`
   - **Start Command:** `daphne -b 0.0.0.0 -p $PORT config.asgi:application`
   - **Instance Type:** Free
4. Add environment variables:

   | Key | Value |
   |---|---|
   | `SECRET_KEY` | click *Generate* |
   | `DEBUG` | `False` |
   | `ALLOWED_HOSTS` | `vibe-api.onrender.com` (your Render hostname) |
   | `DATABASE_URL` | the Neon string from Step 1 |
   | `PYTHON_VERSION` | `3.12.3` |

   Leave `CORS_ALLOWED_ORIGINS` for now — you'll fill it in after Step 3.
5. **Create Web Service**. The build runs `pip install`, `makemigrations`,
   `migrate`, `collectstatic` and `seed_rooms`, so your rooms exist on first boot.
6. Check `https://<your-service>.onrender.com/api/health/` returns OK.

> The repo also contains `backend/render.yaml`, so you can instead use
> **New → Blueprint** and point it at the repo to get all of the above
> pre-filled. You still add `DATABASE_URL` yourself.

---

## Step 3 — Frontend on Vercel

1. Sign up at **https://vercel.com** with GitHub, **Add New → Project**, pick the repo.
2. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (auto-detected)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Environment variable:
   - `VITE_API_URL` = `https://<your-service>.onrender.com` (no trailing slash)
4. Deploy. You get a URL like `https://vibe-xyz.vercel.app`.

### Step 3b — close the loop on CORS

Back in Render, set these and let it redeploy:

| Key | Value |
|---|---|
| `CORS_ALLOWED_ORIGINS` | `https://vibe-xyz.vercel.app` |
| `CSRF_TRUSTED_ORIGINS` | `https://vibe-xyz.vercel.app` |

That's it — share the Vercel URL with anyone and they can join your rooms.

---

## Step 4 — "Save locally → live site updates"

This is already true once Steps 2 and 3 are done, because both Render and
Vercel watch your GitHub branch. Your loop becomes:

```bash
# edit code…
git add .
git commit -m "tweak the queue panel"
git push
```

Render rebuilds the backend, Vercel rebuilds the frontend. Both take 1–3
minutes. Vercel also posts a preview URL for every branch and pull request.

If you want *literally* save-to-deploy with no commit step, add this
`watch-deploy.sh` at the repo root and run it in a spare terminal:

```bash
#!/usr/bin/env bash
# Requires: fswatch (mac: brew install fswatch | linux: apt install fswatch)
while true; do
  fswatch -1 -r --exclude 'node_modules|\.git|__pycache__|dist' .
  sleep 3
  git add -A && git commit -m "auto: $(date '+%F %T')" && git push
done
```

`chmod +x watch-deploy.sh && ./watch-deploy.sh`. Every save gets committed and
pushed, and both hosts redeploy. Good for a solo demo project; you'd want real
commits for anything you care about the history of.

---

## Step 5 — Things to know about the free tier

- **Cold starts.** A free Render service sleeps after ~15 minutes with no
  traffic and takes 30–60s to wake. The first person to open the site waits;
  everyone after that doesn't. If you're demoing at a specific time, load the
  page a minute before.
- A free **cron-job.org** job hitting `/api/health/` every 10 minutes keeps it
  awake during your demo window. (Don't run it 24/7 — you'd burn the 750 hours.)
- **One worker only.** That's why the Channels layer is in-memory and there's no
  Redis. All WebSocket connections land on the same process, so the room state
  and the playback clock are consistent. If you ever scale past one worker, add
  a `REDIS_URL` (Upstash has a free tier) and uncomment `channels-redis` in
  `requirements.txt` — `settings.py` will switch automatically.
- **Email.** Without `EMAIL_HOST`, verification mail prints to the Render logs
  *and* the verify link is returned in the API response, so the Profile page can
  show you a clickable link. To send real mail, add Gmail SMTP with an app
  password: `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`,
  `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and set `EXPOSE_VERIFY_LINK=False`.

---

## Alternative: one service instead of two

If you'd rather have a single URL and skip Vercel entirely, Django can serve the
built React app:

```bash
cd frontend && npm run build
cp -r dist ../backend/frontend_dist
```

Then set `SERVE_FRONTEND=True` on Render and leave `VITE_API_URL` unset (the
frontend falls back to same-origin). Add the copy step to `backend/build.sh` so
Render does it on every deploy:

```bash
# in build.sh, before collectstatic
cd ../frontend && npm ci && npm run build && cp -r dist ../backend/frontend_dist && cd ../backend
```

Simpler to share, slightly slower cold start, and you lose Vercel's CDN. Either
is fine.

---

## Other hosts that work

- **Railway** — $5 of free credit monthly, no sleeping, WebSockets fine. Same
  build/start commands.
- **Fly.io** — free allowance, needs a `fly.toml` and Docker, but it's the
  fastest of the three.
- **Koyeb** — free web service, supports WebSockets.

Avoid Vercel/Netlify **for the Django part**: they're serverless and can't hold
a WebSocket open, which breaks the sync.
