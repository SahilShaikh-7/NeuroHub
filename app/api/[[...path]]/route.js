import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

// ---------- MongoDB ----------
let client, db
async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME || 'neuroflow')
  }
  return db
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

// ---------- Priority / Habit / AI engine ----------
// Priority = 0.4u + 0.3i + 0.2e + 0.1 * delayHistory (all scored 0-10)
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
  // Note: effort scored so low effort = higher priority contribution (inverse 10-effort)
  const e = 10 - (effort || 5)
  const p = 0.4 * urgency + 0.3 * importance + 0.2 * e + 0.1 * delayHistory
  return Math.round(p * 100) / 100
}

// delayHistory: how much user historically delays similar-category tasks (0-10)
async function getDelayHistory(d, userId, category) {
  const past = await d.collection('tasks')
    .find({ userId, category, status: 'completed' })
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
  // normalize to 0-10: 0h=0, 24h=5, 72h+=10
  return Math.min(10, Math.round((avg / 7.2) * 10) / 10)
}

function calcHabitStrength(habit) {
  const checkins = habit.checkins || []
  if (!checkins.length) return 0
  const start = new Date(habit.createdAt).getTime()
  const days = Math.max(1, Math.floor((Date.now() - start) / 86400000))
  const consistency = Math.min(1, checkins.length / days)
  // decay: days since last checkin
  const last = new Date(checkins[checkins.length - 1]).getTime()
  const daysSinceLast = Math.floor((Date.now() - last) / 86400000)
  const decay = Math.pow(0.92, Math.max(0, daysSinceLast - 1))
  // streak bonus
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

// AI adaptive engine
async function generateInsights(d, user) {
  const uid = user.id
  const tasks = await d.collection('tasks').find({ userId: uid }).toArray()
  const completed = tasks.filter(t => t.status === 'completed' && t.completedAt)
  const insights = []
  let peakHour = null, procrastinationWindow = null

  // Peak productivity hours (from completions)
  if (completed.length >= 3) {
    const hourBins = Array(24).fill(0)
    for (const t of completed) hourBins[new Date(t.completedAt).getHours()]++
    // find peak 3-hour window
    let best = 0, bestStart = 9
    for (let h = 0; h < 22; h++) {
      const sum = hourBins[h] + hourBins[h + 1] + hourBins[h + 2]
      if (sum > best) { best = sum; bestStart = h }
    }
    peakHour = { start: bestStart, end: bestStart + 3, count: best }
    insights.push({
      type: 'peak',
      icon: '🔥',
      title: 'Peak productivity window detected',
      message: `You work best between ${bestStart}:00 – ${bestStart + 3}:00. Schedule your hardest tasks here.`
    })
    // Drop-off after hour
    const lateCount = hourBins.slice(20).reduce((a, b) => a + b, 0)
    const earlyCount = hourBins.slice(6, 12).reduce((a, b) => a + b, 0)
    if (earlyCount > lateCount * 2 && earlyCount > 2) {
      insights.push({
        type: 'drop',
        icon: '🌙',
        title: 'Evening productivity drop',
        message: 'Your productivity drops significantly after 8 PM. Consider winding down earlier.'
      })
    }
  }

  // Procrastination: tasks that were completed late
  const lateTasks = completed.filter(t => t.deadline && new Date(t.completedAt) > new Date(t.deadline))
  if (completed.length >= 3 && lateTasks.length / completed.length > 0.3) {
    insights.push({
      type: 'procrastination',
      icon: '⏰',
      title: 'Procrastination pattern detected',
      message: `${Math.round((lateTasks.length / completed.length) * 100)}% of your tasks finish past the deadline. Try breaking them into smaller chunks.`
    })
  }

  // Category-level delay detection
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
        type: 'category_delay',
        icon: '🎯',
        title: `You delay "${cat}" tasks`,
        message: `Schedule ${cat} tasks earlier — future priority will be auto-boosted.`
      })
    }
  }

  // Fast completer
  const fast = completed.filter(t => t.deadline && new Date(t.completedAt) < new Date(t.deadline))
  if (completed.length >= 5 && fast.length / completed.length > 0.7) {
    insights.push({
      type: 'fast',
      icon: '⚡',
      title: 'Fast completer',
      message: "You finish most tasks ahead of deadline — you're crushing it!"
    })
  }

  // Habit insights
  const habits = await d.collection('habits').find({ userId: uid }).toArray()
  const skipped = habits.filter(h => {
    if (!h.checkins || !h.checkins.length) return false
    const last = new Date(h.checkins[h.checkins.length - 1])
    return (Date.now() - last.getTime()) > 86400000 * 2
  })
  if (skipped.length) {
    insights.push({
      type: 'habit_skip',
      icon: '🔁',
      title: 'Habits slipping',
      message: `You've skipped ${skipped.length} habit${skipped.length > 1 ? 's' : ''} for 2+ days. Quick check-in now?`
    })
  }

  // Role-specific nudges
  if (user.role === 'student') {
    const examTasks = tasks.filter(t => /exam|test|quiz|assignment/i.test((t.title || '') + ' ' + (t.category || '')))
    if (examTasks.length) insights.push({
      type: 'role',
      icon: '📚',
      title: 'Study strategy',
      message: `You have ${examTasks.length} academic task(s). Break study sessions into 45-min Pomodoros.`
    })
  } else if (user.role === 'professional') {
    const meetings = tasks.filter(t => /meeting|call|sync|standup/i.test(t.title || ''))
    if (meetings.length) insights.push({
      type: 'role',
      icon: '💼',
      title: 'Meeting load',
      message: `${meetings.length} meeting(s) tracked. Block deep-work hours to protect focus.`
    })
  } else if (user.role === 'freelancer') {
    const byClient = {}
    tasks.forEach(t => { if (t.tags) t.tags.forEach(tg => byClient[tg] = (byClient[tg] || 0) + 1) })
    const topClient = Object.entries(byClient).sort((a, b) => b[1] - a[1])[0]
    if (topClient) insights.push({
      type: 'role',
      icon: '💰',
      title: 'Top client',
      message: `"${topClient[0]}" is your busiest tag (${topClient[1]} tasks). Consider premium pricing.`
    })
  }

  if (!insights.length) {
    insights.push({
      type: 'onboard',
      icon: '✨',
      title: 'Complete a few tasks to unlock insights',
      message: 'Once you have 3+ completed tasks, NeuroFlow will detect your productivity patterns automatically.'
    })
  }

  return { insights, peakHour, procrastinationWindow }
}

