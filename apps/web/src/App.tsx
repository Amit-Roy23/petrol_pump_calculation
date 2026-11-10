import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { BarChart3, Gauge, HandCoins, Home, Settings as SettingsIcon, Users, Wallet } from 'lucide-react';
import { useStore } from './lib/store';
import { cn } from './lib/util';
import type { TKey } from './lib/i18n';
import { BrandMark } from './components/BrandMark';
import { Login, SetupNeeded, Splash, SyncBadge } from './components/Gate';
import Dashboard from './pages/Dashboard';
import DaySheet from './pages/DaySheet';
import Closing from './pages/Closing';
import Dues from './pages/Dues';
import SettingsPage from './pages/Settings';
import Staff from './pages/Staff';

// Charts are heavy – load the reports page on demand.
const Reports = lazy(() => import('./pages/Reports'));

const NAV: { to: string; key: TKey; short?: TKey; icon: typeof Home }[] = [
  { to: '/', key: 'navHome', icon: Home },
  { to: '/sheet', key: 'navSheet', short: 'navSheetShort', icon: Gauge },
  { to: '/closing', key: 'navClosing', short: 'navClosingShort', icon: Wallet },
  { to: '/dues', key: 'navDues', icon: HandCoins },
  { to: '/staff', key: 'navStaff', icon: Users },
  { to: '/reports', key: 'navReports', icon: BarChart3 },
];

function useThemeSync() {
  const { data } = useStore();
  const pref = data.settings.theme;
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
  useEffect(() => {
    document.documentElement.lang = data.settings.language;
    document.title = `${data.settings.stationName} · Fuel Ledger`;
  }, [data.settings.language, data.settings.stationName]);
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const { data, t, toasts, cloud, dismissToast } = useStore();
  useThemeSync();

  if (cloud.mode === 'checking') return <Splash />;
  if (cloud.mode === 'cloud' && cloud.missing.length) return <SetupNeeded missing={cloud.missing} />;
  if (cloud.mode === 'cloud' && cloud.needLogin) return <Login />;
  if (cloud.mode === 'cloud' && !cloud.loaded) {
    return cloud.status === 'error' || cloud.status === 'offline' ? (
      <SetupNeeded missing={[cloud.error ?? t('cantReach')]} />
    ) : (
      <Splash />
    );
  }

  return (
    <div className="min-h-screen lg:flex">
      <ScrollTop />
      {/* Desktop rail */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface/70 px-4 py-6 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 px-2">
          <BrandMark className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-extrabold leading-tight">{data.settings.stationName}</div>
            <div className="truncate text-xs text-ink-3">{t('appTagline')}</div>
          </div>
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {[...NAV, { to: '/settings', key: 'navSettings' as TKey, icon: SettingsIcon }].map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                  isActive ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-sunk hover:text-ink'
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 rounded-xl border border-dashed border-line p-3 text-xs leading-relaxed text-ink-3">
          <SyncBadge />
          {cloud.mode === 'local' && <div>{t('savedLocal')}</div>}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="h-8 w-8 shrink-0" />
            <div className="truncate font-display text-[15px] font-extrabold">{data.settings.stationName}</div>
          </div>
          <div className="flex items-center gap-1">
          <SyncBadge compact />
          <NavLink to="/settings" className={({ isActive }) => cn('btn-quiet', isActive && 'bg-sunk text-ink')} aria-label={t('navSettings')}>
            <SettingsIcon className="h-5 w-5" />
          </NavLink>
          </div>
        </header>

        <main className="print-full mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sheet" element={<DaySheet />} />
            <Route path="/closing" element={<Closing />} />
            <Route path="/dues" element={<Dues />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/reports" element={<Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-sunk" />}><Reports /></Suspense>} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map(({ to, key, short, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn('relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold transition', isActive ? 'text-brand' : 'text-ink-3')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />}
                  <Icon className="h-5 w-5" />
                  <span className="max-w-full truncate px-0.5">{t(short ?? key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="no-print pointer-events-none fixed inset-x-0 bottom-40 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-24">
        {toasts.map((ts) => (
          <div
            key={ts.id}
            role="status"
            className={cn('rise pointer-events-auto flex items-center gap-3 rounded-xl py-2.5 pl-4 pr-2 text-sm font-semibold shadow-lift', ts.tone === 'ok' ? 'bg-ink text-bg' : 'bg-warn text-white', !ts.action && 'pr-4')}
          >
            {ts.text}
            {ts.action && (
              <button
                className="rounded-lg bg-bg/15 px-3 py-1 font-bold text-brand hover:bg-bg/25"
                onClick={() => {
                  ts.action!.run();
                  dismissToast(ts.id);
                }}
              >
                {ts.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
