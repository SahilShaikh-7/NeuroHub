# 🚀 NeuroFlow — Vercel Deployment Guide (Zero → Live in 20 minutes)

A **step-by-step**, copy-pasteable guide. No prior DevOps knowledge required.
Follow every step in order. By the end you'll have a live URL like
`https://your-neuroflow.vercel.app` that anyone in the world can visit.

---

## 📋 What you'll need (all FREE)

| Thing | Why | Where to get it | Cost |
|---|---|---|---|
| GitHub account | Host the source code | <https://github.com/join> | Free |
| Vercel account | Deploy the app | <https://vercel.com/signup> | Free |
| MongoDB Atlas account | Cloud database | <https://cloud.mongodb.com/register> | Free (M0 tier) |
| Git installed locally | Push code to GitHub | `git --version` in terminal | Free |
| Node.js 18+ | Build locally (optional) | <https://nodejs.org/> | Free |

> **Total cost: $0.** Everything is on free tiers.

---

# PART 1 — BASIC: Get the app running on Vercel

## 🧩 STEP 1: Create a MongoDB Atlas database (5 min)

MongoDB Atlas is a free cloud database service.

1. Go to <https://cloud.mongodb.com/register> and sign up.
2. Click **"Build a Database"** → choose the **FREE Shared** tier ($0 forever).
3. Pick cloud provider **AWS** and a region close to you (e.g. `us-east-1`).
4. Cluster name: `Cluster0` (default is fine) → click **Create**.

