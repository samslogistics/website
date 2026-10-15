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
