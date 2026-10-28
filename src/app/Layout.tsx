import { Building, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { navItems } from '@/app/navigation';
import { et } from '@/i18n/et';

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          aria-label={menuOpen ? et.app.closeMenu : et.app.openMenu}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="main-nav"
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-slate-200 px-5">
          <Brand />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map(({ section, path, icon: Icon }) => (
            <NavLink
              key={section}
              to={path}
              end={path === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {et.nav[section]}
            </NavLink>
          ))}
        </nav>

        <p className="border-t border-slate-200 p-4 text-xs text-slate-500">
          {et.app.localDataNotice}
        </p>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="bg-brand-700 flex size-8 items-center justify-center rounded-lg text-white">
        <Building className="size-5" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="font-semibold text-slate-900">{et.app.name}</p>
        <p className="text-xs text-slate-500">{et.app.tagline}</p>
      </div>
    </div>
  );
}
