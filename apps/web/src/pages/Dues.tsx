import { useMemo, useState } from 'react';
import { BookOpen, HandCoins, Phone, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import { customerBalances, customerLedger } from '../lib/compute';
import type { Customer } from '../lib/types';
import { cn, dateLabel, parseAmountExpr, rupee, todayISO, uid } from '../lib/util';
import { Card, Empty, Field, Modal, Segmented, Stat } from '../components/ui';

export default function Dues() {
  const { data, update, t, toast } = useStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Customer | null>(null);
  const [paying, setPaying] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const balances = useMemo(() => customerBalances(data), [data]);
  const lang = data.settings.language;

  const list = data.customers
    .filter((c) => (c.name + c.phone + c.vehicle).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (balances.get(b.id)?.balancePaise ?? 0) - (balances.get(a.id)?.balancePaise ?? 0));
  const outstanding = [...balances.values()].reduce((a, b) => a + Math.max(0, b.balancePaise), 0);
  const today = todayISO();
  const receivedToday = data.receipts.filter((r) => r.date === today).reduce((a, b) => a + b.amountPaise, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{t('navDues')}</h1>
          <p className="text-sm text-ink-2">{t('duesTitle')}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ id: '', name: '', phone: '', vehicle: '', openingDuePaise: 0 })}>
          <UserPlus className="h-4 w-4" /> {t('addCustomer')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Stat label={t('totalOutstanding')} value={rupee(outstanding)} accent="bg-warn" sub={`${data.customers.length} ${t('duesTitle').toLowerCase()}`} />
        <Stat label={`${t('received')} · ${t('today')}`} value={rupee(receivedToday)} accent="bg-ok" />
      </div>

      {data.customers.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input className="input pl-9" placeholder={t('searchCustomers')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}

      {data.customers.length === 0 ? (
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
                  <button className="min-w-0 text-left" onClick={() => setEditing(c)}>
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
                  </button>
                  <div className="text-right">
                    <div className="label mb-0">{t('balance')}</div>
                    <div className={cn('num text-xl font-bold', b.balancePaise > 0 ? 'text-warn' : b.balancePaise < 0 ? 'text-ok' : 'text-ink-3')}>{rupee(b.balancePaise)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <div className="num text-xs text-ink-3">
                    {t('given')} {rupee(b.salesPaise + c.openingDuePaise)} · {t('received')} {rupee(b.receivedPaise)}
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-quiet" onClick={() => setViewing(c)} aria-label={t('ledger')}>
                      <BookOpen className="h-4 w-4" />
                    </button>
                    <button className="btn-ghost whitespace-nowrap px-3 py-2" onClick={() => setPaying(c)}>
                      <Plus className="h-4 w-4" /> {t('receivePayment')}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <CustomerModal
          customer={editing}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            update((d) => {
              if (!c.id) d.customers.push({ ...c, id: uid() });
              else d.customers = d.customers.map((x) => (x.id === c.id ? c : x));
            });
            toast(t('saved'));
            setEditing(null);
          }}
          onDelete={
            editing.id && (balances.get(editing.id)?.salesPaise ?? 0) === 0 && !data.receipts.some((r) => r.customerId === editing.id)
              ? () => {
                  update((d) => {
                    d.customers = d.customers.filter((x) => x.id !== editing.id);
                  });
                  setEditing(null);
                }
              : undefined
          }
        />
      )}

      {paying && <ReceiptModal customer={paying} balance={balances.get(paying.id)?.balancePaise ?? 0} onClose={() => setPaying(null)} />}

      {viewing && <LedgerModal customer={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function CustomerModal({ customer, onClose, onSave, onDelete }: { customer: Customer; onClose: () => void; onSave: (c: Customer) => void; onDelete?: () => void }) {
  const { t } = useStore();
  const [c, setC] = useState(customer);
  const [opening, setOpening] = useState(customer.openingDuePaise ? String(customer.openingDuePaise / 100) : '');
  return (
    <Modal
      open
      onClose={onClose}
      title={customer.id ? customer.name : t('addCustomer')}
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
          <button className="btn-primary" disabled={!c.name.trim()} onClick={() => onSave({ ...c, name: c.name.trim(), openingDuePaise: Math.max(0, parseAmountExpr(opening) ?? 0) })}>
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
          <Field label={t('phone')}>
            <input className="input" inputMode="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
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

function ReceiptModal({ customer, balance, onClose }: { customer: Customer; balance: number; onClose: () => void }) {
  const { update, t, toast, date } = useStore();
  const [amount, setAmount] = useState(balance > 0 ? String(balance / 100) : '');
  const [mode, setMode] = useState<'cash' | 'online'>('cash');
  const [when, setWhen] = useState(date);
  const [note, setNote] = useState('');
  const paise = parseAmountExpr(amount);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('receivePayment')} · ${customer.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={!paise || paise <= 0}
            onClick={() => {
              update((d) => {
                d.receipts.push({ id: uid(), customerId: customer.id, date: when, amountPaise: paise!, mode, note: note.trim() });
              });
              toast(`${t('received')} ${rupee(paise!)}`);
              onClose();
            }}
          >
            {t('save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-warn-soft px-4 py-3 text-sm">
          {t('balance')}: <span className="num font-bold">{rupee(balance)}</span>
        </div>
        <Field label={t('amount')}>
          <input className="input num text-lg font-bold" autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
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
          <Field label={t('date')} className="flex-1">
            <input type="date" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </div>
        <Field label={t('note')}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function LedgerModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { data, update, t } = useStore();
  const lines = customerLedger(data, customer.id);
  const lang = data.settings.language;
  let running = customer.openingDuePaise;
  return (
    <Modal open onClose={onClose} title={`${t('ledger')} · ${customer.name}`}>
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
            <tr>
              <th className="px-5 py-2 text-left">{t('date')}</th>
              <th className="px-2 py-2 text-left">{t('note')}</th>
              <th className="px-2 py-2 text-right">{t('amount')}</th>
              <th className="px-5 py-2 text-right">{t('balance')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customer.openingDuePaise > 0 && (
              <tr>
                <td className="px-5 py-2 text-ink-3">—</td>
                <td className="px-2 py-2">{t('openingDue')}</td>
                <td className="num px-2 py-2 text-right">{rupee(customer.openingDuePaise)}</td>
                <td className="num px-5 py-2 text-right">{rupee(customer.openingDuePaise)}</td>
              </tr>
            )}
            {lines.map((l, i) => {
              running += l.kind === 'sale' ? l.amountPaise : -l.amountPaise;
              const receipt = l.kind === 'receipt' ? data.receipts.filter((r) => r.customerId === customer.id && r.date === l.date && r.amountPaise === l.amountPaise)[0] : undefined;
              return (
                <tr key={i}>
                  <td className="whitespace-nowrap px-5 py-2">{dateLabel(l.date, lang, 'short')}</td>
                  <td className="px-2 py-2 text-ink-2">
                    {l.kind === 'sale' ? `${t('machine')} ${l.machine ?? ''}` : t('received')} {l.note && `· ${l.note}`}
                    {receipt && (
                      <button
                        className="ml-1 text-ink-3 hover:text-bad"
                        aria-label={t('delete')}
                        onClick={() => update((d) => void (d.receipts = d.receipts.filter((r) => r.id !== receipt.id)))}
                      >
                        <Trash2 className="inline h-3 w-3" />
                      </button>
                    )}
                  </td>
                  <td className={cn('num px-2 py-2 text-right', l.kind === 'receipt' ? 'text-ok' : 'text-warn')}>
                    {l.kind === 'receipt' ? '−' : '+'}
                    {rupee(l.amountPaise)}
                  </td>
                  <td className="num px-5 py-2 text-right font-semibold">{rupee(running)}</td>
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
