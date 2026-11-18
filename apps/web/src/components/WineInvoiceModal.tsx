import { useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { allInvoices, createWineDay, invoiceTotal, liveProducts, wineSettings } from '../lib/wine';
import type { WineInvoice, WineInvoiceLine } from '../lib/types';
import { cn, paiseToInput, parseAmountExpr, rupee, uid } from '../lib/util';
import { Field, Modal } from './ui';

export interface InvoiceTarget {
  /** Date the invoice belongs to (stock arrives that day). */
  date: string;
  invoice: WineInvoice;
  /** Set when editing: the date it was saved under. */
  originalDate?: string;
}

export function newInvoiceTarget(date: string): InvoiceTarget {
  return { date, invoice: { id: '', number: '', supplier: '', lines: [], note: '' } };
}

/**
 * Receive stock on a purchase invoice. Bottles are added on top of the
 * existing stock for that day; the brand's purchase price can be updated too.
 */
export function WineInvoiceModal({ target, onClose }: { target: InvoiceTarget; onClose: () => void }) {
  const { data, update, t, toast } = useStore();
  const st = wineSettings(data);
  const products = liveProducts(st).filter((p) => p.active);
  const [date, setDate] = useState(target.date);
  const [inv, setInv] = useState<WineInvoice>(structuredClone(target.invoice));
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(paiseToInput(products[0]?.costPaise ?? 0));
  const [updateCost, setUpdateCost] = useState(true);
  const suppliers = [...new Set(allInvoices(data).map((x) => x.invoice.supplier).filter(Boolean))];
  const nameOf = (id: string) => {
    const p = st.products.find((x) => x.id === id);
    return p ? `${p.name} ${p.size}` : '—';
  };

  const pick = (id: string) => {
    setProductId(id);
    setCost(paiseToInput(st.products.find((x) => x.id === id)?.costPaise ?? 0));
  };
  // Accept "48" or "4x12" (4 cases of 12).
  const qtyNum = Math.round((parseAmountExpr(qty) ?? 0) / 100);
  const addLine = () => {
    if (!productId || qtyNum <= 0) return;
    const line: WineInvoiceLine = { id: uid(), productId, qty: qtyNum, costPaise: Math.max(0, parseAmountExpr(cost) ?? 0) };
    setInv({ ...inv, lines: [...inv.lines, line] });
    setQty('');
  };
  const bottles = inv.lines.reduce((a, l) => a + l.qty, 0);
  const lockedTarget = data.wineDays?.[date]?.locked;

  const save = () => {
    if (!inv.lines.length) return;
    if (lockedTarget) {
      toast(t('dayLocked'), 'warn');
      return;
    }
    update((d) => {
      d.wineDays = d.wineDays ?? {};
      // Editing: take it out of the day it was saved under first.
      if (target.originalDate && d.wineDays[target.originalDate]) {
        const old = d.wineDays[target.originalDate];
        old.invoices = (old.invoices ?? []).filter((x) => x.id !== inv.id);
      }
      if (!d.wineDays[date]) d.wineDays[date] = createWineDay(d, date);
      const day = d.wineDays[date];
      day.invoices = [...(day.invoices ?? []), { ...inv, id: inv.id || uid(), number: inv.number.trim(), supplier: inv.supplier.trim() }];
      day.updatedAt = new Date().toISOString();
      if (updateCost) {
        const ws = structuredClone(wineSettings(d));
        for (const l of inv.lines) {
          const p = ws.products.find((x) => x.id === l.productId);
          if (p && l.costPaise > 0) p.costPaise = l.costPaise;
        }
        d.settings.wine = ws;
      }
    });
    toast(`${t('stockAdded')}: ${bottles} ${t('bottles')}`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-premium" /> {target.invoice.id ? t('editInvoice') : t('receiveStock')}
        </span>
      }
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary" disabled={!inv.lines.length} onClick={save}>
            {t('save')} · {bottles} {t('bottles')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('date')}>
            <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label={t('invoiceNo')}>
            <input className="input" value={inv.number} onChange={(e) => setInv({ ...inv, number: e.target.value })} placeholder="INV-001" />
          </Field>
          <Field label={t('supplier')} className="col-span-2">
            <input className="input" list="wine-suppliers" value={inv.supplier} onChange={(e) => setInv({ ...inv, supplier: e.target.value })} />
            <datalist id="wine-suppliers">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>
        {lockedTarget && <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs font-semibold text-warn">{t('dayLocked')}</p>}

        {/* Lines */}
        <div className="rounded-xl border border-line">
          {inv.lines.length > 0 && (
            <div className="divide-y divide-line">
              {inv.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{nameOf(l.productId)}</span>
                  <span className="num flex shrink-0 items-center gap-2">
                    <span>
                      {l.qty} × {rupee(l.costPaise, { symbol: false })}
                    </span>
                    <b>{rupee(l.qty * l.costPaise)}</b>
                    <button className="btn-quiet px-1.5 hover:text-bad" onClick={() => setInv({ ...inv, lines: inv.lines.filter((x) => x.id !== l.id) })} aria-label={t('delete')}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
              <div className="flex justify-between bg-sunk/60 px-3 py-2 text-sm font-bold">
                <span>
                  {t('total')}: {bottles} {t('bottles')}
                </span>
                <span className="num">{rupee(invoiceTotal(inv))}</span>
              </div>
            </div>
          )}
          <div className={cn('grid grid-cols-2 gap-2 p-3 sm:grid-cols-[1fr_90px_110px_auto]', inv.lines.length > 0 && 'border-t border-line')}>
            <select className="input col-span-2 py-2 sm:col-span-1" value={productId} onChange={(e) => pick(e.target.value)} aria-label={t('brand')}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.size}
                </option>
              ))}
            </select>
            <input
              className="input num py-2 text-center"
              inputMode="numeric"
              placeholder={t('qty')}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLine()}
              aria-label={t('qty')}
              title="48 or 4x12"
            />
            <input
              className="input num py-2 text-right"
              inputMode="decimal"
              placeholder={t('purchasePrice')}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLine()}
              aria-label={t('purchasePrice')}
            />
            <button className="btn-ghost col-span-2 py-2 sm:col-span-1" onClick={addLine} disabled={!productId || qtyNum <= 0}>
              <Plus className="h-4 w-4" /> {t('add')}
            </button>
          </div>
          <p className="px-3 pb-2 text-[11px] text-ink-3">{t('invoiceQtyHint')}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} />
          {t('updateCostPrice')}
        </label>
        <Field label={t('note')}>
          <input className="input" value={inv.note} onChange={(e) => setInv({ ...inv, note: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
