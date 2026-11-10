import { useMemo, useState } from 'react';
import { AlertTriangle, Flame, Lock, Package, Plus, Printer, Receipt, RotateCcw, Trash2, Unlock, UserPlus, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeLpgDay, lpgSettings, type LpgDayCalc, type LpgRowCalc } from '../lib/lpg';
import type { LpgConnection, LpgCylinder, LpgDay, LpgItem, LpgPayMode, LpgQtyRow, LpgStockMove } from '../lib/types';
import { cn, parseAmountExpr, rupee, uid } from '../lib/util';
import { Card, DateNav, Lcd, MoneyInput, Segmented } from '../components/ui';
import { LineItemsEditor } from '../components/EntryList';

/** Letter badge matching the client's printed form: (A), (B), (C), (D). */
function Badge({ children, tone = 'bg-ink text-bg' }: { children: React.ReactNode; tone?: string }) {
  return <span className={cn('grid h-7 min-w-7 place-items-center rounded-lg px-1.5 font-display text-sm font-extrabold', tone)}>{children}</span>;
}

function SectionHead({ badge, title, total, hint, icon }: { badge?: string; title: string; total?: number; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {badge ? <Badge>{badge}</Badge> : icon}
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold leading-7">{title}</h2>
          {hint && <p className="text-xs text-ink-3">{hint}</p>}
        </div>
      </div>
      {total !== undefined && <span className="num shrink-0 text-lg font-bold leading-7">{rupee(total)}</span>}
    </div>
  );
}

