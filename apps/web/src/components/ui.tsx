import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn, dateLabel, paiseToInput, parseAmountExpr, rupee, shiftDate, todayISO } from '../lib/util';
import type { FuelTone, Product } from '../lib/types';
import { useStore } from '../lib/store';

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ icon, title, right, sub }: { icon?: React.ReactNode; title: React.ReactNode; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          {icon}
          {title}
        </h2>
        {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export const toneClass: Record<FuelTone, { dot: string; soft: string; text: string; bar: string }> = {
  petrol: { dot: 'bg-petrol', soft: 'bg-petrol-soft', text: 'text-petrol', bar: 'border-petrol' },
  diesel: { dot: 'bg-diesel', soft: 'bg-diesel-soft', text: 'text-diesel', bar: 'border-diesel' },
  premium: { dot: 'bg-premium', soft: 'bg-premium-soft', text: 'text-premium', bar: 'border-premium' },
  cng: { dot: 'bg-cng', soft: 'bg-cng-soft', text: 'text-cng', bar: 'border-cng' },
};

export function ProductTag({ product, className }: { product?: Product; className?: string }) {
  const { data } = useStore();
  if (!product) return <span className="chip bg-sunk text-ink-3">—</span>;
  const tc = toneClass[product.tone];
  const name = data.settings.language === 'bn' && product.nameBn ? product.nameBn : product.name;
  return (
    <span className={cn('chip', tc.soft, tc.text, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', tc.dot)} />
      {name}
    </span>
  );
}

export function productName(p: Product, lang: string) {
  return lang === 'bn' && p.nameBn ? p.nameBn : p.name;
}

/** Dispenser-like readout used for litres and amounts. */
export function Lcd({ value, unit, size = 'md', ghost, className }: { value: string; unit?: string; size?: 'sm' | 'md' | 'lg'; ghost?: boolean; className?: string }) {
  const sz = size === 'lg' ? 'text-3xl sm:text-4xl px-4 py-3' : size === 'sm' ? 'text-sm px-2.5 py-1.5' : 'text-lg px-3 py-2';
  return (
    <div className={cn('lcd inline-flex items-baseline justify-end gap-1.5 rounded-lg', sz, className)}>
      <span className={cn('tracking-tight', ghost && 'lcd-ghost')}>{value}</span>
      {unit && <span className="text-[0.55em] font-semibold uppercase opacity-70">{unit}</span>}
    </div>
  );
}

export function DiffBadge({ paise, tolerance, size = 'sm' }: { paise: number; tolerance: number; size?: 'sm' | 'lg' }) {
  const { t } = useStore();
  const ok = Math.abs(paise) <= tolerance;
  const tone = paise === 0 ? 'ok' : ok ? 'warn' : 'bad';
  const cls = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' }[tone];
  const label = paise === 0 ? t('balanced') : paise < 0 ? t('short') : t('excess');
  return (
    <span className={cn('chip whitespace-nowrap', cls, size === 'lg' && 'px-3 py-1.5 text-sm')}>
      {tone === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
      {paise !== 0 && <span className="num">{rupee(Math.abs(paise))}</span>}
    </span>
  );
}

/**
 * Money field that accepts notebook-style expressions (e.g. "20000+2525").
 * Commits paise on blur / Enter.
 */
export function MoneyInput({
  value,
  onCommit,
  placeholder = '0',
  className,
  disabled,
  autoFocus,
  ariaLabel,
}: {
  value: number;
  onCommit: (paise: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(paiseToInput(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(paiseToInput(value));
  }, [value, focused]);
  const parsed = parseAmountExpr(text);
  const isExpr = /[+\-*xX×]/.test(text.replace(/^-/, ''));
  const commit = () => {
    if (parsed !== null && parsed !== value) onCommit(Math.max(0, parsed));
    if (parsed === null) setText(paiseToInput(value));
  };
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
      <input
        aria-label={ariaLabel}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn('input num pl-7 text-right', parsed === null && 'border-bad focus:border-bad focus:ring-bad/15')}
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {focused && isExpr && parsed !== null && (
        <span className="num absolute -bottom-5 right-1 text-[11px] text-ink-3">= {rupee(parsed)}</span>
      )}
    </div>
  );
}

export function Field({ label, children, className, hint }: { label: React.ReactNode; children: React.ReactNode; className?: string; hint?: React.ReactNode }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl border border-line bg-sunk p-1', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-labelledby={id} className="rise max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-lift sm:max-w-lg sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <h3 id={id} className="font-display text-lg font-bold">{title}</h3>
          <button className="btn-quiet" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function DateNav({ className }: { className?: string }) {
  const { date, setDate, data, t } = useStore();
  const isToday = date === todayISO();
  return (
    <div className={cn('flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-card', className)}>
      <button className="btn-quiet px-2" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <label className="relative cursor-pointer px-1 text-center">
        <span className="block whitespace-nowrap text-sm font-semibold">{dateLabel(date, data.settings.language)}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Pick date"
        />
      </label>
      <button className="btn-quiet px-2" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
        <ChevronRight className="h-4 w-4" />
      </button>
      {!isToday && (
        <button className="btn-quiet hidden px-2 text-xs sm:inline-flex" onClick={() => setDate(todayISO())}>
          {t('today')}
        </button>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, accent, icon }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; accent?: string; icon?: React.ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <span className={cn('absolute inset-y-0 left-0 w-1', accent ?? 'bg-brand')} />
      <div className="flex items-center justify-between text-ink-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em]">{label}</span>
        {icon}
      </div>
      <div className="num mt-2 text-xl font-bold tracking-tight sm:text-2xl">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-2">{sub}</div>}
    </Card>
  );
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <div className="font-display text-base font-bold">{title}</div>
      {children && <div className="mt-2 max-w-sm text-sm text-ink-2">{children}</div>}
    </div>
  );
}
