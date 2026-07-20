import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  Menu as MenuIcon,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { submitDemoRequest } from '../api/communications'

const FEATURES = [
  {
    icon: Users,
    title: 'Student Records',
    description:
      'Every student gets an auto-generated ID, guardian links, and a full academic history in one place.',
  },
  {
    icon: Wallet,
    title: 'Fees & Billing',
    description:
      'Invoicing and payments in Tanzanian shillings, built around the real 2-term / 4-quarter school calendar.',
  },
  {
    icon: CalendarCheck,
    title: 'Attendance & Alerts',
    description:
      'Daily attendance capture with automatic absence alerts sent straight to guardians.',
  },
  {
    icon: GraduationCap,
    title: 'Exams & Results',
    description:
      'Mark entry, grading, and report cards for every subject, class, and exam sitting.',
  },
  {
    icon: ShieldCheck,
    title: 'Staff Management',
    description:
      'Qualifications, class assignments, disciplinary records, and leave requests, all audited.',
  },
  {
    icon: MessageCircle,
    title: 'Communications',
    description:
      'Reach parents by SMS, WhatsApp, or email — individually, by class, or school-wide.',
  },
]

const HERO_STATS = [
  { value: '6', label: 'Core modules, one login' },
  { value: '3', label: 'Parent alert channels' },
  { value: 'TZS', label: 'Native currency & billing' },
  { value: '2+4', label: 'Term & quarter calendar' },
]

const CAPABILITIES = [
  { value: 'Daily', label: 'Attendance capture' },
  { value: 'Automatic', label: 'Absence alerts' },
  { value: 'Same-day', label: 'Fee receipts' },
  { value: 'Role-scoped', label: 'Dashboards' },
]

const PARENT_FEATURES = [
  {
    icon: Bell,
    title: 'Live absence alerts',
    description: 'The moment a child is marked absent, guardians get an SMS or WhatsApp message — no waiting for a phone call home.',
  },
  {
    icon: CreditCard,
    title: 'Fee invoices & payment history',
    description: 'Guardians see every invoice, every payment, and what is still owed — in Tanzanian shillings, per term.',
  },
  {
    icon: FileText,
    title: 'Report cards & results',
    description: 'Exam marks and report cards are available as soon as a teacher finalizes them, subject by subject.',
  },
  {
    icon: MessageCircle,
    title: 'School announcements',
    description: 'Class-wide or school-wide messages land straight in the parent portal — no missed notice-board flyers.',
  },
]

const ROLES = [
  { name: 'Owner', description: 'Full visibility across every module and school.' },
  { name: 'Headteacher', description: 'Academic, staff, and discipline oversight.' },
  { name: 'Bursar', description: 'Fees, invoices, and payment records.' },
  { name: 'Teacher', description: 'Attendance, marks, and their own classes.' },
  { name: 'Discipline Teacher', description: 'Incident records and behaviour tracking.' },
  { name: 'Parent', description: 'Their own children — attendance, fees, results.' },
]

const REASONS = [
  {
    icon: Wallet,
    title: 'Actually built for Tanzania',
    description: 'TZS-native billing on the real 2-term / 4-quarter calendar schools here run on — not a generic template.',
  },
  {
    icon: MessageCircle,
    title: 'Parents get alerts they’ll see',
    description: 'WhatsApp and SMS out of the box, so a fee reminder or absence alert doesn’t sit unread in an app nobody opens.',
  },
  {
    icon: ClipboardList,
    title: 'Every action is logged',
    description: 'Role changes, payments, and admin actions write to an audit trail — accountability by default.',
  },
  {
    icon: ShieldCheck,
    title: 'Everyone sees only their lane',
    description: 'Eight distinct roles, each with a dashboard scoped to exactly what their job needs.',
  },
]

