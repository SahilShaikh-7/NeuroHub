import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

// ---------- MongoDB (serverless-safe global cache) ----------
// On Vercel/Render serverless, module-level `let client` is reset per cold start.
// Using `globalThis` keeps the connection alive across hot-reloads AND
// warm invocations — this is the official Next.js recommended pattern.
let clientPromise
async function connectToMongo() {
  if (!clientPromise) {
    if (!process.env.MONGO_URL) throw new Error('MONGO_URL env var missing')
    if (globalThis.__neuroflowMongo) {
      clientPromise = globalThis.__neuroflowMongo
    } else {
      const c = new MongoClient(process.env.MONGO_URL, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 8000,
      })
      clientPromise = c.connect()
      if (process.env.NODE_ENV !== 'production') globalThis.__neuroflowMongo = clientPromise
    }
  }
  const client = await clientPromise
  return client.db(process.env.DB_NAME || 'neuroflow')
}

function cors(res) {
  res.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.headers.set('Access-Control-Allow-Credentials', 'true')
  return res
}
export async function OPTIONS() { return cors(new NextResponse(null, { status: 200 })) }

// ---------- Auth helpers ----------
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex')
  const h = crypto.pbkdf2Sync(password, s, 10000, 64, 'sha512').toString('hex')
  return { salt: s, hash: h }
}
function verifyPassword(password, salt, hash) {
  const h = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex')
  return h === hash
}
async function getUserFromReq(request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null
  const d = await connectToMongo()
  const user = await d.collection('users').findOne({ token })
  return user
}
function safeUser(u) {
  if (!u) return null
  const { _id, passwordHash, salt, ...rest } = u
  return rest
}

// ---------- Priority / Habit helpers ----------
function calcUrgency(deadline) {
  if (!deadline) return 3
  const hours = (new Date(deadline).getTime() - Date.now()) / 3600000
  if (hours <= 0) return 10
  if (hours <= 6) return 9.5
  if (hours <= 24) return 8.5
  if (hours <= 48) return 7
  if (hours <= 24 * 7) return 5
  return 3
}
function calcPriority({ urgency, importance = 5, effort = 5, delayHistory = 0 }) {
  const e = 10 - (effort || 5)
  const p = 0.4 * urgency + 0.3 * importance + 0.2 * e + 0.1 * delayHistory
  return Math.round(p * 100) / 100
}
async function getDelayHistory(d, userId, category) {
  // Only use NON-flagged completions when learning (behavior engine protection)
  const past = await d.collection('tasks')
    .find({ userId, category, status: 'completed', $or: [{ flagged: { $ne: true } }, { flagged: { $exists: false } }] })
    .sort({ completedAt: -1 }).limit(20).toArray()
  if (!past.length) return 0
  let delaySum = 0, n = 0
  for (const t of past) {
    if (t.deadline && t.completedAt) {
      const delay = (new Date(t.completedAt).getTime() - new Date(t.deadline).getTime()) / 3600000
      delaySum += Math.max(0, delay)
      n++
    }
  }
  if (!n) return 0
  const avg = delaySum / n
  return Math.min(10, Math.round((avg / 7.2) * 10) / 10)
}

function calcHabitStrength(habit) {
  const checkins = habit.checkins || []
  if (!checkins.length) return 0
  const start = new Date(habit.createdAt).getTime()
  const days = Math.max(1, Math.floor((Date.now() - start) / 86400000))
  const consistency = Math.min(1, checkins.length / days)
  const last = new Date(checkins[checkins.length - 1]).getTime()
  const daysSinceLast = Math.floor((Date.now() - last) / 86400000)
  const decay = Math.pow(0.92, Math.max(0, daysSinceLast - 1))
  const streak = habit.streak || 0
  let bonus = 1
  if (streak >= 30) bonus = 1.3
  else if (streak >= 14) bonus = 1.2
  else if (streak >= 7) bonus = 1.1
  return Math.round(100 * consistency * decay * bonus * 10) / 10
}
function updateStreak(habit) {
  const checkins = (habit.checkins || []).map(c => new Date(c))
  checkins.sort((a, b) => a - b)
  if (!checkins.length) return 0
  let streak = 1
  for (let i = checkins.length - 1; i > 0; i--) {
    const diff = Math.floor((checkins[i] - checkins[i - 1]) / 86400000)
    if (diff === 1) streak++
    else if (diff === 0) continue
    else break
  }
  return streak
}

// =================================================================
// ANTI-FAKE / ACTIVITY VALIDATION LAYER
// =================================================================
// Scores every user action (task complete, habit check-in) with a 0..1
// confidence value. Rules:
//   (1) Too fast completion       -> big penalty if <10s, medium <30s
//   (2) Batch / rapid actions     -> count recent logs in last 10s
//   (3) Unusual hour vs pattern   -> small penalty if far from typical
//   (4) Zero-duration task_complete with no startedAt & deadline gap = suspicious
// Flagged if score < 0.5. XP = baseXP * score. Analytics/insights skip flagged.
async function scoreActivity(d, userId, { actionType, createdAt, startedAt, deadline }) {
  let score = 1.0
  const reasons = []
  const now = Date.now()

  // Reference start time for duration: prefer startedAt, fallback to createdAt
  const ref = startedAt ? new Date(startedAt).getTime() : (createdAt ? new Date(createdAt).getTime() : null)
  let durationSec = null
  if (ref) durationSec = Math.max(0, (now - ref) / 1000)

  if (actionType === 'task_complete' && durationSec !== null) {
    if (durationSec < 3) {
      score -= 0.7
      reasons.push('Instant completion (<3s)')
    } else if (durationSec < 10) {
      score -= 0.5
      reasons.push('Completed in <10 seconds')
    } else if (durationSec < 30 && !startedAt) {
      score -= 0.25
      reasons.push('Completed <30s after creation (no Start)')
    }
  }
  if (actionType === 'habit_check' && durationSec !== null && durationSec < 5) {
    // habit check-ins are quick, so only penalize if >1 back-to-back
  }

  // Rapid batch detection
  const tenSecondsAgo = new Date(now - 10000).toISOString()
  const recentCount = await d.collection('activity_logs').countDocuments({
    userId,
    timestamp: { $gte: tenSecondsAgo }
  })
  if (recentCount >= 4) {
    score -= 0.5
    reasons.push(`Batch pattern: ${recentCount + 1} actions in 10s`)
  } else if (recentCount >= 2) {
    score -= 0.2
    reasons.push('Rapid consecutive actions')
  }

  // Unusual-hour check (only once user has 10+ clean logs)
  const cleanLogs = await d.collection('activity_logs')
    .find({ userId, flagged: { $ne: true } })
    .sort({ timestamp: -1 }).limit(50).toArray()
  if (cleanLogs.length >= 10) {
    const hours = cleanLogs.map(l => new Date(l.timestamp).getHours())
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length
    const variance = hours.reduce((acc, h) => acc + (h - avg) ** 2, 0) / hours.length
    const std = Math.sqrt(variance)
    const currentHour = new Date(now).getHours()
    const delta = Math.min(Math.abs(currentHour - avg), 24 - Math.abs(currentHour - avg))
    if (delta > Math.max(3, std * 2.5)) {
      score -= 0.15
      reasons.push(`Unusual hour (${currentHour}:00) vs typical pattern`)
    }
  }

  // Clamp
  score = Math.max(0, Math.min(1, score))
  score = Math.round(score * 100) / 100
  return {
    score,
    flagged: score < 0.5,
    reasons,
    durationSec: durationSec !== null ? Math.round(durationSec) : null
  }
}

