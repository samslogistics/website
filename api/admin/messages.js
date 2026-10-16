// Admin contact-form messages.
// GET  /api/admin/messages?status=new|handled|all -> list (max 100) + count of new
// POST /api/admin/messages  { id, action: 'handle' | 'reopen' | 'delete' }
//   handle: new -> handled   reopen: handled -> new   delete: removes the message for good
import { db } from '../../backend/lib/db.js';
import { requireAdmin } from '../../backend/lib/auth.js';
import { json, methodGuard, bodyOf } from '../../backend/lib/http.js';

const FILTERS = ['new', 'handled', 'all'];
const ACTIONS = ['handle', 'reopen', 'delete'];

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const sql = db();
      const status = FILTERS.includes(req.query?.status) ? req.query.status : 'new';
      const rows = await sql`
        SELECT id, reference, customer_name, customer_email, customer_phone, service, message,
               status, created_at, handled_at
        FROM contact_messages
        WHERE (${status} = 'all' OR status = ${status})
        ORDER BY created_at DESC LIMIT 100`;
      const counts = await sql`SELECT count(*)::int AS n FROM contact_messages WHERE status = 'new'`;
      return json(res, 200, { messages: rows, newCount: counts[0].n });
    }

    const b = bodyOf(req);
    const id = Number(b.id);
    if (!Number.isSafeInteger(id) || id < 1) return json(res, 400, { error: 'Invalid message id.' });
    if (!ACTIONS.includes(b.action)) return json(res, 400, { error: 'Invalid action.' });

    const sql = db();
    let rows;
    if (b.action === 'handle') {
      rows = await sql`
        UPDATE contact_messages SET status = 'handled', handled_at = now()
        WHERE id = ${id} AND status = 'new' RETURNING id`;
    } else if (b.action === 'reopen') {
      rows = await sql`
        UPDATE contact_messages SET status = 'new', handled_at = NULL
        WHERE id = ${id} AND status = 'handled' RETURNING id`;
    } else {
      rows = await sql`DELETE FROM contact_messages WHERE id = ${id} RETURNING id`;
    }
    if (!rows.length) return json(res, 409, { error: 'This message was already updated or no longer exists.' });
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('messages failed', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
