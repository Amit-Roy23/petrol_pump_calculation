import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CreditCard, QrCode, Lock, Plus, Printer, Smartphone, Trash2, Unlock, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeDay, visibleMethods, type NozzleRow, type SheetCalc } from '../lib/compute';
import type { Entry, MachineSheet } from '../lib/types';
import { cn, litresFmt, parseAmountExpr, rupee, uid } from '../lib/util';
import { Card, DateNav, DiffBadge, Lcd, MoneyInput, ProductTag, toneClass, Empty } from '../components/ui';
import { QuickAmountList } from '../components/EntryList';

const METHOD_ACCENTS = ['bg-diesel', 'bg-petrol', 'bg-brand', 'bg-ink'];

export default function DaySheet() {
  const { data, date, getDay, updateDay, update, t, toast } = useStore();
  const { day } = getDay(date);
  const calc = useMemo(() => computeDay(data, day), [data, day]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = calc.sheets.find((s) => s.machine.id === activeId) ?? calc.sheets[0];
  const locked = day.locked;

  const setLocked = (v: boolean) => {
    // updateDay ignores locked days, so lock/unlock goes through the raw updater.
    update((d) => {
      if (!d.days[date]) d.days[date] = structuredClone(day);
      d.days[date].locked = v;
    });
    toast(v ? t('lockDay') : t('unlockDay'));
  };

  if (!calc.sheets.length) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('navSheet')}</h1>
          <p className="text-sm text-ink-2">{t('sheetHint')}</p>
        </div>
        <div className="no-print flex items-center gap-2">
          <DateNav />
          <button className="btn-ghost px-3" onClick={() => window.print()} aria-label={t('print')}>
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
          <Lock className="h-4 w-4" /> {t('dayLocked')}
        </div>
      )}

      {/* Rates strip */}
      <Card className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <span className="label mb-0">{t('copyPrevRates')}</span>
        {data.settings.products.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <ProductTag product={p} />
            <MoneyInput
              className="w-28"
              disabled={locked}
              ariaLabel={`${p.name} ${t('rate')}`}
              value={day.rates[p.id] ?? p.ratePaise}
              onCommit={(v) =>
                updateDay(date, (dd, draft) => {
                  dd.rates[p.id] = v;
                  // A newer rate becomes the default for future days.
                  const latest = Object.keys(draft.days).sort().pop();
                  if (latest === date) {
                    const prod = draft.settings.products.find((x) => x.id === p.id);
                    if (prod) prod.ratePaise = v;
                  }
                })
              }
            />
            <span className="text-xs text-ink-3">/L</span>
          </div>
        ))}
      </Card>

      {/* Machine tabs */}
      <div className="no-print -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {calc.sheets.map((s) => {
          const isActive = s.machine.id === active.machine.id;
          return (
            <button
              key={s.machine.id}
              onClick={() => setActiveId(s.machine.id)}
              className={cn(
                'flex min-w-[170px] flex-1 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition sm:max-w-xs',
                isActive ? 'border-ink bg-ink text-bg shadow-lift' : 'border-line bg-surface hover:border-ink-3'
              )}
            >
              <div>
                <div className={cn('text-[11px] font-semibold uppercase tracking-wider', isActive ? 'opacity-70' : 'text-ink-3')}>{t('machine')}</div>
                <div className="font-display text-xl font-extrabold leading-tight">{s.machine.name}</div>
              </div>
              <div className="text-right">
                <div className="num text-sm font-bold">{rupee(s.salePaise)}</div>
                <div className={cn('text-[11px]', isActive ? 'opacity-70' : 'text-ink-3')}>
                  {s.hasError ? '⚠ ' + t('hasErrors') : `${s.filledNozzles}/${s.rows.length} ${t('nozzlesFilled')}`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <MachineSheetView key={active.machine.id} calc={active} locked={locked} />

      <div className="no-print flex justify-end">
        <Link to="/closing" className="btn-primary">
          {t('navClosing')} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Print shows every machine */}
      <div className="hidden print:block">
        {calc.sheets
          .filter((s) => s.machine.id !== active.machine.id)
          .map((s) => (
            <div key={s.machine.id} className="mt-6">
              <MachineSheetView calc={s} locked />
            </div>
          ))}
      </div>
    </div>
  );
}