function NavBar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-lg">S</span>
          </span>
          <span className="font-bold text-gray-900 text-lg">Shule SMS</span>
        </a>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
          <a href="#features" className="hover:text-primary transition-colors">Features</a>
          <a href="#parents" className="hover:text-primary transition-colors">For parents</a>
          <a href="#roles" className="hover:text-primary transition-colors">Who it's for</a>
          <a href="#demo" className="hover:text-primary transition-colors">Request a demo</a>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm font-medium text-gray-600 hover:text-primary transition-colors px-3 py-2"
          >
            Staff login
          </Link>
          <a
            href="#demo"
            className="text-sm font-medium text-white bg-primary hover:bg-secondary transition-colors px-4 py-2 rounded-lg shadow-sm"
          >
            Request a demo
          </a>
        </div>

        <button
          className="md:hidden p-2 text-gray-600"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-100 px-4 py-4 space-y-3 bg-white">
          <a href="#features" onClick={() => setOpen(false)} className="block text-sm font-medium text-gray-600">Features</a>
          <a href="#parents" onClick={() => setOpen(false)} className="block text-sm font-medium text-gray-600">For parents</a>
          <a href="#roles" onClick={() => setOpen(false)} className="block text-sm font-medium text-gray-600">Who it's for</a>
          <a href="#demo" onClick={() => setOpen(false)} className="block text-sm font-medium text-gray-600">Request a demo</a>
          <Link to="/login" className="block text-sm font-medium text-gray-600">Staff login</Link>
          <a
            href="#demo"
            onClick={() => setOpen(false)}
            className="block text-center text-sm font-medium text-white bg-primary px-4 py-2 rounded-lg"
          >
            Request a demo
          </a>
        </div>
      )}
    </header>
  )
}

