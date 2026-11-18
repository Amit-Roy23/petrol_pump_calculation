import { useState } from 'react';
import { KeyRound, Phone, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { hashPin } from '../lib/attendance';
import { staffList } from '../lib/compute';
import { BUSINESS_LIST, BUSINESS_META, staffBusinesses, validateStaff } from '../lib/staff';
import type { Business, Staff } from '../lib/types';
import { cn, uid } from '../lib/util';
import { Field, Modal } from './ui';

export const blankStaff = (business: Business = 'petrol'): Staff => ({ id: '', name: '', phone: '', active: true, businesses: [business] });

/** Save a staff record (new or edited), hashing a new PIN. Returns false if invalid. */
export function useSaveStaff() {
  const { data, update, toast, t } = useStore();
  return async (s: Staff, pin: string): Promise<boolean> => {
    const problem = validateStaff(staffList(data.settings), s, pin);
    if (problem) {
      toast(problem === 'alreadyExists' ? `${s.name.trim()} – ${t('alreadyExists')}` : t(problem), 'warn');
      return false;
    }
    const id = s.id || uid();
    const pinHash = pin ? await hashPin(id, pin) : s.pinHash;
    update((d) => {
      const list = staffList(d.settings).map((x) => ({ ...x }));
      const rec: Staff = { ...s, id, name: s.name.trim(), phone: s.phone.trim(), pinHash, businesses: staffBusinesses(s) };
      const i = list.findIndex((x) => x.id === id);
      if (i >= 0) list[i] = rec;
      else list.push(rec);
      d.settings.staff = list;
    });
    toast(t('saved'));
    return true;
  };
}

/** Add / edit one staff member: name, mobile, PIN, parts, active. */
export function StaffModal({ staff, onClose, onSaved, onDelete }: { staff: Staff; onClose: () => void; onSaved?: () => void; onDelete?: () => void }) {
  const { t } = useStore();
  const save = useSaveStaff();
  const [s, setS] = useState<Staff>({ ...staff, businesses: staff.id ? staffBusinesses(staff) : staff.businesses ?? ['petrol'] });
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const parts = s.businesses ?? [];
  const pinOk = pin === '' || /^\d{4,6}$/.test(pin);
  const toggle = (b: Business) => setS({ ...s, businesses: parts.includes(b) ? parts.filter((x) => x !== b) : [...parts, b] });

  return (
    <Modal
      open
      onClose={onClose}
      title={staff.id ? `${t('edit')} · ${staff.name}` : t('addStaff')}
      footer={
        <>
          {onDelete && (
            <button className="btn-quiet mr-auto text-bad" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> {t('delete')}
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={!s.name.trim() || !pinOk || !parts.length || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await save(s, pin);
              setBusy(false);
              if (ok) (onSaved ?? onClose)();
            }}
          >
            {t('save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('worker')}>
          <input className="input" autoFocus value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        </Field>

        <div>
          <span className="label">{t('worksIn')}</span>
          <div className="grid grid-cols-3 gap-2">
            {BUSINESS_LIST.map((b) => (
              <label
                key={b}
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition',
                  parts.includes(b) ? cn('border-transparent', BUSINESS_META[b].chip) : 'border-line text-ink-3 hover:border-ink-3'
                )}
              >
                <input type="checkbox" className="sr-only" checked={parts.includes(b)} onChange={() => toggle(b)} />
                <span className={cn('h-2.5 w-2.5 rounded-full', parts.includes(b) ? BUSINESS_META[b].dot : 'bg-line')} />
                {t(BUSINESS_META[b].key)}
              </label>
            ))}
          </div>
          {!parts.length && <p className="mt-1 text-xs font-semibold text-bad">{t('partsRequired')}</p>}
        </div>

        <div className="rounded-xl border border-line bg-sunk/50 p-3">
          <div className="mb-2 text-sm font-bold">{t('staffLoginTitle')}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('customerPhoneLabel')}>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input className="input num pl-9" inputMode="tel" placeholder="98765 43210" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} />
              </div>
            </Field>
            <Field label={t('pinLabel')}>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  className={cn('input num pl-9 tracking-[0.3em]', !pinOk && 'border-bad')}
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={6}
                  placeholder={s.pinHash ? '••••' : ''}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            </Field>
          </div>
          <p className="mt-2 text-xs text-ink-3">{s.pinHash ? t('pinIsSet') : t('pinHintNew')}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={s.active} onChange={(e) => setS({ ...s, active: e.target.checked })} />
          {t('active')} <span className="font-normal text-ink-3">– {t('activeHint')}</span>
        </label>
      </div>
    </Modal>
  );
}
