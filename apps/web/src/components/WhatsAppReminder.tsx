import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, MessageCircle, SkipForward } from 'lucide-react';
import { useStore } from '../lib/store';
import { customerBalances } from '../lib/compute';
import { buildDueMessage, normalizePhone, reminderSettings, waLink } from '../lib/whatsapp';
import type { Lang } from '../lib/types';
import { cn, rupee } from '../lib/util';
import { Field, Modal, Segmented } from './ui';

/** WhatsApp's own green, for the send button. */
export const WA_GREEN = 'bg-[#25D366] text-white hover:brightness-95';

/** "Reminded 3 days ago" style text. */
export function remindedAgo(iso: string | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (lang === 'bn') return days <= 0 ? 'আজ মনে করানো হয়েছে' : `${days} দিন আগে মনে করানো হয়েছে`;
  return days <= 0 ? 'Reminded today' : days === 1 ? 'Reminded yesterday' : `Reminded ${days} days ago`;
}

/**
 * Prepare and send WhatsApp due reminders. With several customers it works
 * as a queue: send → next → send, so the shop can remind everyone in a row.
 */
export function WhatsAppReminder({ customerIds, onClose }: { customerIds: string[]; onClose: () => void }) {
  const { data, update, t, toast } = useStore();
  const [idx, setIdx] = useState(0);
  const [lang, setLang] = useState<Lang>(reminderSettings(data).lang);
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const customer = data.customers.find((c) => c.id === customerIds[idx]);
  const balance = useMemo(() => (customer ? customerBalances(data).get(customer.id)?.balancePaise ?? 0 : 0), [data, customer]);
  const digits = normalizePhone(phone);
  const multi = customerIds.length > 1;

  // Fresh phone + message whenever we move to another customer or change language.
  useEffect(() => {
    if (!customer) return;
    setPhone(customer.phone);
    setText(buildDueMessage(data, customer, lang));
    setCopied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, lang]);

  if (!customer) return null;

  const next = () => {
    if (idx + 1 < customerIds.length) setIdx(idx + 1);
    else onClose();
  };

  const send = () => {
    if (!digits) return;
    // Open first (browsers only allow pop-ups straight from the click).
    window.open(waLink(digits, text), '_blank', 'noopener');
    update((d) => {
      const c = d.customers.find((x) => x.id === customer.id);
      if (!c) return;
      c.lastReminderAt = new Date().toISOString();
      if (phone.trim() && phone.trim() !== c.phone) c.phone = phone.trim();
    });
    setSent((s) => new Set(s).add(customer.id));
    toast(`${t('reminderOpened')} · ${customer.name}`);
    if (multi) next();
    else onClose();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast(t('copyFailed'), 'warn');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className={cn('grid h-7 w-7 place-items-center rounded-full', WA_GREEN)}>
            <MessageCircle className="h-4 w-4" />
          </span>
          {t('waReminder')}
          {multi && (
            <span className="num ml-1 text-sm font-semibold text-ink-3">
              {idx + 1} / {customerIds.length}
            </span>
          )}
        </span>
      }
      footer={
        <>
          <button className="btn-quiet mr-auto" onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />} {copied ? t('copied') : t('copyMessage')}
          </button>
          {multi && (
            <button className="btn-ghost" onClick={next}>
              <SkipForward className="h-4 w-4" /> {t('skip')}
            </button>
          )}
          <button className={cn('btn', WA_GREEN)} disabled={!digits || !text.trim()} onClick={send}>
            <MessageCircle className="h-4 w-4" /> {t('openWhatsApp')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-xl bg-warn-soft/60 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold">{customer.name}</div>
            {remindedAgo(customer.lastReminderAt, data.settings.language) && <div className="text-xs text-ink-2">{remindedAgo(customer.lastReminderAt, data.settings.language)}</div>}
            {sent.has(customer.id) && <div className="text-xs font-semibold text-ok">✓ {t('reminderOpened')}</div>}
          </div>
          <div className="text-right">
            <div className="label mb-0">{t('balance')}</div>
            <div className="num text-xl font-bold text-warn">{rupee(balance)}</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={t('whatsappNumber')} hint={digits ? `+${digits}` : phone.trim() ? t('phoneInvalid') : t('phoneNeeded')}>
            <input className={cn('input num', phone.trim() && !digits && 'border-bad')} inputMode="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <div>
            <span className="label">{t('messageLanguage')}</span>
            <Segmented
              value={lang}
              onChange={setLang}
              options={[
                { value: 'en', label: 'English' },
                { value: 'bn', label: 'বাংলা' },
              ]}
            />
          </div>
        </div>

        <Field label={t('message')} hint={t('messageEditable')}>
          <textarea className="input min-h-[260px] font-sans text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
