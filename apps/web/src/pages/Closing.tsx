import { useMemo } from 'react';
import { Banknote, Coins, Lock, Printer, Smartphone } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeDay, NOTE_VALUES, visibleMethods } from '../lib/compute';
import { cn, litresFmt, rupee } from '../lib/util';
import { Card, DateNav, DiffBadge, Lcd, ProductTag, SectionTitle } from '../components/ui';
import { LineItemsEditor } from '../components/EntryList';

export default function Closing() {
  const { data, date, getDay, updateDay, t } = useStore();
  const { day } = getDay(date);
  const calc = useMemo(() => computeDay(data, day), [data, day]);
  const locked = day.locked;
  const tol = data.settings.tolerancePaise;
  const denoms = day.closing.denominations;
  const lang = data.settings.language;
  const methods = visibleMethods(data.settings, Object.values(day.sheets));

  const setCount = (note: string, raw: string) =>
    updateDay(date, (d) => {
      const n = note === 'coins' ? Math.max(0, Number(raw) || 0) : Math.max(0, Math.floor(Number(raw) || 0));
      if (n) d.closing.denominations[note] = n;
      else delete d.closing.denominations[note];
    });

  const notesCount = NOTE_VALUES.reduce((a, n) => a + (denoms[n] ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('navClosing')}</h1>
          <p className="text-sm text-ink-2">{t('closingTitle')}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <DateNav />
          <button className="btn-ghost px-3" onClick={() => window.print()} aria-label={t('print')}>
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
          <Lock className="h-4 w-4" /> {t('dayLocked')}
        </div>
      )}

      {/* Headline result */}
      <Card className="grid gap-4 overflow-hidden p-4 sm:grid-cols-3 sm:p-5">
        <div>
          <div className="label">{t('expectedCash')}</div>
          <div className="num text-2xl font-bold">{rupee(calc.expectedCashPaise)}</div>
        </div>
        <div>
          <div className="label">{t('countedCash')}</div>
          <div className="num text-2xl font-bold">{calc.denominationsEntered ? rupee(calc.countedCashPaise) : <span className="text-ink-3">—</span>}</div>
        </div>
        <div className="flex flex-col items-start justify-center sm:items-end">
          <div className="label">{t('difference')}</div>
          {calc.denominationsEntered ? <DiffBadge paise={calc.cashDiffPaise} tolerance={0} size="lg" /> : <span className="text-sm text-ink-3">{t('notCounted')}</span>}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Denomination counter */}
        <Card className="p-4 sm:p-5">
          <SectionTitle icon={<Banknote className="h-5 w-5 text-brand" />} title={t('denominations')} right={<span className="text-xs text-ink-3">{notesCount} {t('notes')}</span>} />
          <div className="divide-y divide-line">
            {NOTE_VALUES.map((note) => {
              const count = denoms[note] ?? 0;
              return (
                <div key={note} className="grid grid-cols-[72px_24px_1fr_auto] items-center gap-2 py-2">
                  <span className={cn('num rounded-lg px-2 py-1.5 text-center text-sm font-bold', count ? 'bg-ok-soft text-ok' : 'bg-sunk text-ink-2')}>₹{note}</span>
                  <span className="text-center text-ink-3">×</span>
                  <input
                    className="input num py-2 text-right"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    disabled={locked}
                    value={count || ''}
                    placeholder="0"
                    onChange={(e) => setCount(note, e.target.value)}
                    aria-label={`₹${note} notes`}
                  />
                  <span className="num w-28 text-right text-sm font-semibold">{count ? rupee(Number(note) * count * 100) : <span className="text-ink-3">—</span>}</span>
                </div>
              );
            })}
            <div className="grid grid-cols-[72px_24px_1fr_auto] items-center gap-2 py-2">
              <span className="grid place-items-center rounded-lg bg-sunk py-1.5 text-ink-2">
                <Coins className="h-4 w-4" />
              </span>
              <span />
              <input
                className="input num py-2 text-right"
                type="number"
                inputMode="decimal"
                min={0}
                disabled={locked}
                value={denoms.coins || ''}
                placeholder={t('coins')}
                onChange={(e) => setCount('coins', e.target.value)}
                aria-label={t('coins')}
              />
              <span className="num w-28 text-right text-sm font-semibold">{denoms.coins ? rupee(Math.round(denoms.coins * 100)) : <span className="text-ink-3">—</span>}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="font-display font-bold">{t('total')}</span>
            <Lcd value={rupee(calc.countedCashPaise)} ghost={!calc.denominationsEntered} />
          </div>
        </Card>

        {/* Expected cash build-up */}
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <SectionTitle title={t('expectedCash')} />
            <div className="space-y-1.5 text-sm">
              {calc.sheets.map((s) => (
                <div key={s.machine.id} className="flex justify-between">
                  <span className="text-ink-2">
                    {t('cash')} · {t('machine')} {s.machine.name}
                  </span>
                  <span className="num">{rupee(s.cashPaise)}</span>
                </div>
              ))}
              {calc.receiptsCashPaise > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-2">{t('dueReceivedCash')}</span>
                  <span className="num">+{rupee(calc.receiptsCashPaise)}</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="label">{t('otherCash')}</div>
              <LineItemsEditor
                items={day.closing.otherCash}
                disabled={locked}
                placeholder={t('otherCash')}
                onChange={(next) => updateDay(date, (d) => (d.closing.otherCash = next))}
              />
            </div>
            <div className="mt-4">
              <div className="label">{t('paidFromDrawer')}</div>
              <LineItemsEditor
                items={day.closing.expenses}
                disabled={locked}
                placeholder={t('expensePlaceholder')}
                onChange={(next) => updateDay(date, (d) => (d.closing.expenses = next))}
              />
            </div>
            {calc.shiftExpensesPaise > 0 && (
              <div className="mt-3 rounded-xl bg-sunk/70 px-3 py-2.5 text-xs text-ink-2">
                <div className="flex justify-between font-semibold">
                  <span>{t('paidByWorkers')}</span>
                  <span className="num">{rupee(calc.shiftExpensesPaise)}</span>
                </div>
                <div className="mt-0.5 text-ink-3">{t('workerExpenseNote')}</div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-dashed border-line pt-3 font-bold">
              <span>{t('expectedCash')}</span>
              <span className="num text-lg">{rupee(calc.expectedCashPaise)}</span>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle icon={<Smartphone className="h-5 w-5 text-cng" />} title={t('nonCashTitle')} />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-2">{t('online')}</span>
                <span className="num">{rupee(calc.onlinePaise)}</span>
              </div>
              {calc.receiptsOnlinePaise > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-2">{t('dueReceivedOnline')}</span>
                  <span className="num">{rupee(calc.receiptsOnlinePaise)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink-2">{t('card')}</span>
                <span className="num">{rupee(calc.cardPaise)}</span>
              </div>
              {methods.map((m) => (
                <div key={m.id} className="flex justify-between">
                  <span className="text-ink-2">{lang === 'bn' && m.nameBn ? m.nameBn : m.name}</span>
                  <span className="num">{rupee(calc.extraPaise[m.id] ?? 0)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-dashed border-line pt-2 font-bold">
                <span>{t('total')}</span>
                <span className="num text-lg">{rupee(calc.totalOnlinePaise + calc.cardPaise + calc.extraTotalPaise)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Day summary */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3 font-display font-bold sm:px-5">{t('daySummary')}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
              <tr>
                <th className="px-4 py-2 text-left sm:px-5">{t('machine')}</th>
                {calc.products.map((p) => (
                  <th key={p.product.id} className="px-3 py-2 text-right">
                    <ProductTag product={p.product} />
                  </th>
                ))}
                <th className="px-3 py-2 text-right">{t('sale')}</th>
                <th className="px-3 py-2 text-right">{t('collected')}</th>
                <th className="px-4 py-2 text-right sm:px-5">{t('kpiDiff')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {calc.sheets.map((s) => (
                <tr key={s.machine.id}>
                  <td className="px-4 py-2.5 font-display font-bold sm:px-5">{s.machine.name}</td>
                  {calc.products.map((p) => {
                    const pl = s.products.find((x) => x.product.id === p.product.id);
                    return (
                      <td key={p.product.id} className="num px-3 py-2.5 text-right">
                        {pl ? `${litresFmt(pl.litresCenti)} L` : '—'}
                      </td>
                    );
                  })}
                  <td className="num px-3 py-2.5 text-right">{rupee(s.salePaise)}</td>
                  <td className="num px-3 py-2.5 text-right">{rupee(s.collectedPaise)}</td>
                  <td className="px-4 py-2.5 text-right sm:px-5">
                    <DiffBadge paise={s.diffPaise} tolerance={tol} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-line bg-sunk/60 font-bold">
              <tr>
                <td className="px-4 py-3 sm:px-5">{t('total')}</td>
                {calc.products.map((p) => (
                  <td key={p.product.id} className="num px-3 py-3 text-right">
                    {litresFmt(p.litresCenti)} L
                    <div className="text-xs font-normal text-ink-3">{rupee(p.amountPaise)}</div>
                  </td>
                ))}
                <td className="num px-3 py-3 text-right">{rupee(calc.salePaise)}</td>
                <td className="num px-3 py-3 text-right">{rupee(calc.collectedPaise)}</td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <DiffBadge paise={calc.diffPaise} tolerance={tol * Math.max(1, calc.sheets.length)} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