export default function LpgSheet() {
  const { data, date, getLpgDay, updateLpgDay, update, t, toast } = useStore();
  const { day } = getLpgDay(date);
  const calc = useMemo(() => computeLpgDay(data, day), [data, day]);
  const st = lpgSettings(data);
  const lang = data.settings.language;
  const locked = day.locked;
  const nm = (x: { name: string; nameBn: string }) => (lang === 'bn' && x.nameBn ? x.nameBn : x.name);

  const edit = (fn: (d: LpgDay) => void) => updateLpgDay(date, (d) => fn(d));

  const setRow = (kind: 'refills' | 'items', id: string, base: LpgQtyRow, patch: Partial<LpgQtyRow>) =>
    updateLpgDay(date, (d, draft) => {
      d[kind][id] = { ...(d[kind][id] ?? base), ...patch };
      // A newer rate becomes the default for future days (like petrol).
      if (patch.ratePaise !== undefined) {
        const latest = Object.keys(draft.lpgDays ?? {}).sort().pop();
        if (latest === date) {
          draft.settings.lpg = draft.settings.lpg ?? structuredClone(st);
          if (kind === 'refills') {
            const c = draft.settings.lpg.cylinders.find((x) => x.id === id);
            if (c) c.refillRatePaise = patch.ratePaise;
          } else {
            const it = draft.settings.lpg.items.find((x) => x.id === id);
            if (it) it.ratePaise = patch.ratePaise;
          }
        }
      }
    });

  const setLocked = (v: boolean) => {
    update((d) => {
      d.lpgDays = d.lpgDays ?? {};
      if (!d.lpgDays[date]) d.lpgDays[date] = structuredClone(day);
      d.lpgDays[date].locked = v;
    });
    toast(v ? t('lockDay') : t('unlockDay'));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Flame className="h-7 w-7 text-brand" /> {t('lpgSheetTitle')}
          </h1>
          <p className="text-sm text-ink-2">{t('lpgSheetHint')}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <DateNav />
          <button className="btn-ghost px-3" onClick={() => window.print()} aria-label={t('print')}>
            <Printer className="h-4 w-4" />
          </button>
          <button className={cn('btn-ghost px-3', locked && 'border-warn text-warn')} onClick={() => setLocked(!locked)}>
            {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            <span className="hidden sm:inline">{locked ? t('unlockDay') : t('lockDay')}</span>
          </button>
        </div>
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
          <Lock className="h-4 w-4" /> {t('dayLocked')}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="space-y-5">
          {/* (A) Refilling */}
          <Card className="overflow-hidden">
            <SectionHead badge="A" title={t('refilling')} total={calc.A} />
            <QtyTable
              rows={calc.refills}
              name={(c: LpgCylinder) => nm(c)}
              withDue
              locked={locked}
              onChange={(r, patch) => setRow('refills', r.ref.id, r.row, patch)}
            />
          </Card>

          {/* (B) Product sale */}
          <Card className="overflow-hidden">
            <SectionHead badge="B" title={t('productSale')} total={calc.B} />
            <QtyTable rows={calc.items} name={(it: LpgItem) => nm(it)} locked={locked} onChange={(r, patch) => setRow('items', r.ref.id, r.row, patch)} />
          </Card>

          {/* (C) New connection / TV in */}
          <Card className="overflow-hidden">
            <SectionHead badge="C" title={t('newConnection')} total={calc.C} />
            <ConnectionEditor day={day} locked={locked} onChange={(next) => edit((d) => (d.connections = next))} />
          </Card>

          {/* TV return */}
          <Card className="overflow-hidden">
            <SectionHead icon={<RotateCcw className="mt-1 h-5 w-5 text-bad" />} title={t('tvReturn')} hint={t('tvReturnHint')} total={calc.R} />
            <RefundEditor day={day} locked={locked} onChange={(next) => edit((d) => (d.refunds = next))} />
          </Card>

          {/* (D) Cost */}
          <Card className="overflow-hidden">
            <SectionHead badge="D" title={t('cost')} total={calc.D} />
            <div className="p-4 sm:p-5">
              <LineItemsEditor items={day.costs} disabled={locked} placeholder={t('expensePlaceholder')} onChange={(next) => edit((d) => (d.costs = next))} />
            </div>
          </Card>
        </div>

        {/* Summary – the bottom of the printed form */}
        <div className="xl:sticky xl:top-6">
          <Summary calc={calc} locked={locked} onAccount={(k, v) => edit((d) => (d[k] = v))} />
        </div>
      </div>

      <StockCard calc={calc} locked={locked} onMove={(cylId, patch) => edit((d) => (d.stock[cylId] = { ...(d.stock[cylId] ?? { received: 0, emptySent: 0, defectiveFound: 0, defectiveSent: 0 }), ...patch }))} />

      <input className="input text-sm" placeholder={t('remark')} value={day.remark} disabled={locked} onChange={(e) => edit((d) => (d.remark = e.target.value))} />
    </div>
  );
}

/* ---------------- (A)/(B) quantity table ---------------- */

function QtyTable<T>({
  rows,
  name,
  withDue,
  locked,
  onChange,
}: {
  rows: LpgRowCalc<T>[];
  name: (ref: T) => string;
  withDue?: boolean;
  locked: boolean;
  onChange: (row: LpgRowCalc<T>, patch: Partial<LpgQtyRow>) => void;
}) {
  const { t } = useStore();
  const cols = withDue ? 'grid-cols-2 sm:grid-cols-[80px_1fr_1fr_1fr_1.35fr]' : 'grid-cols-2 sm:grid-cols-[80px_1fr_1fr_1.35fr]';
  return (
    <div className="divide-y divide-line">
      {rows.map((r, i) => (
        <div key={i} className={cn('px-4 py-3 sm:px-5', r.error && 'bg-bad-soft/40')}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-semibold">{name(r.ref)}</span>
            <span className="num text-sm text-ink-2">
              {r.row.qty || 0} × {rupee(r.row.ratePaise, { symbol: false })} = <b className="text-base text-ink">{rupee(r.amountPaise)}</b>
            </span>
          </div>
          <div className={cn('grid items-end gap-2', cols)}>
            <label className="block">
              <span className="label">{t('qty')}</span>
              <input
                className="input num px-2 py-2 text-center font-bold"
                inputMode="numeric"
                value={r.row.qty || ''}
                placeholder="0"
                disabled={locked}
                onChange={(e) => onChange(r, { qty: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0)) })}
                aria-label={`${name(r.ref)} ${t('qty')}`}
              />
            </label>
            <label className="block">
              <span className="label">{t('rate')}</span>
              <MoneyInput value={r.row.ratePaise} disabled={locked} onCommit={(v) => onChange(r, { ratePaise: v })} inputClassName="py-2 text-sm" ariaLabel={`${name(r.ref)} ${t('rate')}`} />
            </label>
            <label className="block">
              <span className="label">{t('phonepe')}</span>
              <MoneyInput value={r.row.onlinePaise} disabled={locked} onCommit={(v) => onChange(r, { onlinePaise: v })} inputClassName="py-2 text-sm" ariaLabel={`${name(r.ref)} ${t('phonepe')}`} />
            </label>
            {withDue && (
              <label className="block">
                <span className="label">{t('due')}</span>
                <MoneyInput value={r.row.duePaise} disabled={locked} onCommit={(v) => onChange(r, { duePaise: v })} inputClassName="py-2 text-sm" ariaLabel={`${name(r.ref)} ${t('due')}`} />
              </label>
            )}
            <div className="block">
              <span className="label">{t('cashAuto')}</span>
              <div className={cn('num whitespace-nowrap rounded-xl bg-ok-soft/60 px-2 py-2.5 text-right text-sm font-bold text-ok', r.error && 'bg-bad-soft text-bad')}>{rupee(r.cashPaise)}</div>
            </div>
          </div>
          {r.error && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-bad">
              <AlertTriangle className="h-3.5 w-3.5" /> {t('onlineDueTooHigh')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- (C) new connections ---------------- */

const MODE_TONE: Record<LpgPayMode, string> = { cash: 'bg-ok-soft text-ok', online: 'bg-cng-soft text-cng', due: 'bg-warn-soft text-warn' };

function ConnectionEditor({ day, locked, onChange }: { day: LpgDay; locked: boolean; onChange: (next: LpgConnection[]) => void }) {
  const { data, t, toast } = useStore();
  const st = lpgSettings(data);
  const lang = data.settings.language;
  const cylinders = st.cylinders.filter((c) => c.active);
  const [kind, setKind] = useState<'new' | 'tvin'>('new');
  const [cyl, setCyl] = useState(cylinders[0]?.id ?? '');
  const [amount, setAmount] = useState(String(st.newConnectionRatePaise / 100));
  const [mode, setMode] = useState<LpgPayMode>('cash');
  const [note, setNote] = useState('');
  const modeLabel = (m: LpgPayMode) => (m === 'cash' ? t('cash') : m === 'online' ? t('phonepe') : t('due'));
  const cylName = (id: string) => {
    const c = st.cylinders.find((x) => x.id === id);
    return c ? (lang === 'bn' && c.nameBn ? c.nameBn : c.name) : '—';
  };

  const byMode = (m: LpgPayMode) => day.connections.filter((x) => x.mode === m).reduce((a, x) => a + x.amountPaise, 0);
  const add = () => {
    const paise = parseAmountExpr(amount);
    if (paise === null || paise < 0) return;
    onChange([...day.connections, { id: uid(), kind, cylinderId: cyl, amountPaise: paise, mode, note: note.trim() }]);
    setNote('');
  };
  const remove = (x: LpgConnection) => {
    const before = day.connections;
    onChange(day.connections.filter((y) => y.id !== x.id));
    toast(`${t('removed')} ${rupee(x.amountPaise)}`, 'ok', { label: t('undo'), run: () => onChange(before) });
  };

  return (
    <div className="space-y-3 p-4 sm:p-5">
      {day.connections.length > 0 && (
        <div className="divide-y divide-line rounded-xl border border-line">
          {day.connections.map((x, i) => (
            <div key={x.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sunk text-[11px] font-bold">{i + 1}</span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {x.kind === 'new' ? t('kindNew') : t('kindTvIn')} · <span className="font-normal text-ink-2">{cylName(x.cylinderId)}</span>
                  </div>
                  {x.note && <div className="truncate text-xs text-ink-3">{x.note}</div>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('chip', MODE_TONE[x.mode])}>{modeLabel(x.mode)}</span>
                <span className="num font-bold">{rupee(x.amountPaise)}</span>
                {!locked && (
                  <button className="btn-quiet px-1.5 hover:text-bad" onClick={() => remove(x)} aria-label={t('delete')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {!locked && (
        <div className="space-y-2 rounded-xl border border-dashed border-line bg-sunk/40 p-3">
          <div className="flex flex-wrap gap-2">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'new', label: t('kindNew') },
                { value: 'tvin', label: t('kindTvIn') },
              ]}
            />
            <Segmented value={mode} onChange={setMode} options={(['cash', 'online', 'due'] as const).map((m) => ({ value: m, label: modeLabel(m) }))} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr_130px_1.2fr_auto]">
            <select className="input py-2" value={cyl} onChange={(e) => setCyl(e.target.value)} aria-label={t('cylinder')}>
              {cylinders.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'bn' && c.nameBn ? c.nameBn : c.name}
                </option>
              ))}
            </select>
            <input className="input num py-2 text-right" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={t('amount')} placeholder="₹" />
            <input className="input py-2" placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn-primary px-4 py-2" onClick={add}>
              <UserPlus className="h-4 w-4" /> {t('addConnection')}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span>
          {t('cash')}: <b className="num">{rupee(byMode('cash'))}</b>
        </span>
        <span>
          {t('phonepe')}: <b className="num">{rupee(byMode('online'))}</b>
        </span>
        <span>
          {t('due')}: <b className="num">{rupee(byMode('due'))}</b>
        </span>
      </div>
    </div>
  );
}

/* ---------------- TV return ---------------- */

function RefundEditor({ day, locked, onChange }: { day: LpgDay; locked: boolean; onChange: (next: LpgDay['refunds']) => void }) {
  const { data, t, toast } = useStore();
  const st = lpgSettings(data);
  const lang = data.settings.language;
  const cylinders = st.cylinders.filter((c) => c.active);
  const [cyl, setCyl] = useState(cylinders[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const add = () => {
    const paise = parseAmountExpr(amount);
    if (!paise || paise <= 0) return;
    onChange([...day.refunds, { id: uid(), cylinderId: cyl, amountPaise: paise, note: note.trim() }]);
    setAmount('');
    setNote('');
  };
  return (
    <div className="space-y-2 p-4 sm:p-5">
      {day.refunds.map((x) => (
        <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {(() => {
              const c = st.cylinders.find((y) => y.id === x.cylinderId);
              return c ? (lang === 'bn' && c.nameBn ? c.nameBn : c.name) : '—';
            })()}
            {x.note && <span className="text-ink-3"> · {x.note}</span>}
          </span>
          <span className="flex items-center gap-1">
            <span className="num font-bold text-bad">−{rupee(x.amountPaise)}</span>
            {!locked && (
              <button
                className="btn-quiet px-1.5 hover:text-bad"
                aria-label={t('delete')}
                onClick={() => {
                  const before = day.refunds;
                  onChange(day.refunds.filter((y) => y.id !== x.id));
                  toast(`${t('removed')} ${rupee(x.amountPaise)}`, 'ok', { label: t('undo'), run: () => onChange(before) });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
      ))}
      {!locked && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr_130px_1.2fr_auto]">
          <select className="input py-2" value={cyl} onChange={(e) => setCyl(e.target.value)} aria-label={t('cylinder')}>
            {cylinders.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === 'bn' && c.nameBn ? c.nameBn : c.name}
              </option>
            ))}
          </select>
          <input className="input num py-2 text-right" inputMode="decimal" placeholder="₹ 0" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label={t('amount')} />
          <input className="input py-2" placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-ghost px-3 py-2" onClick={add} disabled={!parseAmountExpr(amount)}>
            <Plus className="h-4 w-4" /> {t('addRefund')}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- summary (bottom of the printed form) ---------------- */

function Summary({ calc, locked, onAccount }: { calc: LpgDayCalc; locked: boolean; onAccount: (k: 'currentAccountPaise' | 'edfsAccountPaise', v: number) => void }) {
  const { t } = useStore();
  const line = (label: React.ReactNode, v: number, opts: { minus?: boolean; badge?: string; bold?: boolean } = {}) => (
    <div className={cn('flex items-center justify-between gap-3', opts.bold && 'font-bold')}>
      <span className="flex items-center gap-2 text-ink-2">
        {opts.badge && <Badge tone="bg-sunk text-ink-2">{opts.badge}</Badge>}
        {label}
      </span>
      <span className={cn('num', opts.minus && 'text-bad')}>
        {opts.minus ? '−' : ''}
        {rupee(v)}
      </span>
    </div>
  );
  return (
    <Card className="overflow-hidden">
      <SectionHead icon={<Receipt className="mt-1 h-5 w-5 text-brand" />} title={t('lpgSummary')} />
      <div className="space-y-2 px-4 py-4 text-sm sm:px-5">
        {line(t('refilling'), calc.A, { badge: 'A' })}
        {line(t('productSale'), calc.B, { badge: 'B' })}
        {line(t('newConnection'), calc.C, { badge: 'C' })}
        {line(t('tvReturn'), calc.R, { minus: true })}
        {line(t('cost'), calc.D, { minus: true, badge: 'D' })}
        <div className="border-t border-dashed border-line pt-2">
          {line(
            <span>
              <span className="font-bold text-ink">{t('finalAmount')}</span>
              <span className="block text-[11px] text-ink-3">{t('finalFormula')}</span>
            </span>,
            calc.finalPaise,
            { bold: true }
          )}
        </div>
      </div>
      <div className="space-y-2 border-t border-line px-4 py-4 text-sm sm:px-5">
        {line(<span>{t('totalOnline')} <span className="text-[11px] text-ink-3">(a+b+c)</span></span>, calc.onlinePaise)}
        {line(<span>{t('totalCash')} <span className="text-[11px] text-ink-3">(d+e+f)</span></span>, calc.cashPaise)}
        {line(t('totalDue'), calc.duePaise)}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-ok-soft/50 px-4 py-3 sm:px-5">
        <span>
          <span className="flex items-center gap-2 font-display font-bold">
            <Wallet className="h-4 w-4 text-ok" /> {t('cashInHand')}
          </span>
          <span className="block text-[11px] text-ink-3">{t('cashInHandHint')}</span>
        </span>
        <Lcd value={rupee(calc.cashInHandPaise)} ghost={calc.cashPaise === 0} />
      </div>
      <div className="space-y-3 border-t border-line px-4 py-4 sm:px-5">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">{t('currentAccount')}</span>
          <MoneyInput className="w-40" value={calc.day.currentAccountPaise} disabled={locked} onCommit={(v) => onAccount('currentAccountPaise', v)} inputClassName="py-2 text-sm" ariaLabel={t('currentAccount')} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-2">{t('edfsAccount')}</span>
          <MoneyInput className="w-40" value={calc.day.edfsAccountPaise} disabled={locked} onCommit={(v) => onAccount('edfsAccountPaise', v)} inputClassName="py-2 text-sm" ariaLabel={t('edfsAccount')} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-sunk/70 px-4 py-3 sm:px-5">
        <span>
          <span className="font-display font-bold">{t('finalBalance')}</span>
          <span className="block text-[11px] text-ink-3">{t('finalBalanceFormula')}</span>
        </span>
        <span className="num text-xl font-extrabold">{rupee(calc.finalBalancePaise)}</span>
      </div>
    </Card>
  );
}

/* ---------------- stock ---------------- */

function StockCard({ calc, locked, onMove }: { calc: LpgDayCalc; locked: boolean; onMove: (cylId: string, patch: Partial<LpgStockMove>) => void }) {
  const { data, t } = useStore();
  const lang = data.settings.language;
  const num = (v: number, k: keyof LpgStockMove, cylId: string, label: string) => (
    <input
      className="input num w-full px-2 py-1.5 text-center text-sm"
      inputMode="numeric"
      value={v || ''}
      placeholder="0"
      disabled={locked}
      aria-label={label}
      onChange={(e) => onMove(cylId, { [k]: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0)) })}
    />
  );
  const trio = (f: number, e: number, d: number, strong?: boolean) => (
    <span className={cn('num grid grid-cols-3 gap-1 text-center', strong && 'font-bold')}>
      <span className={cn(f < 0 && 'text-bad')}>{f}</span>
      <span className={cn('text-ink-2', e < 0 && 'text-bad')}>{e}</span>
      <span className={cn('text-ink-3', d < 0 && 'text-bad')}>{d}</span>
    </span>
  );
  return (
    <Card className="overflow-hidden">
      <SectionHead icon={<Package className="mt-1 h-5 w-5 text-brand" />} title={t('stockTitle')} hint={t('stockHint')} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-4 py-2 text-left sm:px-5">{t('cylinder')}</th>
              <th className="px-2 py-2">
                {t('openingStock')}
                <span className="mt-0.5 grid grid-cols-3 gap-1 text-[9px] normal-case tracking-normal">
                  <span>{t('full')}</span>
                  <span>{t('empty')}</span>
                  <span>{t('defective')}</span>
                </span>
              </th>
              <th className="px-2 py-2 text-center">{t('soldOut')}</th>
              <th className="w-24 px-2 py-2">{t('receivedFull')}</th>
              <th className="w-24 px-2 py-2">{t('emptySent')}</th>
              <th className="w-24 px-2 py-2">{t('defectiveFound')}</th>
              <th className="w-24 px-2 py-2">{t('defectiveSent')}</th>
              <th className="px-4 py-2 sm:px-5">
                {t('closingStock')}
                <span className="mt-0.5 grid grid-cols-3 gap-1 text-[9px] normal-case tracking-normal">
                  <span>{t('full')}</span>
                  <span>{t('empty')}</span>
                  <span>{t('defective')}</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {calc.stock.map((s) => {
              const bad = s.closeFull < 0 || s.closeEmpty < 0 || s.closeDefective < 0;
              const name = lang === 'bn' && s.cylinder.nameBn ? s.cylinder.nameBn : s.cylinder.name;
              return (
                <tr key={s.cylinder.id} className={cn(bad && 'bg-bad-soft/40')}>
                  <td className="px-4 py-2.5 font-semibold sm:px-5">
                    {name}
                    {bad && <div className="text-[11px] font-semibold text-bad">⚠ {t('negativeStock')}</div>}
                  </td>
                  <td className="px-2 py-2.5">{trio(s.openFull, s.openEmpty, s.openDefective)}</td>
                  <td className="num px-2 py-2.5 text-center text-xs text-ink-2">
                    {s.refilled + s.newConnections}
                    {s.returned > 0 && <span className="block text-[10px] text-ink-3">+{s.returned} TV</span>}
                  </td>
                  <td className="px-2 py-2">{num(s.move.received, 'received', s.cylinder.id, `${name} ${t('receivedFull')}`)}</td>
                  <td className="px-2 py-2">{num(s.move.emptySent, 'emptySent', s.cylinder.id, `${name} ${t('emptySent')}`)}</td>
                  <td className="px-2 py-2">{num(s.move.defectiveFound, 'defectiveFound', s.cylinder.id, `${name} ${t('defectiveFound')}`)}</td>
                  <td className="px-2 py-2">{num(s.move.defectiveSent, 'defectiveSent', s.cylinder.id, `${name} ${t('defectiveSent')}`)}</td>
                  <td className="px-4 py-2.5 sm:px-5">{trio(s.closeFull, s.closeEmpty, s.closeDefective, true)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
