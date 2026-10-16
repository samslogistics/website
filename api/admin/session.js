// GET    /api/admin/session  -> { signedIn, meta? }
// POST   /api/admin/session  -> sign in  { password }
// DELETE /api/admin/session  -> sign out
import { checkPassword, sessionCookie, clearCookie, isAdmin } from '../../backend/lib/auth.js';
import { SERVICES, DESTINATIONS, STATUSES, SUPPLY_CATEGORIES } from '../../backend/lib/constants.js';
import crypto from 'node:crypto';
import { db } from '../../backend/lib/db.js';
import { json, methodGuard, bodyOf, clientIp } from '../../backend/lib/http.js';

const MAX_FAILURES = 8;      // wrong passwords allowed per visitor...
const WINDOW_MINUTES = 15;   // ...within this many minutes

const ipHashOf = (req) =>
  crypto.createHash('sha256').update(`${clientIp(req)}|${process.env.SESSION_SECRET || ''}`).digest('hex');

// Login throttling is best effort: if the database cannot be reached, the owner is never locked out.
async function tooManyFailures(ipHash) {
  try {
    const rows = await db()`
      SELECT count(*)::int AS n FROM admin_login_failures
      WHERE ip_hash = ${ipHash} AND created_at > now() - make_interval(mins => ${WINDOW_MINUTES})`;
    return rows[0].n >= MAX_FAILURES;
  } catch (err) {
    console.error('login throttle check failed', err?.message);
    return false;
  }
}

async function recordFailure(ipHash) {
  try {
    const sql = db();
    await sql`INSERT INTO admin_login_failures (ip_hash) VALUES (${ipHash})`;
    await sql`DELETE FROM admin_login_failures WHERE created_at < now() - interval '1 day'`;
  } catch (err) {
    console.error('login failure record failed', err?.message);
  }
}

const meta = () => ({
  services: SERVICES,
  destinations: Object.keys(DESTINATIONS),
  statuses: STATUSES,
  supplyCategories: SUPPLY_CATEGORIES,
});

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return;

  try {
    if (req.method === 'GET') {
      return isAdmin(req) ? json(res, 200, { signedIn: true, meta: meta() }) : json(res, 200, { signedIn: false });
    }

    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', clearCookie());
      return json(res, 200, { signedIn: false });
    }

    const ipHash = ipHashOf(req);
    if (await tooManyFailures(ipHash)) {
      return json(res, 429, { error: 'Too many wrong attempts. Please wait 15 minutes and try again.' });
    }

    const { password } = bodyOf(req);
    if (!checkPassword(password)) {
      await recordFailure(ipHash);
      await new Promise((r) => setTimeout(r, 800)); // slow down guessing
      return json(res, 401, { error: 'Incorrect password.' });
    }
    res.setHeader('Set-Cookie', sessionCookie());
    return json(res, 200, { signedIn: true, meta: meta() });
  } catch (err) {
    console.error('session failed', err);
    return json(res, 500, { error: 'Server is not configured correctly.' });
  }
}
