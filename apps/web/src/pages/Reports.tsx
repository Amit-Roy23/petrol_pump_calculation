import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Printer } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeDay, paymentMethods } from '../lib/compute';
import { cn, dateLabel, downloadFile, litresFmt, rupee, shiftDate } from '../lib/util';
import { Card, DiffBadge, Empty, Field, ProductTag, Segmented, Stat } from '../components/ui';
import { productName } from '../components/ui';

type Preset = '7' | '30' | 'month' | 'all' | 'custom';

export default function Reports() {
  const { data, t, setDate, date } = useStore();
  const lang = data.settings.language;
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(shiftDate(date, -29));
  const [to, setTo] = useState(date);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const today = date;
    if (p === '7') {
      setFrom(shiftDate(today, -6));
      setTo(today);
    } else if (p === '30') {
      setFrom(shiftDate(today, -29));
      setTo(today);
    } else if (p === 'month') {
      setFrom(today.slice(0, 8) + '01');
      setTo(today);
    } else if (p === 'all') {
      const all = Object.keys(data.days).sort();
      setFrom(all[0] ?? today);
      setTo(all[all.length - 1] ?? today);
    }
  };

  const rows = useMemo(
    () =>
      Object.keys(data.days)
        .filter((d) => d >= from && d <= to)
        .sort()
        .map((d) => computeDay(data, data.days[d])),
    [data, from, to]
  );

  const methods = paymentMethods(data.settings).filter((m) => m.active || rows.some((r) => (r.extraPaise[m.id] ?? 0) > 0));

  const totals = useMemo(() => {
    const t = { sale: 0, collected: 0, cash: 0, online: 0, card: 0, due: 0, diff: 0, cashDiff: 0, extra: {} as Record<string, number>, expenses: 0, products: new Map<string, { litres: number; amount: number }>() };
    for (const r of rows) {
      t.sale += r.salePaise;
      t.collected += r.collectedPaise;
      t.cash += r.cashPaise;
      t.online += r.onlinePaise;
      t.card += r.cardPaise;
      t.due += r.duePaise;
      t.expenses += r.totalExpensesPaise;
      for (const [id, v] of Object.entries(r.extraPaise)) t.extra[id] = (t.extra[id] ?? 0) + v;
      t.diff += r.diffPaise;
      t.cashDiff += r.denominationsEntered ? r.cashDiffPaise : 0;
      for (const p of r.products) {
        const cur = t.products.get(p.product.id) ?? { litres: 0, amount: 0 };
        cur.litres += p.litresCenti;
        cur.amount += p.amountPaise;
        t.products.set(p.product.id, cur);
      }
    }
    return t;
  }, [rows]);

  const chartData = rows.map((r) => ({ date: r.day.date, label: dateLabel(r.day.date, lang, 'short'), sale: r.salePaise / 100 }));

  const exportCsv = () => {
    const prods = data.settings.products;
    const header = ['Date', ...prods.flatMap((p) => [`${p.name} L`, `${p.name} Rate`, `${p.name} Amount`]), 'Sale', 'Cash', 'Online', 'Card', ...methods.map((m) => m.name), 'Due', 'Collected', 'Short/Excess', 'Expenses', 'Sale After Expenses', 'Counted Cash', 'Cash Diff'];
    const lines = rows.map((r) => [
      r.day.date,
      ...prods.flatMap((p) => {
        const pl = r.products.find((x) => x.product.id === p.id);
        return [pl ? (pl.litresCenti / 100).toFixed(2) : '0.00', ((r.day.rates[p.id] ?? p.ratePaise) / 100).toFixed(2), pl ? (pl.amountPaise / 100).toFixed(2) : '0.00'];
      }),
      ...[r.salePaise, r.cashPaise, r.onlinePaise, r.cardPaise, ...methods.map((m) => r.extraPaise[m.id] ?? 0), r.duePaise, r.collectedPaise, r.diffPaise, r.totalExpensesPaise, r.netAfterExpensesPaise, r.countedCashPaise, r.denominationsEntered ? r.cashDiffPaise : 0].map((v) => (v / 100).toFixed(2)),
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`fuel-ledger_${from}_${to}.csv`, csv, 'text/csv');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('reportsTitle')}</h1>
          <p className="text-sm text-ink-2">
            {dateLabel(from, lang, 'short')} – {dateLabel(to, lang, 'short')} · {rows.length} {t('days')}
          </p>
        </div>
        <div className="no-print flex gap-2">
          <button className="btn-ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">{t('print')}</span>
          </button>
          <button className="btn-primary" onClick={exportCsv} disabled={!rows.length}>
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
          <input
            type="date"
            className="input py-2"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset('custom');
            }}
          />
        </Field>
        <Field label={t('to')}>
          <input
            type="date"
            className="input py-2"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset('custom');
            }}
          />
        </Field>
      </Card>

      {rows.length === 0 ? (
        <Empty icon={<Download className="h-6 w-6" />} title={t('noDays')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t('totalSale')} value={rupee(totals.sale)} sub={`${t('totalExpenses')} ${rupee(totals.expenses)} · ${t('netAfterExpenses')} ${rupee(totals.sale - totals.expenses)}`} />
            <Stat label={t('collected')} value={rupee(totals.collected)} accent="bg-cng" sub={`${t('online')} ${rupee(totals.online)}`} />
            <Stat label={t('kpiDiff')} value={rupee(totals.diff, { sign: true })} accent={totals.diff < 0 ? 'bg-bad' : 'bg-ok'} />
            <Stat label={t('due')} value={rupee(totals.due)} accent="bg-warn" sub={`${t('card')} ${rupee(totals.card)}`} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Card className="p-4 sm:p-5">
              <div className="mb-3 font-display font-bold">{t('dailySales')}</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                    <XAxis dataKey="label" tick={{ fill: 'rgb(var(--ink-3))', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis
                      tick={{ fill: 'rgb(var(--ink-3))', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      tickFormatter={(v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgb(var(--sunk))' }}
                      contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, color: 'rgb(var(--ink))', fontSize: 13 }}
                      labelStyle={{ color: 'rgb(var(--ink-2))', fontWeight: 600 }}
                      formatter={(v: number) => [rupee(Math.round(v * 100)), t('sale')]}
                    />
                    <Bar dataKey="sale" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} maxBarSize={36} onClick={(d: { date?: string }) => d.date && setDate(d.date)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="mb-3 font-display font-bold">{t('products')}</div>
              <div className="space-y-3">
                {data.settings.products.map((p) => {
                  const v = totals.products.get(p.id) ?? { litres: 0, amount: 0 };
                  const share = totals.sale ? (v.amount / totals.sale) * 100 : 0;
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between text-sm">
                        <ProductTag product={p} />
                        <span className="num font-bold">{litresFmt(v.litres)} L</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunk">
                        <div className={cn('h-full rounded-full', p.tone === 'petrol' ? 'bg-petrol' : p.tone === 'diesel' ? 'bg-diesel' : p.tone === 'premium' ? 'bg-premium' : 'bg-cng')} style={{ width: `${share}%` }} />
                      </div>
                      <div className="num mt-1 flex justify-between text-xs text-ink-3">
                        <span>{share.toFixed(1)}%</span>
                        <span>{rupee(v.amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                  <tr>
                    <th className="px-4 py-2.5 text-left">{t('date')}</th>
                    {data.settings.products.map((p) => (
                      <th key={p.id} className="px-3 py-2.5 text-right">
                        {productName(p, lang)} L
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right">{t('sale')}</th>
                    <th className="px-3 py-2.5 text-right">{t('cash')}</th>
                    <th className="px-3 py-2.5 text-right">{t('online')}</th>
                    {methods.map((m) => (
                      <th key={m.id} className="px-3 py-2.5 text-right">
                        {lang === 'bn' && m.nameBn ? m.nameBn : m.name}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right">{t('due')}</th>
                    <th className="px-3 py-2.5 text-right">{t('totalExpenses')}</th>
                    <th className="px-4 py-2.5 text-right">{t('kpiDiff')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.day.date} className="hover:bg-sunk/60">
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold">
                        {dateLabel(r.day.date, lang)}
                        {r.day.locked && <span className="ml-1 text-xs">🔒</span>}
                      </td>
                      {data.settings.products.map((p) => {
                        const pl = r.products.find((x) => x.product.id === p.id);
                        return (
                          <td key={p.id} className="num px-3 py-2.5 text-right">
                            {pl ? litresFmt(pl.litresCenti) : '—'}
                          </td>
                        );
                      })}
                      <td className="num px-3 py-2.5 text-right font-semibold">{rupee(r.salePaise)}</td>
                      <td className="num px-3 py-2.5 text-right">{rupee(r.cashPaise)}</td>
                      <td className="num px-3 py-2.5 text-right">{rupee(r.onlinePaise)}</td>
                      {methods.map((m) => (
                        <td key={m.id} className="num px-3 py-2.5 text-right">
                          {rupee(r.extraPaise[m.id] ?? 0)}
                        </td>
                      ))}
                      <td className="num px-3 py-2.5 text-right">{rupee(r.duePaise)}</td>
                      <td className="num px-3 py-2.5 text-right">{rupee(r.totalExpensesPaise)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <DiffBadge paise={r.diffPaise} tolerance={data.settings.tolerancePaise * Math.max(1, r.sheets.length)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line bg-sunk/60 font-bold">
                  <tr>
                    <td className="px-4 py-3">{t('total')}</td>
                    {data.settings.products.map((p) => (
                      <td key={p.id} className="num px-3 py-3 text-right">
                        {litresFmt(totals.products.get(p.id)?.litres ?? 0)}
                      </td>
                    ))}
                    <td className="num px-3 py-3 text-right">{rupee(totals.sale)}</td>
                    <td className="num px-3 py-3 text-right">{rupee(totals.cash)}</td>
                    <td className="num px-3 py-3 text-right">{rupee(totals.online)}</td>
                    {methods.map((m) => (
                      <td key={m.id} className="num px-3 py-3 text-right">
                        {rupee(totals.extra[m.id] ?? 0)}
                      </td>
                    ))}
                    <td className="num px-3 py-3 text-right">{rupee(totals.due)}</td>
                    <td className="num px-3 py-3 text-right">{rupee(totals.expenses)}</td>
                    <td className="num px-4 py-3 text-right">{rupee(totals.diff, { sign: true })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
