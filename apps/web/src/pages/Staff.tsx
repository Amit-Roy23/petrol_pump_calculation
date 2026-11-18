import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Download, KeyRound, Phone, UserPlus, UserRound, Users } from 'lucide-react';
import { hashPin } from '../lib/attendance';
import { StaffModal, blankStaff } from '../components/StaffEditor';
import { staffFor } from '../lib/staff';
import { useStore } from '../lib/store';
import { computeDay, shiftRecords, staffList, type ShiftRecord } from '../lib/compute';
import type { Staff as StaffT } from '../lib/types';
import { cn, dateLabel, downloadFile, litresFmt, rupee, todayISO, uid } from '../lib/util';
import { Card, DiffBadge, Empty, Field, Modal, SectionTitle } from '../components/ui';
import { Fingerprint } from 'lucide-react';

interface Row {
  key: string;
  name: string;
  staff?: StaffT;
  records: ShiftRecord[];
  byDay: Map<number, ShiftRecord[]>;
  litres: number;
  diff: number;
}

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}`, days, y, m };
}

export default function Staff() {
  const { data, date, update, t, toast } = useStore();
  const lang = data.settings.language;
  const [month, setMonth] = useState(date.slice(0, 7));
  const [editing, setEditing] = useState<StaffT | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const { from, to, days, y, m } = monthBounds(month);
  const tol = data.settings.tolerancePaise;
  const staff = staffList(data.settings);

  const records = useMemo(() => shiftRecords(data, from, to), [data, from, to]);

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    const ensure = (key: string, name: string, st?: StaffT) => {
      if (!map.has(key)) map.set(key, { key, name, staff: st, records: [], byDay: new Map(), litres: 0, diff: 0 });
      return map.get(key)!;
    };
    // Petrol staff always get a row; anyone else only if they worked a petrol shift.
    for (const st of staffFor(data, 'petrol')) ensure(st.id, st.name, st);
    for (const r of records) {
      const st = staff.find((x) => x.id === r.staffKey);
      const row = ensure(r.staffKey, st?.name ?? r.staffName, st);
      row.records.push(r);
      const d = Number(r.date.slice(8));
      row.byDay.set(d, [...(row.byDay.get(d) ?? []), r]);
      row.litres += r.litresCenti;
      row.diff += r.collectedPaise > 0 ? r.diffPaise : 0;
    }
    return [...map.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.name.localeCompare(b.name)));
  }, [records, staff]);

  // Who is on duty on the selected day (from the meter sheet).
  const today = data.days[date] ? computeDay(data, data.days[date]) : null;

  const dayNums = Array.from({ length: days }, (_, i) => i + 1);
  const weekday = (d: number) => new Date(y, m - 1, d).getDay();

  const exportCsv = () => {
    const header = ['Date', 'Machine', 'Shift', 'Start', 'End', 'Worker', 'Litres', 'Sale', 'Collected', 'Short/Excess'];
    const lines = records.map((r) => [
      r.date,
      r.machineName,
      r.label,
      r.start,
      r.end,
      r.staffName,
      (r.litresCenti / 100).toFixed(2),
      (r.salePaise / 100).toFixed(2),
      (r.collectedPaise / 100).toFixed(2),
      (r.diffPaise / 100).toFixed(2),
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`attendance_${month}.csv`, csv, 'text/csv');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('staffTitle')}</h1>
          <p className="text-sm text-ink-2">{t('staffHint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/team" className="btn-ghost">
            <Fingerprint className="h-4 w-4" /> {t('teamTitle')}
          </Link>
          <button className="btn-primary" onClick={() => setEditing(blankStaff('petrol'))}>
            <UserPlus className="h-4 w-4" /> {t('addWorker')}
          </button>
        </div>
      </div>

      {/* On duty for the selected day */}
      <Card className="p-4 sm:p-5">
        <SectionTitle icon={<UserRound className="h-5 w-5 text-brand" />} title={`${t('onDuty')} · ${dateLabel(date, lang)}`} />
        {today && today.sheets.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {today.sheets.map((s) => (
              <Link key={s.machine.id} to="/sheet" className="rounded-xl border border-line bg-sunk/50 p-3 transition hover:border-ink-3">
                <div className="mb-2 font-display text-lg font-extrabold">
                  {t('machine')} {s.machine.name}
                </div>
                <ol className="space-y-1.5">
                  {s.shifts.map((x) => (
                    <li key={x.shift.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold">{x.label}</span>
                        {x.shift.start && <span className="num ml-1 text-[11px] text-ink-3">{x.shift.start}–{x.shift.end}</span>}
                        <span className={cn('block truncate text-xs', x.staffName ? 'text-ink-2' : 'italic text-ink-3')}>{x.staffName || t('noWorker')}</span>
                      </span>
                      {x.collectedPaise > 0 && x.salePaise > 0 ? <DiffBadge paise={x.diffPaise} tolerance={tol} /> : <span className="text-xs text-ink-3">{t('pending')}</span>}
                    </li>
                  ))}
                </ol>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-3">{t('noData')}</p>
        )}
      </Card>

      {/* Monthly attendance */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 font-display font-bold">
            <CalendarDays className="h-5 w-5 text-brand" /> {t('attendance')}
          </div>
          <div className="flex items-center gap-2">
            <input type="month" className="input w-auto py-1.5 text-sm" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t('month')} />
            <button className="btn-ghost py-1.5" onClick={exportCsv} disabled={!records.length}>
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">{t('exportCsv')}</span>
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Users className="h-6 w-6" />} title={t('noShiftsMonth')}>
              {t('staffHint')}
            </Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="sticky left-0 z-10 min-w-[140px] bg-sunk px-4 py-2 text-left">{t('worker')}</th>
                  {dayNums.map((d) => (
                    <th key={d} className={cn('num w-7 px-0.5 py-2 text-center font-semibold', weekday(d) === 0 && 'text-bad', `${month}-${String(d).padStart(2, '0')}` === todayISO() && 'text-brand')}>
                      {d}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right">{t('daysPresent')}</th>
                  <th className="px-2 py-2 text-right">{t('shiftsWorked')}</th>
                  <th className="px-2 py-2 text-right">{t('litresSold')}</th>
                  <th className="px-4 py-2 text-right">{t('shortExcessTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.key || 'none'} className="group cursor-pointer hover:bg-sunk/60" onClick={() => setViewing(r)}>
                    <td className="sticky left-0 z-10 bg-surface px-4 py-2 group-hover:bg-sunk">
                      <div className={cn('font-semibold', !r.key && 'italic text-ink-3')}>{r.key ? r.name : t('unassigned')}</div>
                      {r.key.startsWith('name:') && <div className="text-[10px] text-warn">{t('notInList')}</div>}
                      {r.staff && !r.staff.active && <div className="text-[10px] text-ink-3">{t('inactive')}</div>}
                    </td>
                    {dayNums.map((d) => {
                      const list = r.byDay.get(d) ?? [];
                      const bad = list.some((x) => x.collectedPaise > 0 && Math.abs(x.diffPaise) > tol);
                      return (
                        <td key={d} className="px-0.5 py-2 text-center">
                          {list.length > 0 ? (
                            <span
                              title={list.map((x) => `${x.machineName} · ${x.label}${x.start ? ` ${x.start}–${x.end}` : ''}`).join('\n')}
                              className={cn('num inline-grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold', bad ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok')}
                            >
                              {list.length}
                            </span>
                          ) : (
                            <span className="inline-block h-1 w-1 rounded-full bg-line" />
                          )}
                        </td>
                      );
                    })}
                    <td className="num px-2 py-2 text-right font-semibold">{r.byDay.size}</td>
                    <td className="num px-2 py-2 text-right">{r.records.length}</td>
                    <td className="num px-2 py-2 text-right">{litresFmt(r.litres)}</td>
                    <td className="px-4 py-2 text-right">{r.records.length ? <DiffBadge paise={r.diff} tolerance={tol * Math.max(1, r.records.length)} /> : <span className="text-ink-3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={`${t('shiftHistory')} · ${viewing.key ? viewing.name : t('unassigned')}`}>
          {viewing.staff && (
            <button
              className="btn-ghost mb-3 py-2"
              onClick={() => {
                setEditing(viewing.staff!);
                setViewing(null);
              }}
            >
              {t('edit')}
            </button>
          )}
          {viewing.records.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">{t('noShiftsMonth')}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                  <tr>
                    <th className="px-5 py-2 text-left">{t('date')}</th>
                    <th className="px-2 py-2 text-left">{t('machine')}</th>
                    <th className="px-2 py-2 text-right">{t('litres')}</th>
                    <th className="px-5 py-2 text-right">{t('kpiDiff')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {viewing.records.map((r, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-5 py-2">{dateLabel(r.date, lang, 'short')}</td>
                      <td className="px-2 py-2">
                        {r.machineName} · {r.label}
                        {r.start && <span className="num block text-[11px] text-ink-3">{r.start}–{r.end}</span>}
                      </td>
                      <td className="num px-2 py-2 text-right">{litresFmt(r.litresCenti)}</td>
                      <td className="px-5 py-2 text-right">{r.collectedPaise > 0 ? <DiffBadge paise={r.diffPaise} tolerance={tol} /> : <span className="text-ink-3">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {editing && <StaffModal staff={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