### 1a. Create a database user
1. Left sidebar → **Database Access** → **+ Add New Database User**
2. Authentication method: **Password**
3. Username: `neuroflow`
4. Password: click **Autogenerate Secure Password** → **copy it somewhere safe** (you'll need it)
5. Database User Privileges: **Read and write to any database**
6. Click **Add User**

### 1b. Allow network access
1. Left sidebar → **Network Access** → **+ Add IP Address**
2. Click **ALLOW ACCESS FROM ANYWHERE** → confirms `0.0.0.0/0`
3. Click **Confirm**

> Why "anywhere"? Vercel's serverless functions get random IPs, so we must allow all. You can tighten this later.

### 1c. Get your connection string
1. Left sidebar → **Database** → click **Connect** on your cluster
2. Choose **Drivers**
3. Driver: **Node.js** · Version: **5.5 or later**
4. Copy the connection string — it looks like:
   ```
   mongodb+srv://neuroflow:<password>@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
   ```
5. **Replace `<password>`** with the password you copied in step 1a.
   - ⚠️ If your password contains special chars (`@`, `#`, `$`, `%`), URL-encode them:
     - `@` → `%40` · `#` → `%23` · `$` → `%24` · `%` → `%25` · `!` → `%21`
6. **Save this final string** — this is your `MONGO_URL`. Example:
   ```
   mongodb+srv://neuroflow:MyP%40ss1@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority
   ```

✅ Step 1 done!

---

## 🧩 STEP 2: Push the code to GitHub (3 min)

### 2a. Create a new GitHub repo
1. Go to <https://github.com/new>
2. Repository name: `neuroflow`
3. Visibility: **Public** (required for Vercel free tier) or **Private**
4. Do **NOT** check "Add a README" (we already have files)
5. Click **Create repository**
6. **Copy the URL** shown, e.g. `https://github.com/yourname/neuroflow.git`

### 2b. Push your local code
Open a terminal in the project folder (`/app` in this environment, or wherever your copy lives) and run:

```bash
cd /app    # or your project folder
git init
git add .
git commit -m "feat: NeuroFlow initial commit"
git branch -M main
git remote add origin https://github.com/yourname/neuroflow.git
git push -u origin main
```

When prompted for username/password:
- Username = your GitHub username
- Password = a **Personal Access Token** (not your actual password). Create one at
  <https://github.com/settings/tokens> → **Generate new token (classic)** → check
  `repo` scope → copy and use it as the password.

✅ Your code is now on GitHub!

---

## 🧩 STEP 3: Deploy on Vercel (5 min)

1. Go to <https://vercel.com/signup> and sign up with your **GitHub account** (easiest).
2. On the dashboard, click **"Add New..." → "Project"**.
3. You'll see **"Import Git Repository"** → find `neuroflow` → click **Import**.
   - If you don't see it, click **"Adjust GitHub App Permissions"** and grant access to the repo.
4. **Configure Project** screen appears:
   - **Framework Preset**: Next.js ✅ (auto-detected)
   - **Root Directory**: `./` (leave default)
   - **Build & Output Settings**: leave defaults (our `vercel.json` handles it)

### 3a. ⚠️ Add Environment Variables (CRITICAL)
Click **Environment Variables** and add these **4 variables**:

| Name | Value | Where it comes from |
|---|---|---|
| `MONGO_URL` | `mongodb+srv://neuroflow:YOUR_PASSWORD@cluster0.xxx.mongodb.net/...` | Step 1c — your Atlas string |
| `DB_NAME` | `neuroflow` | Just type this literal string |
| `NEXT_PUBLIC_BASE_URL` | `https://YOUR-PROJECT.vercel.app` | Vercel will show it after first deploy. Use placeholder for now, update after. |
| `CORS_ORIGINS` | `*` | Literal string — means "allow any origin" |

Click **"Add"** after each one.

5. Click the big **Deploy** button.
6. Wait 60–90 seconds. You'll see a confetti animation 🎉 and your live URL.

### 3b. Update `NEXT_PUBLIC_BASE_URL` with the real URL
1. Copy your live URL (e.g. `https://neuroflow-abc123.vercel.app`).
2. Vercel dashboard → **Settings → Environment Variables**.
3. Edit `NEXT_PUBLIC_BASE_URL` → paste the real URL → **Save**.
4. Go to **Deployments** → click the latest → **"Redeploy"** (top-right) → confirm.

✅ Your app is LIVE.

---

## 🧩 STEP 4: Verify it works (2 min)

Open your live URL and test:

1. **Landing page loads** → ✅
2. Click **Sign up** → create an account as "Professional" role → ✅
3. On the dashboard, click **"New Task"** → fill out → Create → ✅
4. Click **Start** then **Complete** on the task → see XP + confidence badge → ✅
5. Open the floating chatbot (bottom-right) → type `help` → see 25+ commands → ✅
6. Open `/api/root` in the URL bar (e.g. `https://yours.vercel.app/api/root`) → should show `{"message":"NeuroFlow API alive"}` → ✅

If anything fails, jump to **Troubleshooting** at the bottom.

---

# PART 2 — INTERMEDIATE: Code changes already done for you

I've prepared these optimizations in your repo so you don't have to touch anything:

### ✅ Already applied:
| File | What changed | Why |
|---|---|---|
| `/app/app/api/[[...path]]/route.js` | MongoDB client uses `globalThis` cache | Survives Vercel serverless cold starts |
| `/app/vercel.json` | Added function timeout = 30s | Default is 10s (Hobby plan max is 60s) |
| `/app/.gitignore` | Excludes `.env`, `node_modules`, `.next` | Prevents secrets/build files from leaking to GitHub |
| `/app/public/manifest.json` | PWA manifest | Lets users install as an app |
| `/app/public/sw.js` | Service worker | Offline support |

### 🔧 Things you may still want to customize:

#### A. Update app name & metadata
**File**: `/app/app/layout.js`

```js
export const metadata = {
  title: 'Your Custom Title',        // ← change this
  description: 'Your tagline...',    // ← and this
  manifest: '/manifest.json',
}
```

#### B. Lock down CORS to your domain
**Vercel env var**: `CORS_ORIGINS`
- Current: `*`
- Production recommendation: `https://yourdomain.vercel.app`

#### C. Change database name
**Vercel env var**: `DB_NAME`
- Current: `neuroflow`
- To run multiple environments on one cluster: `neuroflow_prod`, `neuroflow_staging`, etc.

---

# PART 3 — ADVANCED: Production-grade polish

## 🔒 3.1 Create MongoDB indexes (1 min, big perf win)

1. MongoDB Atlas → your cluster → **Browse Collections**
2. You'll see 5 collections created on first use (users, tasks, habits, workspaces, activity_logs)
3. Top-right → **...** → **Open MongoDB Shell** (or use Compass)
4. Run:
   ```js
   use neuroflow
   db.users.createIndex({ email: 1 }, { unique: true })
   db.users.createIndex({ token: 1 })
   db.tasks.createIndex({ userId: 1, status: 1 })
   db.tasks.createIndex({ workspaceId: 1 })
   db.habits.createIndex({ userId: 1 })
   db.activity_logs.createIndex({ userId: 1, timestamp: -1 })
   db.workspaces.createIndex({ inviteCode: 1 })
   db.workspaces.createIndex({ "members.userId": 1 })
   ```

## 🌐 3.2 Add a custom domain (free with Vercel)

1. Buy a domain at <https://namecheap.com>, <https://porkbun.com>, or <https://www.cloudflare.com/products/registrar/>
2. Vercel dashboard → your project → **Settings → Domains** → **Add**
3. Type your domain (e.g. `neuroflow.app`) → Vercel shows DNS records
4. Go to your domain registrar's DNS settings, add the `A` and `CNAME` records Vercel shows
5. Wait 5–60 min for DNS propagation → Vercel auto-issues SSL certificate
6. **Update Vercel env var** `NEXT_PUBLIC_BASE_URL` → `https://neuroflow.app` → Redeploy

## 📊 3.3 Enable Vercel Analytics (1 click)
- Project → **Analytics** tab → **Enable**
- See visitor counts, Core Web Vitals, top pages — all free.

## 🔔 3.4 Environment separation (staging + production)

1. Vercel dashboard → **Settings → Environment Variables**
2. For each variable, you can set it for:
   - Production (the `main` branch)
   - Preview (PRs and feature branches)
   - Development (local only)
3. Example — use different Atlas database for staging:
   - `DB_NAME`: Production = `neuroflow`, Preview = `neuroflow_staging`

## 🔐 3.5 Restrict MongoDB network access (after first successful deploy)

Vercel publishes its egress IP ranges at <https://vercel.com/docs/edge-network/regions#ip-addresses>.
1. Atlas → **Network Access**
2. Delete `0.0.0.0/0`
3. Add the specific IP ranges from Vercel's docs for your region
4. This prevents unauthorized connections to your DB

## 🧪 3.6 Automatic preview deploys on every PR

Already enabled! When you push a new branch to GitHub:
```bash
git checkout -b feature/workspaces-v2
git push -u origin feature/workspaces-v2
```
Then open a PR on GitHub — Vercel comments on the PR with a **unique preview URL**. Test changes there before merging to main.

## 📦 3.7 Secrets management

**NEVER commit `.env` to git.** The `.gitignore` already protects you.

For teams, use Vercel's built-in:
- Project → **Settings → Environment Variables** → add secret
- Toggle **"Sensitive"** to hide from logs / CLI output

---

# 🚨 Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with "Cannot find module" | Make sure `/app/package.json` is committed. Run `yarn install` locally to verify `yarn.lock` is up-to-date, commit it, push. |
| `500 - Internal Server Error` on API calls | Check Vercel → **Deployments → Runtime Logs**. Most common: wrong `MONGO_URL` (check password URL-encoding). |
| API works but site is blank | Open DevTools → Console. Usually a `NEXT_PUBLIC_BASE_URL` or CORS mismatch. |
| `ECONNREFUSED` / `MongoServerSelectionError` | Atlas **Network Access** doesn't include `0.0.0.0/0`. |
| "Too many connections" in Mongo logs | Atlas M0 allows 500 connections. If you're hitting it, upgrade to M2 ($9/mo) or add `maxPoolSize: 5` in the connection options. |
| PWA install banner doesn't show | App must be served over HTTPS (Vercel gives you this). Also needs `manifest.json` to load — check DevTools → Application tab. |
| Cold-start latency (~1–2 s) on first request after idle | Normal on serverless. Mitigate with [Vercel Cron](https://vercel.com/docs/cron-jobs) hitting `/api/root` every 5 min, or upgrade to Pro plan. |

### Getting help
- Vercel logs: **Deployments → click deployment → Runtime Logs / Build Logs**
- Atlas logs: **Database → Monitoring** → see slow queries, connections
- GitHub Discussions: <https://github.com/vercel/next.js/discussions>

---

# 🎯 Summary — what every env var means

| Variable | Required? | Used by | Example |
|---|---|---|---|
| `MONGO_URL` | ✅ YES | Backend only | `mongodb+srv://neuroflow:pw@cluster0.xxx.mongodb.net/...` |
| `DB_NAME` | ✅ YES | Backend only | `neuroflow` |
| `NEXT_PUBLIC_BASE_URL` | ⚠️ Recommended | Frontend (prefixed with `NEXT_PUBLIC_` so it's exposed to the browser) | `https://neuroflow.vercel.app` |
| `CORS_ORIGINS` | ⚠️ Recommended | Backend only | `*` or `https://neuroflow.vercel.app` |

> ⚠️ **Only variables starting with `NEXT_PUBLIC_` are exposed to the browser.** Never put secrets in them.

---

# 🏁 You're done!

Your Next.js + MongoDB stack is now:
- ✅ Running on Vercel's global CDN
- ✅ Auto-deploying on every `git push`
- ✅ Backed by free MongoDB Atlas
- ✅ PWA-installable
- ✅ HTTPS with auto-renewal
- ✅ Preview deploys on every PR
- ✅ Zero vendor lock-in (all your code is yours)

Next logical steps:
- Buy a $10/year domain and point it to Vercel
- Add Vercel Analytics (free)
- Create MongoDB indexes (see §3.1)
- Restrict `CORS_ORIGINS` and Atlas network access to your domain/IPs

**Questions or stuck? Check `DEPLOYMENT.md` for the full architecture reference.**
