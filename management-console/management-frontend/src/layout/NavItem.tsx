import { NavLink } from 'react-router-dom'
import type { NavConfigItem } from './navConfig'

export function NavItem({ path, label, Icon }: NavConfigItem) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) => ['nav-item', isActive ? 'nav-item--active' : ''].filter(Boolean).join(' ')}
    >
      <span className="nav-item__icon">
        <Icon width={18} height={18} />
      </span>
      {label}
    </NavLink>
  )
}
