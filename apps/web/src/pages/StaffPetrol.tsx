import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Banknote, CheckCircle2, CloudOff, CreditCard, Fuel, Loader2, Lock, Play, QrCode, Receipt, RefreshCw, Save, Send, Smartphone, TriangleAlert, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { AttendanceError, attendanceApi, type PetrolWork } from '../lib/attendance';
import { computeSheet, getShifts, setShiftReading, shiftDisplayLabel, visibleMethods } from '../lib/compute';
import { defaultSettings } from '../lib/seed';
import type { AppData, DayRecord, Entry, MachineSheet, ShiftSheet } from '../lib/types';
import { cn, dateLabel, litresFmt, rupee, shiftDate, todayISO, uid } from '../lib/util';
import { DiffBadge, Lcd, MoneyInput, ProductTag, toneClass } from '../components/ui';
import { LineItemsEditor, QuickAmountList } from '../components/EntryList';
import { DueEditor, METHOD_ACCENTS, NozzleRowView } from './DaySheet';

/* -------------------------------------------------------------------------- */
/* "My shift" – petrol pump work a staff member does from their own login.     */
/* The server only sends their own money figures; others' shifts are readings. */
/* -------------------------------------------------------------------------- */

type Sel = { machineId: string; shiftId: string };
type SaveState = { kind: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'; at?: string; error?: string };

const AUTOSAVE_MS = 1500;

function blankDay(work: PetrolWork, date: string): DayRecord {
  const rates: Record<string, number> = {};
  for (const p of work.settings.products) rates[p.id] = p.ratePaise;
  return { date, rates, sheets: {}, closing: { denominations: {}, otherCash: [], expenses: [] }, locked: false, updatedAt: '' };
}

/** The response as app data, so the usual meter-sheet maths can run on the phone. */
function toAppData(work: PetrolWork, day: DayRecord, extraCustomers: { id: string; name: string }[], lang: 'en' | 'bn'): AppData {
  const base = defaultSettings();
  const days: Record<string, DayRecord> = {};
  for (const d of work.previousDays) days[d.date] = d;
  days[day.date] = day;
  return {
    version: 1,
    settings: { ...base, ...work.settings, roundingMode: work.settings.roundingMode ?? base.roundingMode, language: lang, theme: 'system' },
    days,
    customers: [...work.customers, ...extraCustomers].map((c) => ({ id: c.id, name: c.name, phone: '', vehicle: '', openingDuePaise: 0 })),
    receipts: [],
  };
}

export function StaffPetrol({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { t, data, toast } = useStore();
  const lang = data.settings.language;
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [work, setWork] = useState<PetrolWork | null>(null);
  const [day, setDay] = useState<DayRecord | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  const [newCustomers, setNewCustomers] = useState<{ id: string; name: string }[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [starting, setStarting] = useState(false);
  const editsRef = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const fail = useCallback(
    (e: unknown): string => {
      if (e instanceof AttendanceError) {
        if (e.status === 401) {
          onLogout();
          return '';
        }
        if (e.status === 0) return t('cantReach');
        return e.message;
      }
      return t('cantReach');
    },
    [onLogout, t]
  );

  const load = useCallback(
    async (d: string) => {
      setLoadError('');
      setWork(null);
      setSel(null);
      try {
        const w = await attendanceApi.petrol(token, d);
        setWork(w);
        setDay(w.day ?? blankDay(w, d));
        setNewCustomers([]);
        setSave({ kind: 'idle' });
        // Re-open the shift that's still running, if any.
        const mine = Object.values(w.day?.sheets ?? {}).flatMap((s) => getShifts(s).filter((x) => x.staffId === w.me.id && !x.submittedAt).map((x) => ({ machineId: s.machineId, shiftId: x.id })));
        if (mine.length === 1) setSel(mine[0]);
      } catch (e) {
        setLoadError(fail(e));
      }
    },
    [token, fail]
  );

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const app = useMemo(() => (work && day ? toAppData(work, day, newCustomers, lang) : null), [work, day, newCustomers, lang]);

  /* ---------------- saving ---------------- */

  const doSave = useCallback(
    async (submit = false): Promise<boolean> => {
      if (!work || !day || !sel) return false;
      const shift = day.sheets[sel.machineId] ? getShifts(day.sheets[sel.machineId]).find((s) => s.id === sel.shiftId) : undefined;
      if (!shift) return false;
      window.clearTimeout(timer.current);
      const editsAtStart = editsRef.current;
      setSave({ kind: 'saving' });
      try {
        const used = new Set(shift.dues.map((d) => d.customerId));
        const r = await attendanceApi.petrolSave(token, { date: day.date, machineId: sel.machineId, shift, newCustomers: newCustomers.filter((c) => used.has(c.id)), submit });
        // Customers the server now knows about (or matched to an existing name).
        setWork((w) => (w ? { ...w, customers: [...w.customers, ...r.customers.filter((c) => !w.customers.some((x) => x.id === c.id))] } : w));
        setNewCustomers((list) => list.filter((c) => !r.customers.some((x) => x.id === c.id) && !r.aliases[c.id]));
        if (editsRef.current === editsAtStart) {
          setDay(r.day);
          setSel({ machineId: sel.machineId, shiftId: r.shiftId });
          setSave({ kind: 'saved', at: new Date().toISOString() });
        } else {
          // Typed more while saving – keep it and save again.
          setSave({ kind: 'dirty' });
        }
        return true;
      } catch (e) {
        const msg = fail(e);
        setSave({ kind: 'error', error: msg });
        if (msg && submit) toast(msg, 'warn');
        return false;
      }
    },
    [work, day, sel, token, newCustomers, fail, toast]
  );

  // Auto-save shortly after each change.
  useEffect(() => {
    if (save.kind !== 'dirty') return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void doSave(false), AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [save.kind, day, doSave]);

  /** Change the selected shift locally (then auto-save). */
  const editSheet = (fn: (sheet: MachineSheet, index: number) => void) => {
    if (!day || !sel) return;
    const next = structuredClone(day);
    const sheet = next.sheets[sel.machineId];
    if (!sheet?.shifts) return;
    const i = sheet.shifts.findIndex((s) => s.id === sel.shiftId);
    if (i < 0) return;
    fn(sheet, i);
    editsRef.current++;
    setDay(next);
    setSave({ kind: 'dirty' });
  };
  const edit = (fn: (s: ShiftSheet) => void) => editSheet((sheet, i) => fn(sheet.shifts![i]));

  /* ---------------- start a shift ---------------- */

  const start = async (machineId: string, templateId: string) => {
    if (!work || !day || starting) return;
    setStarting(true);
    try {
      const r = await attendanceApi.petrolSave(token, { date: day.date, machineId, shift: { id: uid(), templateId } });
      setDay(r.day);
      setSel({ machineId, shiftId: r.shiftId });
      setSave({ kind: 'saved', at: new Date().toISOString() });
    } catch (e) {
      const msg = fail(e);
      if (msg) toast(msg, 'warn');
    } finally {
      setStarting(false);
    }
  };

  /* ---------------- render ---------------- */

  const dateSwitch = (
    <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunk p-1">
      {[today, shiftDate(today, -1)].map((d, i) => (
        <button
          key={d}
          onClick={() => {
            if (save.kind === 'dirty' || save.kind === 'saving') void doSave(false);
            setDate(d);
          }}
          className={cn('rounded-lg px-2 py-2 text-sm font-bold transition', date === d ? 'bg-surface text-ink shadow-sm' : 'text-ink-3')}
        >
          {i === 0 ? t('today') : t('yesterday')}
          <span className="num ml-1.5 text-xs font-normal text-ink-3">{dateLabel(d, lang, 'short')}</span>
        </button>
      ))}
    </div>
  );

  if (!work || !day || !app) {
    return (
      <div className="space-y-4">
        {dateSwitch}
        <div className="card p-8 text-center">
          {loadError ? (
            <>
              <TriangleAlert className="mx-auto h-8 w-8 text-bad" />
              <p className="mt-3 text-sm font-semibold text-bad">{loadError}</p>
              <button className="btn-ghost mt-4" onClick={() => void load(date)}>
                <RefreshCw className="h-4 w-4" /> {t('retry')}
              </button>
            </>
          ) : (
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-ink-3" />
          )}
        </div>
      </div>
    );
  }

  const machines = app.settings.machines;
  const mine = machines.flatMap((m) => {
    const sheet = day.sheets[m.id];
    return sheet ? getShifts(sheet).flatMap((s, i) => (s.staffId === work.me.id ? [{ machine: m, shift: s, index: i }] : [])) : [];
  });
  const selected = sel ? mine.find((x) => x.machine.id === sel.machineId && x.shift.id === sel.shiftId) : undefined;

  if (selected) {
    return (
      <div className="space-y-4">
        <ShiftEditor
          app={app}
          day={day}
          machineId={selected.machine.id}
          shiftId={selected.shift.id}
          save={save}
          onBack={
            mine.length > 1 || selected.shift.submittedAt
              ? () => {
                  if (save.kind === 'dirty') void doSave(false);
                  setSel(null);
                }
              : undefined
          }
          onReading={(nozzleId, field, value) => editSheet((sheet, i) => setShiftReading(sheet, i, nozzleId, field, value.replace(/[^\d.]/g, '')))}
          edit={edit}
          customers={app.customers}
          onNewCustomer={(name) => {
            const id = uid();
            setNewCustomers((list) => [...list, { id, name }]);
            return id;
          }}
          onSave={() => void doSave(false)}
          onSubmit={async () => {
            if (!confirm(t('submitShiftConfirm'))) return;
            if (await doSave(true)) toast(t('shiftSubmitted'), 'ok');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dateSwitch}
      {day.locked && (
        <p className="flex items-center gap-2 rounded-xl bg-sunk px-3 py-2.5 text-sm font-semibold text-ink-2">
          <Lock className="h-4 w-4" /> {t('dayClosedByOwner')}
        </p>
      )}

      {mine.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-2.5 text-sm font-bold">{t('myShifts')}</div>
          <div className="divide-y divide-line">
            {mine.map(({ machine, shift, index }) => (
              <button key={shift.id} onClick={() => setSel({ machineId: machine.id, shiftId: shift.id })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sunk/60">
                <span>
                  <span className="font-display text-lg font-extrabold">{machine.name}</span>
                  <span className="ml-2 text-sm text-ink-2">{shiftDisplayLabel(app.settings, shift, index)}</span>
                </span>
                {shift.submittedAt ? (
                  <span className="chip bg-ok-soft px-2.5 py-1 text-ok">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {t('submitted')}
                  </span>
                ) : (
                  <span className="chip bg-brand-soft px-2.5 py-1 text-brand">{t('inProgress')}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {!day.locked && <StartShift app={app} day={day} meId={work.me.id} busy={starting} onStart={start} />}
    </div>
  );
}

/* ---------------- pick a machine + shift ---------------- */

function StartShift({ app, day, meId, busy, onStart }: { app: AppData; day: DayRecord; meId: string; busy: boolean; onStart: (machineId: string, templateId: string) => void }) {
  const { t } = useStore();
  const lang = app.settings.language;
  const templates = app.settings.shiftTemplates ?? [];
  const [machineId, setMachineId] = useState('');
  const [templateId, setTemplateId] = useState('');

  const machines = app.settings.machines;
  const info = (id: string) => {
    const sheet = day.sheets[id];
    const shifts = sheet ? getShifts(sheet).filter((s) => s.staffId || s.attendant.trim()) : [];
    const last = shifts[shifts.length - 1];
    return { count: shifts.length, last, lastIndex: sheet && last ? getShifts(sheet).indexOf(last) : -1 };
  };
  // Suggest the next shift timing for the machine.
  const suggest = (id: string) => templates[Math.min(info(id).count, templates.length - 1)]?.id ?? '';
  const chosenTpl = templateId || (machineId ? suggest(machineId) : '');

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 font-display text-lg font-bold">
        <Play className="h-5 w-5 text-brand" /> {t('startMyShift')}
      </div>
      <p className="mt-1 text-sm text-ink-2">{t('startMyShiftHint')}</p>

      <div className="label mt-4">{t('machine')}</div>
      <div className="grid grid-cols-2 gap-2">
        {machines.map((m) => {
          const { last, lastIndex } = info(m.id);
          const on = machineId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                setMachineId(m.id);
                setTemplateId('');
              }}
              className={cn('rounded-xl border-2 px-3 py-3 text-left transition', on ? 'border-brand bg-brand-soft/60' : 'border-line bg-surface hover:border-ink-3')}
            >
              <span className="flex items-center gap-1.5 font-display text-2xl font-extrabold">
                <Fuel className="h-5 w-5 text-brand" /> {m.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-ink-3">
                {last ? `${last.staffId === meId ? t('you') : last.attendant || '—'} · ${shiftDisplayLabel(app.settings, last, lastIndex)}${last.submittedAt ? ' ✓' : ''}` : t('noShiftYet')}
              </span>
            </button>
          );
        })}
      </div>

      {templates.length > 0 && (
        <>
          <div className="label mt-4">{t('shift')}</div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(templates.length, 3)}, minmax(0, 1fr))` }}>
            {templates.map((tp) => (
              <button
                key={tp.id}
                onClick={() => setTemplateId(tp.id)}
                className={cn('rounded-xl border px-2 py-2 text-sm font-bold', chosenTpl === tp.id ? 'border-ink bg-ink text-bg' : 'border-line text-ink-2')}
              >
                {lang === 'bn' && tp.nameBn ? tp.nameBn : tp.name}
                <span className="num block text-[10px] font-normal opacity-70">
                  {tp.start}–{tp.end}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <button className="btn-primary mt-5 w-full py-3 text-base" disabled={!machineId || busy} onClick={() => onStart(machineId, chosenTpl)}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />} {t('startShift')}
      </button>
      <p className="mt-2 text-center text-xs text-ink-3">{t('openingAuto')}</p>
    </div>
  );
}

/* ---------------- the shift itself ---------------- */

function ShiftEditor({
  app,
  day,
  machineId,
  shiftId,
  save,
  onBack,
  onReading,
  edit,
  customers,
  onNewCustomer,
  onSave,
  onSubmit,
}: {
  app: AppData;
  day: DayRecord;
  machineId: string;
  shiftId: string;
  save: SaveState;
  onBack?: () => void;
  onReading: (nozzleId: string, field: 'opening' | 'closing' | 'testing', value: string) => void;
  edit: (fn: (s: ShiftSheet) => void) => void;
  customers: { id: string; name: string }[];
  onNewCustomer: (name: string, vehicle: string) => string;
  onSave: () => void;
  onSubmit: () => void;
}) {
  const { t } = useStore();
  const settings = app.settings;
  const lang = settings.language;
  const tol = settings.tolerancePaise;
  const machine = settings.machines.find((m) => m.id === machineId)!;
  const calc = computeSheet(app, day, machine);
  const sc = calc.shifts.find((x) => x.shift.id === shiftId);
  if (!sc) return null;
  const shift = sc.shift;
  const locked = !!shift.submittedAt || day.locked;
  const methods = visibleMethods(settings, [shift]);
  const methodName = (m: { name: string; nameBn: string }) => (lang === 'bn' && m.nameBn ? m.nameBn : m.name);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(lang === 'bn' ? 'bn-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' });
  const missing = sc.rows.filter((r) => r.status !== 'ok').length;

  const diffTone = sc.diffPaise === 0 ? 'text-ok' : Math.abs(sc.diffPaise) <= tol ? 'text-warn' : 'text-bad';
  const hasMoney = sc.salePaise > 0 || sc.collectedPaise > 0;
  const actions = (className: string) =>
    !locked && (
      <div className={className}>
        <div className="flex gap-2">
          <button className="btn-ghost shrink-0 px-4" onClick={onSave} disabled={save.kind === 'saving'}>
            {save.kind === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('save')}
          </button>
          <button className="btn-primary flex-1 py-2.5" onClick={onSubmit} disabled={save.kind === 'saving' || missing > 0 || sc.hasError}>
            <Send className="h-4 w-4" /> {t('submitShift')}
          </button>
        </div>
        {(missing > 0 || sc.hasError) && <p className="mt-1 text-center text-[11px] text-ink-3">{sc.hasError ? t('fixReadingsFirst') : `${t('enterAllClosings')} (${missing})`}</p>}
      </div>
    );

  return (
    <>
      {/* Header + live totals (pinned on bigger screens) */}
      <div className="card z-20 p-3 lg:sticky lg:top-3 lg:shadow-lift">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {onBack && (
              <button className="btn-quiet px-2" onClick={onBack} aria-label={t('back')}>
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-extrabold">{machine.name}</span>
                <span className="truncate text-sm font-semibold text-ink-2">{sc.label}</span>
              </div>
              <div className="num text-xs text-ink-3">
                {dateLabel(day.date, lang, 'short')}
                {shift.start && ` · ${shift.start}–${shift.end}`}
              </div>
            </div>
            <div className="ml-auto lg:hidden">
              <SaveBadge save={save} locked={locked} submittedAt={shift.submittedAt} time={time} />
            </div>
          </div>

          <div className="grid w-full grid-cols-3 divide-x divide-line rounded-xl border border-line bg-sunk/60 lg:w-auto">
            {[
              [t('sale'), rupee(sc.salePaise), ''],
              [t('collected'), rupee(sc.collectedPaise), ''],
              [t('kpiDiff'), hasMoney ? (sc.diffPaise === 0 ? '✓ ' + rupee(0) : rupee(sc.diffPaise, { sign: true })) : '—', hasMoney ? diffTone : 'text-ink-3'],
            ].map(([label, value, tone]) => (
              <div key={label} className="min-w-0 px-3 py-1.5 lg:min-w-[128px]">
                <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
                <div className={cn('num truncate text-sm font-bold sm:text-base', tone)}>{value}</div>
              </div>
            ))}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            <SaveBadge save={save} locked={locked} submittedAt={shift.submittedAt} time={time} />
            {actions('w-[300px]')}
          </div>
        </div>
      </div>

      {save.kind === 'error' && !locked && (
        <div className="flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-sm font-semibold text-bad">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{save.error || t('notSavedHint')}</span>
          <button className="underline" onClick={onSave}>
            {t('retry')}
          </button>
        </div>
      )}

      {locked && (
        <p className="flex items-start gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-sm font-semibold text-ok">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          {shift.submittedAt ? `${t('submittedAt')} ${time(shift.submittedAt)} · ${t('askOwnerToChange')}` : t('dayClosedByOwner')}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Left: meter readings + breakdown */}
        <div className="space-y-4">
          <div className="card paper overflow-hidden">
            <div className="border-b border-line bg-surface px-4 py-3 font-display font-bold">
              {t('readingsTitle')} · <span className="text-brand">{machine.name}</span>
            </div>
            <div className="hidden grid-cols-[64px_1fr_1fr_52px_84px] gap-2 border-b border-line bg-sunk px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3 md:grid">
              <span>{t('nozzle')}</span>
              <span>{t('opening')}</span>
              <span>{t('closing')}</span>
              <span>{t('testing')}</span>
              <span className="text-right">{t('litres')}</span>
            </div>
            <div className="divide-y divide-line bg-surface/80">
              {sc.rows.map((row) => (
                <NozzleRowView key={row.nozzle.id} row={row} locked={locked} lockOpening={!!row.reading.opening.trim()} compact onChange={onReading} />
              ))}
            </div>
            <div className="space-y-2 border-t border-line bg-sunk/70 px-4 py-3">
              {sc.products.map((pl) => (
                <div key={pl.product.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border-l-4 bg-surface px-3 py-2', toneClass[pl.product.tone].bar)}>
                  <ProductTag product={pl.product} />
                  <div className="num flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-bold">{litresFmt(pl.litresCenti)} L</span>
                    <span className="text-ink-3">×</span>
                    <span>{rupee(pl.ratePaise, { symbol: false })}</span>
                    <span className="text-ink-3">=</span>
                    <span className="text-base font-bold">{rupee(pl.amountPaise)}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="font-display text-sm font-bold uppercase tracking-wider text-ink-2">{t('shiftTotal')}</span>
                <Lcd value={rupee(sc.salePaise)} size="md" ghost={sc.salePaise === 0} />
              </div>
            </div>
          </div>

          {/* Short / excess breakdown */}
          <div className="card overflow-hidden">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-4 py-4 text-sm">
              {[
                [t('cash'), sc.cashPaise],
                [t('online'), sc.onlinePaise],
                [t('card'), sc.cardPaise],
                ...methods.map((m) => [methodName(m), sc.extraPaise[m.id] ?? 0]),
                [t('due'), sc.duePaise],
                [t('shiftExpenses'), sc.shiftExpensesPaise],
              ].map(([label, v]) => (
                <div key={label as string} className="flex justify-between gap-2">
                  <span className="truncate text-ink-2">{label}</span>
                  <span className="num">{rupee(v as number)}</span>
                </div>
              ))}
              <div className="col-span-2 mt-1 flex justify-between border-t border-dashed border-line pt-2 font-bold">
                <span>{t('collected')}</span>
                <span className="num">{rupee(sc.collectedPaise)}</span>
              </div>
              <div className="col-span-2 flex justify-between font-bold">
                <span>{t('sale')}</span>
                <span className="num">{rupee(sc.salePaise)}</span>
              </div>
            </div>
            <div className={cn('flex items-center justify-between gap-3 px-4 py-3', sc.diffPaise === 0 ? 'bg-ok-soft' : Math.abs(sc.diffPaise) <= tol ? 'bg-warn-soft' : 'bg-bad-soft')}>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <UserRound className="h-4 w-4" /> {sc.complete ? t('status') : t('incomplete')}
              </span>
              {hasMoney ? <DiffBadge paise={sc.diffPaise} tolerance={tol} size="lg" /> : <span className="text-sm text-ink-3">—</span>}
            </div>
          </div>
        </div>

        {/* Right: collections */}
        <div className="card p-4">
          <div className="mb-3 font-display font-bold">{t('collectionsTitle')}</div>
          <div className="mb-4">
            <span className="label flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> {t('cash')}
            </span>
            <MoneyInput key={shift.id} value={shift.cashPaise} disabled={locked} onCommit={(v) => edit((s) => (s.cashPaise = v))} className="[&_input]:py-3 [&_input]:text-lg [&_input]:font-bold" ariaLabel={t('cash')} />
            <span className="mt-1 block text-[11px] text-ink-3">{t('cashHint')}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <QuickAmountList key={`on-${shift.id}`} title={t('online')} icon={<Smartphone className="h-4 w-4" />} accent="bg-cng" entries={shift.online} disabled={locked} onChange={(next) => edit((s) => (s.online = next))} />
            <QuickAmountList key={`card-${shift.id}`} title={t('card')} icon={<CreditCard className="h-4 w-4" />} accent="bg-premium" entries={shift.card} disabled={locked} onChange={(next) => edit((s) => (s.card = next))} />
            {methods.map((m, i) => (
              <QuickAmountList
                key={`${m.id}-${shift.id}`}
                title={methodName(m)}
                icon={<QrCode className="h-4 w-4" />}
                accent={METHOD_ACCENTS[i % METHOD_ACCENTS.length]}
                entries={shift.extra?.[m.id] ?? []}
                disabled={locked}
                onChange={(next: Entry[]) => edit((s) => (s.extra = { ...(s.extra ?? {}), [m.id]: next }))}
              />
            ))}
            <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <DueEditor key={`due-${shift.id}`} dues={shift.dues} locked={locked} customers={customers} onNewCustomer={onNewCustomer} onChange={(next) => edit((s) => (s.dues = next))} />
            </div>
            <div className="rounded-xl border border-line bg-sunk/60 p-3 sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-bad text-white">
                    <Receipt className="h-4 w-4" />
                  </span>
                  {t('shiftExpenses')}
                </div>
                <div className="num text-base font-bold">{rupee(sc.shiftExpensesPaise)}</div>
              </div>
              <p className="mb-2 text-[11px] text-ink-3">{t('shiftExpensesHint')}</p>
              <LineItemsEditor key={`exp-${shift.id}`} items={shift.expenses ?? []} disabled={locked} placeholder={t('expensePlaceholder')} onChange={(next) => edit((s) => (s.expenses = next))} />
            </div>
          </div>
          <input className="input mt-4 text-sm" placeholder={t('remark')} value={shift.remark} disabled={locked} maxLength={200} onChange={(e) => edit((s) => (s.remark = e.target.value))} />
        </div>
      </div>

      {/* Phone: actions stay above the tab bar */}
      {actions('sticky bottom-[84px] z-10 rounded-2xl border border-line bg-surface/95 p-2 shadow-lift backdrop-blur lg:hidden')}
    </>
  );
}

function SaveBadge({ save, locked, submittedAt, time }: { save: SaveState; locked: boolean; submittedAt?: string; time: (iso: string) => string }) {
  const { t } = useStore();
  if (locked && submittedAt)
    return (
      <span className="chip shrink-0 bg-ok-soft px-2.5 py-1 text-ok">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t('submitted')}
      </span>
    );
  if (save.kind === 'saving' || save.kind === 'dirty')
    return (
      <span className="chip shrink-0 bg-sunk px-2.5 py-1 text-ink-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('saving')}
      </span>
    );
  if (save.kind === 'error')
    return (
      <span className="chip max-w-[45%] shrink-0 bg-bad-soft px-2.5 py-1 text-bad" title={save.error}>
        <CloudOff className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{t('notSaved')}</span>
      </span>
    );
  if (save.kind === 'saved' && save.at)
    return (
      <span className="chip shrink-0 bg-ok-soft px-2.5 py-1 text-ok">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t('savedAt')} {time(save.at)}
      </span>
    );
  return null;
}
