import { useState } from 'react'
import { ArrowRight, Lock } from 'lucide-react'
import { api } from '../api'
import { Section } from '../ui'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const u = await api.login(email, password)
      onLogin(u)
      if (!window.location.hash || window.location.hash === '#/login') window.location.hash = '#/'
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <Section enter titleAs="h1" lead="Your vendor desk," leadRest="sign in to check vendors, review approvals and download evidence."
             title="Log in to Vetted"
             body="Use the account your company admin gave you.">
      <div className="md:grid md:grid-cols-12 gap-x-8 mt-10">
        <form onSubmit={submit} className="md:col-start-5 md:col-span-8 max-w-md frame p-6 pop" noValidate>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="username" className="field" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. you@company.com" />
          <label className="label mt-4" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" className="field" value={password} onChange={e => setPassword(e.target.value)} />
          {err && <p role="alert" className="text-sm text-bad mt-3">{err}</p>}
          <button className="btn-dark btn-lg w-full mt-5" disabled={busy}><Lock size={16} aria-hidden="true" />{busy ? 'Signing in' : 'Log in'} <ArrowRight size={16} aria-hidden="true" /></button>
          <div className="mt-5 rounded bg-bg px-4 py-3 text-sm">
            <p className="font-medium">Trying Vetted?</p>
            <p className="text-muted mt-0.5">Demo account: <span className="mono">demo@vetted.example</span> · password <span className="mono">vetted-demo</span></p>
            <button type="button" className="mt-2 text-sm font-medium hover:underline underline-offset-4" onClick={() => { setEmail('demo@vetted.example'); setPassword('vetted-demo') }}>Fill in the demo account</button>
          </div>
          <p className="text-xs text-muted mt-4">Passwords are stored only as salted hashes. Sessions end after 7 days or when you log out.</p>
        </form>
      </div>
    </Section>
  )
}
