import { useLocation } from 'react-router-dom'
import './layout.css'
import { navItems } from './navConfig'

export function Header() {
  const location = useLocation()
  const active = navItems.find((item) => item.path === location.pathname)

  return (
    <header className="header">
      <h1 className="header__title">{active?.label ?? 'Management Console'}</h1>
      <span className="header__user">Signed in as banelemdluli25@gmail.com</span>
    </header>
  )
}
