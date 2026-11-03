import { useState } from 'react';
import { Plus, X } from 'lucide-react';
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
}: {
  title: string;
  icon: React.ReactNode;
  entries: Entry[];
  onChange: (next: Entry[]) => void;
  disabled?: boolean;
  accent?: string;
}) {
  const { t } = useStore();
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const total = sumPaise(entries);
  const add = () => {
    if (!text.trim()) return;
    const amounts = splitAmounts(text);
    if (!amounts || !amounts.length) {
      setBad(true);
      return;
    }
    onChange([...entries, ...amounts.map((a) => ({ id: uid(), amountPaise: a }))]);
    setText('');
    setBad(false);
  };
  return (
    <div className="rounded-xl border border-line bg-sunk/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className={cn('grid h-7 w-7 place-items-center rounded-lg text-white', accent)}>{icon}</span>
          {title}
        </div>
        <div className="text-right">
          <div className="num text-base font-bold">{rupee(total)}</div>
          <div className="text-[11px] text-ink-3">
            {entries.length} {t('entries')}
          </div>
        </div>
      </div>
      {entries.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <span key={e.id} className="num group inline-flex items-center gap-1 rounded-lg border border-line bg-surface py-1 pl-2 pr-1 text-[13px] font-semibold">
              {rupee(e.amountPaise, { symbol: false })}
              {!disabled && (
                <button
                  onClick={() => onChange(entries.filter((x) => x.id !== e.id))}
                  className="rounded p-0.5 text-ink-3 hover:bg-bad-soft hover:text-bad"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <input
            className={cn('input num py-2', bad && 'border-bad')}
            inputMode="decimal"
            placeholder="1160+114+500"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            aria-label={title}
          />
          <button className="btn-ghost shrink-0 px-3" onClick={add} aria-label={t('add')}>
            <Plus className="h-4 w-4" />
          </button>
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
  const { t } = useStore();
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
            <button className="btn-quiet shrink-0 px-2 hover:text-bad" onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label={t('delete')}>
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
