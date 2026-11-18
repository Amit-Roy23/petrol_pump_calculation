import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock, Fingerprint, Gauge, KeyRound, Loader2, LogIn, LogOut, MapPin, RefreshCw, TriangleAlert, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { AttendanceError, attendanceApi, distanceM, fmtDistance, fmtMinutes, staffSession, type Punch, type StaffStatus } from '../lib/attendance';
import { cn } from '../lib/util';
import { BrandMark } from '../components/BrandMark';
import { StaffPetrol } from './StaffPetrol';

/* ------------------------------------------------------------------ */
/* Staff punch page – opened at …/#/punch on the staff member's phone. */
/* It never shows the owner's ledger; staff only see their own punches. */
/* ------------------------------------------------------------------ */

export default function Punch() {
  const [session, setSession] = useState(staffSession.get());
  const logout = useCallback(() => {
    staffSession.set(null);
    setSession(null);
  }, []);
  if (!session) {
    return (
      <div className="paper flex min-h-screen justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-md">
          <StaffLogin onDone={() => setSession(staffSession.get())} />
        </div>
      </div>
    );
  }
  return <StaffApp token={session.token} name={session.name} onLogout={logout} />;
}

type Tab = 'punch' | 'shift';
const TAB_KEY = 'fuel-ledger:staff-tab';

