'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import {
  Brain, CheckCircle2, Circle, Trash2, Plus, Zap, Target, Flame, TrendingUp,
  Sparkles, MessageSquare, Send, BarChart3, User, LogOut, Calendar, Clock,
  GraduationCap, Briefcase, DollarSign, Shield, Trophy, Rocket, Activity
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

// ---------- API helper ----------
const API = '/api'
const apiFetch = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nf_token') : null
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const ROLES = [
  { id: 'student', label: 'Student', icon: GraduationCap, color: 'from-blue-500 to-cyan-500', desc: 'Track study hours, subjects, exams' },
  { id: 'professional', label: 'Professional', icon: Briefcase, color: 'from-purple-500 to-pink-500', desc: 'Manage deadlines, meetings, projects' },
  { id: 'freelancer', label: 'Freelancer', icon: DollarSign, color: 'from-amber-500 to-orange-500', desc: 'Organize clients, projects, billing' },
  { id: 'admin', label: 'Admin', icon: Shield, color: 'from-emerald-500 to-teal-500', desc: 'Oversee teams and productivity' },
]

// ==================== AUTH SCREEN ====================
function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('professional')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register'
      const body = mode === 'login' ? { email, password } : { name, email, password, role }
      const data = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) })
      localStorage.setItem('nf_token', data.token)
      onAuthed(data.user)
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-purple-950/20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>
      <Card className="w-full max-w-md relative backdrop-blur-sm border-purple-500/20">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Brain className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            NeuroFlow
          </CardTitle>
          <CardDescription>Offline AI Adaptive Productivity System</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">Log In</TabsTrigger>
              <TabsTrigger value="register">Sign Up</TabsTrigger>
            </TabsList>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div className="space-y-2">
                    <Label>Your name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Ada Lovelace" />
                  </div>
                  <div className="space-y-2">
                    <Label>I am a...</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ROLES.map(r => (
                        <button key={r.id} type="button" onClick={() => setRole(r.id)}
                          className={`p-3 rounded-lg border text-left transition-all ${role === r.id ? 'border-purple-500 bg-purple-500/10' : 'border-border hover:border-purple-500/50'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <r.icon className="w-4 h-4" />
                            <span className="font-medium text-sm">{r.label}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{r.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700">
                {loading ? 'Please wait...' : (mode === 'login' ? 'Log In' : 'Create Account')}
              </Button>
            </form>
          </Tabs>
          <p className="text-xs text-center text-muted-foreground mt-6">
            Your data is local-first. No paid AI APIs. All intelligence runs on rules + behavioral analytics.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== TASK FORM ====================
function TaskForm({ onCreate, defaultCategory }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(defaultCategory || 'general')
  const [tags, setTags] = useState('')
  const [deadline, setDeadline] = useState('')
  const [importance, setImportance] = useState([5])
  const [effort, setEffort] = useState([5])

  const submit = async () => {
    if (!title.trim()) return toast.error('Title required')
    try {
      const data = await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), description, category,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          deadline: deadline ? new Date(deadline).toISOString() : null,
          importance: importance[0], effort: effort[0]
        })
      })
      onCreate(data.task)
      setOpen(false)
      setTitle(''); setDescription(''); setTags(''); setDeadline(''); setImportance([5]); setEffort([5])
      toast.success('Task added (+5 XP)')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-purple-600 to-cyan-600"><Plus className="w-4 h-4 mr-1" />New Task</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create a smart task</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Finish quarterly report" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="work, study, coding" />
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tags (comma separated)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="client-a, urgent" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label>Importance</Label><span className="text-sm text-muted-foreground">{importance[0]}/10</span></div>
            <Slider value={importance} onValueChange={setImportance} max={10} min={1} step={1} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label>Effort</Label><span className="text-sm text-muted-foreground">{effort[0]}/10</span></div>
            <Slider value={effort} onValueChange={setEffort} max={10} min={1} step={1} />
            <p className="text-xs text-muted-foreground">Lower effort = higher computed priority (easy wins first)</p>
          </div>
          <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/20 text-xs">
            <b>Dynamic priority</b> is computed as: <code>0.4×urgency + 0.3×importance + 0.2×(10−effort) + 0.1×delayHistory</code>. Your past behavior auto-adjusts future urgency.
          </div>
        </div>
        <DialogFooter><Button onClick={submit} className="bg-gradient-to-r from-purple-600 to-cyan-600">Create Task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== TASK LIST ====================
function TaskList({ tasks, reload }) {
  const complete = async (id) => {
    try { await apiFetch(`/tasks/${id}/complete`, { method: 'POST' }); toast.success('Task completed (+15 XP)'); reload() }
    catch (e) { toast.error(e.message) }
  }
  const del = async (id) => {
    try { await apiFetch(`/tasks/${id}`, { method: 'DELETE' }); reload() } catch (e) { toast.error(e.message) }
  }
  if (!tasks.length) return (
    <div className="text-center py-16 text-muted-foreground">
      <Target className="w-12 h-12 mx-auto mb-4 opacity-40" />
      <p>No tasks yet. Create your first smart task →</p>
    </div>
  )
  return (
    <div className="space-y-2">
      {tasks.map(t => {
        const prColor = t.priority >= 7 ? 'bg-red-500' : t.priority >= 5 ? 'bg-amber-500' : 'bg-emerald-500'
        const overdue = t.deadline && new Date(t.deadline) < new Date() && t.status === 'pending'
        return (
          <Card key={t.id} className={`group hover:border-purple-500/40 transition ${t.status === 'completed' ? 'opacity-60' : ''}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <button onClick={() => t.status !== 'completed' && complete(t.id)} className="shrink-0">
                {t.status === 'completed'
                  ? <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  : <Circle className="w-6 h-6 text-muted-foreground hover:text-purple-500" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${t.status === 'completed' ? 'line-through' : ''}`}>{t.title}</span>
                  <Badge variant="outline" className="text-xs">{t.category}</Badge>
                  {t.tags?.map(tg => <Badge key={tg} variant="secondary" className="text-xs">#{tg}</Badge>)}
                  {overdue && <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">Overdue</Badge>}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" />Priority {t.priority}</span>
                  {t.deadline && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(t.deadline).toLocaleString()}</span>}
                  <span>U{t.urgency} · I{t.importance} · E{t.effort}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                <div className={`w-2 h-8 rounded-full ${prColor}`} title="Priority" />
                <Button variant="ghost" size="icon" onClick={() => del(t.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ==================== HABITS ====================
function Habits({ habits, reload }) {
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    try { await apiFetch('/habits', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); setName(''); reload() }
    catch (e) { toast.error(e.message) }
  }
  const checkin = async (id) => {
    try {
      const r = await apiFetch(`/habits/${id}/checkin`, { method: 'POST' })
      if (r.error) toast.info(r.error); else toast.success('Checked in (+10 XP)')
      reload()
    } catch (e) { toast.error(e.message) }
  }
  const del = async (id) => { await apiFetch(`/habits/${id}`, { method: 'DELETE' }); reload() }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="New habit (e.g. 'Read 30 min')" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <Button onClick={add} className="bg-gradient-to-r from-purple-600 to-cyan-600"><Plus className="w-4 h-4" /></Button>
      </div>
      {!habits.length && <p className="text-center text-muted-foreground py-10">No habits yet. Small wins compound.</p>}
      <div className="grid md:grid-cols-2 gap-3">
        {habits.map(h => (
          <Card key={h.id} className="hover:border-purple-500/40 transition">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{h.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" />Streak {h.streak || 0}</span>
                    <span>{(h.checkins || []).length} check-ins</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => del(h.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Habit strength</span>
                  <span className="text-purple-400">{h.strength || 0}%</span>
                </div>
                <Progress value={Math.min(100, h.strength || 0)} />
              </div>
              <Button size="sm" onClick={() => checkin(h.id)} className="w-full bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30">
                Check in today
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ==================== INSIGHTS ====================
function Insights({ data }) {
  if (!data?.insights?.length) return null
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {data.insights.map((i, idx) => (
        <Card key={idx} className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-cyan-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">{i.icon}</div>
              <div>
                <h4 className="font-semibold mb-1">{i.title}</h4>
                <p className="text-sm text-muted-foreground">{i.message}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ==================== ANALYTICS ====================
function Analytics({ data }) {
  if (!data) return <p className="text-muted-foreground">Loading...</p>
  const COLORS = ['#a855f7', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#6366f1']
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Productivity</span><Activity className="w-4 h-4 text-purple-400" /></div>
          <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">{data.productivityScore}</div>
          <Progress value={data.productivityScore} className="mt-2" />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Completion Rate</span><Target className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-3xl font-bold">{data.completionRate}%</div>
          <p className="text-xs text-muted-foreground mt-1">{data.completedTasks}/{data.totalTasks} tasks</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">XP</span><Trophy className="w-4 h-4 text-amber-400" /></div>
          <div className="text-3xl font-bold text-amber-400">{data.xp}</div>
          <p className="text-xs text-muted-foreground mt-1">Level {data.level}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Habits</span><Flame className="w-4 h-4 text-orange-400" /></div>
          <div className="text-3xl font-bold">{data.totalHabits}</div>
          <p className="text-xs text-muted-foreground mt-1">tracking</p>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Last 7 days</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.weekly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Legend />
                <Bar dataKey="tasks" fill="#a855f7" name="Tasks" radius={[4,4,0,0]} />
                <Bar dataKey="habits" fill="#06b6d4" name="Habits" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Hourly activity (completions)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.hourly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="hour" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Line type="monotone" dataKey="count" stroke="#a855f7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Task categories</CardTitle></CardHeader>
        <CardContent>
          {data.categories.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.categories} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {data.categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground py-8">Add tasks with categories to see breakdown.</p>}
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== CHATBOT ====================
function Chatbot({ onAction }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { from: 'bot', text: "Hi! I'm your NeuroFlow assistant. Try:\n• Add task finish report tomorrow at 5 PM\n• Show my pending tasks\n• Give me insights" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setMessages(m => [...m, { from: 'user', text }])
    setInput(''); setLoading(true)
    try {
      const r = await apiFetch('/chatbot', { method: 'POST', body: JSON.stringify({ message: text }) })
      setMessages(m => [...m, { from: 'bot', text: r.reply }])
      if (r.action) onAction?.(r.action)
    } catch (e) {
      setMessages(m => [...m, { from: 'bot', text: 'Error: ' + e.message }])
    } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-cyan-600 shadow-lg shadow-purple-500/30 flex items-center justify-center hover:scale-110 transition z-50">
        {open ? <span className="text-white text-xl">×</span> : <MessageSquare className="w-6 h-6 text-white" />}
      </button>
      {open && (
        <div className="fixed bottom-24 right-6 w-[min(92vw,400px)] h-[550px] bg-card border border-purple-500/20 rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden">
          <div className="p-3 border-b flex items-center gap-2 bg-gradient-to-r from-purple-500/10 to-cyan-500/10">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-sm">NeuroFlow Assistant</span>
            <Badge variant="outline" className="text-xs ml-auto">local · rule-based</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.from === 'user' ? 'bg-purple-600 text-white' : 'bg-muted'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-muted-foreground">thinking...</div>}
            <div ref={endRef} />
          </div>
          <div className="p-3 border-t flex gap-2">
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a command..." />
            <Button size="icon" onClick={send} disabled={loading}><Send className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </>
  )
}

// ==================== ROLE-SPECIFIC WIDGETS ====================
function RoleBanner({ user, analytics }) {
  const role = ROLES.find(r => r.id === user.role) || ROLES[1]
  const RoleIcon = role.icon
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  let subtitle = ''
  if (user.role === 'student') subtitle = `You have ${analytics?.totalTasks || 0} study items · keep your streak alive`
  else if (user.role === 'professional') subtitle = `${analytics?.completedTasks || 0} wins this period · deep work mode`
  else if (user.role === 'freelancer') subtitle = `${analytics?.totalTasks || 0} project tasks · ship value today`
  else subtitle = `Level ${user.level || 1} · ${user.xp || 0} XP`

  return (
    <div className={`rounded-2xl p-6 bg-gradient-to-r ${role.color} text-white shadow-lg overflow-hidden relative`}>
      <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
      <div className="relative flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm opacity-90"><RoleIcon className="w-4 h-4" />{role.label}</div>
          <h1 className="text-3xl font-bold mt-1">{greeting}, {user.name?.split(' ')[0] || 'friend'}</h1>
          <p className="opacity-90 mt-1">{subtitle}</p>
        </div>
        <div className="hidden md:flex gap-4">
          <div className="text-center"><div className="text-3xl font-bold">{analytics?.productivityScore || 0}</div><div className="text-xs opacity-80">Productivity</div></div>
          <div className="text-center"><div className="text-3xl font-bold">{analytics?.level || 1}</div><div className="text-xs opacity-80">Level</div></div>
          <div className="text-center"><div className="text-3xl font-bold">{analytics?.xp || 0}</div><div className="text-xs opacity-80">XP</div></div>
        </div>
      </div>
    </div>
  )
}

// ==================== MAIN APP ====================
function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState([])
  const [habits, setHabits] = useState([])
  const [insights, setInsights] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [tab, setTab] = useState('dashboard')

  // init
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('nf_token')
      if (!token) { setLoading(false); return }
      try {
        const { user } = await apiFetch('/auth/me')
        setUser(user)
      } catch { localStorage.removeItem('nf_token') }
      setLoading(false)
    })()
  }, [])

  const reloadAll = async () => {
    if (!user) return
    try {
      const [t, h, i, a] = await Promise.all([
        apiFetch('/tasks'), apiFetch('/habits'), apiFetch('/insights'), apiFetch('/analytics')
      ])
      setTasks(t.tasks); setHabits(h.habits); setInsights(i); setAnalytics(a)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { if (user) reloadAll() }, [user])

  // request notification permission
  useEffect(() => {
    if (user && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [user])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Brain className="w-8 h-8 animate-pulse text-purple-500" /></div>
  if (!user) return <AuthScreen onAuthed={u => setUser(u)} />

  const pending = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')
  const top3 = pending.slice(0, 3)

  const logout = () => { localStorage.removeItem('nf_token'); setUser(null) }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center"><Brain className="w-5 h-5 text-white" /></div>
            <span className="font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">NeuroFlow</span>
            <Badge variant="outline" className="ml-2 text-xs hidden sm:inline-flex">offline-first · local AI</Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Lv {user.level || 1} · {user.xp || 0} XP</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-sm">{user.name?.[0]?.toUpperCase()}</div>
              <Button variant="ghost" size="icon" onClick={logout}><LogOut className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <RoleBanner user={user} analytics={analytics} />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-5 max-w-2xl">
            <TabsTrigger value="dashboard"><Rocket className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">Dashboard</span></TabsTrigger>
            <TabsTrigger value="tasks"><Target className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">Tasks</span></TabsTrigger>
            <TabsTrigger value="habits"><Flame className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">Habits</span></TabsTrigger>
            <TabsTrigger value="insights"><Sparkles className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">AI</span></TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">Analytics</span></TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4 mt-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="md:col-span-2 border-purple-500/20">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-purple-400" />Top priorities</CardTitle>
                    <CardDescription>Ranked by dynamic priority algorithm</CardDescription>
                  </div>
                  <TaskForm onCreate={() => reloadAll()} />
                </CardHeader>
                <CardContent>
                  {top3.length ? <TaskList tasks={top3} reload={reloadAll} /> : <p className="text-center text-muted-foreground py-6">No priority tasks. Create one!</p>}
                </CardContent>
              </Card>
              <Card className="border-cyan-500/20">
                <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-cyan-400" />Top insight</CardTitle></CardHeader>
                <CardContent>
                  {insights?.insights?.[0] ? (
                    <div className="space-y-2">
                      <div className="text-3xl">{insights.insights[0].icon}</div>
                      <h4 className="font-semibold">{insights.insights[0].title}</h4>
                      <p className="text-sm text-muted-foreground">{insights.insights[0].message}</p>
                      <Button variant="ghost" size="sm" onClick={() => setTab('insights')}>View all →</Button>
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Insights appear as you log activity.</p>}
                </CardContent>
              </Card>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-bold">{pending.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-bold text-emerald-400">{completed.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active habits</div><div className="text-2xl font-bold text-orange-400">{habits.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Productivity</div><div className="text-2xl font-bold text-purple-400">{analytics?.productivityScore || 0}</div></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Smart Tasks <span className="text-sm text-muted-foreground ml-2">{pending.length} pending · {completed.length} done</span></h2>
              <TaskForm onCreate={() => reloadAll()} />
            </div>
            <TaskList tasks={tasks} reload={reloadAll} />
          </TabsContent>

          <TabsContent value="habits" className="space-y-4 mt-4">
            <h2 className="text-xl font-semibold">Habits</h2>
            <Habits habits={habits} reload={reloadAll} />
          </TabsContent>

          <TabsContent value="insights" className="space-y-4 mt-4">
            <div>
              <h2 className="text-xl font-semibold">Adaptive Insights</h2>
              <p className="text-sm text-muted-foreground">Generated locally using behavioral analytics. No external APIs.</p>
            </div>
            <Insights data={insights} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4 mt-4">
            <h2 className="text-xl font-semibold">Analytics</h2>
            <Analytics data={analytics} />
          </TabsContent>
        </Tabs>
      </main>

      <Chatbot onAction={() => reloadAll()} />
    </div>
  )
}

export default App
