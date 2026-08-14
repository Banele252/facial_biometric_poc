import { useLocation, useNavigate } from 'react-router-dom'
import './layout.css'
import { navItems } from './navConfig'
import { clearStoredUser, getStoredUser } from '../auth'

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const active = navItems.find((item) => item.path === location.pathname)
  const user = getStoredUser()

  function handleLogout() {
    clearStoredUser()
    navigate('/login', { replace: true })
  }

  return (
    <header className="header">
      <h1 className="header__title">{active?.label ?? 'Management Console'}</h1>
      <div className="header__user-area">
        {user && <span className="header__user">Signed in as {user.email}</span>}
        <button type="button" className="header__logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}
