// GET  /api/admin/bookings?status=new|accepted|declined|all  -> list (max 100) + count of new
// POST /api/admin/bookings  { id, action: 'accept' | 'decline', location? }
//   accept  -> creates a shipment (tracking number) from the request, atomically
//   decline -> marks the request declined
// DELETE /api/admin/bookings?id=123 -> remove a request (an accepted request's shipment is kept)
import { db } from '../../backend/lib/db.js';
import { requireAdmin } from '../../backend/lib/auth.js';
import { DESTINATIONS } from '../../backend/lib/constants.js';
import { json, methodGuard, bodyOf, clean, generateRef } from '../../backend/lib/http.js';
import { emailBookingAccepted, emailBookingDeclined } from '../../backend/lib/customerMail.js';

// Customer email after the owner's decision. Never throws; reports 'sent' | 'skipped' | 'failed'.
async function tellCustomer(sql, id, send, extra = {}) {
  try {
    const r = await sql`
      SELECT reference, service, destination, customer_name, customer_email
      FROM booking_requests WHERE id = ${id}`;
    if (!r.length) return 'skipped';
    const x = r[0];
    return await send({
      reference: x.reference, service: x.service, destination: x.destination,
      name: x.customer_name, email: x.customer_email, ...extra,
    });
  } catch (err) {
    console.error('booking customer email failed', err?.message);
    return 'failed';
  }
}

const FILTERS = ['new', 'accepted', 'declined', 'all'];

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') {
      const status = FILTERS.includes(req.query?.status) ? req.query.status : 'new';
      const sql = db();
      const rows = status === 'all'
        ? await sql`
            SELECT id, reference, service, destination, customer_name, customer_email, customer_phone,
                   pickup_address, delivery_address, preferred_date, description, status, shipment_ref,
                   created_at, handled_at
            FROM booking_requests ORDER BY created_at DESC LIMIT 100`
        : await sql`
            SELECT id, reference, service, destination, customer_name, customer_email, customer_phone,
                   pickup_address, delivery_address, preferred_date, description, status, shipment_ref,
                   created_at, handled_at
            FROM booking_requests WHERE status = ${status} ORDER BY created_at DESC LIMIT 100`;
      const counts = await sql`SELECT count(*)::int AS n FROM booking_requests WHERE status = 'new'`;
      return json(res, 200, { requests: rows, newCount: counts[0].n });
    }

    if (req.method === 'DELETE') {
      const did = Number(req.query?.id);
      if (!Number.isSafeInteger(did) || did < 1) return json(res, 400, { error: 'Invalid request id.' });
      const gone = await db()`DELETE FROM booking_requests WHERE id = ${did} RETURNING id`;
      if (!gone.length) return json(res, 404, { error: 'Request not found.' });
      return json(res, 200, { ok: true });
    }

    const b = bodyOf(req);
    const id = Number(b.id);
    if (!Number.isSafeInteger(id) || id < 1) return json(res, 400, { error: 'Invalid request id.' });
    if (b.action !== 'accept' && b.action !== 'decline') return json(res, 400, { error: 'Invalid action.' });

    const sql = db();

    if (b.action === 'decline') {
      const rows = await sql`
        UPDATE booking_requests SET status = 'declined', handled_at = now()
        WHERE id = ${id} AND status = 'new' RETURNING id`;
      if (!rows.length) return json(res, 409, { error: 'This request was already handled or no longer exists.' });
      const emailed = await tellCustomer(sql, id, emailBookingDeclined);
      return json(res, 200, { ok: true, emailed });
    }

    const location = clean(b.location, 120) || 'UK';
    const dest = await sql`SELECT destination FROM booking_requests WHERE id = ${id}`;
    if (!dest.length) return json(res, 404, { error: 'Request not found.' });
    const code = DESTINATIONS[dest[0].destination] || 'UK';

    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = generateRef(code);
      try {
        const rows = await sql`
          WITH b AS (
            UPDATE booking_requests
            SET status = 'accepted', shipment_ref = ${ref}, handled_at = now()
            WHERE id = ${id} AND status = 'new'
            RETURNING *
          ), s AS (
            INSERT INTO shipments (tracking_ref, service, destination, customer_name, customer_email, customer_phone, description)
            SELECT ${ref}, service, destination, customer_name, customer_email, customer_phone,
                   left(concat_ws(chr(10),
                     'Booking ' || reference,
                     'From: ' || pickup_address,
                     'To: ' || delivery_address,
                     CASE WHEN preferred_date IS NOT NULL THEN 'Preferred date: ' || preferred_date::text END,
                     description), 900)
            FROM b
            RETURNING id
          )
          INSERT INTO shipment_events (shipment_id, status, location, note)
          SELECT id, 'Order received', ${location}, 'Your booking has been accepted and is being processed.' FROM s
          RETURNING shipment_id`;
        if (!rows.length) return json(res, 409, { error: 'This request was already handled or no longer exists.' });
        const emailed = await tellCustomer(sql, id, emailBookingAccepted, { trackingRef: ref });
        return json(res, 200, { ok: true, shipmentRef: ref, emailed });
      } catch (err) {
        if (err?.code !== '23505') throw err; // retry only on duplicate tracking number
      }
    }
    return json(res, 500, { error: 'Could not generate a unique tracking number. Please try again.' });
  } catch (err) {
    console.error('bookings failed', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
