import { useMemo, useState } from 'react';
import { Package, PackagePlus, Pencil, Plus, Search, Trash2, Wine } from 'lucide-react';
import { useStore } from '../lib/store';
import { WINE_CATEGORIES, allInvoices, invoiceTotal, liveProducts, productUsed, wineCategoryOptions, wineOpeningStock, wineSettings } from '../lib/wine';
import { WineInvoiceModal, newInvoiceTarget, type InvoiceTarget } from '../components/WineInvoiceModal';
import type { WineProduct } from '../lib/types';
import { cn, dateLabel, paiseToInput, parseAmountExpr, rupee, todayISO, uid } from '../lib/util';
import { Card, Empty, Field, Modal, Stat } from '../components/ui';

const NEW_CAT = '__new__';

const blank = (): WineProduct => ({ id: '', name: '', billName: '', size: '750 ml', category: 'Whisky', mrpPaise: 0, costPaise: 0, openingStock: 0, lowStock: 6, active: true });

export default function WineStock() {
  const { data, update, t, toast, date } = useStore();
  const st = wineSettings(data);
  const lang = data.settings.language;
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<WineProduct | null>(null);
  const [invoice, setInvoice] = useState<InvoiceTarget | null>(null);
  const invoices = allInvoices(data);
  const live = liveProducts(st);

  // Stock right now = closing after the last recorded day.
  const stock = useMemo(() => wineOpeningStock(data, '9999-12-31'), [data]);
  const used = (id: string) => productUsed(data, id);

  /** Delete: brands with history are hidden but kept so past days still add up. */
  const removeBrand = (p: WineProduct) => {
    const hasHistory = used(p.id);
    if (!confirm(hasHistory ? t('deleteBrandUsedConfirm') : t('deleteBrandConfirm'))) return;
    const before = structuredClone(st.products);
    update((d) => {
      const ws = structuredClone(wineSettings(d));
      ws.products = hasHistory ? ws.products.map((x) => (x.id === p.id ? { ...x, deleted: true, active: false } : x)) : ws.products.filter((x) => x.id !== p.id);
      d.settings.wine = ws;
    });
    setEditing(null);
    toast(`${t('removedBrand')}: ${p.name} ${p.size}`, 'ok', {
      label: t('undo'),
      run: () =>
        update((d) => {
          d.settings.wine = { ...structuredClone(wineSettings(d)), products: before };
        }),
    });
  };

  const removeInvoice = (dateOf: string, id: string) => {
    if (!confirm(t('deleteInvoiceConfirm'))) return;
    if (data.wineDays?.[dateOf]?.locked) return toast(t('dayLocked'), 'warn');
    update((d) => {
      const day = d.wineDays?.[dateOf];
      if (day) day.invoices = (day.invoices ?? []).filter((x) => x.id !== id);
    });
  };

  const needle = q.trim().toLowerCase();
  const list = live
    .filter((p) => !needle || `${p.name} ${p.billName ?? ''} ${p.size} ${p.category}`.toLowerCase().includes(needle))
    .sort((a, b) => (a.category + a.name + a.size).localeCompare(b.category + b.name + b.size));
  const value = live.filter((p) => p.active).reduce((a, p) => a + (stock[p.id] ?? 0) * p.mrpPaise, 0);
  const bottles = live.filter((p) => p.active).reduce((a, p) => a + (stock[p.id] ?? 0), 0);
  const lowCount = live.filter((p) => p.active && p.lowStock > 0 && (stock[p.id] ?? 0) <= p.lowStock).length;

  const save = (input: WineProduct) => {
    let p = input;
    const name = p.name.trim();
    if (!name) return;
    update((d) => {
      const ws = structuredClone(wineSettings(d));
      p = { ...p, billName: (p.billName ?? '').trim(), category: p.category.trim() || 'Other' };
      // Remember a category the shop typed itself so it shows in the dropdown next time.
      if (!WINE_CATEGORIES.some((c) => c.toLowerCase() === p.category.toLowerCase())) {
        ws.customCategories = ws.customCategories ?? [];
        if (!ws.customCategories.some((c) => c.toLowerCase() === p.category.toLowerCase())) ws.customCategories.push(p.category);
      }
      if (!p.id) ws.products.push({ ...p, name, id: uid() });
      else {
        const i = ws.products.findIndex((x) => x.id === p.id);
        const old = ws.products[i];
        ws.products[i] = { ...p, name };
        // A new MRP also applies to today and later days that aren't locked.
        if (old && old.mrpPaise !== p.mrpPaise) {
          for (const day of Object.values(d.wineDays ?? {})) {
            if (day.date >= todayISO() && !day.locked && day.rows[p.id]) day.rows[p.id].mrpPaise = p.mrpPaise;
          }
        }
      }
      d.settings.wine = ws;
    });
    toast(t('saved'));
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <Package className="h-7 w-7 text-premium" /> {t('navWineStock')}
          </h1>
          <p className="text-sm text-ink-2">{st.shopName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setEditing(blank())}>
            <Plus className="h-4 w-4" /> {t('addBrand')}
          </button>
          <button className="btn-primary" disabled={!live.length} onClick={() => setInvoice(newInvoiceTarget(date))}>
            <PackagePlus className="h-4 w-4" /> {t('receiveStock')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label={t('currentStock')} value={`${bottles} ${t('bottles')}`} accent="bg-premium" sub={`${t('brand')}: ${live.filter((p) => p.active).length}`} />
        <Stat label={t('stockValue')} value={rupee(value)} accent="bg-ok" />
        <Stat label={t('lowStockWarn')} value={String(lowCount)} accent={lowCount ? 'bg-warn' : 'bg-ok'} />
      </div>

      {live.length === 0 ? (
        <Empty icon={<Wine className="h-6 w-6" />} title={t('addBrand')}>
          {t('noBrands')}
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input className="input py-2 pl-9 text-sm" placeholder={t('searchBrands')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="px-4 py-2 text-left sm:px-5">{t('brand')}</th>
                  <th className="px-2 py-2 text-left">{t('category')}</th>
                  <th className="px-2 py-2 text-right">{t('mrp')}</th>
                  <th className="px-2 py-2 text-right">{t('purchasePrice')}</th>
                  <th className="px-2 py-2 text-right">{t('currentStock')}</th>
                  <th className="px-4 py-2 sm:px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((p) => {
                  const n = stock[p.id] ?? 0;
                  const low = p.lowStock > 0 && n <= p.lowStock;
                  return (
                    <tr key={p.id} className={cn('hover:bg-sunk/60', !p.active && 'opacity-50')}>
                      <td className="px-4 py-2.5 sm:px-5">
                        <span className="font-semibold">{p.name}</span> <span className="text-ink-2">{p.size}</span>
                        {p.billName && p.billName !== p.name && <div className="text-[11px] text-ink-3">{t('billName')}: {p.billName}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-ink-2">{p.category}</td>
                      <td className="num px-2 py-2.5 text-right">{rupee(p.mrpPaise)}</td>
                      <td className="num px-2 py-2.5 text-right text-ink-2">{p.costPaise ? rupee(p.costPaise) : '—'}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={cn('num font-bold', n < 0 ? 'text-bad' : low ? 'text-warn' : '')}>{n}</span>
                        {low && <span className="chip ml-1.5 bg-warn-soft px-1.5 py-0 text-[10px] text-warn">{t('lowStockWarn')}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right sm:px-5">
                        <span className="inline-flex gap-0.5">
                          <button className="btn-quiet px-2" onClick={() => setEditing(p)} aria-label={`${t('edit')} ${p.name} ${p.size}`} title={t('edit')}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button className="btn-quiet px-2 hover:text-bad" onClick={() => removeBrand(p)} aria-label={`${t('delete')} ${p.name} ${p.size}`} title={t('delete')}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <BrandModal
          product={editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing.id ? () => removeBrand(editing) : undefined}
        />
      )}

      {/* Stock invoices – every delivery, newest first */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
          <span className="flex items-center gap-2 font-display font-bold">
            <PackagePlus className="h-5 w-5 text-premium" /> {t('stockInvoices')}
          </span>
          <span className="text-xs text-ink-3">{invoices.length}</span>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-ink-3">{t('noInvoices')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-sunk text-[11px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="px-4 py-2 text-left sm:px-5">{t('date')}</th>
                  <th className="px-2 py-2 text-left">{t('invoiceNo')}</th>
                  <th className="px-2 py-2 text-left">{t('supplier')}</th>
                  <th className="px-2 py-2 text-right">{t('bottles')}</th>
                  <th className="px-2 py-2 text-right">{t('amount')}</th>
                  <th className="px-4 py-2 sm:px-5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map(({ date: d, invoice: inv }) => (
                  <tr key={inv.id} className="hover:bg-sunk/60">
                    <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">{dateLabel(d, lang, 'short')}</td>
                    <td className="px-2 py-2.5 font-semibold">{inv.number || '—'}</td>
                    <td className="px-2 py-2.5 text-ink-2">
                      {inv.supplier || '—'}
                      <div className="truncate text-[11px] text-ink-3">
                        {inv.lines
                          .map((l) => {
                            const p = st.products.find((x) => x.id === l.productId);
                            return p ? `${p.name} ${p.size} ×${l.qty}` : `×${l.qty}`;
                          })
                          .join(', ')}
                      </div>
                    </td>
                    <td className="num px-2 py-2.5 text-right font-semibold">+{inv.lines.reduce((a, l) => a + l.qty, 0)}</td>
                    <td className="num px-2 py-2.5 text-right">{rupee(invoiceTotal(inv))}</td>
                    <td className="px-4 py-2.5 text-right sm:px-5">
                      <span className="inline-flex gap-0.5">
                        <button className="btn-quiet px-2" onClick={() => setInvoice({ date: d, invoice: inv, originalDate: d })} aria-label={`${t('edit')} ${inv.number}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="btn-quiet px-2 hover:text-bad" onClick={() => removeInvoice(d, inv.id)} aria-label={`${t('delete')} ${inv.number}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {invoice && <WineInvoiceModal target={invoice} onClose={() => setInvoice(null)} />}
    </div>
  );
}

function BrandModal({ product, onClose, onSave, onDelete }: { product: WineProduct; onClose: () => void; onSave: (p: WineProduct) => void; onDelete?: () => void }) {
  const { t } = useStore();
  const [p, setP] = useState(product);
  const [mrp, setMrp] = useState(paiseToInput(product.mrpPaise));
  const [cost, setCost] = useState(paiseToInput(product.costPaise));
  const { data } = useStore();
  const [extraCats, setExtraCats] = useState<string[]>([]);
  const categoryOptions = [...wineCategoryOptions(wineSettings(data)), ...extraCats.filter((c) => !wineCategoryOptions(wineSettings(data)).includes(c))];
  if (p.category && !categoryOptions.includes(p.category)) categoryOptions.push(p.category);
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const addCat = () => {
    const v = newCat.trim();
    if (!v) return;
    const existing = categoryOptions.find((c) => c.toLowerCase() === v.toLowerCase());
    if (!existing) setExtraCats((xs) => [...xs, v]);
    setP({ ...p, category: existing ?? v });
    setAddingCat(false);
  };
  const int = (v: string) => Math.max(0, Math.floor(Number(v.replace(/\D/g, '')) || 0));
  return (
    <Modal
      open
      onClose={onClose}
      title={product.id ? `${product.name} ${product.size}` : t('addBrand')}
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
            disabled={!p.name.trim() || !parseAmountExpr(mrp)}
            onClick={() => onSave({ ...p, mrpPaise: parseAmountExpr(mrp) ?? 0, costPaise: parseAmountExpr(cost) ?? 0 })}
          >
            {t('save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('brandName')}>
          <input className="input" autoFocus value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        <Field label={t('billName')} hint={t('billNameHint')}>
          <input className="input" value={p.billName ?? ''} placeholder={p.name} onChange={(e) => setP({ ...p, billName: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('size')}>
            <input className="input" list="wine-sizes" value={p.size} onChange={(e) => setP({ ...p, size: e.target.value })} />
            <datalist id="wine-sizes">
              {['1000 ml', '750 ml', '650 ml', '500 ml', '375 ml', '330 ml', '180 ml', '90 ml', '600 ml', '300 ml'].map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label={t('category')}>
            {addingCat ? (
              <div className="flex gap-1.5">
                <input
                  className="input"
                  autoFocus
                  placeholder={t('newCategoryPrompt')}
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addCat();
                    if (e.key === 'Escape') setAddingCat(false);
                  }}
                />
                <button type="button" className="btn-ghost shrink-0 px-3" onClick={addCat} disabled={!newCat.trim()}>
                  {t('add')}
                </button>
              </div>
            ) : (
              <select
                className="input"
                value={p.category}
                onChange={(e) => (e.target.value === NEW_CAT ? (setNewCat(''), setAddingCat(true)) : setP({ ...p, category: e.target.value }))}
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={NEW_CAT}>{t('addCategory')}</option>
              </select>
            )}
          </Field>
          <Field label={t('mrp')}>
            <input className="input num" inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} />
          </Field>
          <Field label={t('purchasePrice')}>
            <input className="input num" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
          </Field>
          <Field label={t('openingStockFirst')}>
            <input className="input num" inputMode="numeric" value={p.openingStock || ''} placeholder="0" onChange={(e) => setP({ ...p, openingStock: int(e.target.value) })} />
          </Field>
          <Field label={t('lowStockLevel')}>
            <input className="input num" inputMode="numeric" value={p.lowStock || ''} placeholder="0" onChange={(e) => setP({ ...p, lowStock: int(e.target.value) })} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
          {t('active')}
        </label>
      </div>
    </Modal>
  );
}