/** The staff member's app: punch in / out, and (petrol staff) their shift on the meter sheet. */
function StaffApp({ token, name, onLogout }: { token: string; name: string; onLogout: () => void }) {
  const { t } = useStore();
  const [parts, setParts] = useState<string[] | null>(null);
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      return localStorage.getItem(TAB_KEY) === 'shift' ? 'shift' : 'punch';
    } catch {
      return 'punch';
    }
  });
  const setTab = (x: Tab) => {
    setTabState(x);
    window.scrollTo(0, 0);
    try {
      localStorage.setItem(TAB_KEY, x);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    attendanceApi
      .status(token)
      .then((s) => setParts(s.staff.businesses?.length ? s.staff.businesses : ['petrol']))
      .catch((e) => {
        if (e instanceof AttendanceError && e.status === 401) onLogout();
      });
  }, [token, onLogout]);

  // Petrol staff get the "My shift" tab (shown while we don't know yet, to avoid a jump).
  const petrol = parts === null || parts.includes('petrol');
  const current: Tab = petrol ? tab : 'punch';

  return (
    <div className="paper flex min-h-screen justify-center px-4 pb-28 pt-6 sm:pt-10">
      <div className={cn('w-full', current === 'shift' ? 'max-w-2xl lg:max-w-7xl' : 'max-w-md')}>
        {current === 'punch' ? (
          <PunchScreen token={token} onLogout={onLogout} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <BrandMark className="h-10 w-10 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-extrabold leading-tight">{name}</div>
                  <div className="truncate text-xs text-ink-3">{t('myShiftTab')}</div>
                </div>
              </div>
              <button className="btn-quiet shrink-0 px-2 text-xs" onClick={onLogout}>
                <LogOut className="h-4 w-4" /> {t('signOut')}
              </button>
            </div>
            <StaffPetrol token={token} onLogout={onLogout} />
          </div>
        )}
      </div>

      {petrol && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid max-w-md grid-cols-2">
            {(
              [
                ['punch', Fingerprint, t('tabPunch')],
                ['shift', Gauge, t('myShiftTab')],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={current === key ? 'page' : undefined}
                className={cn('flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold transition', current === key ? 'text-brand' : 'text-ink-3')}
              >
                <Icon className="h-6 w-6" />
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function errorText(e: unknown, t: (k: never) => string): string {
  const tt = t as (k: string) => string;
  if (e instanceof AttendanceError) {
    if (e.status === 0) return tt('cantReach');
    if (e.status === 404) return tt('punchNeedsServer');
    return e.message;
  }
  return tt('cantReach');
}

/** Staff login form – used on the punch page and the main login page's Staff tab. */
export function StaffLogin({ onDone, bare }: { onDone: () => void; bare?: boolean }) {
  const { t } = useStore();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await attendanceApi.staffLogin(phone, pin);
      staffSession.set(r.token, r.staff.name);
      onDone();
    } catch (err) {
      setError(errorText(err, t as never));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={bare ? '' : 'card rise overflow-hidden'}>
      <div className={bare ? '' : 'p-6 sm:p-8'}>
        {!bare && (
          <>
            <BrandMark className="h-12 w-12" />
            <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight">{t('punchTitle')}</h1>
          </>
        )}
        <p className={cn('text-sm text-ink-2', !bare && 'mt-1.5')}>{t('punchLoginHint')}</p>
        <label className="mt-5 block">
          <span className="label">{t('customerPhoneLabel')}</span>
          <input className="input num text-lg" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} autoFocus={!bare} />
        </label>
        <label className="mt-3 block">
          <span className="label">{t('pin')}</span>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input
              className="input num pl-9 text-lg tracking-[0.4em]"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </label>
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-bad">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <button className="btn-primary mt-5 w-full py-3 text-base" disabled={busy || phone.replace(/\D/g, '').length < 10 || pin.length < 4}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />} {t('signIn')}
        </button>
        <p className="mt-4 text-center text-xs text-ink-3">{t('punchAskOwner')}</p>
      </div>
    </form>
  );
}

type Geo = { lat: number; lng: number; accuracy: number };

function PunchScreen({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { t, data } = useStore();
  const lang = data.settings.language;
  const [status, setStatus] = useState<StaffStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoError, setGeoError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Punch | null>(null);
  const [, tick] = useState(0);
  const [business, setBusiness] = useState<'petrol' | 'lpg' | 'wine' | null>(() => {
    try {
      return (localStorage.getItem('fuel-ledger:staff-business') as 'petrol' | 'lpg' | 'wine' | null) ?? null;
    } catch {
      return null;
    }
  });

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setStatus(await attendanceApi.status(token));
    } catch (e) {
      if (e instanceof AttendanceError && e.status === 401) return onLogout();
      setLoadError(errorText(e, t as never));
    }
  }, [token, onLogout, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the "working for 3h 12m" timer moving.
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Live GPS while the page is open.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError(t('locationUnsupported'));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setGeoError('');
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? t('locationDenied') : t('locationWaiting')),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [t]);

  if (!status) {
    return (
      <div className="card p-8 text-center">
        {loadError ? (
          <>
            <TriangleAlert className="mx-auto h-8 w-8 text-bad" />
            <p className="mt-3 text-sm font-semibold text-bad">{loadError}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button className="btn-ghost" onClick={() => void load()}>
                <RefreshCw className="h-4 w-4" /> {t('retry')}
              </button>
              <button className="btn-quiet" onClick={onLogout}>
                {t('signOut')}
              </button>
            </div>
          </>
        ) : (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-ink-3" />
        )}
      </div>
    );
  }

  const last = status.last;
  const openIn = last && last.type === 'in' && Date.now() - new Date(last.at).getTime() < status.openShiftHours * 3600_000 ? last : null;
  const nextType: 'in' | 'out' = openIn ? 'out' : 'in';
  const parts = status.staff.businesses?.length ? status.staff.businesses : (['petrol'] as const);
  // Punching out goes to the same part as the punch in; otherwise the chosen / first part.
  const part: 'petrol' | 'lpg' | 'wine' = openIn ? openIn.business ?? 'petrol' : business && (parts as string[]).includes(business) ? business : parts[0];
  const partName = (b: string) => status.businessNames?.[b] || t(b === 'lpg' ? 'bizLpg' : b === 'wine' ? 'bizWine' : 'bizPetrol');
  const fence = status.geofence;
  const dist = fence && geo ? distanceM(fence, geo) : null;
  const inside = fence && dist !== null ? dist <= fence.radiusM : null;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'bn' ? 'bn-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' });
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-IN', { day: '2-digit', month: 'short' });

  const submit = async () => {
    if (!photo || !geo || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await attendanceApi.punch(token, { type: nextType, photo, lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, business: part });
      setDone(r.punch);
      setPhoto(null);
      await load();
    } catch (e) {
      if (e instanceof AttendanceError && e.status === 401) return onLogout();
      setError(errorText(e, t as never));
      if (e instanceof AttendanceError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Who */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-extrabold leading-tight">{status.staff.name}</div>
            <div className="truncate text-xs text-ink-3">{partName(part)}</div>
          </div>
        </div>
        <button className="btn-quiet shrink-0 px-2 text-xs" onClick={onLogout}>
          <LogOut className="h-4 w-4" /> {t('signOut')}
        </button>
      </div>

      {/* Success */}
      {done && (
        <div className={cn('card rise flex items-center gap-3 border-2 p-4', done.type === 'in' ? 'border-ok bg-ok-soft/60' : 'border-cng bg-cng-soft/60')}>
          <CheckCircle2 className={cn('h-8 w-8 shrink-0', done.type === 'in' ? 'text-ok' : 'text-cng')} />
          <div>
            <div className="font-display text-lg font-bold">{done.type === 'in' ? t('punchedIn') : t('punchedOut')}</div>
            <div className="num text-sm text-ink-2">
              {time(done.at)} · {day(done.at)}
              {done.distanceM !== null && ` · ${done.inside ? t('atPump') : `${t('outsidePump')} ${fmtDistance(done.distanceM)}`}`}
            </div>
          </div>
        </div>
      )}

      {/* Which part they're working in today (only if more than one) */}
      {parts.length > 1 && (
        <div className="card p-3">
          <div className="label">{t('workingAt')}</div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
            {parts.map((b) => (
              <button
                key={b}
                disabled={!!openIn}
                onClick={() => {
                  setBusiness(b);
                  try {
                    localStorage.setItem('fuel-ledger:staff-business', b);
                  } catch {
                    /* ignore */
                  }
                }}
                className={cn(
                  'truncate rounded-xl border px-2 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed',
                  part === b ? (b === 'petrol' ? 'border-brand bg-brand text-brand-ink' : b === 'lpg' ? 'border-cng bg-cng text-white' : 'border-premium bg-premium text-white') : 'border-line text-ink-2 disabled:opacity-40'
                )}
              >
                {partName(b)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current status */}
      <div className={cn('card p-4', openIn ? 'border-ok/50' : '')}>
        <div className="label">{t('status')}</div>
        {openIn ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-xl font-bold text-ok">
              {t('workingSince')} {time(openIn.at)}
            </span>
            <span className="num text-sm text-ink-2">{fmtMinutes(Math.max(0, Math.round((Date.now() - new Date(openIn.at).getTime()) / 60000)))}</span>
          </div>
        ) : (
          <div className="font-display text-xl font-bold text-ink-2">{t('notPunchedIn')}</div>
        )}
        {last && last.type === 'in' && !openIn && <p className="mt-1 text-xs font-semibold text-warn">⚠ {t('forgotPunchOut')} ({day(last.at)})</p>}
      </div>

      {/* 1. Selfie */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs text-bg">1</span> <Camera className="h-4 w-4" /> {t('takeSelfie')}
        </div>
        <SelfieCamera name={status.staff.name} geo={geo} photo={photo} onPhoto={setPhoto} />
      </div>

      {/* 2. Location */}
      <div className="card p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-xs text-bg">2</span> <MapPin className="h-4 w-4" /> {t('yourLocation')}
        </div>
        {geo ? (
          <div className="space-y-1 text-sm">
            <div className="num text-ink-2">
              {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)} <span className="text-ink-3">± {Math.round(geo.accuracy)} m</span>
            </div>
            {inside !== null && (
              <div className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', inside ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
                <MapPin className="h-3.5 w-3.5" /> {inside ? t('atPump') : `${t('outsidePump')} · ${fmtDistance(dist!)}`}
              </div>
            )}
            {geo.accuracy > 100 && <p className="text-xs text-warn">{t('locationWeak')}</p>}
          </div>
        ) : (
          <p className={cn('flex items-center gap-2 text-sm', geoError ? 'font-semibold text-bad' : 'text-ink-3')}>
            {!geoError && <Loader2 className="h-4 w-4 animate-spin" />} {geoError || t('locationWaiting')}
          </p>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-sm font-semibold text-bad">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {/* 3. Punch */}
      <button
        className={cn(
          'btn w-full py-4 text-lg text-white shadow-lift disabled:opacity-40',
          nextType === 'in' ? 'bg-ok hover:brightness-110' : 'bg-bad hover:brightness-110'
        )}
        disabled={!photo || !geo || busy}
        onClick={submit}
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : nextType === 'in' ? <LogIn className="h-6 w-6" /> : <LogOut className="h-6 w-6" />}
        {nextType === 'in' ? t('punchIn') : t('punchOut')}
      </button>
      {(!photo || !geo) && <p className="text-center text-xs text-ink-3">{!photo ? t('needSelfie') : t('needLocation')}</p>}

      {/* Recent */}
      {status.recent.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-2.5 text-sm font-bold">
            <Clock className="mr-1.5 inline h-4 w-4" /> {t('recentPunches')}
          </div>
          <div className="divide-y divide-line">
            {status.recent.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className={cn('chip px-2 py-0.5 text-[11px]', p.type === 'in' ? 'bg-ok-soft text-ok' : 'bg-cng-soft text-cng')}>{p.type === 'in' ? t('punchIn') : t('punchOut')}</span>
                <span className="num text-ink-2">
                  {day(p.at)} · <b className="text-ink">{time(p.at)}</b>
                </span>
                <span className={cn('text-xs', p.inside === false ? 'text-warn' : 'text-ink-3')}>{p.inside === null ? '' : p.inside ? t('atPump') : fmtDistance(p.distanceM ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Front camera with capture → stamped JPEG (name, time, location burned in). */
function SelfieCamera({ name, geo, photo, onPhoto }: { name: string; geo: Geo | null; photo: string | null; onPhoto: (p: string | null) => void }) {
  const { t } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camError, setCamError] = useState('');
  const [ready, setReady] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setReady(false);
  };

  const start = useCallback(async () => {
    setCamError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError(t('cameraUnsupported'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setReady(true);
    } catch (e) {
      setCamError((e as DOMException)?.name === 'NotAllowedError' ? t('cameraDenied') : t('cameraUnsupported'));
    }
  }, [t]);

  useEffect(() => {
    if (!photo) void start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const W = 480;
    const size = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = W;
    const ctx = c.getContext('2d')!;
    // Mirror like a selfie, crop to a square from the centre.
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, W, W);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Stamp: name, date/time, location.
    const stamp = [name, new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }), geo ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : ''].filter(Boolean);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, W - 22 * stamp.length - 12, W, 22 * stamp.length + 12);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    stamp.forEach((s, i) => ctx.fillText(s, 12, W - 22 * (stamp.length - i) + 8));
    onPhoto(c.toDataURL('image/jpeg', 0.6));
    stop();
  };

  if (photo) {
    return (
      <div className="relative">
        <img src={photo} alt={t('takeSelfie')} className="aspect-square w-full object-cover" />
        <button className="btn absolute bottom-3 right-3 bg-black/60 px-3 py-2 text-white" onClick={() => onPhoto(null)}>
          <RefreshCw className="h-4 w-4" /> {t('retake')}
        </button>
      </div>
    );
  }
  return (
    <div className="relative aspect-square w-full bg-black">
      <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
      {camError ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm font-semibold text-white">
          <div>
            <TriangleAlert className="mx-auto mb-2 h-8 w-8 text-warn" />
            {camError}
            <button className="btn mt-3 bg-white/20 px-3 py-2 text-white" onClick={() => void start()}>
              <RefreshCw className="h-4 w-4" /> {t('retry')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {!ready && <Loader2 className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/70" />}
          <div className="pointer-events-none absolute inset-8 rounded-full border-2 border-dashed border-white/40" />
          <button
            className="absolute bottom-4 left-1/2 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full border-4 border-white bg-white/30 disabled:opacity-40"
            onClick={capture}
            disabled={!ready}
            aria-label={t('takeSelfie')}
          >
            <UserRound className="h-7 w-7 text-white" />
          </button>
        </>
      )}
    </div>
  );
}
