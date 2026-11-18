import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, Send, SkipForward, TriangleAlert, Zap } from 'lucide-react';
import { useStore } from '../lib/store';
import { customerBalances } from '../lib/compute';
import { api, ApiError } from '../lib/api';
import { buildDueMessage, normalizePhone, reminderSettings, templateParams, templatePreview, waLink } from '../lib/whatsapp';
import type { Customer, Lang } from '../lib/types';
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

type BulkResult = { id: string; name: string; status: 'sent' | 'failed' | 'skipped'; detail?: string };

/**
 * Due reminders on WhatsApp.
 * - Automatic (server has WhatsApp Cloud API keys): "Send now" sends straight
 *   from the software using the approved template – WhatsApp never opens.
 * - Otherwise: opens WhatsApp with the message ready; the user presses Send.
 * With several customers it works as a queue, and automatic mode can send to
 * everyone in one go.
 */
export function WhatsAppReminder({ customerIds, onClose }: { customerIds: string[]; onClose: () => void }) {
  const { data, update, t, toast, cloud } = useStore();
  const auto = cloud.mode === 'cloud' && cloud.waAuto;
  const [manual, setManual] = useState(!auto);
  const [idx, setIdx] = useState(0);
  const [lang, setLang] = useState<Lang>(reminderSettings(data).lang);
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bulk, setBulk] = useState<{ running: boolean; done: number; results: BulkResult[] } | null>(null);

  const customer = data.customers.find((c) => c.id === customerIds[idx]);
  const balance = useMemo(() => (customer ? customerBalances(data).get(customer.id)?.balancePaise ?? 0 : 0), [data, customer]);
  const digits = normalizePhone(phone);
  const shopDigits = normalizePhone(reminderSettings(data).stationPhone);
  const isOwnNumber = !!digits && digits === shopDigits;
  const multi = customerIds.length > 1;
  const isAuto = auto && !manual;
  const canSend = !!digits && !isOwnNumber && (isAuto || !!text.trim());

  // Fresh phone + message whenever we move to another customer or change language.
  useEffect(() => {
    if (!customer) return;
    setPhone(customer.phone);
    setText(buildDueMessage(data, customer, lang));
    setCopied(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, lang]);

  if (!customer) return null;

  const markSent = (c: Customer, phoneTyped?: string) =>
    update((d) => {
      const x = d.customers.find((y) => y.id === c.id);
      if (!x) return;
      x.lastReminderAt = new Date().toISOString();
      if (phoneTyped && phoneTyped.trim() !== x.phone) x.phone = phoneTyped.trim();
    });

  const next = () => {
    if (idx + 1 < customerIds.length) setIdx(idx + 1);
    else onClose();
  };

  /** Automatic: the server sends through WhatsApp; nothing opens. */
  const sendAuto = async () => {
    if (!canSend || !digits || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.sendWhatsApp({ to: digits, lang, params: templateParams(data, customer) });
      markSent(customer, phone);
      setSent((s) => new Set(s).add(customer.id));
      toast(`✓ ${t('waSent')} · ${customer.name}`);
      if (multi) next();
      else onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('cantReach'));
    } finally {
      setBusy(false);
    }
  };

  /** Manual: open WhatsApp with the message ready. */
  const sendManual = () => {
    if (!canSend || !digits) return;
    // Open first (browsers only allow pop-ups straight from the click).
    window.open(waLink(digits, text), '_blank', 'noopener');
    markSent(customer, phone);
    setSent((s) => new Set(s).add(customer.id));
    toast(`${t('reminderOpened')} · ${customer.name}`);
    if (multi) next();
    else onClose();
  };

  /** Automatic, everyone left in the queue, one after another. */
  const sendAll = async () => {
    const rest = customerIds.slice(idx).map((id) => data.customers.find((c) => c.id === id)).filter(Boolean) as Customer[];
    setBulk({ running: true, done: 0, results: [] });
    const results: BulkResult[] = [];
    for (const c of rest) {
      const to = normalizePhone(c.phone);
      if (!to || to === shopDigits) {
        results.push({ id: c.id, name: c.name, status: 'skipped', detail: t('noWaNumber') });
      } else {
        try {
          await api.sendWhatsApp({ to, lang, params: templateParams(data, c) });
          markSent(c);
          results.push({ id: c.id, name: c.name, status: 'sent' });
        } catch (e) {
          results.push({ id: c.id, name: c.name, status: 'failed', detail: e instanceof ApiError ? e.message : t('cantReach') });
        }
      }
      setBulk({ running: true, done: results.length, results: [...results] });
    }
    setBulk({ running: false, done: results.length, results });
    const ok = results.filter((r) => r.status === 'sent').length;
    toast(`✓ ${t('waSent')}: ${ok} / ${results.length}`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast(t('copyFailed'), 'warn');
    }
  };

  /* -------- bulk progress / summary -------- */
  if (bulk) {
    const total = customerIds.length - idx;
    return (
      <Modal
        open
        onClose={bulk.running ? () => undefined : onClose}
        title={
          <span className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#25D366]" /> {t('sendAllAuto')}
          </span>
        }
        footer={
          <button className="btn-primary" disabled={bulk.running} onClick={onClose}>
            {bulk.running ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {bulk.running ? `${bulk.done} / ${total}` : t('close')}
          </button>
        }
      >
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-sunk">
          <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${(bulk.done / Math.max(1, total)) * 100}%` }} />
        </div>
        <div className="divide-y divide-line rounded-xl border border-line">
          {bulk.results.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-semibold">{r.name}</span>
              <span className={cn('text-right text-xs font-semibold', r.status === 'sent' ? 'text-ok' : r.status === 'failed' ? 'text-bad' : 'text-warn')}>
                {r.status === 'sent' ? `✓ ${t('waSent')}` : r.status === 'failed' ? `✗ ${r.detail}` : `– ${r.detail}`}
              </span>
            </div>
          ))}
          {bulk.running && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('sending')}…
            </div>
          )}
        </div>
      </Modal>
    );
  }

  const preview = templatePreview(templateParams(data, customer), lang);

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
          {isAuto ? (
            <button className="btn-quiet mr-auto text-xs" onClick={() => setManual(true)}>
              <ExternalLink className="h-4 w-4" /> {t('openWhatsAppInstead')}
            </button>
          ) : (
            <button className="btn-quiet mr-auto" onClick={copy}>
              {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />} {copied ? t('copied') : t('copyMessage')}
            </button>
          )}
          {multi && (
            <button className="btn-ghost" onClick={next} disabled={busy}>
              <SkipForward className="h-4 w-4" /> {t('skip')}
            </button>
          )}
          {isAuto ? (
            <button className={cn('btn', WA_GREEN)} disabled={!canSend || busy} onClick={sendAuto}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {canSend ? (busy ? t('sending') : t('sendNow')) : t('addNumberToSend')}
            </button>
          ) : (
            <button className={cn('btn', WA_GREEN)} disabled={!canSend} onClick={sendManual}>
              <MessageCircle className="h-4 w-4" /> {canSend ? t('openWhatsApp') : t('addNumberToSend')}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 rounded-xl bg-warn-soft/60 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold">{customer.name}</div>
            {remindedAgo(customer.lastReminderAt, data.settings.language) && <div className="text-xs text-ink-2">{remindedAgo(customer.lastReminderAt, data.settings.language)}</div>}
            {sent.has(customer.id) && <div className="text-xs font-semibold text-ok">✓ {t('waSent')}</div>}
          </div>
          <div className="text-right">
            <div className="label mb-0">{t('balance')}</div>
            <div className="num text-xl font-bold text-warn">{rupee(balance)}</div>
          </div>
        </div>

        {/* Mode banner */}
        {isAuto ? (
          <div className="flex items-start gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-3 py-2.5 text-sm">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" />
            <span>{t('autoModeHint')}</span>
          </div>
        ) : (
          auto && (
            <button className="w-full rounded-xl border border-dashed border-line px-3 py-2 text-left text-xs text-ink-2 hover:border-ink-3" onClick={() => setManual(false)}>
              <Zap className="mr-1 inline h-3.5 w-3.5 text-[#25D366]" /> {t('backToAuto')}
            </button>
          )
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={t('whatsappNumber')} hint={digits ? (isOwnNumber ? t('ownNumberWarn') : `+${digits}`) : phone.trim() ? t('phoneInvalid') : t('phoneNeeded')}>
            <input
              className={cn('input num', ((phone.trim() && !digits) || isOwnNumber) && 'border-bad', !phone.trim() && 'border-warn ring-4 ring-warn/15')}
              inputMode="tel"
              placeholder={t('customerPhoneLabel')}
              autoFocus={!customer.phone}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
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

        {!phone.trim() && <p className="rounded-xl bg-warn-soft px-3 py-2.5 text-sm font-semibold text-warn">⚠ {t('customerNoPhone')}</p>}

        <div className="grid gap-1 rounded-xl border border-line bg-sunk/60 px-3 py-2.5 text-sm sm:grid-cols-2">
          <div>
            <span className="text-ink-3">{t('sendTo')}: </span>
            <b>{customer.name}</b> {digits && !isOwnNumber && <span className="num text-ink-2">+{digits}</span>}
          </div>
          <div>
            <span className="text-ink-3">{t('sendFrom')}: </span>
            <span className="text-ink-2">{isAuto ? t('fromBusinessNumber') : t('fromThisDevice')}</span>
          </div>
        </div>

        {isAuto ? (
          <Field label={t('message')} hint={t('templateFixedHint')}>
            <div className="whitespace-pre-wrap rounded-xl border border-line bg-sunk px-3 py-3 text-sm leading-relaxed">{preview}</div>
          </Field>
        ) : (
          <Field label={t('message')} hint={t('messageEditable')}>
            <textarea className="input min-h-[260px] font-sans text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-sm font-semibold text-bad">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {isAuto && multi && (
          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#25D366]/50 px-3 py-2.5 text-sm font-bold text-[#1da851] hover:bg-[#25D366]/10" onClick={sendAll} disabled={busy}>
            <CheckCircle2 className="h-4 w-4" /> {t('sendAllAuto')} ({customerIds.length - idx})
          </button>
        )}
      </div>
    </Modal>
  );
}
