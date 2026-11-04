import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  Lock,
  Pencil,
  Plus,
  Printer,
  Smartphone,
  Trash2,
  Unlock,
  UserRound,
} from 'lucide-react';
import { useStore } from '../lib/store';
import { computeDay, type NozzleRow, type ProductLine, type SheetCalc } from '../lib/compute';
import type { Entry, MachineSheet, Product } from '../lib/types';
import { cn, litresFmt, parseAmountExpr, rupee, uid } from '../lib/util';
import { Card, DateNav, DiffBadge, Empty, Lcd, MoneyInput, ProductTag, toneClass } from '../components/ui';
import { QuickAmountList } from '../components/EntryList';

type ReadingField = 'opening' | 'closing' | 'testing';

export default function DaySheet() {
  const { data, date, getDay, update, t, toast } = useStore();
  const { day } = getDay(date);
  const calc = useMemo(() => computeDay(data, day), [data, day]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = Math.max(0, calc.sheets.findIndex((s) => s.machine.id === activeId));
  const active = calc.sheets[activeIndex];
  const next = calc.sheets[activeIndex + 1];
  const locked = day.locked;
  const tol = data.settings.tolerancePaise;

  const setLocked = (v: boolean) => {
    // updateDay ignores locked days, so lock/unlock goes through the raw updater.
    update((d) => {
      if (!d.days[date]) d.days[date] = structuredClone(day);
      d.days[date].locked = v;
    });
    toast(v ? t('lockDay') : t('unlockDay'));
  };

  const goTo = (id: string) => {
    setActiveId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!active) {
    return (
      <Empty icon={<AlertTriangle className="h-6 w-6" />} title={t('machines')}>
        <Link to="/settings" className="btn-primary mt-3">
          {t('navSettings')}
        </Link>
      </Empty>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('navSheet')}</h1>
        <div className="no-print flex items-center gap-2">
          <DateNav />
          <button className="btn-ghost px-3" onClick={() => window.print()} aria-label={t('print')} title={t('print')}>
            <Printer className="h-4 w-4" />
          </button>
          <button className={cn('btn-ghost px-3', locked && 'border-warn text-warn')} onClick={() => setLocked(!locked)} title={locked ? t('unlockDay') : t('lockDay')}>
            {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            <span className="hidden sm:inline">{locked ? t('unlockDay') : t('lockDay')}</span>
          </button>
        </div>
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
          <Lock className="h-4 w-4 shrink-0" /> {t('dayLocked')}
        </div>
      )}

      {/* Machine switcher */}
      <div className="no-print -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:px-0">
        {calc.sheets.map((s) => (
          <MachinePill key={s.machine.id} calc={s} active={s.machine.id === active.machine.id} onClick={() => setActiveId(s.machine.id)} tolerance={tol} />
        ))}
      </div>

      <MachineSheetView key={active.machine.id} calc={active} locked={locked} next={next} onNext={goTo} />

      {/* Always-visible totals for the machine being entered */}
      <SummaryBar calc={active} tolerance={tol} />

      {/* Print shows every machine */}
      <div className="hidden print:block">
        {calc.sheets
          .filter((s) => s.machine.id !== active.machine.id)
          .map((s) => (
            <div key={s.machine.id} className="mt-8">
              <MachineSheetView calc={s} locked />
            </div>
          ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MachinePill({ calc, active, onClick, tolerance }: { calc: SheetCalc; active: boolean; onClick: () => void; tolerance: number }) {
  const { t } = useStore();
  const started = calc.salePaise > 0 && calc.collectedPaise > 0;
  const progress = calc.rows.length ? calc.filledNozzles / calc.rows.length : 0;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative flex min-w-[250px] snap-start items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition',
        active ? 'border-ink bg-ink text-bg shadow-lift' : 'border-line bg-surface hover:border-ink-3'
      )}
    >
      {/* progress ring */}
      <span className="relative grid h-11 w-11 shrink-0 place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className={active ? 'stroke-bg/20' : 'stroke-line'} />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${progress * 97.4} 97.4`}
            className={calc.hasError ? 'stroke-bad' : calc.complete ? 'stroke-ok' : 'stroke-brand'}
          />
        </svg>
        {calc.complete && !calc.hasError ? (
          <Check className="h-4 w-4 text-ok" strokeWidth={3} />
        ) : calc.hasError ? (
          <AlertTriangle className="h-4 w-4 text-bad" />
        ) : (
          <span className="num text-[11px] font-bold">
            {calc.filledNozzles}/{calc.rows.length}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[11px] font-semibold uppercase tracking-wider', active ? 'opacity-70' : 'text-ink-3')}>{t('machine')}</span>
        <span className="block font-display text-xl font-extrabold leading-tight">{calc.machine.name}</span>
      </span>
      <span className="text-right">
        <span className="num block text-sm font-bold">{rupee(calc.salePaise)}</span>
        {started ? (
          <span className={cn('num block text-[11px] font-semibold', calc.diffPaise === 0 ? 'text-ok' : Math.abs(calc.diffPaise) <= tolerance ? 'text-warn' : 'text-bad')}>
            {calc.diffPaise === 0 ? '✓' : rupee(calc.diffPaise, { sign: true })}
          </span>
        ) : (
          <span className={cn('block text-[11px]', active ? 'opacity-60' : 'text-ink-3')}>{t('pending')}</span>
        )}
      </span>
    </button>
  );
}

function StepHeader({ n, title, hint, done, right }: { n: number; title: string; hint?: string; done?: boolean; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold', done ? 'bg-ok text-white' : 'bg-ink text-bg')}>
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold leading-tight sm:text-lg">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-ink-2 sm:text-sm">{hint}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MachineSheetView({ calc, locked, next, onNext }: { calc: SheetCalc; locked: boolean; next?: SheetCalc; onNext?: (id: string) => void }) {
  const { data, date, updateDay, t } = useStore();
  const { machine, sheet } = calc;

  const edit = (fn: (s: MachineSheet) => void) =>
    updateDay(date, (day) => {
      if (!day.sheets[machine.id]) day.sheets[machine.id] = structuredClone(calc.sheet);
      fn(day.sheets[machine.id]);
    });

  const setReading = (nozzleId: string, field: ReadingField, value: string) =>
    edit((s) => {
      const cur = s.readings[nozzleId] ?? { opening: '', closing: '', testing: '' };
      s.readings[nozzleId] = { ...cur, [field]: value.replace(/[^\d.]/g, '') };
    });

  const setRate = (productId: string, paise: number) =>
    updateDay(date, (dd, draft) => {
      dd.rates[productId] = paise;
      // A newer rate becomes the default for future days.
      const latest = Object.keys(draft.days).sort().pop();
      if (latest === date) {
        const prod = draft.settings.products.find((x) => x.id === productId);
        if (prod) prod.ratePaise = paise;
      }
    });

  // Nozzles grouped by fuel – the notebook's column layout.
  const groups = calc.products.map((pl) => ({ line: pl, rows: calc.rows.filter((r) => r.nozzle.productId === pl.product.id) }));
  const orphanRows = calc.rows.filter((r) => !r.product);
  const moneyEntered = calc.collectedPaise > 0;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      {/* STEP 1 – readings */}
      <Card className="overflow-hidden">
        <StepHeader
          n={1}
          title={`${t('stepReadings')} · ${t('machine')} ${machine.name}`}
          hint={t('stepReadingsHint')}
          done={calc.complete && !calc.hasError}
          right={
            <input
              className="input hidden w-36 py-1.5 text-sm sm:block"
              placeholder={t('attendant')}
              value={sheet.attendant}
              disabled={locked}
              onChange={(e) => edit((s) => (s.attendant = e.target.value))}
              aria-label={t('attendant')}
            />
          }
        />
        <div className="space-y-4 p-3 sm:p-4">
          {groups.map(({ line, rows }) => (
            <ProductGroup key={line.product.id} line={line} rows={rows} locked={locked} onReading={setReading} onRate={(v) => setRate(line.product.id, v)} />
          ))}
          {orphanRows.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {orphanRows.map((r) => (
                <NozzleCard key={r.nozzle.id} row={r} locked={locked} onChange={setReading} />
              ))}
            </div>
          )}
          <input
            className="input py-2 text-sm sm:hidden"
            placeholder={t('attendant')}
            value={sheet.attendant}
            disabled={locked}
            onChange={(e) => edit((s) => (s.attendant = e.target.value))}
            aria-label={t('attendant')}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line bg-sunk/70 px-4 py-3 sm:px-5">
          <span className="font-display text-sm font-bold uppercase tracking-wider text-ink-2">{t('machineTotal')}</span>
          <Lcd value={rupee(calc.salePaise)} ghost={calc.salePaise === 0} />
        </div>
      </Card>

      <div className="space-y-5">
        {/* STEP 2 – money */}
        <Card className="overflow-hidden">
          <StepHeader n={2} title={t('stepMoney')} hint={t('stepMoneyHint')} done={moneyEntered && calc.complete && Math.abs(calc.diffPaise) <= data.settings.tolerancePaise} />
          <div className="space-y-3 p-3 sm:p-4">
            <div className="rounded-xl border border-line bg-ok-soft/40 p-3">
              <label htmlFor={`cash-${machine.id}`} className="mb-2 flex items-center gap-2 text-sm font-bold">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-ok text-white">
                  <Banknote className="h-4 w-4" />
                </span>
                {t('cash')}
              </label>
              <MoneyInput
                id={`cash-${machine.id}`}
                value={sheet.cashPaise}
                disabled={locked}
                placeholder={t('cashPlaceholder')}
                onCommit={(v) => edit((s) => (s.cashPaise = v))}
                inputClassName="py-3 text-xl font-bold bg-surface"
                ariaLabel={t('cash')}
              />
              <span className="mt-1.5 block text-[11px] text-ink-3">{t('cashHint')}</span>
            </div>
            <QuickAmountList
              title={t('online')}
              icon={<Smartphone className="h-4 w-4" />}
              accent="bg-cng"
              entries={sheet.online}
              disabled={locked}
              onChange={(n) => edit((s) => (s.online = n))}
            />
            <QuickAmountList
              title={t('card')}
              icon={<CreditCard className="h-4 w-4" />}
              accent="bg-premium"
              entries={sheet.card}
              disabled={locked}
              collapsedByDefault
              onChange={(n) => edit((s) => (s.card = n))}
            />
            <DueEditor dues={sheet.dues} locked={locked} onChange={(n) => edit((s) => (s.dues = n))} />
            <input className="input text-sm" placeholder={t('remark')} value={sheet.remark} disabled={locked} onChange={(e) => edit((s) => (s.remark = e.target.value))} />
          </div>
        </Card>

        {/* STEP 3 – check */}
        <Card className="overflow-hidden">
          <StepHeader n={3} title={t('stepCheck')} />
          <Bill calc={calc} />
          {(next || onNext) && (
            <div className="no-print flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
              {next && onNext ? (
                <button className="btn-primary" onClick={() => onNext(next.machine.id)}>
                  {t('nextMachine')}: {next.machine.name} <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <Link to="/closing" className="btn-primary">
                  {t('navClosing')} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ProductGroup({
  line,
  rows,
  locked,
  onReading,
  onRate,
}: {
  line: ProductLine;
  rows: NozzleRow[];
  locked: boolean;
  onReading: (id: string, f: ReadingField, v: string) => void;
  onRate: (paise: number) => void;
}) {
  const { t } = useStore();
  const tc = toneClass[line.product.tone];
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-line', tc.tint)}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <span className={cn('h-3 w-3 rounded-full', tc.dot)} />
          <ProductName product={line.product} />
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-2">
          {t('todayRate')}
          <MoneyInput className="w-28" inputClassName="bg-surface py-1.5 text-sm" value={line.ratePaise} disabled={locked} onCommit={onRate} ariaLabel={`${line.product.name} ${t('rate')}`} />
          <span className="text-ink-3">/L</span>
        </label>
      </div>
      <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2 sm:px-4">
        {rows.map((r) => (
          <NozzleCard key={r.nozzle.id} row={r} locked={locked} onChange={onReading} />
        ))}
      </div>
      {/* "121.77 × 100.45 = 12,231.79" – the notebook line */}
      <div className="num flex flex-wrap items-center justify-end gap-x-2 gap-y-1 border-t border-line/70 bg-surface/70 px-3 py-2.5 text-sm sm:px-4">
        <span className="font-bold">{litresFmt(line.litresCenti)} L</span>
        <span className="text-ink-3">×</span>
        <span>{rupee(line.ratePaise, { symbol: false })}</span>
        <span className="text-ink-3">=</span>
        <span className={cn('text-base font-extrabold', tc.text)}>{rupee(line.amountPaise)}</span>
      </div>
    </section>
  );
}

function ProductName({ product }: { product: Product }) {
  const { data } = useStore();
  return <span className="font-display text-base font-bold">{data.settings.language === 'bn' && product.nameBn ? product.nameBn : product.name}</span>;
}

function focusNextClosing(current: HTMLInputElement) {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-closing]:not(:disabled)')).filter((el) => el.offsetParent !== null);
  const i = all.indexOf(current);
  const nextEl = all[i + 1];
  if (nextEl) nextEl.focus();
  else (document.querySelector<HTMLInputElement>('input[id^="cash-"]:not(:disabled)') ?? current).focus();
}

function NozzleCard({ row, locked, onChange }: { row: NozzleRow; locked: boolean; onChange: (id: string, f: ReadingField, v: string) => void }) {
  const { t } = useStore();
  const { nozzle, reading } = row;
  const [editOpening, setEditOpening] = useState(false);
  const [showTesting, setShowTesting] = useState(false);
  const openingEditable = !locked && (editOpening || !reading.opening.trim());
  const testingVisible = showTesting || !!reading.testing.trim();
  const err = row.error && { closingLess: t('errClosingLess'), invalid: t('errInvalid'), testingTooHigh: t('errTesting') }[row.error];

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-3 shadow-sm transition',
        row.status === 'error' ? 'border-bad ring-2 ring-bad/15' : row.status === 'ok' ? 'border-ok/50' : 'border-line'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-ink px-1.5 font-display text-sm font-extrabold text-bg">{nozzle.label}</span>
          {row.status === 'ok' && <Check className="h-4 w-4 text-ok" strokeWidth={3} />}
        </div>
        <Lcd size="sm" value={litresFmt(row.litresCenti)} unit="L" ghost={row.status !== 'ok'} className="min-w-[96px]" />
      </div>

      {/* Opening – carried forward, editable on demand */}
      <div className="mt-3">
        {openingEditable ? (
          <label className="block">
            <span className="label">{reading.opening.trim() ? t('opening') : t('firstOpening')}</span>
            <input
              className={cn('input num py-2 text-[15px]', row.warning === 'carryMismatch' && 'border-warn')}
              inputMode="decimal"
              value={reading.opening}
              placeholder="0.000"
              autoFocus={editOpening}
              onChange={(e) => onChange(nozzle.id, 'opening', e.target.value)}
              onBlur={() => setEditOpening(false)}
            />
          </label>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sunk px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{t('opening')}</span>
            <span className="flex items-center gap-1.5">
              <span className="num text-sm text-ink-2">{reading.opening}</span>
              {!locked && (
                <button className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink" onClick={() => setEditOpening(true)} aria-label={t('editOpening')} title={t('editOpening')}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Closing – the one field staff type every day */}
      <label className="mt-2 block">
        <span className="label text-ink-2">{t('enterClosing')}</span>
        <input
          data-closing
          className={cn(
            'input num py-3 text-lg font-bold',
            row.status === 'error' && 'border-bad focus:border-bad focus:ring-bad/15',
            row.status === 'ok' && 'border-ok/60 bg-ok-soft/30'
          )}
          inputMode="decimal"
          enterKeyHint="next"
          value={reading.closing}
          disabled={locked}
          placeholder={t('closingPlaceholder')}
          onChange={(e) => onChange(nozzle.id, 'closing', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              focusNextClosing(e.currentTarget);
            }
          }}
        />
      </label>

      {testingVisible ? (
        <label className="mt-2 flex items-center gap-2">
          <span className="label mb-0 shrink-0">{t('testing')}</span>
          <input className="input num py-1.5 text-sm" inputMode="decimal" value={reading.testing} disabled={locked} placeholder="0" onChange={(e) => onChange(nozzle.id, 'testing', e.target.value)} />
        </label>
      ) : (
        !locked && (
          <button className="mt-1.5 text-xs font-semibold text-ink-3 hover:text-brand" onClick={() => setShowTesting(true)}>
            {t('addTesting')}
          </button>
        )
      )}

      {(err || row.warning) && (
        <div className="mt-2 space-y-1 text-xs font-semibold">
          {err && (
            <p className="flex items-center gap-1 text-bad">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {err}
            </p>
          )}
          {row.warning === 'bigJump' && <p className="text-warn">⚠ {t('warnBigJump')}</p>}
          {row.warning === 'carryMismatch' && (
            <p className="text-warn">
              ⚠ {t('warnCarry')}: <span className="num">{row.expectedOpening}</span>
              {!locked && (
                <button className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 underline" onClick={() => onChange(nozzle.id, 'opening', row.expectedOpening!)}>
                  {t('useValue')}
                </button>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Bill({ calc }: { calc: SheetCalc }) {
  const { data, t } = useStore();
  const tol = data.settings.tolerancePaise;
  const rows: [string, number, string][] = [
    [t('cash'), calc.cashPaise, 'bg-ok'],
    [t('online'), calc.onlinePaise, 'bg-cng'],
    [t('card'), calc.cardPaise, 'bg-premium'],
    [t('due'), calc.duePaise, 'bg-warn'],
  ];
  const tone = calc.diffPaise === 0 ? 'bg-ok-soft' : Math.abs(calc.diffPaise) <= tol ? 'bg-warn-soft' : 'bg-bad-soft';
  return (
    <div>
      <div className="space-y-1.5 px-4 py-3.5 text-sm sm:px-5">
        {calc.products.map((pl) => (
          <div key={pl.product.id} className="flex items-center justify-between gap-2">
            <ProductTag product={pl.product} />
            <span className="num">{rupee(pl.amountPaise)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-dashed border-line pt-2 font-bold">
          <span>{t('toCollect')}</span>
          <span className="num">{rupee(calc.salePaise)}</span>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-line px-4 py-3.5 text-sm sm:px-5">
        {rows.map(([label, v, dot]) => (
          <div key={label} className={cn('flex items-center justify-between', !v && 'text-ink-3')}>
            <span className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', dot)} />
              {label}
            </span>
            <span className="num">{rupee(v)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-dashed border-line pt-2 font-bold">
          <span>{t('collected')}</span>
          <span className="num">{rupee(calc.collectedPaise)}</span>
        </div>
      </div>
      <div className={cn('flex items-center justify-between gap-3 px-4 py-3 sm:px-5', calc.collectedPaise ? tone : 'bg-sunk')}>
        <span className="text-sm font-semibold">{t('kpiDiff')}</span>
        {calc.collectedPaise ? <DiffBadge paise={calc.diffPaise} tolerance={tol} size="lg" /> : <span className="text-sm text-ink-3">{t('pending')}</span>}
      </div>
    </div>
  );
}

function SummaryBar({ calc, tolerance }: { calc: SheetCalc; tolerance: number }) {
  const { t } = useStore();
  const started = calc.collectedPaise > 0;
  return (
    <div className="no-print sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface/95 px-3 py-2.5 shadow-lift backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <span className="hidden font-display text-lg font-extrabold sm:block">{calc.machine.name}</span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{t('sale')}</div>
            <div className="num truncate text-sm font-bold sm:text-base">{rupee(calc.salePaise)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">{t('collected')}</div>
            <div className="num truncate text-sm font-bold sm:text-base">{rupee(calc.collectedPaise)}</div>
          </div>
        </div>
        {started ? (
          <DiffBadge paise={calc.diffPaise} tolerance={tolerance} size="lg" />
        ) : calc.salePaise > 0 ? (
          <span className="shrink-0 rounded-full bg-sunk px-3 py-1.5 text-xs font-semibold text-ink-2">2 · {t('stepMoney')} →</span>
        ) : (
          <span className="text-xs text-ink-3">{t('pending')}</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DueEditor({ dues, locked, onChange }: { dues: Entry[]; locked: boolean; onChange: (next: Entry[]) => void }) {
  const { data, update, t, toast } = useStore();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const total = dues.reduce((a, b) => a + b.amountPaise, 0);
  const customers = data.customers;
  const paise = parseAmountExpr(amount);
  const canAdd = !!name.trim() && !!paise && paise > 0;

  const add = () => {
    if (!canAdd) return;
    const existing = customers.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    let customerId = existing?.id;
    if (!customerId) {
      const id = uid();
      customerId = id;
      update((d) => void d.customers.push({ id, name: name.trim(), phone: '', vehicle: note.trim(), openingDuePaise: 0 }));
    }
    onChange([...dues, { id: uid(), amountPaise: paise!, customerId, note: note.trim() }]);
    setName('');
    setAmount('');
    setNote('');
  };

  const remove = (d: Entry) => {
    const before = dues;
    onChange(dues.filter((x) => x.id !== d.id));
    toast(`${t('removed')} ${rupee(d.amountPaise)}`, 'ok', { label: t('undo'), run: () => onChange(before) });
  };

  return (
    <div className="rounded-xl border border-line bg-sunk/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn text-white">
            <UserRound className="h-4 w-4" />
          </span>
          {t('due')}
        </div>
        <div className="num text-base font-bold">{rupee(total)}</div>
      </div>
      {dues.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {dues.map((d) => {
            const c = customers.find((x) => x.id === d.customerId);
            return (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c?.name ?? '—'}</div>
                  {d.note && <div className="truncate text-xs text-ink-3">{d.note}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="num font-bold">{rupee(d.amountPaise)}</span>
                  {!locked && (
                    <button className="btn-quiet px-1.5 hover:text-bad" onClick={() => remove(d)} aria-label={t('delete')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!locked && (
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <input className="input bg-surface py-2" list="due-customers" placeholder={t('dueCustomer')} value={name} onChange={(e) => setName(e.target.value)} />
          <datalist id="due-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <input
            className="input num bg-surface py-2 text-right"
            inputMode="decimal"
            placeholder="₹ 0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <input className="input bg-surface py-2" placeholder={t('dueVehicle')} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-ghost px-3" onClick={add} disabled={!canAdd}>
            <Plus className="h-4 w-4" /> {t('add')}
          </button>
        </div>
      )}
    </div>
  );
}
