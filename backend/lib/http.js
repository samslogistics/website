export function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function methodGuard(req, res, allowed) {
  if (allowed.includes(req.method)) return true;
  res.setHeader('Allow', allowed.join(', '));
  json(res, 405, { error: 'Method not allowed' });
  return false;
}

// Tracking numbers: letters, digits and dashes only, 5-30 chars.
export function normalizeRef(value) {
  if (typeof value !== 'string') return null;
  const ref = value.trim().toUpperCase();
  return /^[A-Z0-9-]{5,30}$/.test(ref) ? ref : null;
}

// Trim, collapse empty to null, cap length.
export function clean(value, max = 200) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

export function bodyOf(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

export function generateRef(destinationCode) {
  let tail = '';
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) tail += REF_ALPHABET[b % REF_ALPHABET.length];
  return `SL-${destinationCode}-${tail}`;
}

export function generateRequestRef() {
  let tail = '';
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) tail += REF_ALPHABET[b % REF_ALPHABET.length];
  return `BR-${tail}`;
}

export function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return first || req.headers?.['x-real-ip'] || 'unknown';
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[0-9+()\-\s]{6,25}$/;

// 'YYYY-MM-DD' that is a real date, from yesterday up to ~13 months ahead.
export function validBookingDate(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const day = 24 * 60 * 60 * 1000;
  return d.getTime() >= now.getTime() - 2 * day && d.getTime() <= now.getTime() + 400 * day;
}

// ---- Supplies ordering ----
export function generateOrderRef() {
  let tail = '';
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) tail += REF_ALPHABET[b % REF_ALPHABET.length];
  return `SO-${tail}`;
}

// Admin price input (pounds) -> pence. Blank means "price on request" (null).
// Accepts '12', '12.5', '12.50', '£12.50'. Returns { ok: false } for anything else.
export function parsePricePence(value) {
  if (value === undefined || value === null) return { ok: true, pence: null };
  const raw = String(value).trim();
  if (raw === '') return { ok: true, pence: null };
  const s = raw.replace(/^£\s*/, '');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return { ok: false };
  return { ok: true, pence: Math.round(parseFloat(s) * 100) };
}

export const MAX_ORDER_LINES = 25;
export const MAX_LINE_QTY = 500;

// [{ id, quantity }] from the browser -> [{ id, qty }] with duplicates merged, or null if invalid.
export function parseOrderLines(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ORDER_LINES) return null;
  const merged = new Map();
  for (const it of items) {
    const id = Number(it?.id);
    const qty = Number(it?.quantity);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_LINE_QTY) return null;
    merged.set(id, Math.min((merged.get(id) || 0) + qty, MAX_LINE_QTY));
  }
  return [...merged].map(([id, qty]) => ({ id, qty }));
}

// ---- Contact form ----
export function generateMessageRef() {
  let tail = '';
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) tail += REF_ALPHABET[b % REF_ALPHABET.length];
  return `MS-${tail}`;
}
