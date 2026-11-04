import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Banknote, Check, CheckCircle2, Fuel, Gauge, HandCoins, Scale, Sparkles } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeDay, customerBalances } from '../lib/compute';
import { sampleData } from '../lib/seed';
import { cn, dateLabel, litresFmt, rupee, shiftDate } from '../lib/util';
import { Card, DateNav, DiffBadge, Lcd, ProductTag, Stat, toneClass } from '../components/ui';
import { BrandMark } from '../components/BrandMark';

export default function Dashboard() {
  const { data, date, setDate, getDay, t, replace, fresh } = useStore();
  const navigate = useNavigate();
  const { day, exists } = getDay(date);
  const calc = useMemo(() => computeDay(data, day), [data, day]);
  const tol = data.settings.tolerancePaise;
  const lang = data.settings.language;

  const outstanding = useMemo(() => [...customerBalances(data).values()].reduce((a, b) => a + Math.max(0, b.balancePaise), 0), [data]);

  const week = useMemo(() => {
    const out: { date: string; sale: number; exists: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = shiftDate(date, -i);
      const rec = data.days[d];
      out.push({ date: d, sale: rec ? computeDay(data, rec).salePaise : 0, exists: !!rec });
    }
    return out;
  }, [data, date]);
  const weekMax = Math.max(1, ...week.map((w) => w.sale));

  if (fresh && Object.keys(data.days).length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-6 sm:py-12">
        <Card className="paper overflow-hidden">
          <div className="bg-surface/90 p-6 sm:p-10">
            <BrandMark className="h-14 w-14" />
            <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{t('welcomeTitle')}</h1>
            <p className="mt-3 text-ink-2">{t('welcomeBody')}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                [Gauge, t('navSheet')],
                [Banknote, t('navClosing')],
                [HandCoins, t('navDues')],
              ].map(([Icon, label]) => {
                const I = Icon as typeof Gauge;
                return (
                  <div key={label as string} className="flex items-center gap-2 rounded-xl border border-line bg-sunk px-3 py-2.5 text-sm font-semibold">
                    <I className="h-4 w-4 text-brand" /> {label as string}
                  </div>
                );
              })}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => navigate('/settings')}>
                {t('startFresh')} <ArrowRight className="h-4 w-4" />
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  replace(sampleData(data));
                  setDate('2026-06-19');
                }}
              >
                <Sparkles className="h-4 w-4" /> {t('trySample')}
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const diffTone = calc.diffPaise === 0 ? 'bg-ok' : Math.abs(calc.diffPaise) <= tol * Math.max(1, calc.sheets.length) ? 'bg-warn' : 'bg-bad';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-3">{dateLabel(date, lang)}</p>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('navHome')}</h1>
        </div>
        <DateNav />
      </div>

      {/* Hero */}
      <Card className="relative overflow-hidden">
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="label">{t('kpiSale')}</div>
            <Lcd value={rupee(calc.salePaise)} size="lg" ghost={!exists} className="mt-1 w-full justify-start sm:w-auto" />
            <div className="mt-4 flex flex-wrap gap-2">
              {calc.products.map((p) => (
                <div key={p.product.id} className={cn('flex items-center gap-2 rounded-xl px-3 py-2', toneClass[p.product.tone].soft)}>
                  <ProductTag product={p.product} className="bg-transparent px-0" />
                  <span className="num text-sm font-bold">{litresFmt(p.litresCenti)} L</span>
                  <span className="num text-xs text-ink-2">{rupee(p.amountPaise)}</span>
                </div>
              ))}
            </div>
          </div>
          <Checklist calc={calc} exists={exists} locked={day.locked} />
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t('kpiCollected')} value={rupee(calc.collectedPaise)} sub={`${t('online')} ${rupee(calc.onlinePaise)}`} accent="bg-cng" icon={<Banknote className="h-4 w-4" />} />
        <Stat
          label={t('kpiDiff')}
          value={rupee(calc.diffPaise, { sign: true })}
          sub={calc.sheets.map((s) => `${s.machine.name}: ${rupee(s.diffPaise, { sign: true })}`).join(' · ')}
          accent={diffTone}
          icon={<Scale className="h-4 w-4" />}
        />
        <Stat
          label={t('kpiCash')}
          value={calc.denominationsEntered ? rupee(calc.countedCashPaise) : rupee(calc.expectedCashPaise)}
          sub={
            calc.denominationsEntered ? (
              <DiffBadge paise={calc.cashDiffPaise} tolerance={0} />
            ) : (
              `${t('expectedCash')} · ${t('notCounted')}`
            )
          }
          accent="bg-ok"
          icon={<Fuel className="h-4 w-4" />}
        />
        <Stat label={t('totalOutstanding')} value={rupee(outstanding)} sub={`${data.customers.length} ${t('duesTitle').toLowerCase()}`} accent="bg-warn" icon={<HandCoins className="h-4 w-4" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Machines */}
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold">{t('perMachine')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {calc.sheets.map((s) => (
              <Link key={s.machine.id} to="/sheet" className="card group block p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{t('machine')}</div>
                    <div className="font-display text-2xl font-extrabold">{s.machine.name}</div>
                    {s.sheet.attendant && <div className="text-xs text-ink-3">{s.sheet.attendant}</div>}
                  </div>
                  <div className="flex gap-1" aria-label={`${s.filledNozzles}/${s.rows.length}`}>
                    {s.rows.map((r) => (
                      <span
                        key={r.nozzle.id}
                        title={r.nozzle.label}
                        className={cn('h-6 w-2 rounded-full', r.status === 'ok' ? (r.product ? toneClass[r.product.tone].dot : 'bg-ok') : r.status === 'error' ? 'bg-bad' : 'bg-line')}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-2">{t('sale')}</span>
                    <span className="num font-semibold">{rupee(s.salePaise)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">{t('collected')}</span>
                    <span className="num font-semibold">{rupee(s.collectedPaise)}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {s.salePaise || s.collectedPaise ? <DiffBadge paise={s.diffPaise} tolerance={tol} /> : <span className="text-xs text-ink-3">{t('pending')}</span>}
                  <ArrowRight className="h-4 w-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Last 7 days */}
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold">{t('last7')}</h2>
          <Card className="p-4">
            <div className="flex h-40 items-end gap-2">
              {week.map((w) => {
                const h = (w.sale / weekMax) * 100;
                const isSel = w.date === date;
                return (
                  <button key={w.date} onClick={() => setDate(w.date)} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${dateLabel(w.date, lang, 'short')}: ${rupee(w.sale)}`}>
                    <span className="num hidden text-[10px] text-ink-3 group-hover:block">{w.sale ? Math.round(w.sale / 100000) + 'k' : ''}</span>
                    <span
                      className={cn('w-full max-w-[28px] rounded-t-md transition-all', isSel ? 'bg-brand' : w.exists ? 'bg-ink-3/50 group-hover:bg-ink-3' : 'bg-line')}
                      style={{ height: `${Math.max(w.exists ? 4 : 2, h)}%` }}
                    />
                    <span className={cn('text-[10px] font-semibold', isSel ? 'text-brand' : 'text-ink-3')}>
                      {new Date(w.date + 'T00:00:00').toLocaleDateString(lang === 'bn' ? 'bn-IN' : 'en-IN', { weekday: 'narrow' })}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
              <span className="text-ink-2">{t('total')}</span>
              <span className="num font-bold">{rupee(week.reduce((a, b) => a + b.sale, 0))}</span>
            </div>
          </Card>
          <Link to="/closing" className="btn-ghost w-full">
            <Banknote className="h-4 w-4" /> {t('navClosing')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Checklist({ calc, exists, locked }: { calc: ReturnType<typeof computeDay>; exists: boolean; locked: boolean }) {
  const { t } = useStore();
  const nozzles = calc.sheets.reduce((a, s) => a + s.rows.length, 0);
  const filled = calc.sheets.reduce((a, s) => a + s.filledNozzles, 0);
  const moneySheets = calc.sheets.filter((s) => s.collectedPaise > 0).length;
  const steps = [
    { to: '/sheet', label: t('todoReadings'), done: exists && calc.complete && !calc.hasError, error: calc.hasError, detail: `${filled}/${nozzles}` },
    { to: '/sheet', label: t('todoMoney'), done: calc.sheets.length > 0 && moneySheets === calc.sheets.length, detail: `${moneySheets}/${calc.sheets.length}` },
    { to: '/closing', label: t('todoCount'), done: calc.denominationsEntered, detail: calc.denominationsEntered ? (calc.cashDiffPaise === 0 ? '✓' : rupee(calc.cashDiffPaise, { sign: true })) : '' },
    { to: '/sheet', label: t('todoLock'), done: locked, detail: '' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="label mb-0">{t('todoTitle')}</div>
        <span className="num text-xs font-bold text-ink-3">
          {doneCount}/{steps.length}
        </span>
      </div>
      {doneCount === steps.length ? (
        <div className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-3 text-sm font-semibold text-ok">
          <CheckCircle2 className="h-5 w-5" /> {t('allDone')}
        </div>
      ) : (
        <ol className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={s.label}>
              <Link
                to={s.to}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition',
                  i === nextIdx ? 'border-brand bg-brand-soft/50 font-semibold' : 'border-transparent hover:bg-sunk',
                  s.done && 'text-ink-3'
                )}
              >
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                    s.done ? 'bg-ok text-white' : s.error ? 'bg-bad text-white' : i === nextIdx ? 'bg-brand text-brand-ink' : 'bg-sunk text-ink-3'
                  )}
                >
                  {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : s.error ? '!' : i + 1}
                </span>
                <span className={cn('flex-1', s.done && 'line-through decoration-ink-3/50')}>{s.label}</span>
                {s.detail && <span className="num text-xs text-ink-3">{s.detail}</span>}
                {i === nextIdx && <ArrowRight className="h-4 w-4 text-brand" />}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
