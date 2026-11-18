import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, ExternalLink, Fingerprint, Loader2, MapPin, RefreshCw, Trash2, TriangleAlert, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { AttendanceError, attendanceApi, fmtDistance, fmtMinutes, mapLink, toSessions, type Punch, type Session } from '../lib/attendance';
import { staffList } from '../lib/compute';
import { cn, downloadFile, shiftDate, todayISO } from '../lib/util';
import { BUSINESS_LIST, BUSINESS_META } from '../lib/staff';
import type { Business } from '../lib/types';
import { Card, Field, Modal, Segmented } from './ui';

type Preset = 'today' | '7' | 'month' | 'custom';

/** Local-day boundaries as ISO strings for the server query. */
const startOf = (d: string) => new Date(`${d}T00:00:00`).toISOString();

/** Photo thumbnails are fetched once and cached for the session. */
const photoCache = new Map<string, Promise<string>>();
function usePhoto(id: string | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    if (!photoCache.has(id)) photoCache.set(id, attendanceApi.photo(id).then((r) => r.data).catch(() => ''));
    void photoCache.get(id)!.then((d) => alive && setSrc(d || null));
    return () => {
      alive = false;
    };
  }, [id]);
  return src;
}

function Thumb({ punch, onOpen }: { punch: Punch; onOpen: () => void }) {
  const src = usePhoto(punch.photoId);
  return (
    <button onClick={onOpen} className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-sunk" aria-label="photo">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Loader2 className="m-auto h-4 w-4 animate-spin text-ink-3" />}
    </button>
  );
}

