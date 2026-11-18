import { verifyToken } from './auth';
import { missingEnv, whatsappConfig } from './env';
import { bearer, readJson, send, type Req, type Res } from './http';

/**
 * The template the shop must create and get approved in Meta (WhatsApp
 * Manager → Message templates), category "Utility", name "due_reminder".
 * Body variables, in order:
 *   {{1}} customer name, {{2}} station name, {{3}} balance (e.g. 11,451.00),
 *   {{4}} UPI ID, {{5}} station contact number.
 */
export const TEMPLATE_PARAMS = ['customer', 'station', 'balance', 'upi', 'contact'] as const;

export interface SendBody {
  to: string;
  lang: 'en' | 'bn';
  params: Record<(typeof TEMPLATE_PARAMS)[number], string>;
}

/** Meta rejects empty variables and new lines / tabs inside them. */
function clean(v: unknown): string {
  const s = String(v ?? '')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
  return (s || '-').slice(0, 300);
}

export function buildPayload(body: SendBody, template: string) {
  return {
    messaging_product: 'whatsapp',
    to: body.to,
    type: 'template',
    template: {
      name: template,
      language: { code: body.lang === 'bn' ? 'bn' : 'en' },
      components: [{ type: 'body', parameters: TEMPLATE_PARAMS.map((k) => ({ type: 'text', text: clean(body.params?.[k]) })) }],
    },
  };
}

/** Turn Meta's error into something the shop owner can act on. */
export function explainMetaError(err: { code?: number; message?: string; error_data?: { details?: string } } | undefined): string {
  const code = err?.code;
  const detail = err?.error_data?.details || err?.message || 'Unknown error';
  if (code === 190) return 'WhatsApp access token is invalid or expired – update WHATSAPP_TOKEN in Vercel.';
  if (code === 132001) return 'Message template not found or not approved for this language – check the "due_reminder" template in WhatsApp Manager.';
  if (code === 132000) return 'Template variables don’t match – the template must have exactly 5 variables {{1}}…{{5}}.';
  if (code === 131026) return 'This number is not on WhatsApp or cannot receive messages.';
  if (code === 131030) return 'Test mode: add this customer’s number to the allowed recipients in Meta, or finish going live.';
  if (code === 131042) return 'Payment issue on the Meta account – add a payment method in WhatsApp Manager.';
  if (code === 131047) return 'Outside the 24-hour window – a template message is required.';
  if (code === 131056 || code === 130429) return 'Too many messages too quickly – wait a minute and try again.';
  return `WhatsApp error${code ? ` ${code}` : ''}: ${detail}`;
}

/** POST /api/whatsapp – send one due reminder through the WhatsApp Cloud API. */
export function whatsappHandler(fetchImpl: typeof fetch = fetch) {
  return async function whatsapp(req: Req, res: Res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    const missing = missingEnv();
    if (missing.length) return send(res, 503, { error: `Server not configured: set ${missing.join(', ')}` });
    if (!verifyToken(bearer(req))) return send(res, 401, { error: 'Login required' });
    const cfg = whatsappConfig();
    if (!cfg.ready) return send(res, 501, { error: 'Automatic WhatsApp is not set up – add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in Vercel.' });

    let body: SendBody;
    try {
      body = (await readJson(req)) as SendBody;
    } catch {
      return send(res, 400, { error: 'Invalid JSON' });
    }
    if (!body || typeof body.to !== 'string' || !/^\d{8,15}$/.test(body.to)) return send(res, 400, { error: 'Invalid phone number' });

    try {
      const r = await fetchImpl(`https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(body, cfg.template)),
      });
      const json = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: Parameters<typeof explainMetaError>[0] };
      if (!r.ok || json.error) return send(res, 502, { error: explainMetaError(json.error), code: json.error?.code });
      return send(res, 200, { ok: true, id: json.messages?.[0]?.id ?? null });
    } catch (e) {
      console.error('[fuel-ledger] whatsapp send failed', e);
      return send(res, 502, { error: 'Could not reach WhatsApp – try again.' });
    }
  };
}