async function logActivity(d, userId, actionType, targetId, result) {
  const log = {
    id: uuidv4(),
    userId,
    actionType,
    targetId,
    timestamp: new Date().toISOString(),
    completionTime: result.durationSec,
    confidenceScore: result.score,
    flagged: result.flagged,
    reasons: result.reasons
  }
  await d.collection('activity_logs').insertOne(log)
  return log
}

// =================================================================
// AI insights (respects flagged data -> behavior engine protection)
// =================================================================
async function generateInsights(d, user) {
  const uid = user.id
  const tasks = await d.collection('tasks').find({ userId: uid }).toArray()
  // Only learn from valid completions
  const completed = tasks.filter(t => t.status === 'completed' && t.completedAt && !t.flagged)
  const insights = []
  let peakHour = null

  if (completed.length >= 3) {
    const hourBins = Array(24).fill(0)
    for (const t of completed) hourBins[new Date(t.completedAt).getHours()]++
    let best = 0, bestStart = 9
    for (let h = 0; h < 22; h++) {
      const sum = hourBins[h] + hourBins[h + 1] + hourBins[h + 2]
      if (sum > best) { best = sum; bestStart = h }
    }
    peakHour = { start: bestStart, end: bestStart + 3, count: best }
    insights.push({
      type: 'peak', icon: '🔥',
      title: 'Peak productivity window detected',
      message: `You work best between ${bestStart}:00 – ${bestStart + 3}:00. Schedule your hardest tasks here.`
    })
    const lateCount = hourBins.slice(20).reduce((a, b) => a + b, 0)
    const earlyCount = hourBins.slice(6, 12).reduce((a, b) => a + b, 0)
    if (earlyCount > lateCount * 2 && earlyCount > 2) {
      insights.push({
        type: 'drop', icon: '🌙',
        title: 'Evening productivity drop',
        message: 'Your productivity drops significantly after 8 PM. Consider winding down earlier.'
      })
    }
  }

  const lateTasks = completed.filter(t => t.deadline && new Date(t.completedAt) > new Date(t.deadline))
  if (completed.length >= 3 && lateTasks.length / completed.length > 0.3) {
    insights.push({
      type: 'procrastination', icon: '⏰',
      title: 'Procrastination pattern detected',
      message: `${Math.round((lateTasks.length / completed.length) * 100)}% of your tasks finish past the deadline. Try breaking them into smaller chunks.`
    })
  }

  const byCategory = {}
  for (const t of completed) {
    if (!t.category || !t.deadline) continue
    byCategory[t.category] = byCategory[t.category] || { total: 0, late: 0 }
    byCategory[t.category].total++
    if (new Date(t.completedAt) > new Date(t.deadline)) byCategory[t.category].late++
  }
  for (const [cat, s] of Object.entries(byCategory)) {
    if (s.total >= 2 && s.late / s.total > 0.5) {
      insights.push({
        type: 'category_delay', icon: '🎯',
        title: `You delay "${cat}" tasks`,
        message: `Schedule ${cat} tasks earlier — future priority will be auto-boosted.`
      })
    }
  }

  const fast = completed.filter(t => t.deadline && new Date(t.completedAt) < new Date(t.deadline))
  if (completed.length >= 5 && fast.length / completed.length > 0.7) {
    insights.push({
      type: 'fast', icon: '⚡',
      title: 'Fast completer',
      message: "You finish most tasks ahead of deadline — you're crushing it!"
    })
  }

  const habits = await d.collection('habits').find({ userId: uid }).toArray()
  const skipped = habits.filter(h => {
    if (!h.checkins || !h.checkins.length) return false
    const last = new Date(h.checkins[h.checkins.length - 1])
    return (Date.now() - last.getTime()) > 86400000 * 2
  })
  if (skipped.length) {
    insights.push({
      type: 'habit_skip', icon: '🔁',
      title: 'Habits slipping',
      message: `You've skipped ${skipped.length} habit${skipped.length > 1 ? 's' : ''} for 2+ days. Quick check-in now?`
    })
  }

  // Trust-related insight
  const flaggedCount = await d.collection('activity_logs').countDocuments({ userId: uid, flagged: true })
  const totalLogs = await d.collection('activity_logs').countDocuments({ userId: uid })
  if (totalLogs >= 10 && flaggedCount / totalLogs > 0.2) {
    insights.push({
      type: 'trust', icon: '🛡️',
      title: 'Low-confidence activity detected',
      message: `${flaggedCount}/${totalLogs} recent actions were flagged as suspicious. Use Start → Complete to earn full XP.`
    })
  }

  if (user.role === 'student') {
    const examTasks = tasks.filter(t => /exam|test|quiz|assignment/i.test((t.title || '') + ' ' + (t.category || '')))
    if (examTasks.length) insights.push({ type: 'role', icon: '📚', title: 'Study strategy', message: `You have ${examTasks.length} academic task(s). Break study sessions into 45-min Pomodoros.` })
  } else if (user.role === 'professional') {
    const meetings = tasks.filter(t => /meeting|call|sync|standup/i.test(t.title || ''))
    if (meetings.length) insights.push({ type: 'role', icon: '💼', title: 'Meeting load', message: `${meetings.length} meeting(s) tracked. Block deep-work hours to protect focus.` })
  } else if (user.role === 'freelancer') {
    const byClient = {}
    tasks.forEach(t => { if (t.tags) t.tags.forEach(tg => byClient[tg] = (byClient[tg] || 0) + 1) })
    const topClient = Object.entries(byClient).sort((a, b) => b[1] - a[1])[0]
    if (topClient) insights.push({ type: 'role', icon: '💰', title: 'Top client', message: `"${topClient[0]}" is your busiest tag (${topClient[1]} tasks). Consider premium pricing.` })
  }

  if (!insights.length) {
    insights.push({
      type: 'onboard', icon: '✨',
      title: 'Complete a few tasks to unlock insights',
      message: 'Once you have 3+ completed tasks, NeuroFlow will detect your productivity patterns automatically.'
    })
  }
  return { insights, peakHour }
}

