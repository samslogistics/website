// GET  /api/admin/shipments?q=text&offset=0  -> shipments, 25 per page, newest first, plus the total
// POST /api/admin/shipments         -> create shipment + first event
import { db } from '../../backend/lib/db.js';
import { requireAdmin } from '../../backend/lib/auth.js';
import { SERVICES, DESTINATIONS } from '../../backend/lib/constants.js';
import { json, methodGuard, bodyOf, clean, generateRef, listParams } from '../../backend/lib/http.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const sql = db();
      const { like, offset, limit } = listParams(req);
      const rows = await sql`
        SELECT tracking_ref, service, destination, customer_name, receiver_name, status, created_at, updated_at
        FROM shipments
        WHERE (${like}::text IS NULL OR tracking_ref ILIKE ${like} OR customer_name ILIKE ${like}
               OR receiver_name ILIKE ${like} OR customer_email ILIKE ${like} OR customer_phone ILIKE ${like})
        ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`;
      const t = await sql`
        SELECT count(*)::int AS n FROM shipments
        WHERE (${like}::text IS NULL OR tracking_ref ILIKE ${like} OR customer_name ILIKE ${like}
               OR receiver_name ILIKE ${like} OR customer_email ILIKE ${like} OR customer_phone ILIKE ${like})`;
      return json(res, 200, { shipments: rows, total: t[0].n });
    }

    const b = bodyOf(req);
    const service = clean(b.service, 40);
    const destination = clean(b.destination, 40);
    const customerName = clean(b.customerName, 120);
    if (!SERVICES[service]) return json(res, 400, { error: 'Choose a valid service.' });
    if (!DESTINATIONS[destination]) return json(res, 400, { error: 'Choose a valid destination.' });
    if (!customerName) return json(res, 400, { error: 'Customer name is required.' });

    const fields = {
      email: clean(b.customerEmail, 160),
      phone: clean(b.customerPhone, 40),
      receiver: clean(b.receiverName, 120),
      description: clean(b.description, 500),
      location: clean(b.location, 120) || 'UK',
    };

    const sql = db();
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = generateRef(DESTINATIONS[destination]);
      try {
        await sql`
          WITH s AS (
            INSERT INTO shipments (tracking_ref, service, destination, customer_name, customer_email, customer_phone, receiver_name, description)
            VALUES (${ref}, ${service}, ${destination}, ${customerName}, ${fields.email}, ${fields.phone}, ${fields.receiver}, ${fields.description})
            RETURNING id
          )
          INSERT INTO shipment_events (shipment_id, status, location, note)
          SELECT id, 'Order received', ${fields.location}, 'Your order has been received and is being processed.' FROM s`;
        return json(res, 201, { ref });
      } catch (err) {
        if (err?.code !== '23505') throw err; // only retry on duplicate tracking number
      }
    }
    return json(res, 500, { error: 'Could not generate a unique tracking number. Please try again.' });
  } catch (err) {
    console.error('shipments failed', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
