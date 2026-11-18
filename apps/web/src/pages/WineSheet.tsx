import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, CreditCard, Lock, PackagePlus, Printer, Receipt, Search, Smartphone, Unlock, UserRound, Wallet, Wine } from 'lucide-react';
import { WineInvoiceModal, newInvoiceTarget, type InvoiceTarget } from '../components/WineInvoiceModal';
import { useStore } from '../lib/store';
import { computeWineDay, wineSettings, type WineDayCalc, type WineRowCalc } from '../lib/wine';
import type { WineDay, WineRow } from '../lib/types';
import { cn, rupee } from '../lib/util';
import { Card, DateNav, DiffBadge, Empty, Lcd, MoneyInput } from '../components/ui';
import { LineItemsEditor, QuickAmountList } from '../components/EntryList';

const intOf = (v: string) => Math.max(0, Math.floor(Number(v.replace(/\D/g, '')) || 0));

export default function WineSheet() {
  const { data, date, getWineDay, updateWineDay, update, t, toast } = useStore();
  const { day } = getWineDay(date);
  const calc = useMemo(() => computeWineDay(data, day), [data, day]);
  const st = wineSettings(data);
  const locked = day.locked;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [invoice, setInvoice] = useState<InvoiceTarget | null>(null);

  const edit = (fn: (d: WineDay) => void) => updateWineDay(date, (d) => fn(d));
  const setRow = (r: WineRowCalc, patch: Partial<WineRow>) =>
    updateWineDay(date, (d) => {
      d.rows[r.product.id] = { ...(d.rows[r.product.id] ?? r.row), ...patch };
    });

  const setLocked = (v: boolean) => {
    update((d) => {
      d.wineDays = d.wineDays ?? {};
      if (!d.wineDays[date]) d.wineDays[date] = structuredClone(day);
      d.wineDays[date].locked = v;
    });
    toast(v ? t('lockDay') : t('unlockDay'));
  };

  const categories = [...new Set(calc.rows.map((r) => r.product.category || 'Other'))];
  const needle = q.trim().toLowerCase();
  const visible = calc.rows.filter(
    (r) => (!cat || (r.product.category || 'Other') === cat) && (!needle || `${r.product.name} ${r.product.billName ?? ''} ${r.product.size} ${r.product.category}`.toLowerCase().includes(needle))
  );
  const groups = categories.map((c) => ({ c, rows: visible.filter((r) => (r.product.category || 'Other') === c) })).filter((g) => g.rows.length);

  if (!st.products.length) {
    return (
      <Empty icon={<Wine className="h-6 w-6" />} title={t('wineSheetTitle')}>
        {t('noBrands')}
        <div className="mt-4">
          <Link to="/wine/stock" className="btn-primary">
            {t('addBrand')}
          </Link>
        </div>
      </Empty>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Wine className="h-7 w-7 text-premium" /> {t('wineSheetTitle')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-2">{t('wineSheetHint')}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <DateNav />
          <button className="btn-ghost px-3" disabled={locked} onClick={() => setInvoice(newInvoiceTarget(date))} title={t('receiveStock')}>
            <PackagePlus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('receiveStockShort')}</span>
          </button>
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

      <DayEndStrip calc={calc} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
        {/* Stock register */}
        <Card className="overflow-hidden">
          <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input className="input py-2 pl-9 text-sm" placeholder={t('searchBrands')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <span className="num shrink-0 text-xs font-semibold text-ink-3">
              {calc.countedRows}/{calc.rows.length} {t('countedProgress')}
            </span>
            <div className="flex w-full gap-1.5 overflow-x-auto pb-0.5">
              {['', ...categories].map((c) => (
                <button
                  key={c || 'all'}
                  onClick={() => setCat(c)}
                  className={cn('chip shrink-0 border px-3 py-1.5', cat === c ? 'border-premium bg-premium text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3')}
                >
                  {c || t('allCategories')}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden grid-cols-[minmax(0,1fr)_52px_64px_60px_84px_48px_100px] gap-2 border-b border-line bg-sunk px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3 md:grid">
            <span>{t('brand')}</span>
            <span className="text-center">{t('opening')}</span>
            <span className="text-center">{t('receivedStock')}</span>
            <span className="text-center">{t('breakage')}</span>
            <span className="text-center">{t('closingCount')}</span>
            <span className="text-center">{t('sold')}</span>
            <span className="text-right">{t('amount')}</span>
          </div>

          {groups.map((g) => (
            <div key={g.c}>
              <div className="border-b border-line bg-premium-soft/40 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-premium sm:px-5">{g.c}</div>
              <div className="divide-y divide-line">
                {g.rows.map((r) => (
                  <BrandRow key={r.product.id} r={r} locked={locked} onChange={(p) => setRow(r, p)} />
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunk/70 px-4 py-3 sm:px-5">
            <span className="text-sm text-ink-2">
              {t('bottlesSoldLabel')}: <b className="num text-ink">{calc.bottlesSold}</b>
              {calc.bottlesBroken > 0 && (
                <span className="ml-3">
                  {t('breakage')}: <b className="num text-bad">{calc.bottlesBroken}</b>
                </span>
              )}
            </span>
            <Lcd value={rupee(calc.salePaise)} ghost={calc.salePaise === 0} />
          </div>
        </Card>

        <div className="xl:sticky xl:top-6">
          <MoneyCard calc={calc} locked={locked} edit={edit} />
        </div>
      </div>

      <SoldToday calc={calc} />

      {invoice && <WineInvoiceModal target={invoice} onClose={() => setInvoice(null)} />}

      <input className="input text-sm" placeholder={t('remark')} value={day.remark} disabled={locked} onChange={(e) => edit((d) => (d.remark = e.target.value))} />
    </div>
  );
}

function focusNext(el: HTMLInputElement) {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-wine-closing]:not(:disabled)')).filter((x) => x.offsetParent !== null);
  all[all.indexOf(el) + 1]?.focus();
}

function BrandRow({ r, locked, onChange }: { r: WineRowCalc; locked: boolean; onChange: (p: Partial<WineRow>) => void }) {
  const { t } = useStore();
  const small = (v: number, k: 'received' | 'breakage', label: string) => (
    <input
      className="input num px-2 py-2 text-center text-sm"
      inputMode="numeric"
      value={v || ''}
      placeholder="0"
      disabled={locked}
      aria-label={`${r.product.name} ${r.product.size} ${label}`}
      onChange={(e) => onChange({ [k]: intOf(e.target.value) })}
    />
  );
  return (
    <div className={cn('px-4 py-2.5 sm:px-5', r.error && 'bg-bad-soft/40')}>
      <div className="grid grid-cols-3 items-end gap-2 md:grid-cols-[minmax(0,1fr)_52px_64px_60px_84px_48px_100px] md:items-center">
        <div className="col-span-3 flex items-baseline justify-between gap-2 md:col-span-1 md:block">
          <div className="min-w-0">
            <span className="font-semibold" title={r.product.billName || undefined}>
              {r.product.name}
            </span>{' '}
            <span className="text-sm text-ink-2">{r.product.size}</span>
            {r.low && !r.error && <span className="chip ml-1.5 bg-warn-soft px-1.5 py-0 text-[10px] text-warn">{t('lowStockWarn')}</span>}
            {r.product.billName && r.product.billName !== r.product.name && <div className="truncate text-[11px] text-ink-3">{r.product.billName}</div>}
          </div>
          <div className="num shrink-0 text-xs text-ink-3">
            {rupee(r.row.mrpPaise)}
            <span className="md:hidden">
              {' '}· {t('opening')} <b className="text-ink-2">{r.opening}</b>
            </span>
          </div>
        </div>
        <div className="num hidden text-center text-ink-2 md:block">{r.opening}</div>
        <label className="block">
          <span className="label md:hidden">{t('receivedStock')}</span>
          {small(r.row.received, 'received', t('receivedStock'))}
          {r.invoiceQty > 0 && (
            <span className="num mt-0.5 block text-center text-[10px] font-bold text-premium" title={t('stockInvoices')}>
              +{r.invoiceQty} {t('fromInvoice')}
            </span>
          )}
        </label>
        <label className="block">
          <span className="label md:hidden">{t('breakage')}</span>
          {small(r.row.breakage, 'breakage', t('breakage'))}
        </label>
        <label className="block">
          <span className="label md:hidden">{t('closingCount')}</span>
          <input
            data-wine-closing
            className={cn('input num px-2 py-2 text-center font-bold', r.error && 'border-bad', r.counted && !r.error && 'border-ok/60 bg-ok-soft/30')}
            inputMode="numeric"
            enterKeyHint="next"
            value={r.row.closing}
            placeholder={String(r.available - r.billed)}
            disabled={locked}
            aria-label={`${r.product.name} ${r.product.size} ${t('closingCount')}`}
            onChange={(e) => onChange({ closing: e.target.value.replace(/\D/g, '') })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                focusNext(e.currentTarget);
              }
            }}
          />
        </label>
        <div className="col-span-3 flex items-center justify-between gap-2 md:contents">
          <span className={cn('num text-center font-bold md:block', r.sold ? 'text-ink' : 'text-ink-3')}>
            <span className="text-xs font-normal text-ink-3 md:hidden">{t('sold')}: </span>
            {r.counted || r.billed ? r.sold : '—'}
            {r.billed > 0 && (
              <span className="block text-[10px] font-semibold text-premium">
                {r.billed} {t('billedLabel')}
              </span>
            )}
          </span>
          <span className="num text-right font-bold">{rupee(r.amountPaise)}</span>
        </div>
      </div>
      {r.error && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-bad">
          <AlertTriangle className="h-3.5 w-3.5" /> {t('closingTooHigh')} ({r.available})
        </p>
      )}
      {!r.error && r.unbilled > 0 && r.billed > 0 && (
        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> {r.unbilled} {t('bottles')} {t('unbilledWarn')}
        </p>
      )}
    </div>
  );
}

function MoneyCard({ calc, locked, edit }: { calc: WineDayCalc; locked: boolean; edit: (fn: (d: WineDay) => void) => void }) {
  const { data, t } = useStore();
  const tol = data.settings.tolerancePaise;
  const day = calc.day;
  const minus = (label: string, v: number) => (
    <div className="flex justify-between">
      <span className="text-ink-2">{label}</span>
      <span className="num">−{rupee(v)}</span>
    </div>
  );
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 font-display font-bold sm:px-5">
        <Wallet className="h-5 w-5 text-premium" /> {t('wineMoneyTitle')}
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <QuickAmountList title={t('upiSlips')} icon={<Smartphone className="h-4 w-4" />} accent="bg-cng" entries={day.online} disabled={locked} onChange={(n) => edit((d) => (d.online = n))} />
        <QuickAmountList title={t('card')} icon={<CreditCard className="h-4 w-4" />} accent="bg-premium" entries={day.card} disabled={locked} onChange={(n) => edit((d) => (d.card = n))} />
        <div className="rounded-xl border border-line bg-sunk/60 p-3">
          <div className="mb-2 flex items-center justify-between text-sm font-bold">
            <span className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn text-white">
                <UserRound className="h-4 w-4" />
              </span>
              {t('dueGiven')}
            </span>
            <span className="num">{rupee(calc.duePaise)}</span>
          </div>
          <LineItemsEditor items={day.dues} disabled={locked} placeholder={t('dueCustomerAmount')} onChange={(n) => edit((d) => (d.dues = n))} />
        </div>
        <div className="rounded-xl border border-line bg-sunk/60 p-3">
          <div className="mb-2 flex items-center justify-between text-sm font-bold">
            <span className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-bad text-white">
                <Receipt className="h-4 w-4" />
              </span>
              {t('shopExpenses')}
            </span>
            <span className="num">{rupee(calc.expensesPaise)}</span>
          </div>
          <LineItemsEditor items={day.expenses} disabled={locked} placeholder={t('expensePlaceholder')} onChange={(n) => edit((d) => (d.expenses = n))} />
        </div>
      </div>

      <div className="space-y-1.5 border-t border-line px-4 py-4 text-sm sm:px-5">
        <div className="flex justify-between font-semibold">
          <span>{t('totalSale')}</span>
          <span className="num">{rupee(calc.salePaise)}</span>
        </div>
        {minus(t('upiSlips'), calc.onlinePaise)}
        {minus(t('card'), calc.cardPaise)}
        {minus(t('dueGiven'), calc.duePaise)}
        {minus(t('shopExpenses'), calc.expensesPaise)}
        <div className="flex items-center justify-between border-t border-dashed border-line pt-2">
          <span>
            <span className="font-bold">{t('cashShouldBe')}</span>
            <span className="block text-[11px] text-ink-3">{t('wineCashFormula')}</span>
          </span>
          <span className="num text-lg font-bold">{rupee(calc.expectedCashPaise)}</span>
        </div>
      </div>

      <div className="space-y-3 border-t border-line bg-sunk/60 px-4 py-4 sm:px-5">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          {t('cashCounted')}
          <MoneyInput className="w-44" value={day.cashCountedPaise} disabled={locked} onCommit={(v) => edit((d) => (d.cashCountedPaise = v))} inputClassName="py-2.5 text-base font-bold" ariaLabel={t('cashCounted')} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{t('kpiDiff')}</span>
          {day.cashCountedPaise > 0 ? <DiffBadge paise={calc.cashDiffPaise} tolerance={tol} size="lg" /> : <span className="text-xs text-ink-3">{t('notCounted')}</span>}
        </div>
      </div>

      {calc.hasCost && calc.salePaise > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:px-5">
          <span>
            <span className="font-semibold">{t('grossProfit')}</span>
            <span className="block text-[11px] text-ink-3">{t('grossProfitHint')}</span>
          </span>
          <span className="num font-bold text-ok">{rupee(calc.profitPaise)}</span>
        </div>
      )}
    </Card>
  );
}

/** Day-end view: how much sold, and how the money came in. */
function DayEndStrip({ calc }: { calc: WineDayCalc }) {
  const { t } = useStore();
  const share = (v: number) => (calc.salePaise > 0 ? Math.round((v / calc.salePaise) * 100) : 0);
  const tiles: { label: string; value: string; sub?: string; icon: React.ReactNode; tone: string }[] = [
    { label: t('cashSale'), value: rupee(calc.cashSalePaise), sub: `${share(calc.cashSalePaise)}%`, icon: <Banknote className="h-4 w-4" />, tone: 'bg-ok-soft text-ok' },
    { label: t('online'), value: rupee(calc.onlinePaise), sub: `${share(calc.onlinePaise)}%`, icon: <Smartphone className="h-4 w-4" />, tone: 'bg-cng-soft text-cng' },
    { label: t('card'), value: rupee(calc.cardPaise), sub: `${share(calc.cardPaise)}%`, icon: <CreditCard className="h-4 w-4" />, tone: 'bg-premium-soft text-premium' },
    { label: t('due'), value: rupee(calc.duePaise), sub: `${share(calc.duePaise)}%`, icon: <UserRound className="h-4 w-4" />, tone: 'bg-warn-soft text-warn' },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center">
        <div>
          <div className="label">{t('daySummaryWine')}</div>
          <Lcd value={rupee(calc.salePaise)} size="lg" ghost={calc.salePaise === 0} className="w-full justify-start sm:w-auto" />
          <div className="mt-2 text-sm text-ink-2">
            <b className="num text-ink">{calc.bottlesSold}</b> {t('bottles')} {t('sold').toLowerCase()}
            {calc.invoiceCount > 0 && (
              <span className="ml-3 text-premium">
                +{calc.invoiceBottles} {t('bottles')} · {calc.invoiceCount} {t('invoicesToday')}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((x) => (
            <div key={x.label} className="rounded-xl border border-line bg-sunk/50 p-3">
              <div className="flex items-center justify-between">
                <span className={cn('grid h-7 w-7 place-items-center rounded-lg', x.tone)}>{x.icon}</span>
                <span className="num text-[11px] text-ink-3">{x.sub}</span>
              </div>
              <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{x.label}</div>
              <div className="num text-base font-bold sm:text-lg">{x.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Brands sold today with bottles and amount, best sellers first. */
function SoldToday({ calc }: { calc: WineDayCalc }) {
  const { t } = useStore();
  const sold = calc.rows.filter((r) => r.sold > 0).sort((a, b) => b.amountPaise - a.amountPaise);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <span className="font-display font-bold">{t('soldToday')}</span>
        <span className="num text-sm text-ink-2">
          {calc.bottlesSold} {t('bottles')} · <b className="text-ink">{rupee(calc.salePaise)}</b>
        </span>
      </div>
      {sold.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-ink-3">{t('nothingSold')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-4 py-2 text-left sm:px-5">{t('brand')}</th>
                <th className="px-2 py-2 text-left">{t('category')}</th>
                <th className="px-2 py-2 text-right">{t('sold')}</th>
                <th className="px-2 py-2 text-right">{t('mrp')}</th>
                <th className="px-4 py-2 text-right sm:px-5">{t('amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sold.map((r) => (
                <tr key={r.product.id}>
                  <td className="px-4 py-2 sm:px-5">
                    <span className="font-semibold">{r.product.name}</span> <span className="text-ink-2">{r.product.size}</span>
                  </td>
                  <td className="px-2 py-2 text-ink-2">{r.product.category}</td>
                  <td className="num px-2 py-2 text-right font-bold">{r.sold}</td>
                  <td className="num px-2 py-2 text-right text-ink-2">{rupee(r.row.mrpPaise, { symbol: false })}</td>
                  <td className="num px-4 py-2 text-right font-semibold sm:px-5">{rupee(r.amountPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-line bg-sunk/60 font-bold">
              <tr>
                <td className="px-4 py-2.5 sm:px-5" colSpan={2}>
                  {t('total')}
                </td>
                <td className="num px-2 py-2.5 text-right">{calc.bottlesSold}</td>
                <td />
                <td className="num px-4 py-2.5 text-right sm:px-5">{rupee(calc.salePaise)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-sm sm:grid-cols-4 sm:px-5">
        {[
          [t('cashSale'), calc.cashSalePaise],
          [t('online'), calc.onlinePaise],
          [t('card'), calc.cardPaise],
          [t('due'), calc.duePaise],
        ].map(([l, v]) => (
          <div key={l as string} className="flex justify-between gap-2 sm:block">
            <span className="text-ink-2">{l as string}</span>{' '}
            <b className="num sm:block">{rupee(v as number)}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}
