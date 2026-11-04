import type { IncomingMessage, ServerResponse } from 'http';

/** Minimal shape of the Vercel Node request/response helpers we rely on. */
export interface Req extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}
export type Res = ServerResponse;

export function send(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Vercel parses JSON bodies for us; fall back to reading the stream (local tests). */
export async function readJson(req: Req): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function queryParam(req: Req, name: string): string | undefined {
  const fromQuery = req.query?.[name];
  if (typeof fromQuery === 'string') return fromQuery;
  const url = new URL(req.url ?? '/', 'http://local');
  return url.searchParams.get(name) ?? undefined;
}

export function bearer(req: Req): string | undefined {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7) : undefined;
}
