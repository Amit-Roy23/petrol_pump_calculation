import { useMemo, useState } from 'react';
import { Download, Printer, Wine } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeWineDay, wineDays } from '../lib/wine';
import { dateLabel, downloadFile, rupee, shiftDate } from '../lib/util';
import { Card, DiffBadge, Empty, Field, Segmented, Stat } from '../components/ui';

type Preset = '7' | '30' | 'month' | 'all' | 'custom';

const csvOf = (rows: (string | number)[][]) => rows.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

export default function WineReports() {
  const { data, t, date, setDate } = useStore();
  const lang = data.settings.language;
  const tol = data.settings.tolerancePaise;
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(shiftDate(date, -29));
  const [to, setTo] = useState(date);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === '7') (setFrom(shiftDate(date, -6)), setTo(date));
    else if (p === '30') (setFrom(shiftDate(date, -29)), setTo(date));
    else if (p === 'month') (setFrom(date.slice(0, 8) + '01'), setTo(date));
    else if (p === 'all') {
      const all = Object.keys(wineDays(data)).sort();
      setFrom(all[0] ?? date);
      setTo(all[all.length - 1] ?? date);
    }
  };

  const rows = useMemo(() => {
    const days = wineDays(data);
    return Object.keys(days)
      .filter((d) => d >= from && d <= to)
      .sort()
      .map((d) => computeWineDay(data, days[d]));
  }, [data, from, to]);

  const tot = useMemo(() => {
    const k = ['bottlesSold', 'salePaise', 'cashSalePaise', 'onlinePaise', 'cardPaise', 'duePaise', 'expensesPaise', 'expectedCashPaise', 'profitPaise'] as const;
    const out = Object.fromEntries(k.map((x) => [x, 0])) as Record<(typeof k)[number], number>;
    for (const r of rows) for (const x of k) out[x] += r[x];
    return out;
  }, [rows]);

  // Brand-wise totals for the range, best sellers first.
  const brands = useMemo(() => {
    const map = new Map<string, { name: string; billName: string; size: string; category: string; sold: number; amount: number }>();
    for (const r of rows)
      for (const b of r.rows) {
        if (!b.sold) continue;
        const cur = map.get(b.product.id) ?? { name: b.product.name, billName: b.product.billName ?? '', size: b.product.size, category: b.product.category, sold: 0, amount: 0 };
        cur.sold += b.sold;
        cur.amount += b.amountPaise;
        map.set(b.product.id, cur);
      }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);
  const maxAmount = Math.max(1, ...brands.map((b) => b.amount));

  const exportDaily = () =>
    downloadFile(
      `wine_daily_${from}_${to}.csv`,
      csvOf([
        ['Date', 'Bottles Sold', 'Sale', 'Cash Sale', 'UPI', 'Card', 'Due', 'Expenses', 'Cash Should Be', 'Cash Counted', 'Short/Excess', 'Gross Profit'],
        ...rows.map((r) => [
          r.day.date,
          r.bottlesSold,
          ...[r.salePaise, r.cashSalePaise, r.onlinePaise, r.cardPaise, r.duePaise, r.expensesPaise, r.expectedCashPaise, r.cashCountedPaise, r.cashCountedPaise ? r.cashDiffPaise : 0, r.profitPaise].map((v) => (v / 100).toFixed(2)),
        ]),
      ]),
      'text/csv'
    );
  const exportBrands = () =>
    downloadFile(
      `wine_brands_${from}_${to}.csv`,
      csvOf([['Brand', 'Bill Name', 'Size', 'Category', 'Bottles Sold', 'Amount'], ...brands.map((b) => [b.name, b.billName, b.size, b.category, b.sold, (b.amount / 100).toFixed(2)])]),
      'text/csv'
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Wine className="h-7 w-7 text-premium" /> {t('wineReportsTitle')}
          </h1>
          <p className="text-sm text-ink-2">
            {dateLabel(from, lang, 'short')} – {dateLabel(to, lang, 'short')} · {rows.length} {t('days')}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <button className="btn-ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">{t('print')}</span>
          </button>
          <button className="btn-primary" onClick={exportDaily} disabled={!rows.length}>
            <Download className="h-4 w-4" /> {t('exportCsv')}
          </button>
        </div>
      </div>

      <Card className="no-print flex flex-wrap items-end gap-3 p-4">
        <Segmented
          value={preset}
          onChange={applyPreset}
          options={[
            { value: '7', label: '7d' },
            { value: '30', label: '30d' },
            { value: 'month', label: lang === 'bn' ? 'এই মাস' : 'This month' },
            { value: 'all', label: lang === 'bn' ? 'সব' : 'All' },
          ]}
        />
        <Field label={t('from')}>
          <input type="date" className="input py-2" value={from} onChange={(e) => (setFrom(e.target.value), setPreset('custom'))} />
        </Field>
        <Field label={t('to')}>
          <input type="date" className="input py-2" value={to} onChange={(e) => (setTo(e.target.value), setPreset('custom'))} />
        </Field>
      </Card>

      {rows.length === 0 ? (
        <Empty icon={<Wine className="h-6 w-6" />} title={t('noDays')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t('totalSale')} value={rupee(tot.salePaise)} accent="bg-premium" sub={`${tot.bottlesSold} ${t('bottles')}`} />
            <Stat label={t('cashSale')} value={rupee(tot.cashSalePaise)} accent="bg-ok" sub={`${t('upiSlips')} ${rupee(tot.onlinePaise)} · ${t('card')} ${rupee(tot.cardPaise)}`} />
            <Stat label={t('dueGiven')} value={rupee(tot.duePaise)} accent="bg-warn" sub={`${t('shopExpenses')} ${rupee(tot.expensesPaise)}`} />
            <Stat label={t('grossProfit')} value={rupee(tot.profitPaise)} accent="bg-ok" />
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                  <tr>
                    <th className="px-4 py-2.5 text-left">{t('date')}</th>
                    <th className="px-2 py-2.5 text-right">{t('sold')}</th>
                    <th className="px-2 py-2.5 text-right">{t('sale')}</th>
                    <th className="px-2 py-2.5 text-right">{t('cashSale')}</th>
                    <th className="px-2 py-2.5 text-right">{t('upiSlips')}</th>
                    <th className="px-2 py-2.5 text-right">{t('card')}</th>
                    <th className="px-2 py-2.5 text-right">{t('due')}</th>
                    <th className="px-2 py-2.5 text-right">{t('expenses')}</th>
                    <th className="px-2 py-2.5 text-right">{t('cashShouldBe')}</th>
                    <th className="px-4 py-2.5 text-right">{t('kpiDiff')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.day.date} className="cursor-pointer hover:bg-sunk/60" onClick={() => setDate(r.day.date)}>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold">
                        {dateLabel(r.day.date, lang)}
                        {r.day.locked && <span className="ml-1 text-xs">🔒</span>}
                      </td>
                      <td className="num px-2 py-2.5 text-right">{r.bottlesSold}</td>
                      {[r.salePaise, r.cashSalePaise, r.onlinePaise, r.cardPaise, r.duePaise, r.expensesPaise, r.expectedCashPaise].map((v, i) => (
                        <td key={i} className="num px-2 py-2.5 text-right">
                          {rupee(v)}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right">{r.cashCountedPaise ? <DiffBadge paise={r.cashDiffPaise} tolerance={tol} /> : <span className="text-ink-3">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line bg-sunk/60 font-bold">
                  <tr>
                    <td className="px-4 py-3">{t('total')}</td>
                    <td className="num px-2 py-3 text-right">{tot.bottlesSold}</td>
                    {[tot.salePaise, tot.cashSalePaise, tot.onlinePaise, tot.cardPaise, tot.duePaise, tot.expensesPaise, tot.expectedCashPaise].map((v, i) => (
                      <td key={i} className="num px-2 py-3 text-right">
                        {rupee(v)}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <span className="font-display font-bold">{t('brandWiseSales')}</span>
              <button className="btn-ghost py-1.5 text-xs" onClick={exportBrands} disabled={!brands.length}>
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
            <div className="divide-y divide-line">
              {brands.map((b) => (
                <div key={b.name + b.size} className="px-4 py-2.5 sm:px-5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className="font-semibold">{b.name}</span> <span className="text-ink-2">{b.size}</span>
                      <span className="ml-2 text-xs text-ink-3">{b.category}</span>
                    </span>
                    <span className="num shrink-0">
                      <span className="text-ink-2">{b.sold} ×</span> <b>{rupee(b.amount)}</b>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunk">
                    <div className="h-full rounded-full bg-premium" style={{ width: `${(b.amount / maxAmount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
