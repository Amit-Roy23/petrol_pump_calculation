import { useState } from 'react';
import { KeyRound, Pencil, Phone, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { useStore } from '../lib/store';
import { staffList } from '../lib/compute';
import { BUSINESS_LIST, BUSINESS_META, staffBusinesses } from '../lib/staff';
import type { Business, Staff } from '../lib/types';
import { cn } from '../lib/util';
import { Card, Empty, Stat } from '../components/ui';
import { StaffModal, blankStaff } from '../components/StaffEditor';
import { PunchRegister } from '../components/PunchRegister';

/**
 * One admin panel for everyone who works at the petrol pump, LPG agency and
 * wine shop: who they are, which part they work in, their punch-in login,
 * and the punch in / out register.
 */
export default function Team() {
  const { data, update, t, toast, business } = useStore();
  const staff = staffList(data.settings);
  const [filter, setFilter] = useState<Business | ''>('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Staff | null>(null);

  const needle = q.trim().toLowerCase();
  const list = staff
    .filter((s) => (!filter || staffBusinesses(s).includes(filter)) && (!needle || `${s.name} ${s.phone}`.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const countIn = (b: Business) => staff.filter((s) => s.active && staffBusinesses(s).includes(b)).length;

  const remove = (s: Staff) => {
    if (!confirm(t('deleteStaffConfirm'))) return;
    const before = structuredClone(staff);
    update((d) => {
      d.settings.staff = staffList(d.settings).filter((x) => x.id !== s.id);
    });
    setEditing(null);
    toast(`${t('staffDeleted')}: ${s.name}`, 'ok', {
      label: t('undo'),
      run: () =>
        update((d) => {
          d.settings.staff = before;
        }),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Users className="h-7 w-7 text-brand" /> {t('teamTitle')}
          </h1>
          <p className="max-w-2xl text-sm text-ink-2">{t('teamHint')}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(blankStaff(business))}>
          <UserPlus className="h-4 w-4" /> {t('addStaff')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t('teamTitle')} value={String(staff.filter((s) => s.active).length)} sub={`${staff.filter((s) => s.active && s.pinHash).length} ${t('loginReady').toLowerCase()}`} />
        {BUSINESS_LIST.map((b) => (
          <Stat key={b} label={t(BUSINESS_META[b].key)} value={String(countIn(b))} accent={BUSINESS_META[b].dot} sub={t('staffSummary')} />
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex gap-1.5">
            {(['', ...BUSINESS_LIST] as const).map((b) => (
              <button
                key={b || 'all'}
                onClick={() => setFilter(b)}
                className={cn('chip border px-3 py-1.5', filter === b ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:border-ink-3')}
              >
                {b ? t(BUSINESS_META[b].key) : t('allParts')}
              </button>
            ))}
          </div>
          <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <input className="input py-2 pl-9 text-sm" placeholder={t('searchStaff')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {staff.length === 0 ? (
          <div className="p-5">
            <Empty icon={<Users className="h-6 w-6" />} title={t('addStaff')}>
              {t('noStaffYet')}
            </Empty>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {list.map((s) => (
              <div key={s.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5', !s.active && 'opacity-55')}>
                <div className="min-w-[160px] flex-1">
                  <div className="font-display text-base font-bold">{s.name}</div>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-ink-3">
                    {s.phone ? (
                      <span className="num">
                        <Phone className="mr-1 inline h-3 w-3" />
                        {s.phone}
                      </span>
                    ) : (
                      <span>—</span>
                    )}
                    {!s.active && <span className="font-semibold text-bad">{t('inactive')}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {staffBusinesses(s).map((b) => (
                    <span key={b} className={cn('chip px-2.5 py-1', BUSINESS_META[b].chip)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', BUSINESS_META[b].dot)} />
                      {t(BUSINESS_META[b].key)}
                    </span>
                  ))}
                </div>
                <span className={cn('chip px-2.5 py-1', s.pinHash && s.phone ? 'bg-ok-soft text-ok' : 'bg-sunk text-ink-3')}>
                  <KeyRound className="h-3.5 w-3.5" /> {s.pinHash && s.phone ? t('loginReady') : t('noLogin')}
                </span>
                <span className="flex gap-0.5">
                  <button className="btn-quiet px-2" onClick={() => setEditing(s)} aria-label={`${t('edit')} ${s.name}`} title={t('edit')}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="btn-quiet px-2 hover:text-bad" onClick={() => remove(s)} aria-label={`${t('delete')} ${s.name}`} title={t('delete')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
            ))}
            {list.length === 0 && <p className="px-5 py-6 text-center text-sm text-ink-3">—</p>}
          </div>
        )}
      </Card>

      <PunchRegister />

      {editing && <StaffModal staff={editing} onClose={() => setEditing(null)} onDelete={editing.id ? () => remove(editing) : undefined} />}
    </div>
  );
}
