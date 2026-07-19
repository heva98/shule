import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  BarChart3,
  CalendarCheck,
  GraduationCap,
  Menu as MenuIcon,
  MessageCircle,
  ShieldCheck,
  Smartphone,
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

const ROLES = [
  'Owner', 'Headteacher', 'Bursar', 'Teacher', 'Discipline Teacher', 'Parent',
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

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-primary">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, white 0, transparent 35%), radial-gradient(circle at 80% 60%, white 0, transparent 40%)',
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <span className="inline-block text-xs font-semibold tracking-wide uppercase text-white/80 bg-white/10 px-3 py-1 rounded-full mb-6">
          Built for Tanzanian private schools
        </span>
        <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight max-w-3xl mx-auto">
          One system for students, fees, attendance, exams, staff, and parents
        </h1>
        <p className="mt-5 text-base sm:text-lg text-white/80 max-w-2xl mx-auto">
          Shule SMS brings your whole school onto one platform — TZS-native billing, a real
          2-term / 4-quarter calendar, and SMS/WhatsApp alerts parents actually see.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="#demo"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-accent hover:brightness-95 text-white font-semibold text-sm shadow-lg transition"
          >
            Request a demo
          </a>
          <Link
            to="/login"
            className="w-full sm:w-auto px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-sm border border-white/30 transition"
          >
            Staff login
          </Link>
        </div>
      </div>
    </section>
  )
}

function StatsBar() {
  const stats = [
    { label: 'Currency', value: 'TZS native' },
    { label: 'Academic calendar', value: '2 terms · 4 quarters' },
    { label: 'Parent alerts', value: 'SMS · WhatsApp · Email' },
    { label: 'Access control', value: 'Role-based, audited' },
  ]
  return (
    <section className="bg-surface border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-sm sm:text-base font-semibold text-primary">{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
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
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
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

function RolesSection() {
  return (
    <section id="roles" className="bg-surface border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Built for every role</h2>
        <p className="mt-3 text-sm sm:text-base text-gray-500 max-w-xl mx-auto">
          Each person signs in and sees exactly what their job needs — nothing more.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {ROLES.map((role) => (
            <span
              key={role}
              className="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm"
            >
              {role}
            </span>
          ))}
        </div>
        <div className="mt-10 inline-flex items-center gap-2 text-sm text-gray-500">
          <Smartphone className="w-4 h-4" />
          Parents get their own portal — no app install required.
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
      <div className="max-w-md mx-auto text-center bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="w-6 h-6 text-success" />
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
      className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-4"
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
        className="w-full py-2.5 px-4 bg-primary hover:bg-secondary text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
  return (
    <section id="demo" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-xl mx-auto mb-10">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">See it on your own school</h2>
        <p className="mt-3 text-sm sm:text-base text-gray-500">
          Tell us a bit about you and we'll set up a walkthrough — no commitment required.
        </p>
      </div>
      <DemoRequestForm />
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-primary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <span className="text-white font-bold">S</span>
          </span>
          <span className="text-white font-semibold">Shule SMS</span>
        </div>
        <p className="text-xs text-white/60 text-center">
          Shule SMS &middot; Private School Management &middot; Tanzania
        </p>
        <Link to="/login" className="text-xs text-white/70 hover:text-white transition-colors">
          Staff login →
        </Link>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      <Hero />
      <StatsBar />
      <Features />
      <RolesSection />
      <DemoSection />
      <Footer />
    </div>
  )
}
