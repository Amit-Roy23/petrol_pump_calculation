import { customerBalances, customerLedger } from './compute';
import type { AppData, Customer, Lang, ReminderSettings } from './types';
import { dateLabel, rupee } from './util';

export function reminderSettings(data: AppData): ReminderSettings {
  return data.settings.reminders ?? { stationPhone: '', upiId: '', lang: data.settings.language };
}

/**
 * Turns what people type into the international digits WhatsApp needs.
 *  "98765 43210", "098765-43210", "+91 98765 43210" → "919876543210"
 * Returns null if it can't be a valid number.
 */
export function normalizePhone(raw: string): string | null {
  const hasPlus = raw.trim().startsWith('+');
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (!hasPlus) {
    d = d.replace(/^0+/, '');
    // Indian mobile: 10 digits starting 6–9.
    if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
    if (/^91[6-9]\d{9}$/.test(d)) return d;
    return null;
  }
  // International number typed with +country code.
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** Click-to-chat link: opens WhatsApp with the message ready to send. */
export function waLink(phoneDigits: string, text: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

const T = {
  en: {
    greet: (n: string) => `Namaskar ${n},`,
    intro: (s: string) => `This is a friendly reminder from *${s}* about your due (credit) amount.`,
    balance: 'Outstanding balance',
    recent: 'Recent credit',
    lastPaid: 'Last payment',
    ask: 'Please clear the amount at your earliest convenience. You can pay at the pump in cash or by UPI.',
    upi: 'UPI ID',
    thanks: 'Thank you 🙏',
    contact: 'Contact',
    machine: 'Machine',
    more: (n: number) => `…and ${n} more`,
  },
  bn: {
    greet: (n: string) => `নমস্কার ${n},`,
    intro: (s: string) => `*${s}* থেকে আপনার বাকি টাকার কথা মনে করিয়ে দিচ্ছি।`,
    balance: 'মোট বাকি',
    recent: 'সাম্প্রতিক বাকি',
    lastPaid: 'শেষ জমা',
    ask: 'অনুগ্রহ করে যত তাড়াতাড়ি সম্ভব টাকাটা মিটিয়ে দিন। পাম্পে নগদ বা ইউপিআই-তে দিতে পারেন।',
    upi: 'ইউপিআই আইডি',
    thanks: 'ধন্যবাদ 🙏',
    contact: 'যোগাযোগ',
    machine: 'মেশিন',
    more: (n: number) => `…আরও ${n}টি`,
  },
} as const;

/** The reminder text for one customer, in the chosen language. */
export function buildDueMessage(data: AppData, customer: Customer, lang: Lang = reminderSettings(data).lang): string {
  const L = T[lang];
  const rs = reminderSettings(data);
  const bal = customerBalances(data).get(customer.id)?.balancePaise ?? 0;
  const ledger = customerLedger(data, customer.id);
  const credits = ledger.filter((l) => l.kind === 'sale');
  const lastReceipt = [...ledger].reverse().find((l) => l.kind === 'receipt');
  const recent = credits.slice(-5).reverse();

  const lines: string[] = [L.greet(customer.name), '', L.intro(data.settings.stationName), '', `💰 *${L.balance}: ${rupee(bal)}*`];
  if (recent.length) {
    lines.push('', `${L.recent}:`);
    for (const c of recent) {
      lines.push(`• ${dateLabel(c.date, lang, 'short')} – ${rupee(c.amountPaise)}${c.machine ? ` (${L.machine} ${c.machine})` : ''}${c.note ? ` · ${c.note}` : ''}`);
    }
    if (credits.length > recent.length) lines.push(L.more(credits.length - recent.length));
  }
  if (lastReceipt) lines.push('', `${L.lastPaid}: ${rupee(lastReceipt.amountPaise)} (${dateLabel(lastReceipt.date, lang, 'short')})`);
  lines.push('', L.ask);
  if (rs.upiId.trim()) lines.push(`${L.upi}: *${rs.upiId.trim()}*`);
  lines.push('', L.thanks, data.settings.stationName);
  if (rs.stationPhone.trim()) lines.push(`${L.contact}: ${rs.stationPhone.trim()}`);
  return lines.join('\n');
}

/** Values for the approved "due_reminder" template ({{1}}…{{5}}). */
export function templateParams(data: AppData, customer: Customer) {
  const rs = reminderSettings(data);
  const bal = customerBalances(data).get(customer.id)?.balancePaise ?? 0;
  return {
    customer: customer.name.trim(),
    station: data.settings.stationName.trim(),
    balance: rupee(bal, { symbol: false }),
    upi: rs.upiId.trim() || '-',
    contact: rs.stationPhone.trim() || '-',
  };
}

/**
 * The template wording to submit to Meta – shown in the app as a preview and
 * in docs/WHATSAPP_SETUP.md. Keep both in step.
 */
export const TEMPLATE_TEXT: Record<Lang, string> = {
  en: 'Namaskar {{1}}, this is a reminder from {{2}} about your due (credit) amount. Outstanding balance: Rs. {{3}}. Please pay at the pump in cash or by UPI ({{4}}). For any query call {{5}}. Thank you.',
  bn: 'নমস্কার {{1}}, {{2}} থেকে আপনার বাকি টাকার কথা মনে করিয়ে দিচ্ছি। মোট বাকি: Rs. {{3}}। অনুগ্রহ করে পাম্পে নগদ বা ইউপিআই ({{4}})-তে টাকা দিন। কোনো প্রশ্নে ফোন করুন {{5}}। ধন্যবাদ।',
};

export function templatePreview(params: ReturnType<typeof templateParams>, lang: Lang): string {
  const vals = [params.customer, params.station, params.balance, params.upi, params.contact];
  return TEMPLATE_TEXT[lang].replace(/\{\{(\d)\}\}/g, (_, n) => vals[Number(n) - 1] ?? '');
}