// =================================================================
// Chatbot (rule-based NLU)
// =================================================================
function parseDateHint(text) {
  const now = new Date()
  const t = text.toLowerCase()
  let date = null
  if (/\btomorrow\b/.test(t)) { date = new Date(now); date.setDate(now.getDate() + 1) }
  else if (/\btoday\b/.test(t)) { date = new Date(now) }
  else if (/\btonight\b/.test(t)) { date = new Date(now); date.setHours(21, 0, 0, 0); return date }
  else {
    const m = t.match(/in (\d+) (day|days|hour|hours)/)
    if (m) {
      date = new Date(now)
      const n = parseInt(m[1])
      if (m[2].startsWith('day')) date.setDate(now.getDate() + n)
      else date.setHours(now.getHours() + n)
    }
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    for (let i = 0; i < 7; i++) {
      if (new RegExp('\\b' + dayNames[i] + '\\b').test(t)) {
        date = new Date(now)
        const diff = (i - now.getDay() + 7) % 7 || 7
        date.setDate(now.getDate() + diff)
        break
      }
    }
  }
  const timeMatch = t.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (timeMatch && date) {
    let h = parseInt(timeMatch[1]), mi = parseInt(timeMatch[2] || '0')
    const ap = timeMatch[3]
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    date.setHours(h, mi, 0, 0)
  } else if (date && !/at/.test(t)) {
    date.setHours(17, 0, 0, 0)
  }
  return date
}
// ---------- Intent helpers ----------
const MOTIVATIONS = [
  "🚀 One task at a time. You've got this.",
  "💪 Progress > perfection. Ship something today.",
  "🌱 Small consistent wins compound into big change.",
  "⚡ Your future self is built by the task in front of you.",
  "🔥 Discipline is choosing between what you want now and what you want most.",
  "🎯 Focus is saying no to 99 good things.",
  "✨ You don't need more time — you need fewer tabs open."
]
function fmtTime(d) { return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function matchTaskByName(tasks, query) {
  const q = query.toLowerCase().trim()
  if (!q) return null
  // exact > startsWith > includes
  return tasks.find(t => t.title.toLowerCase() === q) ||
         tasks.find(t => t.title.toLowerCase().startsWith(q)) ||
         tasks.find(t => t.title.toLowerCase().includes(q)) ||
         tasks.find(t => q.split(' ').every(w => t.title.toLowerCase().includes(w)))
}
function matchHabitByName(habits, query) {
  const q = query.toLowerCase().trim()
  if (!q) return null
  return habits.find(h => h.name.toLowerCase() === q) ||
         habits.find(h => h.name.toLowerCase().startsWith(q)) ||
         habits.find(h => h.name.toLowerCase().includes(q))
}

async function chatbotHandle(d, user, message) {
  const text = (message || '').trim()
  const lower = text.toLowerCase()

  // ==================== Greeting / small talk ====================
  if (/^(hi|hello|hey|yo|hola|howdy|good (morning|afternoon|evening))\b/i.test(lower)) {
    const hour = new Date().getHours()
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
    return { reply: `${greet}, ${user.name?.split(' ')[0] || 'friend'}! 👋 What should we tackle next?\nTry: "show my top task", "what's due today", or "give me insights".`, action: null }
  }
  if (/^(thanks|thank you|thx|ty|appreciate it|thank u)/i.test(lower))
    return { reply: "Anytime. Now back to work 💪", action: null }
  if (/\b(who are you|what are you|your name)\b/i.test(lower))
    return { reply: "I'm the NeuroFlow Assistant — a local, rule-based NLU bot. I parse your commands with regex + intent mapping. No external LLMs, no data leaves your server.", action: null }
  if (/\b(help|commands?|what can you do|capabilities|menu)\b/i.test(lower))
    return {
      reply: `🧠 I can do a lot! Try:\n\n📝 Tasks\n• Add task <title> tomorrow at 5 PM\n• Show my (pending|completed|overdue) tasks\n• What's due (today|this week)\n• What's my top task / top priority\n• Complete <task name>\n• Delete <task name>\n• Set priority of <task> to high\n\n🔁 Habits\n• Add habit read 30 min\n• List my habits / show streaks\n• Check in <habit>\n• Delete habit <name>\n\n📊 Analytics & AI\n• Show my stats / productivity / trust score\n• How many tasks do I have\n• Weekly summary\n• Peak hours / when do I work best\n• Give me insights\n• Flagged activity / security\n\n👥 Teams\n• Show my workspaces\n• Create workspace <name>\n\n⏱️ Focus\n• Start a pomodoro / take a break\n• Motivate me\n• What time is it\n\nType any of these!`,
      action: 'help'
    }
  if (/^(bye|goodbye|see you|cya|later)/i.test(lower))
    return { reply: "Go ship something great. See you soon 👋", action: null }
  if (/\b(motivate|encourage|inspire|pep talk|motivation)\b/i.test(lower))
    return { reply: MOTIVATIONS[Math.floor(Math.random() * MOTIVATIONS.length)], action: null }
  if (/\b(time|clock|what time)\b/i.test(lower) && !/\btasks?\b/.test(lower))
    return { reply: `🕒 It's ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`, action: null }
  if (/\b(pomodoro|focus timer|start timer|25 min|deep work)\b/i.test(lower))
    return { reply: "🍅 Pomodoro plan: 25 min focused work → 5 min break → repeat 4× → 15 min long break. Pick your top task, hit Start on it, then silence notifications. I'll be here when you're done.", action: null }
  if (/\b(break|rest|tired|burn(ed|t)? out)\b/i.test(lower))
    return { reply: "🌿 Stand up, stretch, look 20 feet away for 20 seconds, drink water. Back in 5?", action: null }

  // ==================== Add task ====================
  if (/^(add|create|new)\s+(task|todo)/i.test(text) || /^remind me to/i.test(text)) {
    let title = text.replace(/^(add|create|new)\s+(task|todo)\s*:?/i, '').replace(/^remind me to/i, '').trim()
    const deadline = parseDateHint(title)
    title = title.replace(/\b(tomorrow|today|tonight)\b/gi, '')
      .replace(/in \d+ (day|days|hour|hours)/gi, '')
      .replace(/at \d{1,2}(:\d{2})?\s*(am|pm)?/gi, '')
      .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
      .replace(/\s+/g, ' ').trim()
    if (!title) return { reply: "I couldn't figure out the task title. Try: 'Add task finish report tomorrow at 5 PM'", action: null }
    const urgency = calcUrgency(deadline)
    const delayHistory = await getDelayHistory(d, user.id, 'general')
    const priority = calcPriority({ urgency, importance: 5, effort: 5, delayHistory })
    const task = {
      id: uuidv4(), userId: user.id, title, description: '', category: 'general', tags: [],
      urgency, importance: 5, effort: 5, delayHistory, priority,
      deadline: deadline ? deadline.toISOString() : null,
      status: 'pending', startedAt: null, createdAt: new Date().toISOString(), completedAt: null
    }
    await d.collection('tasks').insertOne(task)
    await awardXP(d, user, 5)
    const { _id, ...clean } = task
    return { reply: `✅ Added task "${title}"${deadline ? ` due ${fmtTime(deadline)}` : ''} (priority ${priority})`, action: 'task_created', data: clean }
  }

  // ==================== Fetch task lists ====================
  const allTasks = await d.collection('tasks').find({ userId: user.id }).sort({ priority: -1 }).toArray()
  const pending = allTasks.filter(t => t.status === 'pending')
  const done = allTasks.filter(t => t.status === 'completed')

  if (/\b(top (task|priority)|most important|what should i do|focus on|next task)\b/i.test(lower)) {
    if (!pending.length) return { reply: "🎉 Inbox zero. Add a new task or take a well-earned break.", action: null }
    const top = pending[0]
    return { reply: `🎯 Your top priority is "${top.title}" (P${top.priority})${top.deadline ? ` · due ${fmtTime(top.deadline)}` : ''}. Want to hit Start on it?`, action: 'top_task' }
  }
  if (/\b(overdue|late|past due|missed deadline)\b/i.test(lower)) {
    const now = Date.now()
    const overdue = pending.filter(t => t.deadline && new Date(t.deadline).getTime() < now)
    if (!overdue.length) return { reply: "✅ Nothing overdue. Keep it up.", action: null }
    const lines = overdue.slice(0, 5).map((t, i) => `${i + 1}. ${t.title} · was due ${fmtTime(t.deadline)}`).join('\n')
    return { reply: `⏰ ${overdue.length} overdue task(s):\n${lines}`, action: 'list_overdue' }
  }
  if (/\b(due today|today'?s tasks|what'?s on today|today list)\b/i.test(lower)) {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    const today = pending.filter(t => t.deadline && new Date(t.deadline) >= start && new Date(t.deadline) < end)
    if (!today.length) return { reply: "📅 Nothing due today. Maybe plan tomorrow?", action: null }
    const lines = today.map((t, i) => `${i + 1}. ${t.title} (P${t.priority})`).join('\n')
    return { reply: `🗓️ Due today (${today.length}):\n${lines}`, action: 'list_today' }
  }
  if (/\b(this week|weekly|due this week|7 days)\b/i.test(lower) && /\btasks?\b/i.test(lower)) {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 7)
    const week = pending.filter(t => t.deadline && new Date(t.deadline) >= start && new Date(t.deadline) < end)
    if (!week.length) return { reply: "📆 No tasks due this week.", action: null }
    const lines = week.slice(0, 8).map((t, i) => `${i + 1}. ${t.title} · ${fmtTime(t.deadline)}`).join('\n')
    return { reply: `📆 ${week.length} task(s) this week:\n${lines}`, action: 'list_week' }
  }
  if (/\b(completed|finished|done) (tasks?|todos?)\b/i.test(lower) || /\b(what have i (finished|completed|done))\b/i.test(lower)) {
    if (!done.length) return { reply: "No completed tasks yet. Go finish one!", action: null }
    const recent = done.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 5)
    const lines = recent.map((t, i) => `${i + 1}. ${t.title}${t.flagged ? ' ⚠️' : ''}`).join('\n')
    return { reply: `✅ Last ${recent.length} completed:\n${lines}\nTotal valid: ${done.filter(t => !t.flagged).length}/${done.length}.`, action: 'list_completed' }
  }
  if (/\b(how many|count)\b.*\btasks?\b/i.test(lower)) {
    return { reply: `📊 ${pending.length} pending · ${done.length} completed · ${allTasks.length} total.`, action: 'count' }
  }
  if (/\b(show|list|what are|view)\b.*(tasks?|pending|todos?)/i.test(lower) || /\b(my|pending) tasks\b/i.test(lower)) {
    if (!pending.length) return { reply: "🎉 No pending tasks! You're all caught up.", action: 'list_tasks' }
    const lines = pending.slice(0, 5).map((t, i) => `${i + 1}. ${t.title} (P${t.priority}${t.deadline ? ' · ' + new Date(t.deadline).toLocaleDateString() : ''})`).join('\n')
    return { reply: `You have ${pending.length} pending task(s):\n${lines}`, action: 'list_tasks' }
  }

  // ==================== Complete / delete / update task ====================
  if (/^(complete|finish|done|mark done|check off)\s+/i.test(text)) {
    const q = text.replace(/^(complete|finish|done|mark done|check off)\s+/i, '').trim()
    const match = matchTaskByName(pending, q)
    if (!match) return { reply: `Couldn't find a pending task matching "${q}". Try "show my pending tasks" first.`, action: null }
    const s = await scoreActivity(d, user.id, { actionType: 'task_complete', createdAt: match.createdAt, startedAt: match.startedAt, deadline: match.deadline })
    await d.collection('tasks').updateOne({ id: match.id }, { $set: { status: 'completed', completedAt: new Date().toISOString(), confidenceScore: s.score, flagged: s.flagged, completionReasons: s.reasons } })
    await logActivity(d, user.id, 'task_complete', match.id, s)
    const xp = Math.round(15 * s.score)
    await awardXP(d, user, xp)
    return { reply: `🎯 Completed "${match.title}" — +${xp} XP (confidence ${Math.round(s.score * 100)}%)${s.flagged ? ' ⚠️ flagged' : ''}`, action: 'task_completed' }
  }
  if (/^(delete|remove|cancel|drop)\s+(task\s+)?/i.test(text) && !/habit/i.test(text) && !/workspace/i.test(text)) {
    const q = text.replace(/^(delete|remove|cancel|drop)\s+(task\s+)?/i, '').trim()
    const match = matchTaskByName(allTasks, q)
    if (!match) return { reply: `No task matches "${q}".`, action: null }
    await d.collection('tasks').deleteOne({ id: match.id, userId: user.id })
    return { reply: `🗑️ Deleted "${match.title}".`, action: 'task_deleted' }
  }
  {
    const m = text.match(/^set\s+(priority|importance)\s+(?:of\s+)?(.+?)\s+to\s+(high|medium|low|\d+)$/i)
    if (m) {
      const q = m[2].trim(), level = m[3].toLowerCase()
      const match = matchTaskByName(pending, q)
      if (!match) return { reply: `No pending task matches "${q}".`, action: null }
      const importance = level === 'high' ? 9 : level === 'medium' ? 5 : level === 'low' ? 2 : Math.max(1, Math.min(10, parseInt(level)))
      const urgency = calcUrgency(match.deadline)
      const priority = calcPriority({ urgency, importance, effort: match.effort || 5, delayHistory: match.delayHistory || 0 })
      await d.collection('tasks').updateOne({ id: match.id }, { $set: { importance, priority } })
      return { reply: `🔧 Updated "${match.title}" → importance ${importance}/10, priority ${priority}.`, action: 'task_updated' }
    }
  }

  // ==================== Habits ====================
  if (/^(add|create|track|new)\s+habit/i.test(text)) {
    const name = text.replace(/^(add|create|track|new)\s+habit\s*:?/i, '').trim()
    if (!name) return { reply: 'Give your habit a name, e.g. "Add habit read 30 min"', action: null }
    const habit = { id: uuidv4(), userId: user.id, name, checkins: [], streak: 0, strength: 0, createdAt: new Date().toISOString() }
    await d.collection('habits').insertOne(habit)
    const { _id, ...clean } = habit
    return { reply: `🔁 Started tracking habit: ${name}`, action: 'habit_created', data: clean }
  }
  const habitsAll = await d.collection('habits').find({ userId: user.id }).toArray()
  if (/\b(list|show|my)\s+habits?\b/i.test(lower) || /\b(streaks?|habit (strength|list))\b/i.test(lower)) {
    if (!habitsAll.length) return { reply: "No habits yet. Try 'Add habit meditate 10 min'.", action: null }
    const lines = habitsAll.map((h, i) => `${i + 1}. ${h.name} · 🔥 streak ${h.streak || 0} · ${Math.round(calcHabitStrength(h))}% strength`).join('\n')
    return { reply: `🔁 ${habitsAll.length} habit(s):\n${lines}`, action: 'list_habits' }
  }
  if (/^(check ?in|log habit|did)\s+/i.test(text)) {
    const q = text.replace(/^(check ?in|log habit|did)\s+/i, '').trim()
    const habit = matchHabitByName(habitsAll, q)
    if (!habit) return { reply: `No habit matches "${q}".`, action: null }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const already = (habit.checkins || []).some(c => new Date(c).setHours(0, 0, 0, 0) === today.getTime())
    if (already) return { reply: `✅ "${habit.name}" already checked in today.`, action: null }
    const s = await scoreActivity(d, user.id, { actionType: 'habit_check', createdAt: habit.createdAt })
    await logActivity(d, user.id, 'habit_check', habit.id, s)
    const checkins = [...(habit.checkins || []), new Date().toISOString()]
    const streak = updateStreak({ ...habit, checkins })
    const strength = calcHabitStrength({ ...habit, checkins, streak })
    await d.collection('habits').updateOne({ id: habit.id }, { $set: { checkins, streak, strength } })
    const xp = Math.round(10 * s.score)
    await awardXP(d, user, xp)
    return { reply: `🔥 Checked in "${habit.name}" — streak ${streak}, +${xp} XP (conf ${Math.round(s.score * 100)}%).`, action: 'habit_checked' }
  }
  if (/^(delete|remove)\s+habit\s+/i.test(text)) {
    const q = text.replace(/^(delete|remove)\s+habit\s+/i, '').trim()
    const habit = matchHabitByName(habitsAll, q)
    if (!habit) return { reply: `No habit matches "${q}".`, action: null }
    await d.collection('habits').deleteOne({ id: habit.id, userId: user.id })
    return { reply: `🗑️ Removed habit "${habit.name}".`, action: 'habit_deleted' }
  }

  // ==================== Workspaces ====================
  if (/\b(show|list|my)\s+workspaces?\b/i.test(lower) || /\bteams?\b/i.test(lower)) {
    const ws = await d.collection('workspaces').find({
      $or: [{ ownerId: user.id }, { 'members.userId': user.id }]
    }).toArray()
    if (!ws.length) return { reply: "You're not in any workspace yet. Try 'Create workspace <name>' or use an invite code.", action: null }
    const lines = ws.map((w, i) => `${i + 1}. ${w.name} · ${w.ownerId === user.id ? 'owner' : 'member'} · ${(w.members || []).length + 1} member(s)`).join('\n')
    return { reply: `👥 Your workspaces:\n${lines}`, action: 'list_workspaces' }
  }
  if (/^(create|new)\s+workspace\s+/i.test(text)) {
    const name = text.replace(/^(create|new)\s+workspace\s+/i, '').trim()
    if (!name) return { reply: "Give it a name, e.g. 'Create workspace Design Team'.", action: null }
    const ws = { id: uuidv4(), name, ownerId: user.id, ownerName: user.name, members: [], inviteCode: crypto.randomBytes(4).toString('hex'), createdAt: new Date().toISOString() }
    await d.collection('workspaces').insertOne(ws)
    return { reply: `👥 Created workspace "${name}". Invite code: ${ws.inviteCode}`, action: 'workspace_created' }
  }

  // ==================== Stats / analytics / trust ====================
  if (/\b(weekly summary|week summary|recap|how was my week)\b/i.test(lower)) {
    const weekAgo = new Date(Date.now() - 7 * 86400000)
    const wkDone = done.filter(t => t.completedAt && new Date(t.completedAt) >= weekAgo && !t.flagged)
    const wkCheckins = habitsAll.reduce((a, h) => a + (h.checkins || []).filter(c => new Date(c) >= weekAgo).length, 0)
    return { reply: `📅 Last 7 days:\n• ${wkDone.length} valid task completions\n• ${wkCheckins} habit check-ins\n• XP gained tracked in profile\nKeep going!`, action: 'weekly' }
  }
  if (/\b(trust|security|flagged|suspicious|fake activity)\b/i.test(lower)) {
    const total = await d.collection('activity_logs').countDocuments({ userId: user.id })
    const flagged = await d.collection('activity_logs').countDocuments({ userId: user.id, flagged: true })
    const trustPct = total ? Math.round(((total - flagged) / total) * 100) : 100
    return { reply: `🛡️ Trust score: ${trustPct}% · ${flagged}/${total} actions flagged by the anti-fake layer.${flagged > 0 ? " Use Start → Complete for full XP." : ' Looking squeaky clean.'}`, action: 'trust' }
  }
  if (/\b(xp|level|points|progress)\b/i.test(lower) && !/\btasks?\b/.test(lower)) {
    const fresh = await d.collection('users').findOne({ id: user.id })
    const xp = fresh?.xp || 0, lvl = fresh?.level || 1
    const nextLevel = lvl * 100
    const toNext = nextLevel - xp
    return { reply: `🏆 Level ${lvl} · ${xp} XP · ${toNext > 0 ? `${toNext} XP to Level ${lvl + 1}` : 'level up pending!'}`, action: 'xp' }
  }
  if (/\b(peak|best hour|best time|most productive hour)\b/i.test(lower)) {
    const ins = await generateInsights(d, user)
    if (ins.peakHour) return { reply: `🔥 Your peak window is ${ins.peakHour.start}:00 – ${ins.peakHour.end}:00 (${ins.peakHour.count} completions in range). Schedule hard work there.`, action: 'peak' }
    return { reply: "Not enough data yet. Complete 3+ tasks and I'll detect your peak hours.", action: null }
  }
  if (/\b(stats|productivity|score|analytics|how am i|dashboard)\b/i.test(lower)) {
    const valid = done.filter(t => !t.flagged)
    const rate = allTasks.length ? Math.round((valid.length / allTasks.length) * 100) : 0
    const fresh = await d.collection('users').findOne({ id: user.id })
    return { reply: `📊 Valid completions: ${valid.length}/${allTasks.length} (${rate}%)\n🏆 Level ${fresh?.level || 1} · ${fresh?.xp || 0} XP\n🔁 Habits: ${habitsAll.length}\nType "insights" for personalized tips.`, action: 'stats' }
  }
  if (/\b(insight|suggest|recommend|advice|tips?)\b/i.test(lower)) {
    const { insights } = await generateInsights(d, user)
    const top = insights.slice(0, 3).map(i => `${i.icon} ${i.title}: ${i.message}`).join('\n\n')
    return { reply: top, action: 'insights' }
  }

  // ==================== Fallback ====================
  return {
    reply: `🤔 I didn't catch that. Type "help" to see everything I can do.\n\nPopular commands:\n• Add task <title> tomorrow at 5 PM\n• What's my top task\n• What's due today\n• Show my stats\n• Give me insights\n• Motivate me`,
    action: null
  }
}

