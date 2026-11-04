import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { Entry, LineItem } from '../lib/types';
import { cn, parseAmountExpr, rupee, splitAmounts, sumPaise, uid } from '../lib/util';
import { useStore } from '../lib/store';
import { MoneyInput } from './ui';

/** Quick list for P.T.M / card slips: type "1160+114+500", press Enter, get 3 chips. */
export function QuickAmountList({
  title,
  icon,
  entries,
  onChange,
  disabled,
  accent = 'bg-brand',
  collapsedByDefault,
}: {
  title: string;
  icon: React.ReactNode;
  entries: Entry[];
  onChange: (next: Entry[]) => void;
  disabled?: boolean;
  accent?: string;
  collapsedByDefault?: boolean;
}) {
  const { t, toast } = useStore();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const [open, setOpen] = useState(!collapsedByDefault || entries.length > 0);
  const total = sumPaise(entries);
  const preview = splitAmounts(text);
  const add = () => {
    if (!text.trim()) return;
    if (!preview || !preview.length) {
      setBad(true);
      return;
    }
    onChange([...entries, ...preview.map((a) => ({ id: uid(), amountPaise: a }))]);
    setText('');
    setBad(false);
  };
  const remove = (e: Entry) => {
    const before = entries;
    onChange(entries.filter((x) => x.id !== e.id));
    toast(`${t('removed')} ${rupee(e.amountPaise)}`, 'ok', { label: t('undo'), run: () => onChange(before) });
  };
  return (
    <div className="rounded-xl border border-line bg-sunk/60">
      <button type="button" className="flex w-full items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className={cn('grid h-7 w-7 place-items-center rounded-lg text-white', accent)}>{icon}</span>
          {title}
          {entries.length > 0 && <span className="chip bg-surface px-2 py-0.5 text-[11px] text-ink-2">{entries.length}</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className="num text-base font-bold">{rupee(total)}</span>
          <ChevronDown className={cn('h-4 w-4 text-ink-3 transition', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {entries.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {entries.map((e) => (
                <span key={e.id} className="num inline-flex items-center gap-1 rounded-lg border border-line bg-surface py-1 pl-2.5 pr-1 text-[13px] font-semibold">
                  {rupee(e.amountPaise, { symbol: false })}
                  {!disabled && (
                    <button onClick={() => remove(e)} className="rounded p-1 text-ink-3 hover:bg-bad-soft hover:text-bad" aria-label={`${t('delete')} ${rupee(e.amountPaise)}`}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {!disabled && (
            <>
              <div className="flex gap-2">
                <input
                  className={cn('input num bg-surface py-2', bad && 'border-bad')}
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder="1160+114+500"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setBad(false);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && add()}
                  aria-label={title}
                />
                <button className="btn-ghost shrink-0 px-3" onClick={add} disabled={!text.trim()}>
                  <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t('add')}</span>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-3">
                {preview && preview.length > 1 ? (
                  <span className="num font-semibold text-ink-2">
                    {preview.length} × → {rupee(preview.reduce((a, b) => a + b, 0))}
                  </span>
                ) : (
                  t('onlineHint')
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Labelled money lines (other cash, expenses). */
export function LineItemsEditor({
  items,
  onChange,
  placeholder,
  disabled,
}: {
  items: LineItem[];
  onChange: (next: LineItem[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const { t, toast } = useStore();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const add = () => {
    const p = parseAmountExpr(amount);
    if (!p || p <= 0) return;
    onChange([...items, { id: uid(), label: label.trim() || placeholder, amountPaise: p }]);
    setLabel('');
    setAmount('');
  };
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-2">
          <input
            className="input py-2"
            value={it.label}
            disabled={disabled}
            onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)))}
          />
          <MoneyInput
            className="w-36 shrink-0"
            value={it.amountPaise}
            disabled={disabled}
            onCommit={(v) => onChange(items.map((x) => (x.id === it.id ? { ...x, amountPaise: v } : x)))}
          />
          {!disabled && (
            <button
              className="btn-quiet shrink-0 px-2 hover:text-bad"
              onClick={() => {
                const before = items;
                onChange(items.filter((x) => x.id !== it.id));
                toast(`${t('removed')} ${it.label}`, 'ok', { label: t('undo'), run: () => onChange(before) });
              }}
              aria-label={t('delete')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <div className="flex items-center gap-2">
          <input className="input py-2" placeholder={placeholder} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <input
            className="input num w-36 shrink-0 py-2 text-right"
            inputMode="decimal"
            placeholder="₹ 0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-ghost shrink-0 px-2.5" onClick={add} aria-label={t('add')}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
