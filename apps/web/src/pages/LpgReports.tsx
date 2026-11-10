import { useMemo, useState } from 'react';
import { Download, Flame, Printer } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeLpgDay, lpgDays, lpgOpeningStock, lpgSettings } from '../lib/lpg';
import { dateLabel, downloadFile, rupee, shiftDate } from '../lib/util';
import { Card, Empty, Field, Segmented, Stat } from '../components/ui';

type Preset = '7' | '30' | 'month' | 'all' | 'custom';

export default function LpgReports() {
  const { data, t, date, setDate } = useStore();
  const lang = data.settings.language;
  const st = lpgSettings(data);
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(shiftDate(date, -29));
  const [to, setTo] = useState(date);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === '7') {
      setFrom(shiftDate(date, -6));
      setTo(date);
    } else if (p === '30') {
      setFrom(shiftDate(date, -29));
      setTo(date);
    } else if (p === 'month') {
      setFrom(date.slice(0, 8) + '01');
      setTo(date);
    } else if (p === 'all') {
      const all = Object.keys(lpgDays(data)).sort();
      setFrom(all[0] ?? date);
      setTo(all[all.length - 1] ?? date);
    }
  };

  const rows = useMemo(() => {
    const days = lpgDays(data);
    return Object.keys(days)
      .filter((d) => d >= from && d <= to)
      .sort()
      .map((d) => computeLpgDay(data, days[d]));
  }, [data, from, to]);

  const tot = useMemo(() => {
    const k = ['refillQty', 'A', 'B', 'C', 'R', 'D', 'finalPaise', 'onlinePaise', 'cashPaise', 'duePaise', 'cashInHandPaise', 'newConnectionCount'] as const;
    const out = Object.fromEntries(k.map((x) => [x, 0])) as Record<(typeof k)[number], number>;
    for (const r of rows) for (const x of k) out[x] += r[x];
    return out;
  }, [rows]);

  const closingStock = lpgOpeningStock(data, shiftDate(to, 1));
  const activeCyl = st.cylinders.filter((c) => c.active);

  const exportCsv = () => {
    const header = ['Date', 'Refill Qty', 'Refilling (A)', 'Product Sale (B)', 'New Connection (C)', 'TV Return', 'Cost (D)', 'Final Amount', 'Online', 'Cash', 'Due', 'Cash In Hand', 'Current A/C', 'EDFS A/C', 'Final Balance'];
    const lines = rows.map((r) => [
      r.day.date,
      r.refillQty,
      ...[r.A, r.B, r.C, r.R, r.D, r.finalPaise, r.onlinePaise, r.cashPaise, r.duePaise, r.cashInHandPaise, r.day.currentAccountPaise, r.day.edfsAccountPaise, r.finalBalancePaise].map((v) => (v / 100).toFixed(2)),
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`lpg_${from}_${to}.csv`, csv, 'text/csv');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Flame className="h-7 w-7 text-brand" /> {t('lpgReportsTitle')}
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
          <input type="date" className="input py-2" value={from} onChange={(e) => (setFrom(e.target.value), setPreset('custom'))} />
        </Field>
        <Field label={t('to')}>
          <input type="date" className="input py-2" value={to} onChange={(e) => (setTo(e.target.value), setPreset('custom'))} />
        </Field>
      </Card>

      {rows.length === 0 ? (
        <Empty icon={<Flame className="h-6 w-6" />} title={t('noDays')} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label={t('finalAmount')} value={rupee(tot.finalPaise)} sub={`${tot.refillQty} ${t('refilling').toLowerCase()} · ${tot.newConnectionCount} ${t('kindNew').toLowerCase()}`} />
            <Stat label={t('totalCash')} value={rupee(tot.cashPaise)} accent="bg-ok" sub={`${t('cashInHand')} ${rupee(tot.cashInHandPaise)}`} />
            <Stat label={t('totalOnline')} value={rupee(tot.onlinePaise)} accent="bg-cng" />
            <Stat label={t('totalDue')} value={rupee(tot.duePaise)} accent="bg-warn" sub={`${t('cost')} ${rupee(tot.D)}`} />
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                  <tr>
                    <th className="px-4 py-2.5 text-left">{t('date')}</th>
                    <th className="px-2 py-2.5 text-right">{t('qty')}</th>
                    <th className="px-2 py-2.5 text-right">A</th>
                    <th className="px-2 py-2.5 text-right">B</th>
                    <th className="px-2 py-2.5 text-right">C</th>
                    <th className="px-2 py-2.5 text-right">TV</th>
                    <th className="px-2 py-2.5 text-right">D</th>
                    <th className="px-2 py-2.5 text-right">{t('total')}</th>
                    <th className="px-2 py-2.5 text-right">{t('online')}</th>
                    <th className="px-2 py-2.5 text-right">{t('cash')}</th>
                    <th className="px-2 py-2.5 text-right">{t('due')}</th>
                    <th className="px-4 py-2.5 text-right">{t('cashInHand')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.day.date} className="cursor-pointer hover:bg-sunk/60" onClick={() => setDate(r.day.date)}>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold">
                        {dateLabel(r.day.date, lang)}
                        {r.day.locked && <span className="ml-1 text-xs">🔒</span>}
                      </td>
                      <td className="num px-2 py-2.5 text-right">{r.refillQty}</td>
                      {[r.A, r.B, r.C].map((v, i) => (
                        <td key={i} className="num px-2 py-2.5 text-right">
                          {rupee(v)}
                        </td>
                      ))}
                      <td className="num px-2 py-2.5 text-right text-bad">{r.R ? `−${rupee(r.R)}` : '—'}</td>
                      <td className="num px-2 py-2.5 text-right text-bad">{r.D ? `−${rupee(r.D)}` : '—'}</td>
                      <td className="num px-2 py-2.5 text-right font-semibold">{rupee(r.finalPaise)}</td>
                      <td className="num px-2 py-2.5 text-right">{rupee(r.onlinePaise)}</td>
                      <td className="num px-2 py-2.5 text-right">{rupee(r.cashPaise)}</td>
                      <td className="num px-2 py-2.5 text-right">{rupee(r.duePaise)}</td>
                      <td className="num px-4 py-2.5 text-right font-semibold">{rupee(r.cashInHandPaise)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line bg-sunk/60 font-bold">
                  <tr>
                    <td className="px-4 py-3">{t('total')}</td>
                    <td className="num px-2 py-3 text-right">{tot.refillQty}</td>
                    {[tot.A, tot.B, tot.C].map((v, i) => (
                      <td key={i} className="num px-2 py-3 text-right">
                        {rupee(v)}
                      </td>
                    ))}
                    <td className="num px-2 py-3 text-right">{rupee(tot.R)}</td>
                    <td className="num px-2 py-3 text-right">{rupee(tot.D)}</td>
                    <td className="num px-2 py-3 text-right">{rupee(tot.finalPaise)}</td>
                    <td className="num px-2 py-3 text-right">{rupee(tot.onlinePaise)}</td>
                    <td className="num px-2 py-3 text-right">{rupee(tot.cashPaise)}</td>
                    <td className="num px-2 py-3 text-right">{rupee(tot.duePaise)}</td>
                    <td className="num px-4 py-3 text-right">{rupee(tot.cashInHandPaise)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="mb-3 font-display font-bold">
              {t('stockTitle')} · {t('closingStock')} {dateLabel(to, lang, 'short')}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {activeCyl.map((c) => {
                const s = closingStock[c.id] ?? { full: 0, empty: 0, defective: 0 };
                return (
                  <div key={c.id} className="rounded-xl border border-line bg-sunk/50 p-3">
                    <div className="text-sm font-semibold">{lang === 'bn' && c.nameBn ? c.nameBn : c.name}</div>
                    <div className="num mt-2 grid grid-cols-3 gap-2 text-center">
                      {[
                        [t('full'), s.full, 'text-ok'],
                        [t('empty'), s.empty, 'text-ink-2'],
                        [t('defective'), s.defective, 'text-bad'],
                      ].map(([l, v, cls]) => (
                        <div key={l as string}>
                          <div className={`text-xl font-bold ${cls}`}>{v as number}</div>
                          <div className="text-[10px] uppercase tracking-wider text-ink-3">{l as string}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
