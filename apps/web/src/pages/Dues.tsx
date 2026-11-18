import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, HandCoins, Lock, MessageCircle, Pencil, Phone, Plus, RotateCcw, Search, Trash2, UserPlus } from 'lucide-react';
import { WA_GREEN, WhatsAppReminder, remindedAgo } from '../components/WhatsAppReminder';
import { useStore } from '../lib/store';
import { customerBalances, customerHasHistory, customerLedger, editSheetDue, liveCustomers, type LedgerLine } from '../lib/compute';
import type { Customer, DueReceipt } from '../lib/types';
import { cn, dateLabel, paiseToInput, parseAmountExpr, rupee, todayISO, uid } from '../lib/util';
import { Card, Empty, Field, Modal, Segmented, Stat } from '../components/ui';

const blankCustomer = (): Customer => ({ id: '', name: '', phone: '', vehicle: '', openingDuePaise: 0 });

/** What the entry form is creating or editing. */
type EntryTarget =
  | { kind: 'receipt' | 'credit'; customer: Customer; receipt?: DueReceipt }
  | { kind: 'sheet'; customer: Customer; line: LedgerLine };

export default function Dues() {
  const { data, update, t, toast } = useStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [entry, setEntry] = useState<EntryTarget | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [reminding, setReminding] = useState<string[] | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const balances = useMemo(() => customerBalances(data), [data]);
  const lang = data.settings.language;
  const customers = liveCustomers(data);
  const deleted = data.customers.filter((c) => c.deleted);
  const bal = (id: string) => balances.get(id)?.balancePaise ?? 0;

  // Customers who owe money, largest balance first.
  const owing = customers.filter((c) => bal(c.id) > 0).sort((x, y) => bal(y.id) - bal(x.id));
  const needle = q.trim().toLowerCase();
  const list = customers.filter((c) => (c.name + c.phone + c.vehicle).toLowerCase().includes(needle)).sort((a, b) => bal(b.id) - bal(a.id));
  const outstanding = customers.reduce((a, c) => a + Math.max(0, bal(c.id)), 0);
  const today = todayISO();
  const receivedToday = data.receipts.filter((r) => r.date === today && r.mode !== 'credit').reduce((a, b) => a + b.amountPaise, 0);

  const saveCustomer = (c: Customer) => {
    const name = c.name.trim();
    const clash = data.customers.find((x) => x.id !== c.id && !x.deleted && x.name.trim().toLowerCase() === name.toLowerCase());
    if (clash) {
      toast(`${name} – ${t('alreadyExists')}`, 'warn');
      return;
    }
    update((d) => {
      if (!c.id) d.customers.push({ ...c, name, id: uid() });
      else d.customers = d.customers.map((x) => (x.id === c.id ? { ...x, ...c, name } : x));
    });
    toast(t('saved'));
    setEditing(null);
  };

  /** Customers with history are hidden (restorable); others are removed. */
  const deleteCustomer = (c: Customer) => {
    const b = bal(c.id);
    const history = customerHasHistory(data, c.id) || c.openingDuePaise > 0;
    const msg = (b !== 0 ? `${t('stillOwes')} ${rupee(b)}. ` : '') + (history ? t('deleteCustomerHistory') : t('deleteCustomerConfirm'));
    if (!confirm(msg)) return;
    const before = structuredClone(data.customers);
    update((d) => {
      d.customers = history ? d.customers.map((x) => (x.id === c.id ? { ...x, deleted: true } : x)) : d.customers.filter((x) => x.id !== c.id);
    });
    setEditing(null);
    setViewing(null);
    toast(`${t('customerDeleted')}: ${c.name}`, 'ok', {
      label: t('undo'),
      run: () =>
        update((d) => {
          d.customers = before;
        }),
    });
  };

  const restore = (c: Customer) => {
    update((d) => {
      d.customers = d.customers.map((x) => (x.id === c.id ? { ...x, deleted: false } : x));
    });
    toast(`${t('restored')}: ${c.name}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('navDues')}</h1>
          <p className="text-sm text-ink-2">{t('duesTitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {owing.length > 0 && (
            <button className={cn('btn', WA_GREEN)} onClick={() => setReminding(owing.map((c) => c.id))}>
              <MessageCircle className="h-4 w-4" /> {t('remindAll')} ({owing.length})
            </button>
          )}
          <button className="btn-primary" onClick={() => setEditing(blankCustomer())}>
            <UserPlus className="h-4 w-4" /> {t('addCustomer')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Stat label={t('totalOutstanding')} value={rupee(outstanding)} accent="bg-warn" sub={`${owing.length} / ${customers.length} ${t('duesTitle').toLowerCase()}`} />
        <Stat label={`${t('received')} · ${t('today')}`} value={rupee(receivedToday)} accent="bg-ok" />
      </div>

      {customers.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input className="input pl-9" placeholder={t('searchCustomers')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      {customers.length === 0 ? (
        <Empty icon={<HandCoins className="h-6 w-6" />} title={t('duesTitle')}>
          {t('noCustomers')}
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((c) => {
            const b = balances.get(c.id)!;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button className="min-w-0 text-left" onClick={() => setViewing(c)}>
                    <div className="truncate font-display text-lg font-bold">{c.name}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                      {c.phone && (
                        <span>
                          <Phone className="mr-1 inline h-3 w-3" />
                          {c.phone}
                        </span>
                      )}
                      {c.vehicle && <span>{c.vehicle}</span>}
                      {b.lastDate && <span>{dateLabel(b.lastDate, lang, 'short')}</span>}
                    </div>
                    {remindedAgo(c.lastReminderAt, lang) && <div className="mt-0.5 text-[11px] font-semibold text-ok">✓ {remindedAgo(c.lastReminderAt, lang)}</div>}
                    {!c.phone.trim() && b.balancePaise > 0 && <div className="mt-0.5 text-[11px] font-semibold text-warn">⚠ {t('noWaNumber')}</div>}
                  </button>
                  <div className="flex items-start gap-2">
                    <div className="text-right">
                      <div className="label mb-0">{t('balance')}</div>
                      <div className={cn('num text-xl font-bold', b.balancePaise > 0 ? 'text-warn' : b.balancePaise < 0 ? 'text-ok' : 'text-ink-3')}>{rupee(b.balancePaise)}</div>
                    </div>
                  </div>
                </div>
                <div className="num mt-2 text-xs text-ink-3">
                  {t('given')} {rupee(b.salesPaise + c.openingDuePaise)} · {t('received')} {rupee(b.receivedPaise)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                  <button className="btn-ghost whitespace-nowrap px-3 py-2" onClick={() => setEntry({ kind: 'receipt', customer: c })}>
                    <Plus className="h-4 w-4" /> {t('receivePayment')}
                  </button>
                  <button className="btn-ghost whitespace-nowrap px-3 py-2" onClick={() => setEntry({ kind: 'credit', customer: c })}>
                    <Plus className="h-4 w-4" /> {t('addDue')}
                  </button>
                  {b.balancePaise > 0 && (
                    <button className={cn('btn px-3 py-2', WA_GREEN)} onClick={() => setReminding([c.id])} aria-label={`${t('waReminder')} ${c.name}`} title={t('waReminder')}>
                      <MessageCircle className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('waShort')}</span>
                    </button>
                  )}
                  <span className="ml-auto flex gap-0.5">
                    <button className="btn-quiet px-2" onClick={() => setViewing(c)} aria-label={`${t('ledger')} ${c.name}`} title={t('ledger')}>
                      <BookOpen className="h-4 w-4" />
                    </button>
                    <button className="btn-quiet px-2" onClick={() => setEditing(c)} aria-label={`${t('edit')} ${c.name}`} title={t('edit')}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="btn-quiet px-2 hover:text-bad" onClick={() => deleteCustomer(c)} aria-label={`${t('delete')} ${c.name}`} title={t('delete')}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Deleted customers – kept for history, can be restored */}
      {deleted.length > 0 && (
        <Card className="overflow-hidden">
          <button className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ink-2 sm:px-5" onClick={() => setShowDeleted((v) => !v)} aria-expanded={showDeleted}>
            {t('deletedCustomers')} ({deleted.length})
            <ChevronDown className={cn('h-4 w-4 transition', showDeleted && 'rotate-180')} />
          </button>
          {showDeleted && (
            <div className="divide-y divide-line border-t border-line">
              {deleted.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="min-w-0 truncate">
                    <b>{c.name}</b> <span className="num text-ink-3">{rupee(bal(c.id))}</span>
                  </span>
                  <span className="flex gap-1">
                    <button className="btn-quiet px-2" onClick={() => setViewing(c)} aria-label={`${t('ledger')} ${c.name}`}>
                      <BookOpen className="h-4 w-4" />
                    </button>
                    <button className="btn-ghost px-3 py-1.5" onClick={() => restore(c)}>
                      <RotateCcw className="h-4 w-4" /> {t('restore')}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {editing && <CustomerModal customer={editing} onClose={() => setEditing(null)} onSave={saveCustomer} onDelete={editing.id ? () => deleteCustomer(editing) : undefined} />}

      {entry && <EntryModal target={entry} balance={bal(entry.customer.id)} onClose={() => setEntry(null)} />}

      {viewing && !entry && (
        <LedgerModal
          customer={data.customers.find((c) => c.id === viewing.id) ?? viewing}
          onClose={() => setViewing(null)}
          onEntry={(e) => setEntry(e)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}

      {reminding && <WhatsAppReminder customerIds={reminding} onClose={() => setReminding(null)} />}
    </div>
  );
}

function CustomerModal({ customer, onClose, onSave, onDelete }: { customer: Customer; onClose: () => void; onSave: (c: Customer) => void; onDelete?: () => void }) {
  const { t } = useStore();
  const [c, setC] = useState(customer);
  const [opening, setOpening] = useState(paiseToInput(customer.openingDuePaise));
  return (
    <Modal
      open
      onClose={onClose}
      title={customer.id ? `${t('edit')} · ${customer.name}` : t('addCustomer')}
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
          <button className="btn-primary" disabled={!c.name.trim()} onClick={() => onSave({ ...c, openingDuePaise: Math.max(0, parseAmountExpr(opening) ?? 0) })}>
            {t('save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('dueCustomer')}>
          <input className="input" autoFocus value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('customerPhoneLabel')}>
            <input className="input" inputMode="tel" placeholder="98765 43210" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          </Field>
          <Field label={t('dueVehicle')}>
            <input className="input" value={c.vehicle} onChange={(e) => setC({ ...c, vehicle: e.target.value })} />
          </Field>
        </div>
        <Field label={t('openingDue')}>
          <input className="input num" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
        </Field>
      </div>
    </Modal>
  );
}

/** Add or edit a payment received, a due added by hand, or a due from a meter sheet. */
function EntryModal({ target, balance, onClose }: { target: EntryTarget; balance: number; onClose: () => void }) {
  const { data, update, t, toast, date } = useStore();
  const isSheet = target.kind === 'sheet';
  const existing = target.kind === 'sheet' ? undefined : target.receipt;
  const initialAmount = target.kind === 'sheet' ? target.line.amountPaise : existing?.amountPaise ?? (target.kind === 'receipt' && balance > 0 ? balance : 0);
  const [amount, setAmount] = useState(paiseToInput(initialAmount));
  const [mode, setMode] = useState<'cash' | 'online'>(existing && existing.mode !== 'credit' ? existing.mode : 'cash');
  const [when, setWhen] = useState(target.kind === 'sheet' ? target.line.date : existing?.date ?? date);
  const [note, setNote] = useState(target.kind === 'sheet' ? target.line.note : existing?.note ?? '');
  const paise = parseAmountExpr(amount);
  const isPayment = target.kind === 'receipt' || (existing && existing.mode !== 'credit');
  const title =
    target.kind === 'sheet'
      ? `${t('edit')} · ${t('dueFromSheet')}`
      : existing
        ? `${t('edit')} · ${isPayment ? t('received') : t('addDue')}`
        : isPayment
          ? t('receivePayment')
          : t('addDue');

  const save = () => {
    if (!paise || paise <= 0) return;
    if (target.kind === 'sheet') {
      const ref = target.line.ref;
      if (ref.type !== 'sheet') return;
      let ok = false;
      update((d) => {
        ok = editSheetDue(d, ref, { amountPaise: paise, note: note.trim() });
      });
      if (!ok && data.days[ref.date]?.locked) return toast(t('dayLocked'), 'warn');
    } else {
      const rec: DueReceipt = {
        id: existing?.id ?? uid(),
        customerId: target.customer.id,
        date: when,
        amountPaise: paise,
        mode: isPayment ? mode : 'credit',
        note: note.trim(),
      };
      update((d) => {
        d.receipts = existing ? d.receipts.map((r) => (r.id === rec.id ? rec : r)) : [...d.receipts, rec];
      });
    }
    toast(t('saved'));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${title} · ${target.customer.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" disabled={!paise || paise <= 0} onClick={save}>
            {t('save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm">
          {t('balance')}: <span className="num font-bold">{rupee(balance)}</span>
        </div>
        {isSheet && target.kind === 'sheet' && (
          <p className="rounded-xl bg-sunk px-3 py-2 text-xs text-ink-2">
            {t('dueFromSheetHint')} {dateLabel(target.line.date, data.settings.language)} · {t('machine')} {target.line.machine}
          </p>
        )}
        <Field label={t('amount')}>
          <input className="input num text-lg font-bold" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          {isPayment && (
            <div>
              <span className="label">{t('mode')}</span>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'cash', label: t('cash') },
                  { value: 'online', label: t('online') },
                ]}
              />
            </div>
          )}
          {!isSheet && (
            <Field label={t('date')} className="flex-1">
              <input type="date" className="input" value={when} onChange={(e) => e.target.value && setWhen(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label={t('note')}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isPayment ? '' : t('addDueNotePlaceholder')} />
        </Field>
      </div>
    </Modal>
  );
}

function LedgerModal({ customer, onClose, onEntry, onEdit }: { customer: Customer; onClose: () => void; onEntry: (e: EntryTarget) => void; onEdit: () => void }) {
  const { data, update, t, toast } = useStore();
  const lines = customerLedger(data, customer.id);
  const lang = data.settings.language;
  let running = customer.openingDuePaise;

  const remove = (l: LedgerLine) => {
    if (!confirm(t('deleteEntryConfirm'))) return;
    if (l.ref.type === 'receipt') {
      const id = l.ref.id;
      const before = data.receipts;
      update((d) => {
        d.receipts = d.receipts.filter((r) => r.id !== id);
      });
      toast(`${t('removed')} ${rupee(l.amountPaise)}`, 'ok', {
        label: t('undo'),
        run: () =>
          update((d) => {
            d.receipts = before;
          }),
      });
    } else {
      const ref = l.ref;
      if (ref.locked) return toast(t('dayLocked'), 'warn');
      update((d) => void editSheetDue(d, ref, null));
      toast(`${t('removed')} ${rupee(l.amountPaise)}`);
    }
  };

  const edit = (l: LedgerLine) => {
    if (l.ref.type === 'receipt') {
      const id = l.ref.id;
      onEntry({ kind: l.mode === 'credit' ? 'credit' : 'receipt', customer, receipt: data.receipts.find((r) => r.id === id) });
    } else {
      if (l.ref.locked) return toast(t('dayLocked'), 'warn');
      onEntry({ kind: 'sheet', customer, line: l });
    }
  };

  const describe = (l: LedgerLine) => {
    if (l.ref.type === 'sheet') return `${t('machine')} ${l.machine ?? ''}`;
    if (l.mode === 'credit') return t('addDue');
    return `${t('received')} · ${l.mode === 'online' ? t('online') : t('cash')}`;
  };

  return (
    <Modal open onClose={onClose} title={`${t('ledger')} · ${customer.name}`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="btn-ghost px-3 py-2" onClick={() => onEntry({ kind: 'receipt', customer })}>
          <Plus className="h-4 w-4" /> {t('receivePayment')}
        </button>
        <button className="btn-ghost px-3 py-2" onClick={() => onEntry({ kind: 'credit', customer })}>
          <Plus className="h-4 w-4" /> {t('addDue')}
        </button>
        <button className="btn-quiet ml-auto px-3 py-2" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> {t('edit')}
        </button>
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-5 py-2 text-left">{t('date')}</th>
              <th className="px-2 py-2 text-left">{t('note')}</th>
              <th className="px-2 py-2 text-right">{t('amount')}</th>
              <th className="px-2 py-2 text-right">{t('balance')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customer.openingDuePaise > 0 && (
              <tr>
                <td className="px-5 py-2 text-ink-3">—</td>
                <td className="px-2 py-2">{t('openingDue')}</td>
                <td className="num px-2 py-2 text-right">{rupee(customer.openingDuePaise)}</td>
                <td className="num px-2 py-2 text-right">{rupee(customer.openingDuePaise)}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn-quiet px-1.5" onClick={onEdit} aria-label={`${t('edit')} ${t('openingDue')}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            )}
            {lines.map((l, i) => {
              running += l.kind === 'sale' ? l.amountPaise : -l.amountPaise;
              const locked = l.ref.type === 'sheet' && l.ref.locked;
              return (
                <tr key={i}>
                  <td className="whitespace-nowrap px-5 py-2">{dateLabel(l.date, lang, 'short')}</td>
                  <td className="px-2 py-2 text-ink-2">
                    {describe(l)}
                    {l.note && <span className="text-ink-3"> · {l.note}</span>}
                  </td>
                  <td className={cn('num px-2 py-2 text-right', l.kind === 'receipt' ? 'text-ok' : 'text-warn')}>
                    {l.kind === 'receipt' ? '−' : '+'}
                    {rupee(l.amountPaise)}
                  </td>
                  <td className="num px-2 py-2 text-right font-semibold">{rupee(running)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {locked ? (
                      <Lock className="ml-auto h-3.5 w-3.5 text-ink-3" aria-label={t('dayLocked')} />
                    ) : (
                      <span className="inline-flex">
                        <button className="btn-quiet px-1.5" onClick={() => edit(l)} aria-label={`${t('edit')} ${rupee(l.amountPaise)}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button className="btn-quiet px-1.5 hover:text-bad" onClick={() => remove(l)} aria-label={`${t('delete')} ${rupee(l.amountPaise)}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lines.length === 0 && customer.openingDuePaise === 0 && <p className="px-5 py-6 text-center text-sm text-ink-3">—</p>}
      </div>
    </Modal>
  );
}
