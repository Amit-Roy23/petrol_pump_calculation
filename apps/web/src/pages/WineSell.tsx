import { useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, Lock, Minus, Plus, Receipt, Search, ShoppingCart, Smartphone, Trash2, UserRound, X } from 'lucide-react';
import { useStore } from '../lib/store';
import { computeWineDay, liveProducts, saleTotal, wineSettings, type WineRowCalc } from '../lib/wine';
import type { WinePayMode, WineSale } from '../lib/types';
import { cn, dateLabel, parseAmountExpr, rupee, todayISO, uid } from '../lib/util';
import { Card, DateNav, Empty } from '../components/ui';
import { Link } from 'react-router-dom';

const MODES: { mode: WinePayMode; key: 'cashSale' | 'upiSlips' | 'card' | 'due'; Icon: typeof Banknote; on: string }[] = [
  { mode: 'cash', key: 'cashSale', Icon: Banknote, on: 'border-ok bg-ok text-white' },
  { mode: 'online', key: 'upiSlips', Icon: Smartphone, on: 'border-cng bg-cng text-white' },
  { mode: 'card', key: 'card', Icon: CreditCard, on: 'border-premium bg-premium text-white' },
  { mode: 'due', key: 'due', Icon: UserRound, on: 'border-warn bg-warn text-white' },
];
const MODE_CHIP: Record<WinePayMode, string> = { cash: 'bg-ok-soft text-ok', online: 'bg-cng-soft text-cng', card: 'bg-premium-soft text-premium', due: 'bg-warn-soft text-warn' };

const nowHM = () => new Date().toTimeString().slice(0, 5);