// ---------- Chatbot (rule-based NLU) ----------
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
async function chatbotHandle(d, user, message) {
  const text = (message || '').trim()
  const lower = text.toLowerCase()

  // Intent: add task
  if (/^(add|create|new)\s+(task|todo)/i.test(text) || /^remind me to/i.test(text)) {
    let title = text
      .replace(/^(add|create|new)\s+(task|todo)\s*:?/i, '')
      .replace(/^remind me to/i, '')
      .trim()
    const deadline = parseDateHint(title)
    // strip date tokens from title
    title = title
      .replace(/\b(tomorrow|today|tonight)\b/gi, '')
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
      status: 'pending', createdAt: new Date().toISOString(), completedAt: null
    }
    await d.collection('tasks').insertOne(task)
    await awardXP(d, user, 5)
    const { _id, ...clean } = task
    return { reply: `✅ Added task "${title}"${deadline ? ` due ${deadline.toLocaleString()}` : ''} (priority ${priority})`, action: 'task_created', data: clean }
  }

  // Intent: list/show tasks
  if (/\b(show|list|what are|view)\b.*(tasks?|pending|todos?)/i.test(lower) || /\b(my|pending) tasks\b/i.test(lower)) {
    const tasks = await d.collection('tasks').find({ userId: user.id, status: 'pending' }).sort({ priority: -1 }).limit(10).toArray()
    if (!tasks.length) return { reply: "🎉 No pending tasks! You're all caught up.", action: 'list_tasks' }
    const lines = tasks.slice(0, 5).map((t, i) => `${i + 1}. ${t.title} (P${t.priority}${t.deadline ? ' · ' + new Date(t.deadline).toLocaleDateString() : ''})`).join('\n')
    return { reply: `You have ${tasks.length} pending task(s):\n${lines}`, action: 'list_tasks' }
  }

  // Intent: complete task
  if (/^(complete|finish|done|mark done)\s+/i.test(text)) {
    const q = text.replace(/^(complete|finish|done|mark done)\s+/i, '').trim()
    const tasks = await d.collection('tasks').find({ userId: user.id, status: 'pending' }).toArray()
    const match = tasks.find(t => t.title.toLowerCase().includes(q.toLowerCase()))
    if (!match) return { reply: `Couldn't find a pending task matching "${q}".`, action: null }
    await d.collection('tasks').updateOne({ id: match.id }, { $set: { status: 'completed', completedAt: new Date().toISOString() } })
    await awardXP(d, user, 15)
    return { reply: `🎯 Completed "${match.title}" — +15 XP!`, action: 'task_completed' }
  }

  // Intent: habit add
  if (/^(add|create|track)\s+habit/i.test(text)) {
    const name = text.replace(/^(add|create|track)\s+habit\s*:?/i, '').trim()
    if (!name) return { reply: 'Give your habit a name, e.g. "Add habit read 30 min"', action: null }
    const habit = { id: uuidv4(), userId: user.id, name, checkins: [], streak: 0, strength: 0, createdAt: new Date().toISOString() }
    await d.collection('habits').insertOne(habit)
    const { _id, ...clean } = habit
    return { reply: `🔁 Started tracking habit: ${name}`, action: 'habit_created', data: clean }
  }

  // Intent: stats
  if (/\b(stats|productivity|score|analytics|how am i)\b/i.test(lower)) {
    const tasks = await d.collection('tasks').find({ userId: user.id }).toArray()
    const completed = tasks.filter(t => t.status === 'completed').length
    const rate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
    return { reply: `📊 You've completed ${completed}/${tasks.length} tasks (${rate}%). XP: ${user.xp || 0}, Level: ${user.level || 1}.`, action: 'stats' }
  }

  // Intent: insight request
  if (/\b(insight|suggest|recommend|advice|tips?)\b/i.test(lower)) {
    const { insights } = await generateInsights(d, user)
    const top = insights.slice(0, 3).map(i => `${i.icon} ${i.title}: ${i.message}`).join('\n\n')
    return { reply: top, action: 'insights' }
  }

  // Fallback
  return {
    reply: `I can help you with:\n• "Add task finish report tomorrow at 5 PM"\n• "Show my pending tasks"\n• "Complete <task name>"\n• "Add habit read 30 min"\n• "Show my stats"\n• "Give me insights"`,
    action: null
  }
}

