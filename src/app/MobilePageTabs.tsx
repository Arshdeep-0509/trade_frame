import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { usePageLinks } from './pageLinks'

/**
 * Page navigation below `md`, where the top bar has no room for its page
 * links: one full-width row of tabs under the header, so every page (Intraday
 * included) is one tap away on a phone. At most four tabs, so they always fit
 * side by side — no scrolling to find a page.
 *
 * md, not sm: between 640 and ~700px the developer's four links plus the badge
 * would push Settings and Log out out of the top bar (it clips, never wraps).
 */
export function MobilePageTabs() {
  const links = usePageLinks()

  return (
    <nav aria-label="Pages" className="flex shrink-0 border-b border-border bg-panel md:hidden">
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex h-11 min-w-0 flex-1 items-center justify-center border-b-2 px-1 text-xs font-medium transition-colors',
              isActive ? 'border-neutral text-neutral' : 'border-transparent text-text-secondary hover:text-text-primary',
            )
          }
        >
          <span className="truncate">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
