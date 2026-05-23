import { NavLink } from 'react-router-dom'
import { Home, CalendarDays, BookOpen, Wallet, Camera } from 'lucide-react'

const tabs = [
  { to: '/', icon: Home, label: 'Accueil' },
  { to: '/planning', icon: CalendarDays, label: 'Planning' },
  { to: '/guides', icon: BookOpen, label: 'Guides' },
  { to: '/budget', icon: Wallet, label: 'Budget' },
  { to: '/journal', icon: Camera, label: 'Journal' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-bottom z-40">
      <div className="flex">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1 rounded-xl transition-colors ${isActive ? 'bg-blue-50' : ''}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
