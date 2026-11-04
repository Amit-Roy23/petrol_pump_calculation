import { useState } from 'react';
import { CloudOff, CloudUpload, Cloud, HardDrive, KeyRound, Loader2, ServerCrash, TriangleAlert } from 'lucide-react';
import { useStore, type SyncStatus } from '../lib/store';
import { ApiError } from '../lib/api';
import { cn } from '../lib/util';
import { BrandMark } from './BrandMark';
import type { TKey } from '../lib/i18n';

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="paper flex min-h-screen items-center justify-center px-4 py-10">{children}</div>;
}

export function Splash() {
  return (
    <Centered>
      <div className="flex flex-col items-center gap-4 text-ink-3">
        <BrandMark className="h-14 w-14 animate-pulse" />
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    </Centered>
  );
}

export function SetupNeeded({ missing }: { missing: string[] }) {
  const { t } = useStore();
  return (
    <Centered>
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-warn-soft text-warn">
          <ServerCrash className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-extrabold">{t('setupTitle')}</h1>
        <p className="mt-2 text-sm text-ink-2">{t('setupBody')}</p>
        <ul className="mt-4 space-y-2">
          {missing.map((m) => (
            <li key={m} className="num rounded-xl border border-line bg-sunk px-3 py-2 text-sm font-semibold">
              {m}
            </li>
          ))}
        </ul>
      </div>
    </Centered>
  );
}

export function Login() {
  const { t, login, data } = useStore();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? t('wrongPassword') : err.message) : t('cantReach'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Centered>
      <form onSubmit={submit} className="card rise w-full max-w-sm overflow-hidden">
        <div className="bg-surface p-6 sm:p-8">
          <BrandMark className="h-12 w-12" />
          <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight">{t('loginTitle')}</h1>
          <p className="mt-1.5 text-sm text-ink-2">{t('loginBody')}</p>
          <label className="mt-6 block">
            <span className="label">{t('password')}</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                className={cn('input pl-9', error && 'border-bad')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </label>
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-bad">
              <TriangleAlert className="h-4 w-4" /> {error}
            </p>
          )}
          <button className="btn-primary mt-5 w-full" disabled={!password || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? t('signingIn') : t('signIn')}
          </button>
        </div>
        <div className="border-t border-line bg-sunk px-6 py-3 text-center text-xs text-ink-3">{data.settings.language === 'bn' ? 'দৈনিক মিটার ও কালেকশন খাতা' : 'Daily meter & collection ledger'}</div>
      </form>
    </Centered>
  );
}

const STATUS: Record<SyncStatus, { key: TKey; icon: typeof Cloud; cls: string }> = {
  synced: { key: 'syncSynced', icon: Cloud, cls: 'text-ok' },
  pending: { key: 'syncPending', icon: CloudUpload, cls: 'text-warn' },
  saving: { key: 'syncSaving', icon: Loader2, cls: 'text-ink-2' },
  offline: { key: 'syncOffline', icon: CloudOff, cls: 'text-warn' },
  error: { key: 'syncError', icon: TriangleAlert, cls: 'text-bad' },
};

export function SyncBadge({ compact }: { compact?: boolean }) {
  const { cloud, t, syncNow } = useStore();
  if (cloud.mode === 'checking') return null;
  if (cloud.mode === 'local') {
    return compact ? null : (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3">
        <HardDrive className="h-3.5 w-3.5" /> {t('localMode')}
      </span>
    );
  }
  const s = STATUS[cloud.status];
  const Icon = s.icon;
  return (
    <button
      onClick={syncNow}
      title={cloud.error ?? t(s.key)}
      className={cn('inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold', s.cls, compact ? 'p-1.5' : 'px-0 py-0.5')}
    >
      <Icon className={cn('h-4 w-4', cloud.status === 'saving' && 'animate-spin')} />
      {!compact && t(s.key)}
    </button>
  );
}
