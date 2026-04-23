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
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import {
  Brain, CheckCircle2, Circle, Trash2, Plus, Zap, Target, Flame, TrendingUp,
  Sparkles, MessageSquare, Send, BarChart3, LogOut, Calendar, Clock,
  GraduationCap, Briefcase, DollarSign, Shield, Trophy, Rocket, Activity,
  Play, ShieldCheck, AlertTriangle, WifiOff, Wifi, Bell, Users, Copy, UserPlus,
  LogIn, ArrowRight, Lock, Gauge, Cpu
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'
import { enqueue, flushQueue, getQueueSize } from '@/lib/offline'

// ---------- API helper with offline queueing ----------
const API = '/api'
const rawFetch = async (path, opts = {}) => {
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
const apiFetch = async (path, opts = {}) => {
  const method = (opts.method || 'GET').toUpperCase()
  const isMutation = method !== 'GET'
  try {
    return await rawFetch(path, opts)
  } catch (e) {
    // If offline and mutation, queue
    if (isMutation && typeof window !== 'undefined' && !navigator.onLine) {
      await enqueue({ path, method, body: opts.body ? JSON.parse(opts.body) : null })
      toast.info('Offline — change queued and will sync when online.')
      return { queued: true }
    }
    throw e
  }
}

const ROLES = [
  { id: 'student', label: 'Student', icon: GraduationCap, color: 'from-blue-500 to-cyan-500', desc: 'Track study hours, subjects, exams' },
  { id: 'professional', label: 'Professional', icon: Briefcase, color: 'from-purple-500 to-pink-500', desc: 'Manage deadlines, meetings, projects' },
  { id: 'freelancer', label: 'Freelancer', icon: DollarSign, color: 'from-amber-500 to-orange-500', desc: 'Organize clients, projects, billing' },
  { id: 'admin', label: 'Admin', icon: Shield, color: 'from-emerald-500 to-teal-500', desc: 'Oversee teams and productivity' },
]

// ====================================================================
// LANDING PAGE (public)
// ====================================================================
function Landing({ onGetStarted }) {
  const features = [
    { icon: Brain, title: 'Local AI Adaptive Engine', desc: 'Detects your peak productivity windows, procrastination patterns, and category-level delays using pure behavioral analytics — zero paid APIs.' },
    { icon: Zap, title: 'Dynamic Priority Algorithm', desc: 'Priority = 0.4×urgency + 0.3×importance + 0.2×effort + 0.1×delay history. Learns from your past to auto-rank future tasks.' },
    { icon: Flame, title: 'Habit Strength Tracking', desc: 'HabitStrength = base × consistency × decay × streak bonus. Long streaks unlock multipliers; missed days decay strength.' },
    { icon: ShieldCheck, title: 'Anti-Fake Validation Layer', desc: 'Every action gets a confidence score. Too-fast clicks, batch completions, and unusual-hour activity are flagged — XP scales with trust.' },
    { icon: Users, title: 'Team Workspaces', desc: 'Invite teammates, assign shared tasks, and track team productivity — with owner/member roles.' },
    { icon: MessageSquare, title: 'Rule-Based Assistant', desc: '"Add task finish report tomorrow at 5 PM" → parsed locally with regex + intent mapping. No LLM needed.' },
    { icon: WifiOff, title: 'Offline-First + PWA', desc: 'IndexedDB-backed sync queue auto-replays your actions when you reconnect. Install as an app.' },
    { icon: Trophy, title: 'Gamified Growth', desc: 'XP, levels, and streak bonuses make consistency rewarding — while the anti-fake layer keeps them honest.' },
  ]
  const steps = [
    { n: '01', title: 'Create an account & pick a role', desc: 'Student, Professional, Freelancer or Admin — each gets a tailored dashboard.' },
    { n: '02', title: 'Add tasks with smart priorities', desc: 'Set deadline, importance & effort. The engine computes dynamic priority and re-ranks continuously.' },
    { n: '03', title: 'Start → Complete the honest way', desc: 'Hit Start when you begin. Our anti-fake middleware rewards genuine work with full XP.' },
    { n: '04', title: 'Unlock adaptive insights', desc: 'After a few completions, NeuroFlow reveals your peak hours, drop-offs, and procrastination windows.' },
  ]

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-[400px] h-[400px] bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative border-b border-border/40 bg-background/60 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">NeuroFlow</span>
            <Badge variant="outline" className="ml-1 text-[10px] hidden sm:inline-flex border-purple-500/30">v1.0 · local AI</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onGetStarted('login')}><LogIn className="w-4 h-4 mr-2" />Log in</Button>
            <Button onClick={() => onGetStarted('register')} className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:opacity-90">
              Sign up <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative container mx-auto px-4 pt-20 pb-16 text-center">
        <Badge className="mb-4 bg-purple-500/10 text-purple-300 border-purple-500/30">
          <Sparkles className="w-3 h-3 mr-1" /> Offline-first · Zero paid APIs · Anti-fake layer
        </Badge>
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            Productivity that adapts
          </span>
          <br />
          <span className="text-foreground">to how you actually work.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          NeuroFlow is a local-first, role-aware productivity OS. Smart priorities, behavior-aware
          insights, a rule-based assistant, and an anti-fake validation layer — all running without
          paid AI APIs.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Button size="lg" onClick={() => onGetStarted('register')} className="bg-gradient-to-r from-purple-600 to-cyan-600 text-base shadow-lg shadow-purple-500/30">
            Get started free <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => onGetStarted('login')} className="text-base">
            I already have an account
          </Button>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Local-first data</span>
          <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> Rule-based AI</span>
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Anti-fake scoring</span>
          <span className="flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" /> Works offline</span>
        </div>
      </section>

      {/* Role cards */}
      <section className="relative container mx-auto px-4 py-10">
        <h2 className="text-center text-sm uppercase tracking-widest text-muted-foreground mb-6">Built for every kind of worker</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ROLES.map(r => (
            <Card key={r.id} className="border-border/60 hover:border-purple-500/50 transition">
              <CardContent className="p-5">
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${r.color} flex items-center justify-center mb-3`}>
                  <r.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold">{r.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">{r.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold">
            All the intelligence,{' '}
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">none of the API bills.</span>
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            Every feature runs on rule-based heuristics, behavioral analytics, and pattern detection — right on your server.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <Card key={i} className="border-border/60 hover:border-purple-500/40 transition group">
              <CardContent className="p-5">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-3 group-hover:bg-purple-500/20 transition">
                  <f.icon className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="font-semibold text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Anti-fake spotlight */}
      <section className="relative container mx-auto px-4 py-16">
        <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 via-background to-cyan-500/5 overflow-hidden">
          <CardContent className="p-8 sm:p-12 grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <Badge className="mb-3 bg-purple-500/10 text-purple-300 border-purple-500/30">New · Anti-fake layer</Badge>
              <h3 className="text-2xl sm:text-3xl font-bold mb-3">
                Honest progress, rewarded.
              </h3>
              <p className="text-muted-foreground mb-4">
                Every task completion and habit check-in is scored by our local confidence engine.
                Too-fast clicks, rapid batches, and unusual-hour bursts reduce your score.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> <span><b>Confidence (0–1)</b> on every action, logged in ActivityLogs</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> <span><b>XP = baseXP × confidence</b> — cheating just lowers your XP</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> <span>Flagged data never trains the behavior engine</span></li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> <span>Analytics dashboard filters confidenceScore ≥ 0.6</span></li>
              </ul>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-purple-500/20 bg-card/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Task completed: "Design wireframes"</span>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">0.95</Badge>
                </div>
                <Progress value={95} />
                <p className="text-xs text-muted-foreground mt-2">+14 XP · genuine 42-minute session</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-card/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Task completed: "Quick checkbox"</span>
                  <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">0.45 · flagged</Badge>
                </div>
                <Progress value={45} />
                <p className="text-xs text-muted-foreground mt-2">+7 XP · completed in under 3 seconds</p>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-card/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Habit check-in: "Meditate"</span>
                  <Badge className="bg-red-500/10 text-red-400 border-red-500/30">0.20 · flagged</Badge>
                </div>
                <Progress value={20} />
                <p className="text-xs text-muted-foreground mt-2">+2 XP · batch pattern detected (5 actions in 10s)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* How it works */}
      <section className="relative container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How NeuroFlow works</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map(s => (
            <Card key={s.n} className="border-border/60">
              <CardContent className="p-5">
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">{s.n}</div>
                <h3 className="font-semibold mt-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative container mx-auto px-4 py-20 text-center">
        <Card className="max-w-2xl mx-auto border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-background to-cyan-500/10">
          <CardContent className="p-10">
            <h2 className="text-3xl font-bold mb-3">Ready to build honest momentum?</h2>
            <p className="text-muted-foreground mb-6">Free forever · No credit card · Your data stays yours.</p>
            <Button size="lg" onClick={() => onGetStarted('register')} className="bg-gradient-to-r from-purple-600 to-cyan-600 shadow-lg shadow-purple-500/30">
              Create your account <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <footer className="relative border-t border-border/40 mt-10">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <span>NeuroFlow — Offline AI Adaptive Productivity</span>
          </div>
          <span>MERN · Local-first · Rule-based intelligence</span>
        </div>
      </footer>
    </div>
  )
}

// ====================================================================
// AUTH SCREEN
// ====================================================================
function AuthScreen({ initialMode = 'login', onAuthed, onBack }) {
  const [mode, setMode] = useState(initialMode)
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
      const data = await rawFetch(endpoint, { method: 'POST', body: JSON.stringify(body) })
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-purple-950/20 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>
      <Button variant="ghost" onClick={onBack} className="absolute top-4 left-4 z-10">← Back to home</Button>
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
        </CardContent>
      </Card>
    </div>
  )
}

// ====================================================================
// TASK FORM
// ====================================================================
function TaskForm({ onCreate, workspaceId = null, triggerLabel = 'New Task', triggerClass = '' }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
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
          importance: importance[0], effort: effort[0],
          workspaceId
        })
      })
      onCreate(data.task)
      setOpen(false)
      setTitle(''); setDescription(''); setTags(''); setDeadline(''); setImportance([5]); setEffort([5])
      toast.success('Task added (+5 XP)')
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClass || 'bg-gradient-to-r from-purple-600 to-cyan-600'}>
          <Plus className="w-4 h-4 mr-1" />{triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create a smart task</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Finish quarterly report" /></div>
          <div className="space-y-2"><Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Category</Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="work, study, coding" /></div>
            <div className="space-y-2"><Label>Deadline</Label>
              <Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Tags (comma separated)</Label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="client-a, urgent" /></div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label>Importance</Label><span className="text-sm text-muted-foreground">{importance[0]}/10</span></div>
            <Slider value={importance} onValueChange={setImportance} max={10} min={1} step={1} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between"><Label>Effort</Label><span className="text-sm text-muted-foreground">{effort[0]}/10</span></div>
            <Slider value={effort} onValueChange={setEffort} max={10} min={1} step={1} />
            <p className="text-xs text-muted-foreground">Lower effort = higher priority (easy wins first)</p>
          </div>
          <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/20 text-xs">
            <b>Tip:</b> hit <b>Start</b> when you begin working — our anti-fake layer rewards genuine effort with full XP.
          </div>
        </div>
        <DialogFooter><Button onClick={submit} className="bg-gradient-to-r from-purple-600 to-cyan-600">Create Task</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ====================================================================
// TASK LIST (with Start/Complete + confidence badge)
// ====================================================================
function TaskRow({ t, reload }) {
  const start = async () => {
    try { await apiFetch(`/tasks/${t.id}/start`, { method: 'POST' }); toast.success('Task started — timer running'); reload() }
    catch (e) { toast.error(e.message) }
  }
  const complete = async () => {
    try {
      const r = await apiFetch(`/tasks/${t.id}/complete`, { method: 'POST' })
      if (r.queued) return
      const conf = Math.round((r.confidence || 0) * 100)
      if (r.flagged) toast.warning(`Flagged: +${r.xpEarned} XP (confidence ${conf}%) — ${(r.reasons || []).join('; ')}`)
      else toast.success(`Completed! +${r.xpEarned} XP (${conf}% confidence)`)
      reload()
    } catch (e) { toast.error(e.message) }
  }
  const del = async () => {
    try { await apiFetch(`/tasks/${t.id}`, { method: 'DELETE' }); reload() } catch (e) { toast.error(e.message) }
  }
  const prColor = t.priority >= 7 ? 'bg-red-500' : t.priority >= 5 ? 'bg-amber-500' : 'bg-emerald-500'
  const overdue = t.deadline && new Date(t.deadline) < new Date() && t.status === 'pending'
  const isStarted = !!t.startedAt && t.status === 'pending'
  const confPct = t.confidenceScore !== undefined ? Math.round(t.confidenceScore * 100) : null

  return (
    <Card className={`group hover:border-purple-500/40 transition ${t.status === 'completed' ? 'opacity-70' : ''} ${t.flagged ? 'border-amber-500/40' : ''}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-2 h-10 rounded-full ${prColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {t.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            <span className={`font-medium ${t.status === 'completed' ? 'line-through' : ''}`}>{t.title}</span>
            <Badge variant="outline" className="text-xs">{t.category}</Badge>
            {t.tags?.map(tg => <Badge key={tg} variant="secondary" className="text-xs">#{tg}</Badge>)}
            {overdue && <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">Overdue</Badge>}
            {isStarted && <Badge className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30"><Clock className="w-3 h-3 mr-1" />Started {new Date(t.startedAt).toLocaleTimeString()}</Badge>}
            {t.flagged && <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30"><AlertTriangle className="w-3 h-3 mr-1" />Flagged</Badge>}
            {confPct !== null && t.status === 'completed' && (
              <Badge className={`text-xs ${confPct >= 60 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                <ShieldCheck className="w-3 h-3 mr-1" />{confPct}%
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" />Priority {t.priority}</span>
            {t.deadline && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(t.deadline).toLocaleString()}</span>}
            <span>U{t.urgency} · I{t.importance} · E{t.effort}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {t.status === 'pending' && !isStarted && (
            <Button size="sm" variant="outline" onClick={start} className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10">
              <Play className="w-3 h-3 mr-1" />Start
            </Button>
          )}
          {t.status === 'pending' && (
            <Button size="sm" onClick={complete} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-3 h-3 mr-1" />Complete
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={del}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </CardContent>
    </Card>
  )
}
function TaskList({ tasks, reload }) {
  if (!tasks.length) return (
    <div className="text-center py-16 text-muted-foreground">
      <Target className="w-12 h-12 mx-auto mb-4 opacity-40" />
      <p>No tasks yet. Create your first smart task →</p>
    </div>
  )
  return <div className="space-y-2">{tasks.map(t => <TaskRow key={t.id} t={t} reload={reload} />)}</div>
}

// ====================================================================
// HABITS
// ====================================================================
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
      if (r.queued) return
      if (r.error) toast.info(r.error)
      else {
        const conf = Math.round((r.confidence || 1) * 100)
        if (r.flagged) toast.warning(`Flagged check-in: +${r.xpEarned} XP (${conf}%)`)
        else toast.success(`Checked in (+${r.xpEarned} XP · ${conf}%)`)
      }
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

// ====================================================================
// SECURITY / ACTIVITY LOGS (Anti-Fake transparency)
// ====================================================================
function Security({ data }) {
  if (!data) return <p className="text-muted-foreground">Loading...</p>
  const trustPct = Math.round((data.trust || 1) * 100)
  return (
    <div className="space-y-4">
      <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-cyan-500/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold">Trust score: {trustPct}%</h3>
              <p className="text-sm text-muted-foreground">{data.total} total actions · {data.flagged} flagged</p>
              <Progress value={trustPct} className="mt-2" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
            Every task completion and habit check-in passes through our Anti-Fake Detection Layer. Confidence is scored 0–1 using:
            completion speed, action batching, and unusual-hour detection. Below are your most recent 50 actions.
            <b className="text-foreground"> XP = baseXP × confidence.</b> Flagged actions never train the behavior engine.
          </p>
        </CardContent>
      </Card>

      {!data.logs?.length ? (
        <p className="text-center text-muted-foreground py-8">No activity logs yet. Complete tasks and habits to see your trust footprint.</p>
      ) : (
        <div className="space-y-2">
          {data.logs.map(l => {
            const pct = Math.round((l.confidenceScore || 0) * 100)
            const color = pct >= 80 ? 'emerald' : pct >= 60 ? 'yellow' : pct >= 40 ? 'amber' : 'red'
            return (
              <Card key={l.id} className={`border-${color}-500/30`}>
                <CardContent className="p-3 flex items-center gap-3">
                  {l.flagged ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{l.actionType.replace('_', ' ')}</Badge>
                      {l.flagged && <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">flagged</Badge>}
                      <span className="text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</span>
                      {l.completionTime !== null && <span className="text-xs text-muted-foreground">· {l.completionTime}s duration</span>}
                    </div>
                    {!!l.reasons?.length && (
                      <p className="text-xs text-muted-foreground mt-1">Reasons: {l.reasons.join('; ')}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${pct >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{pct}%</div>
                    <Progress value={pct} className="w-20 h-1.5" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ====================================================================
// WORKSPACES
// ====================================================================
function Workspaces({ workspaces, reload }) {
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [active, setActive] = useState(null)
  const [wsDetail, setWsDetail] = useState(null)
  const [wsStats, setWsStats] = useState(null)

  const loadDetail = async (id) => {
    const d = await apiFetch(`/workspaces/${id}`)
    const s = await apiFetch(`/workspaces/${id}/analytics`)
    setWsDetail(d); setWsStats(s); setActive(id)
  }
  const create = async () => {
    if (!name.trim()) return
    try { await apiFetch('/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); setName(''); reload() }
    catch (e) { toast.error(e.message) }
  }
  const join = async () => {
    if (!inviteCode.trim()) return
    try {
      await apiFetch('/workspaces/join', { method: 'POST', body: JSON.stringify({ inviteCode: inviteCode.trim() }) })
      setInviteCode(''); reload(); toast.success('Joined workspace')
    } catch (e) { toast.error(e.message) }
  }
  const invite = async () => {
    const email = prompt('Invite by email (user must have a NeuroFlow account)')
    if (!email) return
    try {
      await apiFetch(`/workspaces/${active}/invite`, { method: 'POST', body: JSON.stringify({ email }) })
      toast.success('Member added')
      loadDetail(active)
    } catch (e) { toast.error(e.message) }
  }
  const copyCode = (code) => {
    navigator.clipboard.writeText(code)
    toast.success('Invite code copied')
  }
  const del = async (id) => {
    if (!confirm('Delete workspace and all its tasks?')) return
    await apiFetch(`/workspaces/${id}`, { method: 'DELETE' })
    setActive(null); reload()
  }

  if (active && wsDetail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => { setActive(null); setWsDetail(null) }}>← Back</Button>
          <h2 className="text-xl font-semibold">{wsDetail.workspace.name}</h2>
          <Badge variant="outline">{wsDetail.workspace.role}</Badge>
          {wsDetail.workspace.role === 'owner' && (
            <>
              <Button size="sm" variant="outline" onClick={invite}><UserPlus className="w-4 h-4 mr-1" />Invite</Button>
              <Button size="sm" variant="outline" onClick={() => copyCode(wsDetail.workspace.inviteCode)}><Copy className="w-4 h-4 mr-1" />{wsDetail.workspace.inviteCode}</Button>
              <Button size="sm" variant="ghost" onClick={() => del(active)} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
            </>
          )}
        </div>
        {wsStats && (
          <div className="grid md:grid-cols-3 gap-3">
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total tasks</div><div className="text-2xl font-bold">{wsStats.totalTasks}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Valid completions</div><div className="text-2xl font-bold text-emerald-400">{wsStats.validCompleted}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Team completion</div><div className="text-2xl font-bold text-purple-400">{wsStats.completionRate}%</div></CardContent></Card>
          </div>
        )}
        {wsStats?.memberStats && (
          <Card><CardHeader><CardTitle className="text-base">Team productivity</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {wsStats.memberStats.map(m => (
                  <div key={m.userId} className="flex items-center gap-3 p-2 rounded border border-border/40">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-sm">{m.name?.[0]?.toUpperCase()}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{m.name} <Badge variant="outline" className="text-xs ml-1">{m.role}</Badge></div>
                      <div className="text-xs text-muted-foreground">{m.completed || 0} completed / {m.created || 0} created</div>
                    </div>
                    <div className="w-32"><Progress value={m.created ? (m.completed / m.created) * 100 : 0} /></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Shared tasks ({wsDetail.tasks.length})</h3>
          <TaskForm onCreate={() => loadDetail(active)} workspaceId={active} />
        </div>
        <TaskList tasks={wsDetail.tasks} reload={() => loadDetail(active)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Create a workspace</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="Team name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} />
            <Button onClick={create} className="bg-gradient-to-r from-purple-600 to-cyan-600">Create</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Join with invite code</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="Paste code" value={inviteCode} onChange={e => setInviteCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && join()} />
            <Button variant="outline" onClick={join}>Join</Button>
          </CardContent>
        </Card>
      </div>
      {!workspaces.length && <p className="text-center text-muted-foreground py-12">You're not in any workspace yet.</p>}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {workspaces.map(w => (
          <Card key={w.id} className="hover:border-purple-500/40 transition cursor-pointer" onClick={() => loadDetail(w.id)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <h3 className="font-semibold">{w.name}</h3>
                </div>
                <Badge variant="outline" className="text-xs">{w.role}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">{w.memberCount} member{w.memberCount !== 1 ? 's' : ''}</div>
              {w.role === 'owner' && <div className="text-xs mt-2 text-purple-400">code: {w.inviteCode}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ====================================================================
// INSIGHTS / ANALYTICS / CHATBOT (unchanged from v1)
// ====================================================================
function Insights({ data }) {
  if (!data?.insights?.length) return null
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {data.insights.map((i, idx) => (
        <Card key={idx} className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-cyan-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">{i.icon}</div>
              <div><h4 className="font-semibold mb-1">{i.title}</h4>
                <p className="text-sm text-muted-foreground">{i.message}</p></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
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
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Valid completion</span><Target className="w-4 h-4 text-emerald-400" /></div>
          <div className="text-3xl font-bold">{data.completionRate}%</div>
          <p className="text-xs text-muted-foreground mt-1">{data.completedTasks} valid / {data.totalTasks} total · {data.flaggedTasks || 0} flagged</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Trust</span><ShieldCheck className="w-4 h-4 text-cyan-400" /></div>
          <div className="text-3xl font-bold text-cyan-400">{data.trustScore || 100}%</div>
          <p className="text-xs text-muted-foreground mt-1">{data.totalActions || 0} actions · {data.flaggedActions || 0} flagged</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">XP</span><Trophy className="w-4 h-4 text-amber-400" /></div>
          <div className="text-3xl font-bold text-amber-400">{data.xp}</div>
          <p className="text-xs text-muted-foreground mt-1">Level {data.level}</p>
        </CardContent></Card>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Last 7 days (valid only)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.weekly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={12} /><YAxis fontSize={12} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} /><Legend />
                <Bar dataKey="tasks" fill="#a855f7" name="Tasks" radius={[4,4,0,0]} />
                <Bar dataKey="habits" fill="#06b6d4" name="Habits" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Hourly activity (valid completions)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.hourly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="hour" fontSize={12} /><YAxis fontSize={12} />
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
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground py-8">Add tasks with categories to see breakdown.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
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
    setMessages(m => [...m, { from: 'user', text }]); setInput(''); setLoading(true)
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
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.from === 'user' ? 'bg-purple-600 text-white' : 'bg-muted'}`}>{m.text}</div>
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
          <div className="text-center"><div className="text-3xl font-bold">{analytics?.trustScore || 100}%</div><div className="text-xs opacity-80">Trust</div></div>
          <div className="text-center"><div className="text-3xl font-bold">{analytics?.level || 1}</div><div className="text-xs opacity-80">Level</div></div>
          <div className="text-center"><div className="text-3xl font-bold">{analytics?.xp || 0}</div><div className="text-xs opacity-80">XP</div></div>
        </div>
      </div>
    </div>
  )
}

// ====================================================================
// MAIN APP
// ====================================================================
function App() {
  const [screen, setScreen] = useState('landing') // 'landing' | 'auth' | 'app'
  const [authMode, setAuthMode] = useState('login')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [tasks, setTasks] = useState([])
  const [habits, setHabits] = useState([])
  const [insights, setInsights] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [activity, setActivity] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [tab, setTab] = useState('dashboard')

  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [queueSize, setQueueSize] = useState(0)
  const [notifEnabled, setNotifEnabled] = useState(false)

  // init
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('nf_token')
      if (!token) { setLoading(false); return }
      try {
        const { user } = await rawFetch('/auth/me')
        setUser(user); setScreen('app')
      } catch { localStorage.removeItem('nf_token') }
      setLoading(false)
    })()
  }, [])

  // online / offline
  useEffect(() => {
    const on = async () => {
      setOnline(true)
      const r = await flushQueue(rawFetch)
      if (r.flushed) { toast.success(`Synced ${r.flushed} queued action(s)`); reloadAll() }
      setQueueSize(await getQueueSize())
    }
    const off = () => { setOnline(false); toast.warning('You are offline — changes will be queued') }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    getQueueSize().then(setQueueSize)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // notification perm
  useEffect(() => {
    if (!user || typeof window === 'undefined' || !('Notification' in window)) return
    setNotifEnabled(Notification.permission === 'granted')
  }, [user])

  // schedule deadline reminders
  useEffect(() => {
    if (!user || !notifEnabled || typeof window === 'undefined' || !('Notification' in window)) return
    const timers = []
    const now = Date.now()
    for (const t of tasks.filter(x => x.status === 'pending' && x.deadline)) {
      const deadline = new Date(t.deadline).getTime()
      const warn = deadline - 15 * 60 * 1000
      const notify = (title, body) => {
        try { new Notification(title, { body, icon: '/icon.svg' }) } catch {}
      }
      if (warn > now && warn - now < 86400000) {
        timers.push(setTimeout(() => notify('⏰ Deadline in 15 min', t.title), warn - now))
      }
      if (deadline > now && deadline - now < 86400000) {
        timers.push(setTimeout(() => notify('🚨 Deadline reached', t.title), deadline - now))
      }
    }
    return () => timers.forEach(clearTimeout)
  }, [tasks, user, notifEnabled])

  const reloadAll = async () => {
    if (!user) return
    try {
      const [t, h, i, a, al, w] = await Promise.all([
        apiFetch('/tasks?workspaceId=none'), apiFetch('/habits'), apiFetch('/insights'),
        apiFetch('/analytics'), apiFetch('/activity-logs'), apiFetch('/workspaces')
      ])
      setTasks(t.tasks); setHabits(h.habits); setInsights(i); setAnalytics(a)
      setActivity(al); setWorkspaces(w.workspaces)
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { if (user) reloadAll() }, [user])

  const enableNotifications = async () => {
    if (!('Notification' in window)) return toast.error('Notifications not supported')
    const res = await Notification.requestPermission()
    if (res === 'granted') { setNotifEnabled(true); toast.success('Notifications enabled'); new Notification('NeuroFlow', { body: "We'll remind you before deadlines.", icon: '/icon.svg' }) }
    else toast.info('Notifications blocked by browser')
  }

  const logout = () => { localStorage.removeItem('nf_token'); setUser(null); setScreen('landing') }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Brain className="w-8 h-8 animate-pulse text-purple-500" /></div>

  if (screen === 'landing' && !user) {
    return <Landing onGetStarted={(mode) => { setAuthMode(mode); setScreen('auth') }} />
  }
  if (screen === 'auth' && !user) {
    return <AuthScreen initialMode={authMode} onAuthed={u => { setUser(u); setScreen('app') }} onBack={() => setScreen('landing')} />
  }
  if (!user) return <Landing onGetStarted={(mode) => { setAuthMode(mode); setScreen('auth') }} />

  const pending = tasks.filter(t => t.status === 'pending')
  const completed = tasks.filter(t => t.status === 'completed')
  const top3 = pending.slice(0, 3)

  return (
    <div className="min-h-screen">
      {/* Offline banner */}
      {(!online || queueSize > 0) && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-sm">
          <div className="container mx-auto px-4 py-2 flex items-center gap-2">
            {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {online ? `${queueSize} queued action(s) syncing…` : `Offline — ${queueSize} change(s) queued`}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center"><Brain className="w-5 h-5 text-white" /></div>
            <span className="font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">NeuroFlow</span>
          </div>
          <div className="flex items-center gap-3">
            {!notifEnabled && (
              <Button variant="ghost" size="sm" onClick={enableNotifications}><Bell className="w-4 h-4 mr-1" />Enable</Button>
            )}
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
          <TabsList className="grid grid-cols-7 max-w-3xl">
            <TabsTrigger value="dashboard"><Rocket className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Dashboard</span></TabsTrigger>
            <TabsTrigger value="tasks"><Target className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Tasks</span></TabsTrigger>
            <TabsTrigger value="habits"><Flame className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Habits</span></TabsTrigger>
            <TabsTrigger value="workspaces"><Users className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Teams</span></TabsTrigger>
            <TabsTrigger value="insights"><Sparkles className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">AI</span></TabsTrigger>
            <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Analytics</span></TabsTrigger>
            <TabsTrigger value="security"><ShieldCheck className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Security</span></TabsTrigger>
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
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Valid completed</div><div className="text-2xl font-bold text-emerald-400">{completed.filter(t => !t.flagged).length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active habits</div><div className="text-2xl font-bold text-orange-400">{habits.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Trust score</div><div className="text-2xl font-bold text-cyan-400">{analytics?.trustScore || 100}%</div></CardContent></Card>
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

          <TabsContent value="workspaces" className="space-y-4 mt-4">
            <h2 className="text-xl font-semibold">Workspaces</h2>
            <Workspaces workspaces={workspaces} reload={reloadAll} />
          </TabsContent>

          <TabsContent value="insights" className="space-y-4 mt-4">
            <div>
              <h2 className="text-xl font-semibold">Adaptive Insights</h2>
              <p className="text-sm text-muted-foreground">Generated locally using behavioral analytics. Flagged data is never used to train the engine.</p>
            </div>
            <Insights data={insights} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4 mt-4">
            <h2 className="text-xl font-semibold">Analytics</h2>
            <p className="text-xs text-muted-foreground -mt-2">Dashboard uses only validated data (confidence ≥ 0.6, not flagged).</p>
            <Analytics data={analytics} />
          </TabsContent>

          <TabsContent value="security" className="space-y-4 mt-4">
            <div>
              <h2 className="text-xl font-semibold">Security & Activity Log</h2>
              <p className="text-sm text-muted-foreground">Anti-Fake Detection Layer · Full transparency on scoring</p>
            </div>
            <Security data={activity} />
          </TabsContent>
        </Tabs>
      </main>

      <Chatbot onAction={() => reloadAll()} />
    </div>
  )
}

export default App