export default function WineSell() {
  const { data, date, getWineDay, updateWineDay, t, toast } = useStore();
  const lang = data.settings.language;
  const { day } = getWineDay(date);
  const calc = useMemo(() => computeWineDay(data, day), [data, day]);
  const st = wineSettings(data);
  const locked = day.locked;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<WinePayMode>('cash');
  const [customer, setCustomer] = useState('');
  const [given, setGiven] = useState('');
  const cartRef = useRef<HTMLDivElement>(null);

  const rows = calc.rows.filter((r) => r.product.active && !r.product.deleted);
  const byId = new Map(calc.rows.map((r) => [r.product.id, r]));
  const categories = [...new Set(rows.map((r) => r.product.category || 'Other'))];
  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (!cat || (r.product.category || 'Other') === cat) && (!needle || `${r.product.name} ${r.product.billName ?? ''} ${r.product.size} ${r.product.category}`.toLowerCase().includes(needle))
  );

  const lines = Object.entries(cart)
    .filter(([, n]) => n > 0)
    .map(([id, qty]) => ({ r: byId.get(id)!, qty }))
    .filter((x) => x.r);
  const total = lines.reduce((a, x) => a + x.qty * x.r.row.mrpPaise, 0);
  const bottles = lines.reduce((a, x) => a + x.qty, 0);
  const givenPaise = parseAmountExpr(given) ?? 0;
  const left = (r: WineRowCalc) => r.inStock - (cart[r.product.id] ?? 0);

  const setQty = (r: WineRowCalc, qty: number) => {
    const max = Math.max(0, r.inStock);
    if (qty > max) toast(`${r.product.name} ${r.product.size}: ${t('onlyInStock')} ${max}`, 'warn');
    setCart((c) => ({ ...c, [r.product.id]: Math.max(0, Math.min(qty, max)) }));
  };
  const add = (r: WineRowCalc) => setQty(r, (cart[r.product.id] ?? 0) + 1);

  const complete = () => {
    if (!lines.length || locked) return;
    if (mode === 'due' && !customer.trim()) {
      toast(t('dueNeedsName'), 'warn');
      return;
    }
    const sale: WineSale = {
      id: uid(),
      time: date === todayISO() ? nowHM() : '',
      lines: lines.map((x) => ({ productId: x.r.product.id, qty: x.qty, mrpPaise: x.r.row.mrpPaise })),
      mode,
      customer: customer.trim(),
    };
    updateWineDay(date, (d) => {
      d.sales = [...(d.sales ?? []), sale];
    });
    toast(`${t('billSaved')} · ${rupee(total)}`);
    setCart({});
    setCustomer('');
    setGiven('');
    setMode('cash');
  };

  const voidBill = (s: WineSale) => {
    if (!confirm(t('voidBillConfirm'))) return;
    const before = day.sales ?? [];
    updateWineDay(date, (d) => {
      d.sales = (d.sales ?? []).filter((x) => x.id !== s.id);
    });
    toast(`${t('billVoided')} · ${rupee(saleTotal(s))}`, 'ok', {
      label: t('undo'),
      run: () =>
        updateWineDay(date, (d) => {
          d.sales = before;
        }),
    });
  };

  if (!liveProducts(st).length) {
    return (
      <Empty icon={<ShoppingCart className="h-6 w-6" />} title={t('sellTitle')}>
        {t('noBrands')}
        <div className="mt-4">
          <Link to="/wine/stock" className="btn-primary">
            {t('addBrand')}
          </Link>
        </div>
      </Empty>
    );
  }

  const bills = [...(day.sales ?? [])].reverse();
  const nameOf = (id: string) => {
    const p = st.products.find((x) => x.id === id);
    return p ? `${p.name} ${p.size}` : '—';
  };

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            <ShoppingCart className="h-7 w-7 text-premium" /> {t('sellTitle')}
          </h1>
          <p className="text-sm text-ink-2">{t('sellHint')}</p>
        </div>
        <DateNav />
      </div>

      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
          <Lock className="h-4 w-4" /> {t('dayLocked')}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        {/* Brand picker */}
        <Card className="overflow-hidden">
          <div className="space-y-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                className="input py-2.5 pl-9"
                placeholder={t('searchBrands')}
                value={q}
                // Desktop only – on phones it would pop the keyboard open every time.
                autoFocus={typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && visible[0]) add(visible[0]);
                }}
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {['', ...categories].map((c) => (
                <button
                  key={c || 'all'}
                  onClick={() => setCat(c)}
                  className={cn('chip shrink-0 border px-3 py-1.5', cat === c ? 'border-premium bg-premium text-white' : 'border-line bg-surface text-ink-2 hover:border-ink-3')}
                >
                  {c || t('allCategories')}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:p-4">
            {visible.map((r) => {
              const inCart = cart[r.product.id] ?? 0;
              const remaining = left(r);
              const out = r.inStock <= 0;
              return (
                <button
                  key={r.product.id}
                  disabled={locked || out}
                  onClick={() => add(r)}
                  className={cn(
                    'relative flex flex-col rounded-xl border p-3 text-left transition active:scale-[0.98] disabled:opacity-45',
                    inCart ? 'border-premium bg-premium-soft/50 ring-2 ring-premium/25' : 'border-line bg-surface hover:border-ink-3'
                  )}
                >
                  {inCart > 0 && (
                    <span className="num absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-premium px-1.5 text-xs font-bold text-white">{inCart}</span>
                  )}
                  <span className="text-sm font-semibold leading-tight">{r.product.name}</span>
                  <span className="text-xs text-ink-2">{r.product.size}</span>
                  <span className="mt-2 flex items-end justify-between gap-1">
                    <span className="num font-bold">{rupee(r.row.mrpPaise)}</span>
                    <span className={cn('num text-[11px]', out ? 'font-bold text-bad' : remaining <= r.product.lowStock ? 'font-semibold text-warn' : 'text-ink-3')}>
                      {out ? t('outOfStock') : `${remaining} ${t('left')}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Cart / bill */}
        <div ref={cartRef} className="space-y-5 lg:sticky lg:top-6">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <span className="flex items-center gap-2 font-display font-bold">
                <Receipt className="h-5 w-5 text-premium" /> {t('currentBill')}
              </span>
              {lines.length > 0 && (
                <button className="btn-quiet px-2 text-xs" onClick={() => setCart({})}>
                  <X className="h-3.5 w-3.5" /> {t('clearBill')}
                </button>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-3">{t('tapToAdd')}</p>
            ) : (
              <div className="divide-y divide-line">
                {lines.map(({ r, qty }) => (
                  <div key={r.product.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {r.product.name} <span className="font-normal text-ink-2">{r.product.size}</span>
                      </div>
                      <div className="num text-xs text-ink-3">{rupee(r.row.mrpPaise)}</div>
                    </div>
                    <div className="flex items-center rounded-lg border border-line">
                      <button className="px-2 py-1.5 text-ink-2 hover:text-ink" onClick={() => setQty(r, qty - 1)} aria-label="−">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        className="num w-10 bg-transparent text-center text-sm font-bold outline-none"
                        inputMode="numeric"
                        value={qty}
                        onChange={(e) => setQty(r, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0))}
                        aria-label={`${r.product.name} ${t('qty')}`}
                      />
                      <button className="px-2 py-1.5 text-ink-2 hover:text-ink" onClick={() => setQty(r, qty + 1)} aria-label="+">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="num w-24 text-right font-bold">{rupee(qty * r.row.mrpPaise)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-line bg-sunk/60 px-4 py-4 sm:px-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink-2">
                  {bottles} {t('bottles')}
                </span>
                <span className="num text-2xl font-extrabold">{rupee(total)}</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('mode')}>
                {MODES.map(({ mode: m, key, Icon, on }) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={cn('flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-bold transition', mode === m ? on : 'border-line bg-surface text-ink-2 hover:border-ink-3')}
                  >
                    <Icon className="h-4 w-4" />
                    {t(key)}
                  </button>
                ))}
              </div>
              {mode === 'due' && <input className="input py-2" placeholder={t('dueCustomerAmount')} value={customer} onChange={(e) => setCustomer(e.target.value)} />}
              {mode === 'cash' && total > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <input className="input num w-36 py-2 text-right" inputMode="decimal" placeholder={t('cashGiven')} value={given} onChange={(e) => setGiven(e.target.value)} aria-label={t('cashGiven')} />
                  {givenPaise >= total && (
                    <span className="text-ink-2">
                      {t('changeToReturn')}: <b className="num text-ok">{rupee(givenPaise - total)}</b>
                    </span>
                  )}
                </div>
              )}
              <button className="btn-primary w-full py-3 text-base" disabled={!lines.length || locked} onClick={complete}>
                <Receipt className="h-5 w-5" /> {t('completeSale')} · {rupee(total)}
              </button>
            </div>
          </Card>

          {/* Today's bills */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <span className="font-display font-bold">
                {t('billsToday')} · {dateLabel(date, lang, 'short')}
              </span>
              <span className="num text-sm">
                {calc.billCount} · <b>{rupee(calc.billedPaise)}</b>
              </span>
            </div>
            {bills.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-ink-3">{t('noBillsYet')}</p>
            ) : (
              <div className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {bills.map((s, i) => (
                  <div key={s.id} className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="num text-xs text-ink-3">#{bills.length - i}</span>
                        {s.time && <span className="num text-xs text-ink-3">{s.time}</span>}
                        <span className={cn('chip px-2 py-0.5 text-[10px]', MODE_CHIP[s.mode])}>
                          {t(MODES.find((m) => m.mode === s.mode)!.key)}
                          {s.customer && ` · ${s.customer}`}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-2">{s.lines.map((l) => `${nameOf(l.productId)} ×${l.qty}`).join(', ')}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="num font-bold">{rupee(saleTotal(s))}</span>
                      {!locked && (
                        <button className="btn-quiet px-1.5 hover:text-bad" onClick={() => voidBill(s)} aria-label={t('voidBill')} title={t('voidBill')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-4 gap-2 border-t border-line px-4 py-3 text-center text-xs sm:px-5">
              {MODES.map(({ mode: m, key }) => (
                <div key={m}>
                  <div className="text-ink-3">{t(key)}</div>
                  <div className="num font-bold">{rupee((day.sales ?? []).filter((s) => s.mode === m).reduce((a, s) => a + saleTotal(s), 0))}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Phone: always-visible bill total */}
      {lines.length > 0 && (
        <div className="no-print fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4 lg:hidden">
          <button
            onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="flex w-full items-center justify-between rounded-2xl bg-premium px-4 py-3 text-white shadow-lift"
          >
            <span className="flex items-center gap-2 font-bold">
              <ShoppingCart className="h-5 w-5" /> {bottles} {t('bottles')}
            </span>
            <span className="num text-lg font-extrabold">{rupee(total)} →</span>
          </button>
        </div>
      )}
    </div>
  );
}