async function awardXP(d, user, amount) {
  if (amount <= 0) return
  const newXP = (user.xp || 0) + amount
  const newLevel = Math.floor(newXP / 100) + 1
  await d.collection('users').updateOne({ id: user.id }, { $set: { xp: newXP, level: newLevel } })
}

// =================================================================
// Route handler
// =================================================================
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method
  try {
    const d = await connectToMongo()

    if ((route === '/' || route === '/root') && method === 'GET')
      return cors(NextResponse.json({ message: 'NeuroFlow API alive' }))

    // ---------- Auth ----------
    if (route === '/auth/register' && method === 'POST') {
      const body = await request.json()
      const { name, email, password, role } = body || {}
      if (!name || !email || !password || !role)
        return cors(NextResponse.json({ error: 'name, email, password, role required' }, { status: 400 }))
      const existing = await d.collection('users').findOne({ email: email.toLowerCase() })
      if (existing) return cors(NextResponse.json({ error: 'Email already registered' }, { status: 400 }))
      const { salt, hash } = hashPassword(password)
      const user = {
        id: uuidv4(), name, email: email.toLowerCase(), passwordHash: hash, salt,
        role, preferences: {}, behaviorLogs: [],
        productivityScore: 0, workingHoursPattern: {}, procrastinationScore: 0,
        xp: 0, level: 1, trustScore: 1.0,
        token: uuidv4() + uuidv4(),
        createdAt: new Date().toISOString()
      }
      await d.collection('users').insertOne(user)
      return cors(NextResponse.json({ token: user.token, user: safeUser(user) }))
    }
    if (route === '/auth/login' && method === 'POST') {
      const { email, password } = await request.json()
      const user = await d.collection('users').findOne({ email: (email || '').toLowerCase() })
      if (!user || !verifyPassword(password, user.salt, user.passwordHash))
        return cors(NextResponse.json({ error: 'Invalid credentials' }, { status: 401 }))
      const token = uuidv4() + uuidv4()
      await d.collection('users').updateOne({ id: user.id }, { $set: { token } })
      return cors(NextResponse.json({ token, user: safeUser({ ...user, token }) }))
    }
    if (route === '/auth/me' && method === 'GET') {
      const user = await getUserFromReq(request)
      if (!user) return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      return cors(NextResponse.json({ user: safeUser(user) }))
    }

    // ---------- Protected ----------
    const user = await getUserFromReq(request)
    if (!user) return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    // Tasks
    if (route === '/tasks' && method === 'GET') {
      // Optional workspace filter via query
      const url = new URL(request.url)
      const workspaceId = url.searchParams.get('workspaceId')
      const query = { userId: user.id }
      if (workspaceId === 'none' || !workspaceId) {
        query.$or = [{ workspaceId: { $exists: false } }, { workspaceId: null }]
      } else if (workspaceId) {
        delete query.userId
        query.workspaceId = workspaceId
      }
      const tasks = await d.collection('tasks').find(query).sort({ priority: -1, createdAt: -1 }).toArray()
      const live = tasks.map(t => {
        const { _id, ...rest } = t
        if (t.status === 'pending' && t.deadline) {
          const u = calcUrgency(t.deadline)
          const p = calcPriority({ urgency: u, importance: t.importance, effort: t.effort, delayHistory: t.delayHistory || 0 })
          return { ...rest, urgency: u, priority: p }
        }
        return rest
      })
      return cors(NextResponse.json({ tasks: live }))
    }
    if (route === '/tasks' && method === 'POST') {
      const body = await request.json()
      const { title, description = '', category = 'general', tags = [], deadline = null, importance = 5, effort = 5, workspaceId = null, assignedTo = null } = body
      if (!title) return cors(NextResponse.json({ error: 'title required' }, { status: 400 }))
      // workspace permission check
      if (workspaceId) {
        const ws = await d.collection('workspaces').findOne({ id: workspaceId })
        if (!ws) return cors(NextResponse.json({ error: 'Workspace not found' }, { status: 404 }))
        const isMember = ws.ownerId === user.id || (ws.members || []).some(m => m.userId === user.id)
        if (!isMember) return cors(NextResponse.json({ error: 'Not a workspace member' }, { status: 403 }))
      }
      const urgency = calcUrgency(deadline)
      const delayHistory = await getDelayHistory(d, user.id, category)
      const priority = calcPriority({ urgency, importance, effort, delayHistory })
      const task = {
        id: uuidv4(), userId: user.id, title, description, category, tags,
        urgency, importance, effort, delayHistory, priority,
        deadline: deadline || null, status: 'pending',
        startedAt: null,
        workspaceId, assignedTo,
        createdAt: new Date().toISOString(), completedAt: null
      }
      await d.collection('tasks').insertOne(task)
      await awardXP(d, user, 5)
      const { _id, ...clean } = task
      return cors(NextResponse.json({ task: clean }))
    }
    if (route.startsWith('/tasks/') && route.endsWith('/start') && method === 'POST') {
      const id = path[1]
      const task = await d.collection('tasks').findOne({ id })
      if (!task) return cors(NextResponse.json({ error: 'not found' }, { status: 404 }))
      const owns = task.userId === user.id || (task.workspaceId && (async () => {
        const ws = await d.collection('workspaces').findOne({ id: task.workspaceId })
        return ws && (ws.ownerId === user.id || (ws.members || []).some(m => m.userId === user.id))
      })())
      if (!owns) return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      await d.collection('tasks').updateOne({ id }, { $set: { startedAt: new Date().toISOString() } })
      return cors(NextResponse.json({ ok: true, startedAt: new Date().toISOString() }))
    }
    if (route.startsWith('/tasks/') && route.endsWith('/complete') && method === 'POST') {
      const id = path[1]
      const task = await d.collection('tasks').findOne({ id })
      if (!task) return cors(NextResponse.json({ error: 'not found' }, { status: 404 }))
      // Permission
      if (task.userId !== user.id) {
        if (!task.workspaceId) return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
        const ws = await d.collection('workspaces').findOne({ id: task.workspaceId })
        const isMember = ws && (ws.ownerId === user.id || (ws.members || []).some(m => m.userId === user.id))
        if (!isMember) return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      }
      if (task.status === 'completed')
        return cors(NextResponse.json({ error: 'already completed' }, { status: 400 }))

      // --- Anti-Fake middleware ---
      const s = await scoreActivity(d, user.id, {
        actionType: 'task_complete',
        createdAt: task.createdAt, startedAt: task.startedAt, deadline: task.deadline
      })
      const log = await logActivity(d, user.id, 'task_complete', id, s)
      const baseXP = 15
      const xpEarned = Math.round(baseXP * s.score)
      await d.collection('tasks').updateOne({ id }, {
        $set: {
          status: 'completed',
          completedAt: new Date().toISOString(),
          confidenceScore: s.score,
          flagged: s.flagged,
          completionReasons: s.reasons
        }
      })
      await awardXP(d, user, xpEarned)
      return cors(NextResponse.json({
        ok: true,
        confidence: s.score,
        flagged: s.flagged,
        reasons: s.reasons,
        xpEarned,
        baseXP,
        log
      }))
    }
    if (route.startsWith('/tasks/') && method === 'PUT') {
      const id = path[1]
      const body = await request.json()
      const updates = { ...body }
      delete updates._id; delete updates.id; delete updates.userId
      if (updates.deadline !== undefined || updates.importance !== undefined || updates.effort !== undefined || updates.category !== undefined) {
        const current = await d.collection('tasks').findOne({ id, userId: user.id })
        if (current) {
          const deadline = updates.deadline ?? current.deadline
          const importance = updates.importance ?? current.importance
          const effort = updates.effort ?? current.effort
          const category = updates.category ?? current.category
          const urgency = calcUrgency(deadline)
          const delayHistory = await getDelayHistory(d, user.id, category)
          updates.urgency = urgency
          updates.delayHistory = delayHistory
          updates.priority = calcPriority({ urgency, importance, effort, delayHistory })
        }
      }
      await d.collection('tasks').updateOne({ id, userId: user.id }, { $set: updates })
      const t = await d.collection('tasks').findOne({ id, userId: user.id })
      const { _id, ...clean } = t || {}
      return cors(NextResponse.json({ task: clean }))
    }
    if (route.startsWith('/tasks/') && method === 'DELETE') {
      const id = path[1]
      await d.collection('tasks').deleteOne({ id, userId: user.id })
      return cors(NextResponse.json({ ok: true }))
    }

    // Habits
    if (route === '/habits' && method === 'GET') {
      const habits = await d.collection('habits').find({ userId: user.id }).toArray()
      const withStrength = habits.map(h => {
        const { _id, ...rest } = h
        return { ...rest, strength: calcHabitStrength(h) }
      })
      return cors(NextResponse.json({ habits: withStrength }))
    }
    if (route === '/habits' && method === 'POST') {
      const { name, target = 1 } = await request.json()
      if (!name) return cors(NextResponse.json({ error: 'name required' }, { status: 400 }))
      const habit = { id: uuidv4(), userId: user.id, name, target, checkins: [], streak: 0, strength: 0, createdAt: new Date().toISOString() }
      await d.collection('habits').insertOne(habit)
      const { _id, ...clean } = habit
      return cors(NextResponse.json({ habit: clean }))
    }
    if (route.startsWith('/habits/') && route.endsWith('/checkin') && method === 'POST') {
      const id = path[1]
      const habit = await d.collection('habits').findOne({ id, userId: user.id })
      if (!habit) return cors(NextResponse.json({ error: 'not found' }, { status: 404 }))
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const already = (habit.checkins || []).some(c => new Date(c).setHours(0, 0, 0, 0) === today.getTime())
      if (already) return cors(NextResponse.json({ error: 'Already checked in today', habit }))

      // --- Anti-Fake ---
      const s = await scoreActivity(d, user.id, { actionType: 'habit_check', createdAt: habit.createdAt })
      await logActivity(d, user.id, 'habit_check', id, s)

      const checkins = [...(habit.checkins || []), new Date().toISOString()]
      const streak = updateStreak({ ...habit, checkins })
      const strength = calcHabitStrength({ ...habit, checkins, streak })
      await d.collection('habits').updateOne({ id }, { $set: { checkins, streak, strength } })
      const baseXP = 10
      const xp = Math.round(baseXP * s.score)
      await awardXP(d, user, xp)
      return cors(NextResponse.json({
        habit: { ...habit, checkins, streak, strength },
        confidence: s.score, flagged: s.flagged, reasons: s.reasons, xpEarned: xp, baseXP
      }))
    }
    if (route.startsWith('/habits/') && method === 'DELETE') {
      const id = path[1]
      await d.collection('habits').deleteOne({ id, userId: user.id })
      return cors(NextResponse.json({ ok: true }))
    }

    // Activity Logs (transparency for user)
    if (route === '/activity-logs' && method === 'GET') {
      const logs = await d.collection('activity_logs')
        .find({ userId: user.id })
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray()
      const clean = logs.map(({ _id, ...r }) => r)
      const total = logs.length
      const flagged = logs.filter(l => l.flagged).length
      const trust = total ? Math.round(logs.reduce((a, l) => a + (l.confidenceScore || 0), 0) / total * 100) / 100 : 1.0
      return cors(NextResponse.json({ logs: clean, total, flagged, trust }))
    }

    // Insights
    if (route === '/insights' && method === 'GET')
      return cors(NextResponse.json(await generateInsights(d, user)))

    // Analytics (filtered by confidenceScore>=0.6)
    if (route === '/analytics' && method === 'GET') {
      const tasks = await d.collection('tasks').find({ userId: user.id }).toArray()
      const habits = await d.collection('habits').find({ userId: user.id }).toArray()
      const allCompleted = tasks.filter(t => t.status === 'completed')
      // Valid = not flagged AND (no score or score>=0.6)
      const validCompleted = allCompleted.filter(t => !t.flagged && (t.confidenceScore === undefined || t.confidenceScore >= 0.6))
      const completionRate = tasks.length ? Math.round((validCompleted.length / tasks.length) * 100) : 0
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - i)
        const d1 = new Date(d0); d1.setDate(d1.getDate() + 1)
        const tCompleted = validCompleted.filter(t => {
          const c = new Date(t.completedAt)
          return c >= d0 && c < d1
        }).length
        const hChecked = habits.reduce((acc, h) => acc + ((h.checkins || []).filter(c => {
          const cd = new Date(c); return cd >= d0 && cd < d1
        }).length), 0)
        days.push({ day: d0.toLocaleDateString('en', { weekday: 'short' }), tasks: tCompleted, habits: hChecked })
      }
      const hourBins = Array(24).fill(0)
      validCompleted.forEach(t => { if (t.completedAt) hourBins[new Date(t.completedAt).getHours()]++ })
      const hourly = hourBins.map((v, h) => ({ hour: `${h}`, count: v }))
      const categories = {}
      tasks.forEach(t => { categories[t.category || 'general'] = (categories[t.category || 'general'] || 0) + 1 })
      const catData = Object.entries(categories).map(([name, value]) => ({ name, value }))
      const productivityScore = Math.min(100, Math.round(completionRate * 0.6 + Math.min(40, (habits.reduce((a, h) => a + calcHabitStrength(h), 0) / Math.max(1, habits.length)) * 0.4)))
      await d.collection('users').updateOne({ id: user.id }, { $set: { productivityScore } })
      // Trust
      const totalLogs = await d.collection('activity_logs').countDocuments({ userId: user.id })
      const flaggedLogs = await d.collection('activity_logs').countDocuments({ userId: user.id, flagged: true })
      const trustPct = totalLogs ? Math.round(((totalLogs - flaggedLogs) / totalLogs) * 100) : 100
      return cors(NextResponse.json({
        completionRate, productivityScore,
        totalTasks: tasks.length,
        completedTasks: validCompleted.length,
        allCompletedTasks: allCompleted.length,
        flaggedTasks: allCompleted.length - validCompleted.length,
        totalHabits: habits.length,
        weekly: days, hourly, categories: catData,
        xp: user.xp || 0, level: user.level || 1,
        trustScore: trustPct, totalActions: totalLogs, flaggedActions: flaggedLogs
      }))
    }

    // Chatbot
    if (route === '/chatbot' && method === 'POST') {
      const { message } = await request.json()
      const fresh = await d.collection('users').findOne({ id: user.id })
      const result = await chatbotHandle(d, fresh, message)
      return cors(NextResponse.json(result))
    }

    // =================================================================
    // WORKSPACES / COLLABORATION
    // =================================================================
    if (route === '/workspaces' && method === 'GET') {
      const workspaces = await d.collection('workspaces').find({
        $or: [{ ownerId: user.id }, { 'members.userId': user.id }]
      }).toArray()
      const clean = workspaces.map(({ _id, ...r }) => ({
        ...r,
        role: r.ownerId === user.id ? 'owner' : 'member',
        memberCount: (r.members || []).length + 1
      }))
      return cors(NextResponse.json({ workspaces: clean }))
    }
    if (route === '/workspaces' && method === 'POST') {
      const { name } = await request.json()
      if (!name) return cors(NextResponse.json({ error: 'name required' }, { status: 400 }))
      const ws = {
        id: uuidv4(), name,
        ownerId: user.id, ownerName: user.name,
        members: [],
        inviteCode: crypto.randomBytes(4).toString('hex'),
        createdAt: new Date().toISOString()
      }
      await d.collection('workspaces').insertOne(ws)
      const { _id, ...clean } = ws
      return cors(NextResponse.json({ workspace: { ...clean, role: 'owner', memberCount: 1 } }))
    }
    if (route.startsWith('/workspaces/') && path.length === 2 && method === 'GET') {
      const ws = await d.collection('workspaces').findOne({ id: path[1] })
      if (!ws) return cors(NextResponse.json({ error: 'not found' }, { status: 404 }))
      const isMember = ws.ownerId === user.id || (ws.members || []).some(m => m.userId === user.id)
      if (!isMember) return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const tasks = await d.collection('tasks').find({ workspaceId: ws.id }).sort({ priority: -1 }).toArray()
      const cleanTasks = tasks.map(({ _id, ...r }) => r)
      const { _id, ...rest } = ws
      return cors(NextResponse.json({
        workspace: { ...rest, role: ws.ownerId === user.id ? 'owner' : 'member' },
        tasks: cleanTasks
      }))
    }
    if (route.startsWith('/workspaces/') && route.endsWith('/invite') && method === 'POST') {
      const id = path[1]
      const { email } = await request.json()
      const ws = await d.collection('workspaces').findOne({ id })
      if (!ws) return cors(NextResponse.json({ error: 'not found' }, { status: 404 }))
      if (ws.ownerId !== user.id) return cors(NextResponse.json({ error: 'only owner can invite' }, { status: 403 }))
      const invitee = await d.collection('users').findOne({ email: (email || '').toLowerCase() })
      if (!invitee) return cors(NextResponse.json({ error: 'user with that email not found', inviteCode: ws.inviteCode }, { status: 404 }))
      if ((ws.members || []).some(m => m.userId === invitee.id))
        return cors(NextResponse.json({ error: 'already a member' }, { status: 400 }))
      await d.collection('workspaces').updateOne({ id }, {
        $push: { members: { userId: invitee.id, name: invitee.name, email: invitee.email, role: 'member', joinedAt: new Date().toISOString() } }
      })
      return cors(NextResponse.json({ ok: true, added: { name: invitee.name, email: invitee.email } }))
    }
    if (route === '/workspaces/join' && method === 'POST') {
      const { inviteCode } = await request.json()
      const ws = await d.collection('workspaces').findOne({ inviteCode })
      if (!ws) return cors(NextResponse.json({ error: 'invalid invite code' }, { status: 404 }))
      if (ws.ownerId === user.id) return cors(NextResponse.json({ error: 'you own this workspace' }, { status: 400 }))
      if ((ws.members || []).some(m => m.userId === user.id))
        return cors(NextResponse.json({ error: 'already a member', workspaceId: ws.id }, { status: 400 }))
      await d.collection('workspaces').updateOne({ id: ws.id }, {
        $push: { members: { userId: user.id, name: user.name, email: user.email, role: 'member', joinedAt: new Date().toISOString() } }
      })
      return cors(NextResponse.json({ ok: true, workspaceId: ws.id, name: ws.name }))
    }
    if (route.startsWith('/workspaces/') && route.endsWith('/analytics') && method === 'GET') {
      const id = path[1]
      const ws = await d.collection('workspaces').findOne({ id })
      if (!ws) return cors(NextResponse.json({ error: 'not found' }, { status: 404 }))
      const isMember = ws.ownerId === user.id || (ws.members || []).some(m => m.userId === user.id)
      if (!isMember) return cors(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
      const tasks = await d.collection('tasks').find({ workspaceId: id }).toArray()
      const valid = tasks.filter(t => t.status === 'completed' && !t.flagged)
      const byMember = {}
      const memberIds = [ws.ownerId, ...(ws.members || []).map(m => m.userId)]
      memberIds.forEach(mid => { byMember[mid] = { created: 0, completed: 0 } })
      tasks.forEach(t => {
        if (t.userId && byMember[t.userId]) byMember[t.userId].created++
        if (t.status === 'completed' && !t.flagged && t.userId && byMember[t.userId]) byMember[t.userId].completed++
      })
      const allMembers = [{ userId: ws.ownerId, name: ws.ownerName, role: 'owner' }, ...(ws.members || [])]
      const memberStats = allMembers.map(m => ({ ...m, ...byMember[m.userId] }))
      return cors(NextResponse.json({
        totalTasks: tasks.length,
        validCompleted: valid.length,
        completionRate: tasks.length ? Math.round((valid.length / tasks.length) * 100) : 0,
        memberStats
      }))
    }
    if (route.startsWith('/workspaces/') && method === 'DELETE') {
      const id = path[1]
      const ws = await d.collection('workspaces').findOne({ id })
      if (!ws) return cors(NextResponse.json({ error: 'not found' }, { status: 404 }))
      if (ws.ownerId !== user.id) return cors(NextResponse.json({ error: 'only owner can delete' }, { status: 403 }))
      await d.collection('workspaces').deleteOne({ id })
      await d.collection('tasks').deleteMany({ workspaceId: id })
      return cors(NextResponse.json({ ok: true }))
    }

    return cors(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }))
  } catch (e) {
    console.error('API Error:', e)
    return cors(NextResponse.json({ error: 'Internal server error', detail: e.message }, { status: 500 }))
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