function MachineSheetView({ calc, locked }: { calc: SheetCalc; locked: boolean }) {
  const { data, date, updateDay, t } = useStore();
  const { machine, sheet } = calc;
  const tol = data.settings.tolerancePaise;
  const methods = visibleMethods(data.settings, [sheet]);
  const methodName = (m: { name: string; nameBn: string }) => (data.settings.language === 'bn' && m.nameBn ? m.nameBn : m.name);

  const edit = (fn: (s: MachineSheet) => void) =>
    updateDay(date, (day) => {
      if (!day.sheets[machine.id]) {
        day.sheets[machine.id] = { ...structuredClone(calc.sheet) };
      }
      fn(day.sheets[machine.id]);
    });

  const setReading = (nozzleId: string, field: 'opening' | 'closing' | 'testing', value: string) =>
    edit((s) => {
      const cur = s.readings[nozzleId] ?? { opening: '', closing: '', testing: '' };
      s.readings[nozzleId] = { ...cur, [field]: value.replace(/[^\d.]/g, '') };
    });

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
      {/* Readings */}
      <Card className="paper overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 sm:px-5">
          <div className="font-display font-bold">
            {t('readingsTitle')} · <span className="text-brand">{machine.name}</span>
          </div>
          <input
            className="input w-40 py-1.5 text-sm sm:w-48"
            placeholder={t('attendant')}
            value={sheet.attendant}
            disabled={locked}
            onChange={(e) => edit((s) => (s.attendant = e.target.value))}
          />
        </div>

        <div className="hidden grid-cols-[96px_1fr_1fr_64px_104px] gap-3 border-b border-line bg-sunk px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3 md:grid">
          <span>{t('nozzle')}</span>
          <span>{t('opening')}</span>
          <span>{t('closing')}</span>
          <span>{t('testing')}</span>
          <span className="text-right">{t('litres')}</span>
        </div>

        <div className="divide-y divide-line bg-surface/80">
          {calc.rows.map((row) => (
            <NozzleRowView key={row.nozzle.id} row={row} locked={locked} onChange={setReading} />
          ))}
        </div>

        {/* Product subtotals – the "121.77 × 100.45 = 12,231.79" lines */}
        <div className="space-y-2 border-t border-line bg-sunk/70 px-4 py-4 sm:px-5">
          {calc.products.map((pl) => (
            <div key={pl.product.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border-l-4 bg-surface px-3 py-2.5', toneClass[pl.product.tone].bar)}>
              <div className="flex items-center gap-2">
                <ProductTag product={pl.product} />
              </div>
              <div className="num flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-bold">{litresFmt(pl.litresCenti)} L</span>
                <span className="text-ink-3">×</span>
                <span>{rupee(pl.ratePaise, { symbol: false })}</span>
                <span className="text-ink-3">=</span>
                <span className="text-base font-bold">{rupee(pl.amountPaise)}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="font-display text-sm font-bold uppercase tracking-wider text-ink-2">{t('machineTotal')}</span>
            <Lcd value={rupee(calc.salePaise)} size="md" ghost={calc.salePaise === 0} />
          </div>
        </div>
      </Card>

      {/* Collections */}
      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 font-display font-bold">{t('collectionsTitle')}</div>

          <div className="mb-5">
            <span className="label flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> {t('cash')}
            </span>
            <MoneyInput value={sheet.cashPaise} disabled={locked} onCommit={(v) => edit((s) => (s.cashPaise = v))} className="[&_input]:py-3 [&_input]:text-lg [&_input]:font-bold" ariaLabel={t('cash')} />
            <span className="mt-1 block text-[11px] text-ink-3">{t('cashHint')}</span>
          </div>

          <div className="space-y-3">
            <QuickAmountList
              title={t('online')}
              icon={<Smartphone className="h-4 w-4" />}
              accent="bg-cng"
              entries={sheet.online}
              disabled={locked}
              onChange={(next) => edit((s) => (s.online = next))}
            />
            <QuickAmountList
              title={t('card')}
              icon={<CreditCard className="h-4 w-4" />}
              accent="bg-premium"
              entries={sheet.card}
              disabled={locked}
              onChange={(next) => edit((s) => (s.card = next))}
            />
            {methods.map((m, i) => (
              <QuickAmountList
                key={m.id}
                title={methodName(m)}
                icon={<QrCode className="h-4 w-4" />}
                accent={METHOD_ACCENTS[i % METHOD_ACCENTS.length]}
                entries={sheet.extra?.[m.id] ?? []}
                disabled={locked}
                onChange={(next) => edit((s) => (s.extra = { ...(s.extra ?? {}), [m.id]: next }))}
              />
            ))}
            <DueEditor dues={sheet.dues} locked={locked} onChange={(next) => edit((s) => (s.dues = next))} />
          </div>
          <p className="mt-2 text-[11px] text-ink-3">{t('onlineHint')}</p>

          <input
            className="input mt-4 text-sm"
            placeholder={t('remark')}
            value={sheet.remark}
            disabled={locked}
            onChange={(e) => edit((s) => (s.remark = e.target.value))}
          />
        </Card>

        {/* Reconciliation */}
        <Card className="overflow-hidden">
          <div className="space-y-1.5 px-4 py-4 text-sm sm:px-5">
            {[
              [t('cash'), calc.cashPaise],
              [t('online'), calc.onlinePaise],
              [t('card'), calc.cardPaise],
              ...methods.map((m) => [methodName(m), calc.extraPaise[m.id] ?? 0]),
              [t('due'), calc.duePaise],
            ].map(([label, v]) => (
              <div key={label as string} className="flex justify-between">
                <span className="text-ink-2">{label}</span>
                <span className="num">{rupee(v as number)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-dashed border-line pt-2 font-bold">
              <span>{t('collected')}</span>
              <span className="num">{rupee(calc.collectedPaise)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{t('sale')}</span>
              <span className="num">{rupee(calc.salePaise)}</span>
            </div>
          </div>
          <div
            className={cn(
              'flex items-center justify-between gap-3 px-4 py-3 sm:px-5',
              calc.diffPaise === 0 ? 'bg-ok-soft' : Math.abs(calc.diffPaise) <= tol ? 'bg-warn-soft' : 'bg-bad-soft'
            )}
          >
            <span className="text-sm font-semibold">{calc.complete ? t('status') : t('incomplete')}</span>
            {calc.salePaise > 0 || calc.collectedPaise > 0 ? <DiffBadge paise={calc.diffPaise} tolerance={tol} size="lg" /> : <span className="text-sm text-ink-3">—</span>}
          </div>
        </Card>
        </div>
    </div>
  );
}

function NozzleRowView({ row, locked, onChange }: { row: NozzleRow; locked: boolean; onChange: (id: string, f: 'opening' | 'closing' | 'testing', v: string) => void }) {
  const { t } = useStore();
  const { nozzle, reading } = row;
  const err = row.error && { closingLess: t('errClosingLess'), invalid: t('errInvalid'), testingTooHigh: t('errTesting') }[row.error];
  return (
    <div className={cn('px-4 py-3 sm:px-5', row.status === 'error' && 'bg-bad-soft/50')}>
      <div className="grid grid-cols-[1fr_1fr_64px] items-end gap-x-2 gap-y-2 sm:gap-x-3 md:grid-cols-[96px_1fr_1fr_64px_104px] md:items-center">
        <div className="col-span-3 flex items-center justify-between md:col-span-1 md:block">
          <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-1">
            <span className="font-display text-base font-extrabold">{nozzle.label}</span>
            <ProductTag product={row.product} />
          </div>
          <Lcd className="md:hidden" size="sm" value={litresFmt(row.litresCenti)} unit="L" ghost={row.status !== 'ok'} />
        </div>
        <label className="block">
          <span className="label md:hidden">{t('opening')}</span>
          <input
            className={cn('input num px-2.5 py-2 text-[14px]', row.warning === 'carryMismatch' && 'border-warn')}
            inputMode="decimal"
            value={reading.opening}
            disabled={locked}
            placeholder="0.000"
            onChange={(e) => onChange(nozzle.id, 'opening', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label md:hidden">{t('closing')}</span>
          <input
            className={cn('input num px-2.5 py-2 text-[14px] font-semibold', row.status === 'error' && 'border-bad', row.status === 'ok' && 'border-ok/50')}
            inputMode="decimal"
            value={reading.closing}
            disabled={locked}
            placeholder={reading.opening || '0.000'}
            onChange={(e) => onChange(nozzle.id, 'closing', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label md:hidden">{t('testing')}</span>
          <input
            className="input num px-2 py-2 text-center text-[14px]"
            inputMode="decimal"
            value={reading.testing}
            disabled={locked}
            placeholder="0"
            onChange={(e) => onChange(nozzle.id, 'testing', e.target.value)}
          />
        </label>
        <div className="hidden justify-end md:flex">
          <Lcd size="sm" value={litresFmt(row.litresCenti)} unit="L" ghost={row.status !== 'ok'} className="w-full" />
        </div>
      </div>
      {(err || row.warning) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
          {err && (
            <span className="text-bad">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              {err}
            </span>
          )}
          {row.warning === 'bigJump' && <span className="text-warn">⚠ {t('warnBigJump')}</span>}
          {row.warning === 'carryMismatch' && (
            <span className="text-warn">
              ⚠ {t('warnCarry')} (<span className="num">{row.expectedOpening}</span>)
              {!locked && (
                <button className="ml-2 underline" onClick={() => onChange(nozzle.id, 'opening', row.expectedOpening!)}>
                  {t('useValue')}
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function DueEditor({ dues, locked, onChange }: { dues: Entry[]; locked: boolean; onChange: (next: Entry[]) => void }) {
  const { data, update, t, toast } = useStore();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const total = dues.reduce((a, b) => a + b.amountPaise, 0);
  const customers = data.customers;

  const add = () => {
    const paise = parseAmountExpr(amount);
    if (!name.trim() || !paise || paise <= 0) return;
    let customer = customers.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    let customerId = customer?.id;
    if (!customerId) {
      customerId = uid();
      const id = customerId;
      update((d) => {
        d.customers.push({ id, name: name.trim(), phone: '', vehicle: note.trim(), openingDuePaise: 0 });
      });
    }
    onChange([...dues, { id: uid(), amountPaise: paise, customerId, note: note.trim() }]);
    setName('');
    setAmount('');
    setNote('');
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
                    <button className="btn-quiet px-1.5 hover:text-bad" onClick={() => {
                        const before = dues;
                        onChange(dues.filter((x) => x.id !== d.id));
                        toast(`${t('removed')} ${rupee(d.amountPaise)}`, 'ok', { label: t('undo'), run: () => onChange(before) });
                      }} aria-label={t('delete')}>
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
          <input className="input py-2" list="due-customers" placeholder={t('dueCustomer')} value={name} onChange={(e) => setName(e.target.value)} />
          <datalist id="due-customers">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <input className="input num py-2 text-right" inputMode="decimal" placeholder="₹ 0" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input className="input py-2" placeholder={t('dueVehicle')} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-ghost px-3" onClick={add}>
            <Plus className="h-4 w-4" /> {t('add')}
          </button>
        </div>
      )}
    </div>
  );
}

