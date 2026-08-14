import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import './pages.css'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { login } from '../api'
import { setStoredUser } from '../auth'

export function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    login(username, password)
      .then((user) => {
        setStoredUser(user)
        navigate('/', { replace: true })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Login failed')
      })
      .finally(() => setSubmitting(false))
  }

  return (
    <div className="login-page">
      <Card className="login-page__card">
        <div className="login-page__brand">
          <span className="login-page__brand-mark">T</span>
          <div>
            <div className="login-page__brand-text">Trust Platform</div>
            <div className="login-page__brand-subtext">Management Dashboard</div>
          </div>
        </div>

        <form className="login-page__form" onSubmit={handleSubmit}>
          <label className="login-page__label">
            Username
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="login-page__label">
            Password
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="login-page__error">{error}</p>}

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
