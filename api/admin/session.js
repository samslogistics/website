// GET    /api/admin/session  -> { signedIn, meta? }
// POST   /api/admin/session  -> sign in  { password }
// DELETE /api/admin/session  -> sign out
import { checkPassword, sessionCookie, clearCookie, isAdmin } from '../../backend/lib/auth.js';
import { SERVICES, DESTINATIONS, STATUSES } from '../../backend/lib/constants.js';
import { json, methodGuard, bodyOf } from '../../backend/lib/http.js';

const meta = () => ({ services: SERVICES, destinations: Object.keys(DESTINATIONS), statuses: STATUSES });

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

    const { password } = bodyOf(req);
    if (!checkPassword(password)) {
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
