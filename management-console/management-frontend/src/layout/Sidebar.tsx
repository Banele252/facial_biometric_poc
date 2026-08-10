import './layout.css'
import { navItems } from './navConfig'
import { NavItem } from './NavItem'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">M</span>
        <div>
          <div className="sidebar__brand-text">MTN Console</div>
          <div className="sidebar__brand-subtext">Management Dashboard</div>
        </div>
      </div>
      <nav className="sidebar__nav">
        {navItems.map((item) => (
          <NavItem key={item.path} {...item} />
        ))}
      </nav>
    </aside>
  )
}
