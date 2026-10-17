// GET    /api/admin/shipment?ref=...  -> full details incl. customer info + events
// POST   /api/admin/shipment          -> add a status update { ref, status, location?, note?, notify? }
//                                        notify: true also emails the customer (if they have an email)
// DELETE /api/admin/shipment?ref=...  -> delete a shipment (and its events)
import { db } from '../../backend/lib/db.js';
import { requireAdmin } from '../../backend/lib/auth.js';
import { STATUSES } from '../../backend/lib/constants.js';
import { json, methodGuard, bodyOf, clean, normalizeRef } from '../../backend/lib/http.js';
import { emailStatusUpdate } from '../../backend/lib/customerMail.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST', 'DELETE'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'POST') {
      const b = bodyOf(req);
      const ref = normalizeRef(b.ref);
      const status = clean(b.status, 60);
      if (!ref) return json(res, 400, { error: 'Invalid tracking number.' });
      if (!STATUSES.includes(status)) return json(res, 400, { error: 'Choose a valid status.' });
      const location = clean(b.location, 120);
      const note = clean(b.note, 500);

      const sql = db();
      const rows = await sql`
        WITH s AS (
          UPDATE shipments SET status = ${status}, updated_at = now()
          WHERE tracking_ref = ${ref} RETURNING id
        )
        INSERT INTO shipment_events (shipment_id, status, location, note)
        SELECT id, ${status}, ${location}, ${note} FROM s RETURNING id`;
      if (!rows.length) return json(res, 404, { error: 'Shipment not found.' });

      // Optional customer email. A problem here never undoes the saved update.
      let emailed = 'not requested';
      if (b.notify === true) {
        try {
          const c = await sql`SELECT customer_name, customer_email FROM shipments WHERE tracking_ref = ${ref}`;
          emailed = c.length
            ? await emailStatusUpdate({ trackingRef: ref, status, location, note, name: c[0].customer_name, email: c[0].customer_email })
            : 'skipped';
        } catch (err) {
          console.error('status customer email failed', err?.message);
          emailed = 'failed';
        }
      }
      return json(res, 200, { ok: true, emailed });
    }

    const ref = normalizeRef(req.query?.ref);
    if (!ref) return json(res, 400, { error: 'Invalid tracking number.' });

    const sql = db();
    if (req.method === 'DELETE') {
      const rows = await sql`DELETE FROM shipments WHERE tracking_ref = ${ref} RETURNING id`;
      if (!rows.length) return json(res, 404, { error: 'Shipment not found.' });
      return json(res, 200, { ok: true });
    }

    const rows = await sql`SELECT * FROM shipments WHERE tracking_ref = ${ref}`;
    if (!rows.length) return json(res, 404, { error: 'Shipment not found.' });
    const s = rows[0];
    const events = await sql`
      SELECT status, location, note, created_at FROM shipment_events
      WHERE shipment_id = ${s.id} ORDER BY created_at DESC, id DESC`;
    const { id, ...shipment } = s;
    return json(res, 200, { shipment, events });
  } catch (err) {
    console.error('shipment failed', err);
    return json(res, 500, { error: 'Something went wrong.' });
  }
}