function DashboardMockup() {
  const bars = [42, 65, 50, 80, 60, 95]
  return (
    <div className="relative">
      {/* Floating badge — top left */}
      <div className="hidden sm:flex absolute -top-5 -left-5 z-10 items-center gap-2 bg-white rounded-xl shadow-lg border border-gray-100 px-3.5 py-2.5">
        <span className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4 text-secondary" />
        </span>
        <div className="leading-tight">
          <p className="text-[11px] text-gray-400">Absence alert sent</p>
          <p className="text-xs font-semibold text-gray-800">via WhatsApp</p>
        </div>
      </div>

      {/* Browser chrome card */}
      <div className="mt-8 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-accent/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
          </div>
          <span className="text-xs text-gray-400">Shule SMS — Dashboard</span>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400">Students</p>
              <p className="text-lg font-bold text-gray-900 mt-1">68</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400">Attendance</p>
              <p className="text-lg font-bold text-success mt-1">94%</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="text-[11px] text-gray-400">Fees collected</p>
              <p className="text-lg font-bold text-gray-900 mt-1">4.2M</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] text-gray-400 mb-3">Fee collection (TZS)</p>
            <div className="flex items-end gap-2 h-24">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-primary to-secondary"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating badge — bottom right */}
      <div className="hidden sm:flex absolute -bottom-5 -right-5 z-10 items-center gap-2 bg-white rounded-xl shadow-lg border border-gray-100 px-3.5 py-2.5">
        <span className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-success" />
        </span>
        <div className="leading-tight">
          <p className="text-[11px] text-gray-400">Fee receipt</p>
          <p className="text-xs font-semibold text-gray-800">Confirmed &amp; sent</p>
        </div>
      </div>

      <p className="mt-8 sm:mt-4 text-center text-xs text-white/40">Illustrative preview — sample data</p>
    </div>
  )
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-primary">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, white 0, transparent 35%), radial-gradient(circle at 85% 70%, white 0, transparent 40%)',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-white/80 bg-white/10 px-3 py-1 rounded-full mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Built for Tanzanian private schools
            </span>
            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
              One system for students, fees, attendance, exams, staff, and{' '}
              <span className="text-accent">parents</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-white/80 max-w-xl">
              Shule SMS brings your whole school onto one platform — TZS-native billing, a real
              2-term / 4-quarter calendar, and SMS/WhatsApp alerts parents actually see.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-start gap-3">
              <a
                href="#demo"
                className="w-full sm:w-auto text-center px-6 py-3 rounded-lg bg-accent hover:brightness-95 text-white font-semibold text-sm shadow-lg transition"
              >
                Request a demo
              </a>
              <Link
                to="/login"
                className="w-full sm:w-auto text-center px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/30 transition"
              >
                Staff login
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-5">
              {HERO_STATS.map((s, i) => (
                <div key={s.label} className={i > 0 ? 'pl-8 border-l border-white/15' : ''}>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-white/60 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  )
}

function CapabilityBand() {
  return (
    <section className="bg-gradient-to-r from-primary to-secondary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {CAPABILITIES.map((c) => (
          <div key={c.label}>
            <p className="text-xl sm:text-2xl font-bold text-white">{c.value}</p>
            <p className="text-xs sm:text-sm text-white/70 mt-1">{c.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-xl mx-auto mb-14">
        <span className="text-xs font-semibold tracking-widest uppercase text-secondary">What's included</span>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">
          Everything the school office needs
        </h2>
        <p className="mt-3 text-sm sm:text-base text-gray-500">
          Six modules, one login — no more juggling spreadsheets and paper registers.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="p-6 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
            <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function PhoneMockup() {
  return (
    <div className="mx-auto w-full max-w-[280px] bg-white rounded-[2rem] shadow-2xl border-8 border-gray-900 overflow-hidden">
      <div className="bg-primary px-4 pt-5 pb-6 text-white">
        <p className="text-[11px] text-white/70">Good morning,</p>
        <p className="font-semibold">Mary Josephat</p>
      </div>
      <div className="p-4 space-y-3 -mt-4">
        <div className="bg-white rounded-xl shadow border border-gray-100 p-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-sm font-bold text-success">92%</p>
            <p className="text-[10px] text-gray-400">Attendance</p>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">A&minus;</p>
            <p className="text-[10px] text-gray-400">Latest grade</p>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">0</p>
            <p className="text-[10px] text-gray-400">Fee balance</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-800">Fee receipt confirmed</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Term 2 &middot; TZS 450,000 paid</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-800">Attendance alert</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Present today, 7:42 AM</p>
        </div>
        <div className="flex gap-2 pt-1">
          <div className="flex-1 text-center text-[11px] font-medium text-white bg-primary rounded-lg py-2">Report card</div>
          <div className="flex-1 text-center text-[11px] font-medium text-primary bg-primary/10 rounded-lg py-2">Pay fees</div>
        </div>
      </div>
    </div>
  )
}

function ParentSpotlight() {
  return (
    <section id="parents" className="bg-surface border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 grid lg:grid-cols-2 gap-16 items-center">
        <div className="order-2 lg:order-1">
          <span className="text-xs font-semibold tracking-widest uppercase text-secondary">For parents</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">
            Parents stay in the loop, automatically
          </h2>
          <p className="mt-3 text-sm sm:text-base text-gray-500 max-w-md">
            Every guardian gets their own portal — no separate app to install, no waiting for a
            phone call from the school office.
          </p>
          <div className="mt-8 space-y-6">
            {PARENT_FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <PhoneMockup />
        </div>
      </div>
    </section>
  )
}

function RolesSection() {
  return (
    <section id="roles" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-xl mx-auto mb-14">
        <span className="text-xs font-semibold tracking-widest uppercase text-secondary">Access control</span>
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">Built for every role</h2>
        <p className="mt-3 text-sm sm:text-base text-gray-500">
          Each person signs in and sees exactly what their job needs — nothing more.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLES.map((role) => (
          <div
            key={role.name}
            className="rounded-xl border border-gray-100 bg-white shadow-sm p-4"
          >
            <p className="font-semibold text-gray-900 text-sm">{role.name}</p>
            <p className="text-xs text-gray-500 mt-1">{role.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Reasons() {
  return (
    <section className="bg-surface border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-xl mx-auto mb-14">
          <span className="text-xs font-semibold tracking-widest uppercase text-secondary">Why Shule SMS</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">
            Not a generic template
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {REASONS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DemoRequestForm() {
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', school_name: '', message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await submitDemoRequest(form)
      setSubmitted(true)
      toast.success('Request sent — we will be in touch shortly.')
    } catch (err) {
      const detail =
        err.response?.data?.detail ??
        err.response?.data?.email?.[0] ??
        'Something went wrong. Please try again.'
      setError(detail)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="max-w-md mx-auto text-center bg-white rounded-2xl shadow-sm p-8">
        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6 text-success" />
        </div>
        <h3 className="font-semibold text-gray-900 text-lg mb-1.5">Thanks — request received</h3>
        <p className="text-sm text-gray-500">
          We'll reach out shortly to walk you through Shule SMS. In the meantime, staff with an
          account can{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            sign in here
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-6 sm:p-8 space-y-4"
    >
      {error && (
        <div className="px-3 py-2.5 bg-red-50 border border-red-200 text-danger text-sm rounded-lg">
          {error}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
        <input
          name="full_name"
          required
          value={form.full_name}
          onChange={onChange}
          placeholder="Jane Mwangi"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
        <input
          type="email"
          name="email"
          required
          value={form.email}
          onChange={onChange}
          placeholder="you@school.ac.tz"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <input
            name="phone"
            value={form.phone}
            onChange={onChange}
            placeholder="0712 345 678"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">School name</label>
          <input
            name="school_name"
            value={form.school_name}
            onChange={onChange}
            placeholder="St. Mary's"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          What would you like to see? <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          name="message"
          rows={3}
          value={form.message}
          onChange={onChange}
          placeholder="e.g. fee tracking and parent SMS alerts"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 px-4 bg-accent hover:brightness-95 text-white rounded-lg text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting && (
          <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {submitting ? 'Sending…' : 'Request a demo'}
      </button>
    </form>
  )
}

function DemoSection() {
  const checklist = ['No cost to see a walkthrough', 'No commitment required', 'We work around your school’s needs']
  return (
    <section id="demo" className="relative overflow-hidden bg-primary">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 80% 10%, white 0, transparent 35%), radial-gradient(circle at 10% 90%, white 0, transparent 40%)',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-xl mx-auto mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">See it on your own school</h2>
          <p className="mt-3 text-sm sm:text-base text-white/70">
            Tell us a bit about you and we'll set up a walkthrough.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2">
            {checklist.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5 text-xs text-white/70">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                {item}
              </span>
            ))}
          </div>
        </div>
        <DemoRequestForm />
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-primary border-t border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white font-bold">S</span>
            </span>
            <span className="text-white font-semibold">Shule SMS</span>
          </div>
          <p className="text-xs text-white/60 mt-3 leading-relaxed max-w-[220px]">
            School management built for the way Tanzanian private schools actually run.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold text-white uppercase tracking-widest mb-3">Product</p>
          <ul className="space-y-2 text-sm text-white/70">
            <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
            <li><a href="#parents" className="hover:text-white transition-colors">For parents</a></li>
            <li><a href="#roles" className="hover:text-white transition-colors">Who it's for</a></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-white uppercase tracking-widest mb-3">Access</p>
          <ul className="space-y-2 text-sm text-white/70">
            <li><a href="#demo" className="hover:text-white transition-colors">Request a demo</a></li>
            <li><Link to="/login" className="hover:text-white transition-colors">Staff login</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-white uppercase tracking-widest mb-3">Contact</p>
          <p className="text-sm text-white/70">Private School Management &middot; Tanzania</p>
          <a
            href="tel:+255654389616"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            +255 654 389 616
          </a>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 text-center">
          <p className="text-xs text-white/50">&copy; {new Date().getFullYear()} Shule SMS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      <Hero />
      <CapabilityBand />
      <Features />
      <ParentSpotlight />
      <RolesSection />
      <Reasons />
      <DemoSection />
      <Footer />
    </div>
  )
}