export function PunchRegister() {
  const { data, t, toast, cloud } = useStore();
  // Attendance always starts from the real date, not the ledger's selected day.
  const date = todayISO();
  const lang = data.settings.language;
  const [preset, setPreset] = useState<Preset>('today');
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [staffId, setStaffId] = useState('');
  const [part, setPart] = useState<Business | ''>('');
  const [punches, setPunches] = useState<Punch[] | null>(null);
  const [openHours, setOpenHours] = useState(16);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<Punch | null>(null);
  const online = cloud.mode === 'cloud';

  const load = useCallback(async () => {
    if (!online) return;
    setError('');
    setPunches(null);
    try {
      const r = await attendanceApi.list(startOf(from), startOf(shiftDate(to, 1)));
      setPunches(r.punches);
      setOpenHours(r.openShiftHours);
    } catch (e) {
      setError(e instanceof AttendanceError && e.status !== 0 ? e.message : t('cantReach'));
      setPunches([]);
    }
  }, [online, from, to, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const today = date;
    if (p === 'today') (setFrom(today), setTo(today));
    else if (p === '7') (setFrom(shiftDate(today, -6)), setTo(today));
    else if (p === 'month') (setFrom(today.slice(0, 8) + '01'), setTo(today));
  };

  const sessions = useMemo(() => toSessions((punches ?? []).filter((p) => (!staffId || p.staffId === staffId) && (!part || (p.business ?? 'petrol') === part)), openHours), [punches, staffId, part, openHours]);
  const totals = useMemo(() => {
    const m = new Map<string, { name: string; minutes: number; days: Set<string>; missing: number }>();
    for (const s of sessions) {
      const cur = m.get(s.staffId) ?? { name: s.staffName, minutes: 0, days: new Set<string>(), missing: 0 };
      if (s.minutes) cur.minutes += s.minutes;
      if (s.in) cur.days.add(new Date(s.in.at).toDateString());
      if (s.missingOut) cur.missing++;
      m.set(s.staffId, cur);
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  }, [sessions]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'bn' ? 'bn-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' });
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
  const link = `${location.origin}${location.pathname}#/punch`;

  const exportCsv = () => {
    const rows = [['Staff', 'Part', 'Date', 'In', 'In location', 'In at pump', 'Out', 'Out location', 'Out at pump', 'Hours']];
    for (const s of [...sessions].reverse()) {
      const loc = (p: Punch | null) => (p ? `${p.lat},${p.lng}` : '');
      const atPump = (p: Punch | null) => (p ? (p.inside === null ? '' : p.inside ? 'yes' : `no (${p.distanceM} m)`) : '');
      rows.push([
        s.staffName,
        (s.in ?? s.out)!.business ?? 'petrol',
        (s.in ?? s.out)!.at.slice(0, 10),
        s.in ? time(s.in.at) : '',
        loc(s.in),
        atPump(s.in),
        s.out ? time(s.out.at) : s.missingOut ? 'MISSING' : '',
        loc(s.out),
        atPump(s.out),
        s.minutes !== null ? (s.minutes / 60).toFixed(2) : '',
      ]);
    }
    downloadFile(`punches_${from}_${to}.csv`, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };

  const PunchCell = ({ p, s, kind }: { p: Punch | null; s: Session; kind: 'in' | 'out' }) => {
    if (!p) {
      if (kind === 'out' && s.open) return <span className="chip bg-ok-soft text-ok">{t('working')}</span>;
      if (kind === 'out' && s.missingOut) return <span className="chip bg-bad-soft text-bad">⚠ {t('missingOut')}</span>;
      return <span className="text-ink-3">—</span>;
    }
    return (
      <div className="flex items-center gap-2">
        <Thumb punch={p} onOpen={() => setViewing(p)} />
        <div className="min-w-0">
          <div className="num font-bold">{time(p.at)}</div>
          <a href={mapLink(p.lat, p.lng)} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', p.inside === false ? 'text-warn' : 'text-ink-3 hover:text-ink')}>
            <MapPin className="h-3 w-3" />
            {p.inside === null ? t('viewOnMap') : p.inside ? t('atPump') : fmtDistance(p.distanceM ?? 0)}
          </a>
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div>
          <div className="flex items-center gap-2 font-display font-bold">
            <Fingerprint className="h-5 w-5 text-brand" /> {t('punchRegister')}
          </div>
          <p className="text-xs text-ink-3">{t('punchRegisterHint')}</p>
        </div>
        {online && (
          <div className="flex gap-2">
            <button className="btn-ghost py-1.5" onClick={() => void load()} aria-label={t('retry')}>
              <RefreshCw className="h-4 w-4" />
            </button>
            <button className="btn-ghost py-1.5" onClick={exportCsv} disabled={!sessions.length}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t('exportCsv')}</span>
            </button>
          </div>
        )}
      </div>

      {!online ? (
        <p className="px-5 py-6 text-sm text-ink-2">{t('attendanceNeedsServer')}</p>
      ) : (
        <>
          {/* Staff link + filters */}
          <div className="space-y-3 border-b border-line bg-sunk/50 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-ink-2">{t('staffPunchLink')}:</span>
              <code className="num rounded bg-surface px-2 py-1">{link}</code>
              <button
                className="btn-quiet px-2 py-1 text-xs"
                onClick={() => navigator.clipboard?.writeText(link).then(() => toast(t('linkCopied')), () => toast(t('copyFailed'), 'warn'))}
              >
                <Copy className="h-3.5 w-3.5" /> {t('copyLink')}
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Segmented
                value={preset}
                onChange={applyPreset}
                options={[
                  { value: 'today', label: t('today') },
                  { value: '7', label: '7d' },
                  { value: 'month', label: lang === 'bn' ? 'এই মাস' : 'This month' },
                ]}
              />
              <Field label={t('from')}>
                <input type="date" className="input py-1.5" value={from} onChange={(e) => e.target.value && (setFrom(e.target.value), setPreset('custom'))} />
              </Field>
              <Field label={t('to')}>
                <input type="date" className="input py-1.5" value={to} onChange={(e) => e.target.value && (setTo(e.target.value), setPreset('custom'))} />
              </Field>
              <Field label={t('workingAt')}>
                <select className="input py-1.5" value={part} onChange={(e) => setPart(e.target.value as Business | '')}>
                  <option value="">{t('allParts')}</option>
                  {BUSINESS_LIST.map((b) => (
                    <option key={b} value={b}>
                      {t(BUSINESS_META[b].key)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('worker')}>
                <select className="input py-1.5" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">{t('allStaff')}</option>
                  {staffList(data.settings).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {error && (
            <p className="m-4 flex items-center gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-sm font-semibold text-bad">
              <TriangleAlert className="h-4 w-4" /> {error}
            </p>
          )}

          {punches === null ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-ink-3" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-3">{t('noPunches')}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                    <tr>
                      <th className="px-4 py-2 text-left sm:px-5">{t('worker')}</th>
                      <th className="px-2 py-2 text-left">{t('date')}</th>
                      <th className="px-2 py-2 text-left">{t('inTime')}</th>
                      <th className="px-2 py-2 text-left">{t('outTime')}</th>
                      <th className="px-4 py-2 text-right sm:px-5">{t('hoursWorked')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sessions.map((s, i) => (
                      <tr key={(s.in ?? s.out)!.id + i}>
                        <td className="px-4 py-2 font-semibold sm:px-5">
                          <UserRound className="mr-1 inline h-3.5 w-3.5 text-ink-3" />
                          {s.staffName}
                          {(() => {
                            const b = ((s.in ?? s.out)!.business ?? 'petrol') as Business;
                            return <span className={cn('chip ml-1.5 px-2 py-0.5 text-[10px]', BUSINESS_META[b].chip)}>{t(BUSINESS_META[b].key)}</span>;
                          })()}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-ink-2">{day((s.in ?? s.out)!.at)}</td>
                        <td className="px-2 py-2">
                          <PunchCell p={s.in} s={s} kind="in" />
                        </td>
                        <td className="px-2 py-2">
                          <PunchCell p={s.out} s={s} kind="out" />
                        </td>
                        <td className="num px-4 py-2 text-right font-bold sm:px-5">{s.minutes !== null ? fmtMinutes(s.minutes) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Per-staff totals */}
              <div className="grid gap-2 border-t border-line px-4 py-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
                {totals.map((x) => (
                  <div key={x.name} className="flex items-center justify-between rounded-xl bg-sunk/60 px-3 py-2 text-sm">
                    <span className="font-semibold">{x.name}</span>
                    <span className="num text-ink-2">
                      {x.days.size} {t('daysPresent').toLowerCase()} · <b className="text-ink">{fmtMinutes(x.minutes)}</b>
                      {x.missing > 0 && <span className="ml-1 text-bad">· ⚠{x.missing}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {viewing && (
        <PunchModal
          punch={viewing}
          onClose={() => setViewing(null)}
          onDeleted={() => {
            setPunches((ps) => (ps ?? []).filter((p) => p.id !== viewing.id));
            setViewing(null);
          }}
        />
      )}
    </Card>
  );
}

function PunchModal({ punch, onClose, onDeleted }: { punch: Punch; onClose: () => void; onDeleted: () => void }) {
  const { t, toast, data } = useStore();
  const src = usePhoto(punch.photoId);
  const lang = data.settings.language;
  const when = new Date(punch.at).toLocaleString(lang === 'bn' ? 'bn-IN' : 'en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const remove = async () => {
    if (!confirm(t('deletePunchConfirm'))) return;
    try {
      await attendanceApi.remove(punch.id);
      toast(t('removed'));
      onDeleted();
    } catch (e) {
      toast(e instanceof AttendanceError ? e.message : t('cantReach'), 'warn');
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${punch.staffName} · ${punch.type === 'in' ? t('punchIn') : t('punchOut')}`}
      footer={
        <>
          <button className="btn-quiet mr-auto text-bad" onClick={remove}>
            <Trash2 className="h-4 w-4" /> {t('delete')}
          </button>
          <a className="btn-ghost" href={mapLink(punch.lat, punch.lng)} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> {t('viewOnMap')}
          </a>
        </>
      }
    >
      <div className="space-y-3">
        <div className="aspect-square w-full overflow-hidden rounded-xl bg-sunk">{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Loader2 className="m-auto mt-24 h-8 w-8 animate-spin text-ink-3" />}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <span className="text-ink-3">{t('date')}</span>
          <span className="num font-semibold">{when}</span>
          <span className="text-ink-3">{t('yourLocation')}</span>
          <span className="num">
            {punch.lat.toFixed(5)}, {punch.lng.toFixed(5)}
          </span>
          <span className="text-ink-3">{t('accuracy')}</span>
          <span className="num">{punch.accuracy >= 0 ? `± ${punch.accuracy} m` : '—'}</span>
          {punch.distanceM !== null && (
            <>
              <span className="text-ink-3">{t('status')}</span>
              <span className={cn('font-semibold', punch.inside ? 'text-ok' : 'text-warn')}>{punch.inside ? t('atPump') : `${t('outsidePump')} · ${fmtDistance(punch.distanceM)}`}</span>
            </>
          )}
          <span className="text-ink-3">{t('device')}</span>
          <span className="truncate text-xs text-ink-2" title={punch.device}>
            {punch.device || '—'}
          </span>
        </div>
      </div>
    </Modal>
  );
}
