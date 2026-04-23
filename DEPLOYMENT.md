# NeuroFlow — Architecture & Deployment Guide

A complete reference for how NeuroFlow is built and how to ship it to production on any free/cheap platform.

---

## 1. High-level Architecture

```
           ┌──────────────────────────────────────────────┐
           │               Browser (PWA)                   │
           │  ─ React SPA (Next.js App Router, /app/page.js)│
           │  ─ Service Worker (/public/sw.js)              │
           │  ─ IndexedDB offline queue (/lib/offline.js)   │
           └───────────────┬──────────────────────────────┘
                           │  fetch  /api/*   (Bearer token)
                           ▼
           ┌──────────────────────────────────────────────┐
           │          Next.js API route handler            │
           │   /app/app/api/[[...path]]/route.js           │
           │                                               │
           │  ┌──── Auth (PBKDF2 + token) ───────────┐    │
           │  │  ┌──── Task service ─────────────┐   │    │
           │  │  │  ┌── Anti-Fake scoring ────┐ │   │    │
           │  │  │  │   (+ ActivityLogs)       │ │   │    │
           │  │  │  └──────────────────────────┘ │   │    │
           │  │  │  ┌── Priority algo ─────────┐ │   │    │
           │  │  │  └──────────────────────────┘ │   │    │
           │  │  └───────────────────────────────┘   │    │
           │  │  ┌─── Habit service ────────────┐    │    │
           │  │  ┌─── AI Insights engine ──────┐    │    │
           │  │  ┌─── Rule-based Chatbot ──────┐    │    │
           │  │  ┌─── Workspaces service ──────┐    │    │
           │  │  ┌─── Analytics aggregator ────┐    │    │
           │  └──────────────────────────────────────┘    │
           └───────────────┬──────────────────────────────┘
                           │ MongoDB driver
                           ▼
                ┌─────────────────────────┐
                │       MongoDB            │
                │  (self-hosted or Atlas)  │
                └─────────────────────────┘
```

**Key properties**
- 100% local intelligence — no paid AI APIs.
- All server logic lives inside **one** Next.js API route (catch-all `[[...path]]`), so it deploys as a single serverless/Node unit.
- UUID v4 for all IDs (never Mongo ObjectIds) → safe to JSON-serialize.
- Stateless HTTP auth via random token stored on the user document.

---

## 2. Database Design (MongoDB)

Database name comes from `DB_NAME` env var (default `neuroflow`). All timestamps are ISO-8601 strings. All IDs are UUIDs.

### 2.1 `users`
```js
{
  id: "uuid",
  name: "Ada Lovelace",
  email: "ada@example.com",         // lowercased, unique-ish
  passwordHash: "hex",              // PBKDF2-SHA512, 10000 iters, 64 bytes
  salt: "hex",                      // 16 random bytes
  role: "student" | "professional" | "freelancer" | "admin",
  preferences: {},                  // free-form
  behaviorLogs: [],                 // legacy embedded log
  productivityScore: 0..100,        // cached, recomputed on /analytics
  workingHoursPattern: {},
  procrastinationScore: 0..1,
  xp: 0,
  level: 1,
  trustScore: 0..1,
  token: "uuid+uuid",               // active session token
  createdAt: "ISO"
}
```

### 2.2 `tasks`
```js
{
  id: "uuid",
  userId: "uuid",                   // creator
  workspaceId: null | "uuid",       // shared task if set
  assignedTo: null | "uuid",
  title, description, category,
  tags: ["client-a", "urgent"],
  urgency:     0..10,               // computed from deadline
  importance:  1..10,               // user-set
  effort:      1..10,               // user-set (low = higher priority)
  delayHistory: 0..10,              // learned from past, flagged skipped
  priority:    0..10,               // dynamic: 0.4u + 0.3i + 0.2(10-e) + 0.1d
  deadline:    null | ISO,
  status: "pending" | "completed",
  startedAt:   null | ISO,          // set by POST /api/tasks/:id/start
  completedAt: null | ISO,
  confidenceScore: 0..1,            // from anti-fake engine (on completion)
  flagged: false | true,            // true if confidenceScore < 0.5
  completionReasons: [string],      // human-readable flags
  createdAt: ISO
}
```

### 2.3 `habits`
```js
{
  id: "uuid", userId: "uuid",
  name: "Read 30 min", target: 1,
  checkins: ["ISO", "ISO", …],
  streak: int,
  strength: 0..100,                 // base * consistency * decay * streakBonus
  createdAt: ISO
}
```

### 2.4 `workspaces`
```js
{
  id: "uuid", name: "Design Team",
  ownerId: "uuid", ownerName: "Ada",
  members: [
    { userId, name, email, role: "member", joinedAt }
  ],
  inviteCode: "8 hex chars",
  createdAt: ISO
}
```

