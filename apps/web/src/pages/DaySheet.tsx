import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Banknote, CreditCard, QrCode, Lock, Plus, Printer, Smartphone, Trash2, Unlock, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import {
  addShift,
  computeDay,
  ensureShifts,
  setShiftReading,
  shiftTemplates,
  staffList,
  visibleMethods,
  type NozzleRow,
  type SheetCalc,
} from '../lib/compute';
import type { AppData, Entry, MachineSheet, ShiftSheet } from '../lib/types';
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
                  {s.shifts.length > 1 && ` · ${s.shifts.length} ${t('shifts')}`}
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
  const { data, date, updateDay, t, toast } = useStore();
  const { machine } = calc;
  const settings = data.settings;
  const tol = settings.tolerancePaise;
  // Open on the first shift still being filled in, else the last one.
  const [shiftIdx, setShiftIdx] = useState(() => {
    const i = calc.shifts.findIndex((sc) => !sc.complete);
    return i >= 0 ? i : calc.shifts.length - 1;
  });
  const idx = Math.min(shiftIdx, calc.shifts.length - 1);
  const sc = calc.shifts[idx];
  const shift = sc.shift;
  const multi = calc.shifts.length > 1;
  const methods = visibleMethods(settings, [shift]);
  const methodName = (m: { name: string; nameBn: string }) => (settings.language === 'bn' && m.nameBn ? m.nameBn : m.name);

  /** Edit the machine's day record (created on first edit). */
  const editSheet = (fn: (sheet: MachineSheet, draft: AppData) => void) =>
    updateDay(date, (day, draft) => {
      if (!day.sheets[machine.id]) day.sheets[machine.id] = structuredClone(calc.sheet);
      const sheet = day.sheets[machine.id];
      ensureShifts(sheet);
      fn(sheet, draft);
    });
  /** Edit the selected shift. */
  const edit = (fn: (s: ShiftSheet, draft: AppData) => void) =>
    editSheet((sheet, draft) => {
      const sh = sheet.shifts![idx];
      if (sh) fn(sh, draft);
    });

  const setReading = (nozzleId: string, field: 'opening' | 'closing' | 'testing', value: string) =>
    editSheet((sheet) => setShiftReading(sheet, idx, nozzleId, field, value.replace(/[^\d.]/g, '')));

  const onAddShift = () => {
    const last = calc.shifts[calc.shifts.length - 1];
    if (last && last.filledNozzles < last.rows.length) toast(t('addShiftHint'), 'warn');
    editSheet((sheet, draft) => {
      addShift(draft.settings, sheet, machine);
    });
    setShiftIdx(calc.shifts.length);
  };

  const onRemoveShift = () => {
    if (!multi || !confirm(t('confirmRemoveShift'))) return;
    const before = structuredClone(calc.sheet.shifts ?? []);
    editSheet((sheet) => {
      sheet.shifts!.splice(idx, 1);
    });
    setShiftIdx(Math.max(0, idx - 1));
    toast(`${t('removed')} ${sc.label}`, 'ok', {
      label: t('undo'),
      run: () =>
        editSheet((sheet) => {
          sheet.shifts = before;
        }),
    });
  };

  /** Pick a worker by name; known names link to the staff list, new names are added to it. */
  const setWorker = (name: string) =>
    edit((sh, draft) => {
      const clean = name.trim();
      sh.attendant = clean;
      if (!clean) {
        sh.staffId = '';
        return;
      }
      draft.settings.staff = draft.settings.staff ?? [];
      let st = draft.settings.staff.find((x) => x.name.trim().toLowerCase() === clean.toLowerCase());
      if (!st) {
        st = { id: uid(), name: clean, phone: '', active: true };
        draft.settings.staff.push(st);
      }
      sh.staffId = st.id;
      sh.attendant = st.name;
    });

  const templates = shiftTemplates(settings);

  return (
    <div className="space-y-4">
      {/* Shift tabs */}
      <div className="no-print flex items-stretch gap-2 overflow-x-auto pb-1">
        {calc.shifts.map((x, i) => {
          const on = i === idx;
          return (
            <button
              key={x.shift.id}
              onClick={() => setShiftIdx(i)}
              className={cn(
                'flex min-w-[168px] shrink-0 flex-col gap-1 rounded-xl border px-3 py-2 text-left transition',
                on ? 'border-brand bg-brand-soft/60 ring-2 ring-brand/20' : 'border-line bg-surface hover:border-ink-3'
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <span className={cn('grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold', x.complete ? 'bg-ok text-white' : on ? 'bg-brand text-brand-ink' : 'bg-sunk text-ink-2')}>
                    {x.complete ? '✓' : i + 1}
                  </span>
                  {x.label}
                </span>
                {x.shift.start && (
                  <span className="num text-[10px] text-ink-3">
                    {x.shift.start}–{x.shift.end}
                  </span>
                )}
              </span>
              <span className="flex items-center justify-between gap-2 text-xs">
                <span className={cn('flex items-center gap-1 truncate', x.staffName ? 'text-ink-2' : 'italic text-ink-3')}>
                  <UserRound className="h-3 w-3 shrink-0" />
                  {x.staffName || t('noWorker')}
                </span>
                {x.collectedPaise > 0 && x.salePaise > 0 ? (
                  <span className={cn('num font-semibold', x.diffPaise === 0 ? 'text-ok' : Math.abs(x.diffPaise) <= tol ? 'text-warn' : 'text-bad')}>
                    {x.diffPaise === 0 ? '✓' : rupee(x.diffPaise, { sign: true })}
                  </span>
                ) : (
                  <span className="num text-ink-3">{rupee(x.salePaise)}</span>
                )}
              </span>
            </button>
          );
        })}
        {!locked && (
          <button onClick={onAddShift} className="flex min-w-[120px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-3/50 px-3 py-2 text-sm font-semibold text-ink-2 hover:border-brand hover:text-brand">
            <Plus className="h-4 w-4" /> {t('addShift')}
          </button>
        )}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Readings */}
        <Card className="paper overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 sm:px-5">
            <div className="font-display font-bold">
              {t('readingsTitle')} · <span className="text-brand">{machine.name}</span>
              {multi && <span className="text-ink-3"> · {sc.label}</span>}
            </div>
            <WorkerInput key={shift.id} value={sc.staffName} disabled={locked} onCommit={setWorker} />
          </div>

          {/* Shift details */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunk/60 px-4 py-2.5 text-sm sm:px-5">
            <span className="label mb-0">{t('shift')}</span>
            <select
              className="input w-auto py-1.5 text-sm"
              value={shift.templateId}
              disabled={locked}
              onChange={(e) =>
                edit((sh) => {
                  const tpl = templates.find((x) => x.id === e.target.value);
                  sh.templateId = tpl?.id ?? '';
                  sh.label = tpl?.name ?? sh.label;
                  if (tpl) {
                    sh.start = tpl.start;
                    sh.end = tpl.end;
                  }
                })
              }
              aria-label={t('shift')}
            >
              <option value="">{`${t('shift')} ${idx + 1}`}</option>
              {templates.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {settings.language === 'bn' && tp.nameBn ? tp.nameBn : tp.name}
                </option>
              ))}
            </select>
            <input type="time" className="input num w-auto py-1.5 text-sm" value={shift.start} disabled={locked} onChange={(e) => edit((sh) => (sh.start = e.target.value))} aria-label={t('shiftStart')} />
            <span className="text-ink-3">–</span>
            <input type="time" className="input num w-auto py-1.5 text-sm" value={shift.end} disabled={locked} onChange={(e) => edit((sh) => (sh.end = e.target.value))} aria-label={t('shiftEnd')} />
            {multi && !locked && (
              <button className="btn-quiet ml-auto px-2 text-xs hover:text-bad" onClick={onRemoveShift}>
                <Trash2 className="h-3.5 w-3.5" /> {t('removeShift')}
              </button>
            )}
          </div>

          <div className="hidden grid-cols-[96px_1fr_1fr_64px_104px] gap-3 border-b border-line bg-sunk px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3 md:grid">
            <span>{t('nozzle')}</span>
            <span>{t('opening')}</span>
            <span>{t('closing')}</span>
            <span>{t('testing')}</span>
            <span className="text-right">{t('litres')}</span>
          </div>

          <div className="divide-y divide-line bg-surface/80">
            {sc.rows.map((row) => (
              <NozzleRowView key={row.nozzle.id} row={row} locked={locked} onChange={setReading} />
            ))}
          </div>

          {/* Product subtotals – the "121.77 × 100.45 = 12,231.79" lines */}
          <div className="space-y-2 border-t border-line bg-sunk/70 px-4 py-4 sm:px-5">
            {sc.products.map((pl) => (
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
              <span className="font-display text-sm font-bold uppercase tracking-wider text-ink-2">{multi ? t('shiftTotal') : t('machineTotal')}</span>
              <Lcd value={rupee(sc.salePaise)} size="md" ghost={sc.salePaise === 0} />
            </div>
          </div>
        </Card>

        {/* Collections */}
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 font-display font-bold">
              {t('collectionsTitle')}
              {multi && <span className="text-ink-3"> · {sc.label}</span>}
            </div>

            <div className="mb-5">
              <span className="label flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5" /> {t('cash')}
              </span>
              <MoneyInput key={shift.id} value={shift.cashPaise} disabled={locked} onCommit={(v) => edit((s) => (s.cashPaise = v))} className="[&_input]:py-3 [&_input]:text-lg [&_input]:font-bold" ariaLabel={t('cash')} />
              <span className="mt-1 block text-[11px] text-ink-3">{t('cashHint')}</span>
            </div>

            <div className="space-y-3">
              <QuickAmountList
                key={`on-${shift.id}`}
                title={t('online')}
                icon={<Smartphone className="h-4 w-4" />}
                accent="bg-cng"
                entries={shift.online}
                disabled={locked}
                onChange={(next) => edit((s) => (s.online = next))}
              />
              <QuickAmountList
                key={`card-${shift.id}`}
                title={t('card')}
                icon={<CreditCard className="h-4 w-4" />}
                accent="bg-premium"
                entries={shift.card}
                disabled={locked}
                onChange={(next) => edit((s) => (s.card = next))}
              />
              {methods.map((m, i) => (
                <QuickAmountList
                  key={`${m.id}-${shift.id}`}
                  title={methodName(m)}
                  icon={<QrCode className="h-4 w-4" />}
                  accent={METHOD_ACCENTS[i % METHOD_ACCENTS.length]}
                  entries={shift.extra?.[m.id] ?? []}
                  disabled={locked}
                  onChange={(next) => edit((s) => (s.extra = { ...(s.extra ?? {}), [m.id]: next }))}
                />
              ))}
              <DueEditor key={`due-${shift.id}`} dues={shift.dues} locked={locked} onChange={(next) => edit((s) => (s.dues = next))} />
            </div>
            <p className="mt-2 text-[11px] text-ink-3">{t('onlineHint')}</p>

            <input
              className="input mt-4 text-sm"
              placeholder={t('remark')}
              value={shift.remark}
              disabled={locked}
              onChange={(e) => edit((s) => (s.remark = e.target.value))}
            />
          </Card>

          {/* Reconciliation for this shift */}
          <Card className="overflow-hidden">
            <div className="space-y-1.5 px-4 py-4 text-sm sm:px-5">
              {[
                [t('cash'), sc.cashPaise],
                [t('online'), sc.onlinePaise],
                [t('card'), sc.cardPaise],
                ...methods.map((m) => [methodName(m), sc.extraPaise[m.id] ?? 0]),
                [t('due'), sc.duePaise],
              ].map(([label, v]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-ink-2">{label}</span>
                  <span className="num">{rupee(v as number)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-dashed border-line pt-2 font-bold">
                <span>{t('collected')}</span>
                <span className="num">{rupee(sc.collectedPaise)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{t('sale')}</span>
                <span className="num">{rupee(sc.salePaise)}</span>
              </div>
            </div>
            <div
              className={cn(
                'flex items-center justify-between gap-3 px-4 py-3 sm:px-5',
                sc.diffPaise === 0 ? 'bg-ok-soft' : Math.abs(sc.diffPaise) <= tol ? 'bg-warn-soft' : 'bg-bad-soft'
              )}
            >
              <span className="text-sm font-semibold">
                {sc.complete ? t('status') : t('incomplete')}
                {sc.staffName && <span className="font-normal text-ink-2"> · {sc.staffName}</span>}
              </span>
              {sc.salePaise > 0 || sc.collectedPaise > 0 ? <DiffBadge paise={sc.diffPaise} tolerance={tol} size="lg" /> : <span className="text-sm text-ink-3">—</span>}
            </div>
          </Card>
        </div>
      </div>

      {multi && <ShiftsSummary calc={calc} activeIndex={idx} onPick={setShiftIdx} />}
    </div>
  );
}

/** Machine's whole day, one row per worker shift. */
function ShiftsSummary({ calc, activeIndex, onPick }: { calc: SheetCalc; activeIndex: number; onPick: (i: number) => void }) {
  const { data, t } = useStore();
  const tol = data.settings.tolerancePaise;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <span className="font-display font-bold">
          {t('allShifts')} · <span className="text-brand">{calc.machine.name}</span>
        </span>
        <span className="text-xs text-ink-3">
          {calc.shifts.length} {t('shifts')}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-4 py-2 text-left sm:px-5">{t('shift')}</th>
              <th className="px-3 py-2 text-left">{t('worker')}</th>
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
            {calc.shifts.map((x, i) => (
              <tr key={x.shift.id} onClick={() => onPick(i)} className={cn('cursor-pointer hover:bg-sunk/60', i === activeIndex && 'bg-brand-soft/40')}>
                <td className="px-4 py-2.5 sm:px-5">
                  <div className="font-semibold">{x.label}</div>
                  {x.shift.start && (
                    <div className="num text-[11px] text-ink-3">
                      {x.shift.start}–{x.shift.end}
                    </div>
                  )}
                </td>
                <td className={cn('px-3 py-2.5', !x.staffName && 'italic text-ink-3')}>{x.staffName || t('noWorker')}</td>
                {calc.products.map((p) => {
                  const pl = x.products.find((y) => y.product.id === p.product.id);
                  return (
                    <td key={p.product.id} className="num px-3 py-2.5 text-right">
                      {litresFmt(pl?.litresCenti ?? 0)} L
                    </td>
                  );
                })}
                <td className="num px-3 py-2.5 text-right">{rupee(x.salePaise)}</td>
                <td className="num px-3 py-2.5 text-right">{rupee(x.collectedPaise)}</td>
                <td className="px-4 py-2.5 text-right sm:px-5">
                  {x.salePaise || x.collectedPaise ? <DiffBadge paise={x.diffPaise} tolerance={tol} /> : <span className="text-ink-3">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-line bg-sunk/60 font-bold">
            <tr>
              <td className="px-4 py-3 sm:px-5" colSpan={2}>
                {t('machineTotal')}
              </td>
              {calc.products.map((p) => (
                <td key={p.product.id} className="num px-3 py-3 text-right">
                  {litresFmt(p.litresCenti)} L
                </td>
              ))}
              <td className="num px-3 py-3 text-right">{rupee(calc.salePaise)}</td>
              <td className="num px-3 py-3 text-right">{rupee(calc.collectedPaise)}</td>
              <td className="px-4 py-3 text-right sm:px-5">
                <DiffBadge paise={calc.diffPaise} tolerance={tol * calc.shifts.length} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/** Worker name with suggestions from the staff list; commits on blur / Enter. */
function WorkerInput({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (name: string) => void }) {
  const { data, t } = useStore();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const staff = staffList(data.settings).filter((x) => x.active);
  const commit = () => {
    if (text.trim() !== value.trim()) onCommit(text);
  };
  return (
    <label className="relative flex items-center">
      <UserRound className="pointer-events-none absolute left-3 h-4 w-4 text-ink-3" />
      <input
        className="input w-44 py-1.5 pl-9 text-sm font-semibold sm:w-52"
        list="staff-names"
        placeholder={t('selectWorker')}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={t('worker')}
      />
      <datalist id="staff-names">
        {staff.map((x) => (
          <option key={x.id} value={x.name} />
        ))}
      </datalist>
    </label>
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

