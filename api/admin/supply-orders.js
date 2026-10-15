// Admin supply orders.
// GET  /api/admin/supply-orders?status=new|confirmed|completed|cancelled|all -> list (max 100) + count of new
// POST /api/admin/supply-orders  { id, action: 'confirm' | 'complete' | 'cancel' }
//   confirm:  new -> confirmed
//   complete: new or confirmed -> completed
//   cancel:   new or confirmed -> cancelled
import { db } from '../../backend/lib/db.js';
import { requireAdmin } from '../../backend/lib/auth.js';
import { json, methodGuard, bodyOf } from '../../backend/lib/http.js';

const FILTERS = ['new', 'confirmed', 'completed', 'cancelled', 'all'];
const ACTIONS = ['confirm', 'complete', 'cancel'];

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const sql = db();
      const status = FILTERS.includes(req.query?.status) ? req.query.status : 'new';
      const rows = await sql`
        SELECT o.id, o.reference, o.customer_name, o.customer_phone, o.customer_email,
               o.fulfilment, o.address, o.note, o.status, o.created_at, o.handled_at,
               COALESCE((
                 SELECT json_agg(json_build_object(
                          'name', l.name, 'quantity', l.quantity, 'unitPricePence', l.unit_price_pence
                        ) ORDER BY l.id)
                 FROM supply_order_items l WHERE l.order_id = o.id
               ), '[]'::json) AS lines
        FROM supply_orders o
        WHERE (${status} = 'all' OR o.status = ${status})
        ORDER BY o.created_at DESC LIMIT 100`;
      const counts = await sql`SELECT count(*)::int AS n FROM supply_orders WHERE status = 'new'`;
      return json(res, 200, { orders: rows, newCount: counts[0].n });
    }

    const b = bodyOf(req);
    const id = Number(b.id);
    if (!Number.isSafeInteger(id) || id < 1) return json(res, 400, { error: 'Invalid order id.' });
    if (!ACTIONS.includes(b.action)) return json(res, 400, { error: 'Invalid action.' });

    const sql = db();
    let rows;
    if (b.action === 'confirm') {
      rows = await sql`
        UPDATE supply_orders SET status = 'confirmed', handled_at = now()
        WHERE id = ${id} AND status = 'new' RETURNING id`;
    } else if (b.action === 'complete') {
      rows = await sql`
        UPDATE supply_orders SET status = 'completed', handled_at = now()
        WHERE id = ${id} AND status IN ('new', 'confirmed') RETURNING id`;
    } else {
      rows = await sql`
        UPDATE supply_orders SET status = 'cancelled', handled_at = now()
        WHERE id = ${id} AND status IN ('new', 'confirmed') RETURNING id`;
    }
    if (!rows.length) return json(res, 409, { error: 'This order was already handled or no longer exists.' });
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('supply orders failed', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