### 2.5 `activity_logs` (Anti-Fake Detection Layer)
```js
{
  id: "uuid",
  userId: "uuid",
  actionType: "task_complete" | "habit_check",
  targetId: "uuid",
  timestamp: ISO,
  completionTime: null | seconds,    // duration from start/creation → now
  confidenceScore: 0..1,
  flagged: bool,                     // score < 0.5
  reasons: [string]                  // e.g. ["Instant completion (<3s)", "Batch pattern: 5 actions in 10s"]
}
```
**Guarantees**
- Analytics excludes docs where `flagged: true` or `confidenceScore < 0.6`.
- Behavior engine (delayHistory, peak-hour detection, insights) reads only non-flagged rows.
- XP is computed as `baseXP × confidenceScore`.

### Recommended indexes (create once in Mongo shell)
```js
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ token: 1 })
db.tasks.createIndex({ userId: 1, status: 1 })
db.tasks.createIndex({ workspaceId: 1 })
db.habits.createIndex({ userId: 1 })
db.activity_logs.createIndex({ userId: 1, timestamp: -1 })
db.workspaces.createIndex({ inviteCode: 1 })
db.workspaces.createIndex({ "members.userId": 1 })
```

---

## 3. Backend Architecture

### 3.1 Request flow
All backend traffic goes through a single Next.js App-Router catch-all handler:

```
/app/app/api/[[...path]]/route.js
```

This handler:
1. **Parses the route** from `params.path` (e.g. `/tasks/:id/complete`).
2. **CORS + OPTIONS preflight**.
3. **Auth middleware** — reads `Authorization: Bearer <token>`, looks up `users.token`.
4. **Dispatches** to the correct handler (auth, tasks, habits, insights, analytics, chatbot, workspaces, activity-logs).
5. **Persists** to MongoDB via a module-level pooled client.

### 3.2 Service layer (inside same file for MVP simplicity)
| Service | Responsibility |
|---|---|
| `hashPassword` / `verifyPassword` | PBKDF2-SHA512 authentication |
| `calcUrgency` / `calcPriority` | Dynamic priority scoring |
| `getDelayHistory` | Behavior-learning, skips flagged data |
| `calcHabitStrength` / `updateStreak` | Habit math |
| **`scoreActivity`** | Anti-Fake confidence engine (rules: speed, batch, unusual hour) |
| **`logActivity`** | Appends to `activity_logs` collection |
| `generateInsights` | Pattern detection from completed tasks |
| `chatbotHandle` | Rule-based NLU (25+ intents) |
| `awardXP` | XP + level math |

For production you can split each into `/backend/services/*.js` and import — the logic will not change.

### 3.3 REST endpoints

**Auth**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/auth/me`

**Tasks**
- `GET  /api/tasks?workspaceId=<id|none>`
- `POST /api/tasks`
- `PUT  /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/start`   ← enables anti-fake duration tracking
- `POST /api/tasks/:id/complete` ← returns `{confidence, flagged, reasons, xpEarned}`

**Habits**
- `GET /api/habits`
- `POST /api/habits`
- `POST /api/habits/:id/checkin`
- `DELETE /api/habits/:id`

**AI / Chatbot / Analytics**
- `GET /api/insights`
- `GET /api/analytics`
- `GET /api/activity-logs`   ← Anti-fake transparency for the user
- `POST /api/chatbot`

**Workspaces**
- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/:id`
- `POST /api/workspaces/:id/invite`
- `POST /api/workspaces/join`
- `GET /api/workspaces/:id/analytics`
- `DELETE /api/workspaces/:id`

---

## 4. Frontend Architecture