async function awardXP(d, user, amount) {
  const newXP = (user.xp || 0) + amount
  const newLevel = Math.floor(newXP / 100) + 1
  await d.collection('users').updateOne({ id: user.id }, { $set: { xp: newXP, level: newLevel } })
}

// ---------- Route handler ----------
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const d = await connectToMongo()

    // Health
    if ((route === '/' || route === '/root') && method === 'GET')
      return cors(NextResponse.json({ message: 'NeuroFlow API alive' }))

    // ----- Auth -----
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
        xp: 0, level: 1,
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

    // ----- Protected routes -----
    const user = await getUserFromReq(request)
    if (!user) return cors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    // Tasks
    if (route === '/tasks' && method === 'GET') {
      const tasks = await d.collection('tasks').find({ userId: user.id }).sort({ priority: -1, createdAt: -1 }).toArray()
      // recompute urgency live (since time passes)
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
      const { title, description = '', category = 'general', tags = [], deadline = null, importance = 5, effort = 5 } = body
      if (!title) return cors(NextResponse.json({ error: 'title required' }, { status: 400 }))
      const urgency = calcUrgency(deadline)
      const delayHistory = await getDelayHistory(d, user.id, category)
      const priority = calcPriority({ urgency, importance, effort, delayHistory })
      const task = {
        id: uuidv4(), userId: user.id, title, description, category, tags,
        urgency, importance, effort, delayHistory, priority,
        deadline: deadline || null, status: 'pending',
        createdAt: new Date().toISOString(), completedAt: null
      }
      await d.collection('tasks').insertOne(task)
      await awardXP(d, user, 5)
      const { _id, ...clean } = task
      return cors(NextResponse.json({ task: clean }))
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
    if (route.startsWith('/tasks/') && route.endsWith('/complete') && method === 'POST') {
      const id = path[1]
      await d.collection('tasks').updateOne({ id, userId: user.id }, { $set: { status: 'completed', completedAt: new Date().toISOString() } })
      await awardXP(d, user, 15)
      await d.collection('users').updateOne({ id: user.id }, { $push: { behaviorLogs: { type: 'task_complete', taskId: id, at: new Date().toISOString() } } })
      return cors(NextResponse.json({ ok: true }))
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
      // prevent duplicate checkin same day
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const already = (habit.checkins || []).some(c => new Date(c).setHours(0, 0, 0, 0) === today.getTime())
      if (already) return cors(NextResponse.json({ error: 'Already checked in today', habit }))
      const checkins = [...(habit.checkins || []), new Date().toISOString()]
      const streak = updateStreak({ ...habit, checkins })
      const strength = calcHabitStrength({ ...habit, checkins, streak })
      await d.collection('habits').updateOne({ id }, { $set: { checkins, streak, strength } })
      await awardXP(d, user, 10)
      return cors(NextResponse.json({ habit: { ...habit, checkins, streak, strength } }))
    }
    if (route.startsWith('/habits/') && method === 'DELETE') {
      const id = path[1]
      await d.collection('habits').deleteOne({ id, userId: user.id })
      return cors(NextResponse.json({ ok: true }))
    }

    // AI Insights
    if (route === '/insights' && method === 'GET') {
      const data = await generateInsights(d, user)
      return cors(NextResponse.json(data))
    }

    // Analytics
    if (route === '/analytics' && method === 'GET') {
      const tasks = await d.collection('tasks').find({ userId: user.id }).toArray()
      const habits = await d.collection('habits').find({ userId: user.id }).toArray()
      const completed = tasks.filter(t => t.status === 'completed')
      const completionRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0
      // last 7 days
      const days = []
      for (let i = 6; i >= 0; i--) {
        const d0 = new Date(); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - i)
        const d1 = new Date(d0); d1.setDate(d1.getDate() + 1)
        const tCompleted = completed.filter(t => {
          const c = new Date(t.completedAt)
          return c >= d0 && c < d1
        }).length
        const hChecked = habits.reduce((acc, h) => acc + ((h.checkins || []).filter(c => {
          const cd = new Date(c); return cd >= d0 && cd < d1
        }).length), 0)
        days.push({ day: d0.toLocaleDateString('en', { weekday: 'short' }), tasks: tCompleted, habits: hChecked })
      }
      // hour distribution
      const hourBins = Array(24).fill(0)
      completed.forEach(t => { if (t.completedAt) hourBins[new Date(t.completedAt).getHours()]++ })
      const hourly = hourBins.map((v, h) => ({ hour: `${h}`, count: v }))
      // category breakdown
      const categories = {}
      tasks.forEach(t => { categories[t.category || 'general'] = (categories[t.category || 'general'] || 0) + 1 })
      const catData = Object.entries(categories).map(([name, value]) => ({ name, value }))
      // productivity score (dynamic)
      const productivityScore = Math.min(100, Math.round(completionRate * 0.6 + Math.min(40, (habits.reduce((a, h) => a + calcHabitStrength(h), 0) / Math.max(1, habits.length)) * 0.4)))
      await d.collection('users').updateOne({ id: user.id }, { $set: { productivityScore } })
      return cors(NextResponse.json({
        completionRate, productivityScore,
        totalTasks: tasks.length, completedTasks: completed.length,
        totalHabits: habits.length,
        weekly: days, hourly, categories: catData,
        xp: user.xp || 0, level: user.level || 1
      }))
    }

    // Chatbot
    if (route === '/chatbot' && method === 'POST') {
      const { message } = await request.json()
      const fresh = await d.collection('users').findOne({ id: user.id })
      const result = await chatbotHandle(d, fresh, message)
      return cors(NextResponse.json(result))
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
