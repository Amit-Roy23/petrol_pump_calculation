import { useMemo, useState } from 'react';
import { Package, Pencil, Plus, Search, Trash2, Wine } from 'lucide-react';
import { useStore } from '../lib/store';
import { WINE_CATEGORIES, wineOpeningStock, wineSettings } from '../lib/wine';
import type { WineProduct } from '../lib/types';
import { cn, paiseToInput, parseAmountExpr, rupee, todayISO, uid } from '../lib/util';
import { Card, Empty, Field, Modal, Stat } from '../components/ui';

const blank = (): WineProduct => ({ id: '', name: '', size: '750 ml', category: 'Whisky', mrpPaise: 0, costPaise: 0, openingStock: 0, lowStock: 6, active: true });

export default function WineStock() {
  const { data, update, t, toast } = useStore();
  const st = wineSettings(data);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<WineProduct | null>(null);

  // Stock right now = closing after the last recorded day.
  const stock = useMemo(() => wineOpeningStock(data, '9999-12-31'), [data]);
  const used = (id: string) => Object.values(data.wineDays ?? {}).some((d) => d.rows[id] && (d.rows[id].received || d.rows[id].breakage || d.rows[id].closing));

  const needle = q.trim().toLowerCase();
  const list = st.products
    .filter((p) => !needle || `${p.name} ${p.size} ${p.category}`.toLowerCase().includes(needle))
    .sort((a, b) => (a.category + a.name + a.size).localeCompare(b.category + b.name + b.size));
  const value = st.products.filter((p) => p.active).reduce((a, p) => a + (stock[p.id] ?? 0) * p.mrpPaise, 0);
  const bottles = st.products.filter((p) => p.active).reduce((a, p) => a + (stock[p.id] ?? 0), 0);
  const lowCount = st.products.filter((p) => p.active && p.lowStock > 0 && (stock[p.id] ?? 0) <= p.lowStock).length;

  const save = (p: WineProduct) => {
    const name = p.name.trim();
    if (!name) return;
    update((d) => {
      const ws = structuredClone(wineSettings(d));
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
        <button className="btn-primary" onClick={() => setEditing(blank())}>
          <Plus className="h-4 w-4" /> {t('addBrand')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label={t('currentStock')} value={`${bottles} ${t('bottles')}`} accent="bg-premium" sub={`${t('brand')}: ${st.products.filter((p) => p.active).length}`} />
        <Stat label={t('stockValue')} value={rupee(value)} accent="bg-ok" />
        <Stat label={t('lowStockWarn')} value={String(lowCount)} accent={lowCount ? 'bg-warn' : 'bg-ok'} />
      </div>

      {st.products.length === 0 ? (
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
                      </td>
                      <td className="px-2 py-2.5 text-ink-2">{p.category}</td>
                      <td className="num px-2 py-2.5 text-right">{rupee(p.mrpPaise)}</td>
                      <td className="num px-2 py-2.5 text-right text-ink-2">{p.costPaise ? rupee(p.costPaise) : '—'}</td>
                      <td className="px-2 py-2.5 text-right">
                        <span className={cn('num font-bold', n < 0 ? 'text-bad' : low ? 'text-warn' : '')}>{n}</span>
                        {low && <span className="chip ml-1.5 bg-warn-soft px-1.5 py-0 text-[10px] text-warn">{t('lowStockWarn')}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right sm:px-5">
                        <button className="btn-quiet px-2" onClick={() => setEditing(p)} aria-label={t('edit')}>
                          <Pencil className="h-4 w-4" />
                        </button>
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
          onDelete={
            editing.id && !used(editing.id)
              ? () => {
                  update((d) => {
                    const ws = structuredClone(wineSettings(d));
                    ws.products = ws.products.filter((x) => x.id !== editing.id);
                    d.settings.wine = ws;
                  });
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function BrandModal({ product, onClose, onSave, onDelete }: { product: WineProduct; onClose: () => void; onSave: (p: WineProduct) => void; onDelete?: () => void }) {
  const { t } = useStore();
  const [p, setP] = useState(product);
  const [mrp, setMrp] = useState(paiseToInput(product.mrpPaise));
  const [cost, setCost] = useState(paiseToInput(product.costPaise));
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
            <input className="input" list="wine-cats" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} />
            <datalist id="wine-cats">
              {WINE_CATEGORIES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
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
