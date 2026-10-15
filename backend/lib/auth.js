import crypto from 'node:crypto';
import { json } from './http.js';

const COOKIE = 'sams_admin';
const MAX_AGE_SECONDS = 8 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)');
  return s;
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ADMIN_PASSWORD is not set');
  return typeof input === 'string' && safeEqual(input, expected);
}

const cookieFlags = 'HttpOnly; Secure; SameSite=Strict; Path=/';

export function sessionCookie(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + MAX_AGE_SECONDS * 1000 })).toString('base64url');
  return `${COOKIE}=${payload}.${sign(payload)}; ${cookieFlags}; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearCookie() {
  return `${COOKIE}=; ${cookieFlags}; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers?.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function isAdmin(req, now = Date.now()) {
  try {
    const token = readCookie(req, COOKIE);
    if (!token) return false;
    const [payload, sig] = token.split('.');
    if (!payload || !sig || !safeEqual(sig, sign(payload))) return false;
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}

export function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  json(res, 401, { error: 'Not signed in' });
  return false;
}