- **Next.js 14 (App Router)** rendered as a single-page app.
- **State** lives in `/app/app/page.js` using React `useState` / `useEffect`. (Redux/Zustand isn't needed at this scale.)
- **shadcn/ui** for primitives (Button, Card, Tabs, Slider, Dialog…).
- **Recharts** for bar/line/pie analytics.
- **sonner** for toasts.
- **lucide-react** for icons.
- **PWA** — `/public/manifest.json` + `/public/sw.js` registered in `app/layout.js`.
- **Offline queue** — `/lib/offline.js` uses IndexedDB to store mutations when `navigator.onLine === false`, auto-flushes on the `online` event.
- **Browser notifications** — scheduled client-side via `setTimeout` on deadlines (15-min warning + at-deadline).

---

## 5. Deploying from GitHub

Any of the three platforms below will work. **Our recommendation is Vercel** because:
- Next.js is a first-class citizen (built by the same company).
- Zero-config; auto-detects `next build`.
- Generous free tier, instant GitHub previews.
- Region-aware edge network.

Trade-offs:

| Platform | Type | Mongo hosting? | Best for | Limits (free) |
|---|---|---|---|---|
| **Vercel** ⭐ | Serverless | No (use **MongoDB Atlas**) | Full-stack Next.js, preview deploys | 100 GB bandwidth, 10s function timeout (Hobby) |
| **Railway** | Long-running containers | ✅ One-click Mongo add-on | Apps with websockets, cron, persistent connections | $5/mo after free trial |
| **Render** | Containers + static | ✅ Managed Mongo (paid) | Teams wanting Docker + traditional server model | Web Service sleeps after 15 min idle on free tier |

---

### 5.1 Step 0 — Push this project to GitHub
```bash
cd /app
git init
git add .
git commit -m "feat: NeuroFlow MVP"
git branch -M main
git remote add origin https://github.com/<you>/neuroflow.git
git push -u origin main
```

### 5.2 MongoDB Atlas (free shared cluster — works everywhere)
1. Create a free account → <https://cloud.mongodb.com>.
2. Create a **Free Shared Cluster** (M0).
3. Database Access → add user `neuroflow / <password>`.
4. Network Access → **Allow access from anywhere** (`0.0.0.0/0`) for Vercel/Render; you can restrict later.
5. Connect → **Drivers** → copy connection string:
   ```
   mongodb+srv://neuroflow:<password>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` literally and URL-encode any special chars.

---

### 5.3 Option A — Vercel (recommended)

1. <https://vercel.com> → **Import Git Repository** → pick `neuroflow`.
2. Framework preset auto-detected as **Next.js**.
3. Environment Variables:
   | Key | Value |
   |---|---|
   | `MONGO_URL` | your Atlas string |
   | `DB_NAME` | `neuroflow` |
   | `NEXT_PUBLIC_BASE_URL` | `https://<your-project>.vercel.app` |
   | `CORS_ORIGINS` | `*` (or your domain) |
4. Click **Deploy**. Done in ~60 seconds.
5. Every `git push` → automatic preview / production deploy.

**Gotchas on Vercel**
- Serverless functions are **stateless** — the `let client` pool in `route.js` is re-initialized per cold start; that's fine for this scale.
- Long-running Socket.io would need a custom server → use Railway for that.
- If you hit the 10-sec timeout, split heavy operations or upgrade plan.

---

### 5.4 Option B — Railway

1. <https://railway.app> → **New Project → Deploy from GitHub repo**.
2. Add a second service → **Database → MongoDB** (one-click).
3. In your Next.js service → **Variables** tab → reference Mongo's `MONGO_URL`:
   ```
   MONGO_URL=${{MongoDB.MONGO_URL}}
   DB_NAME=neuroflow
   NEXT_PUBLIC_BASE_URL=https://<your-project>.up.railway.app
   CORS_ORIGINS=*
   ```
4. **Build command**: `yarn build` (auto-detected). **Start command**: `yarn start`.
5. Deploy.

**Why choose Railway**
- If you want to add **Socket.io**, **BullMQ**, **email workers**, or long-lived WebSockets.
- Mongo is bundled — one less vendor.

---

### 5.5 Option C — Render

1. <https://render.com> → **New → Web Service** → connect GitHub.
2. Runtime: **Node**. Build command: `yarn && yarn build`. Start: `yarn start`.
3. For Mongo, either:
   - Use **MongoDB Atlas** (preferred), OR
   - Render's **Private Service** type with a Mongo Docker image (paid).
4. Environment variables — same four as Vercel.
5. Deploy.

**Gotchas on Render**
- Free tier Web Services **sleep** after 15 min idle → first request after sleep = 30-50 sec cold boot. For demos, bump to $7/mo "Starter" plan.

---

## 6. Recommended stack for a portfolio / GitHub deployment

```
GitHub repo  →  Vercel  (frontend + API)  →  MongoDB Atlas
```

**Why**:
1. Zero YAML / Docker / config.
2. Free for hobby usage — no credit card needed.
3. Instant preview URL on every PR.
4. Fast global CDN, HTTPS by default.
5. Works out of the box with the Next.js App Router + our catch-all API.

If you later need real-time Socket.io + background workers → **migrate the API** to Railway and keep the frontend on Vercel.

---

## 7. Post-deploy checklist
- [ ] `https://<domain>/api/root` returns `{"message":"NeuroFlow API alive"}`
- [ ] Sign up creates a user, `/api/auth/me` returns it.
- [ ] Create a task, hit Start, Complete → confidence shown in Security tab.
- [ ] Install as PWA (Chrome → "Install app" icon in URL bar).
- [ ] Add Mongo indexes from §2.5.
- [ ] Set `CORS_ORIGINS` to your domain (not `*`) if you add a separate frontend.

---

## 8. Quickstart for local development
```bash
git clone https://github.com/<you>/neuroflow.git
cd neuroflow
yarn install

# .env
echo "MONGO_URL=mongodb://localhost:27017
DB_NAME=neuroflow
NEXT_PUBLIC_BASE_URL=http://localhost:3000
CORS_ORIGINS=*" > .env

yarn dev
# open http://localhost:3000
```

That's it. Everything else works out of the box — no API keys, no paid services, no vendor lock-in.
