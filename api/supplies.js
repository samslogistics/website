// Public endpoint for the supplies shop:
//   GET  /api/supplies  -> the active catalogue
//   POST /api/supplies  -> place an order request (pay later; the owner confirms by phone/WhatsApp)
import crypto from 'node:crypto';
import { db } from '../backend/lib/db.js';
import { FULFILMENT } from '../backend/lib/constants.js';
import {
  json, methodGuard, bodyOf, clean, clientIp, generateOrderRef, parseOrderLines,
  EMAIL_RE, PHONE_RE,
} from '../backend/lib/http.js';
import { alertSupplyOrder } from '../backend/lib/notify.js';

const MAX_PER_HOUR = 5; // per visitor (salted IP hash)

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  return req.method === 'GET' ? listItems(res) : placeOrder(req, res);
}

async function listItems(res) {
  try {
    const rows = await db()`
      SELECT id, name, category, description, unit, price_pence
      FROM supply_items WHERE active ORDER BY sort_order, id`;
    return json(res, 200, {
      items: rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        category: r.category,
        description: r.description,
        unit: r.unit,
        pricePence: r.price_pence === null ? null : Number(r.price_pence),
      })),
    });
  } catch (err) {
    console.error('supplies list failed', err);
    return json(res, 500, { error: 'Products are temporarily unavailable. Please call us to order.' });
  }
}

async function placeOrder(req, res) {
  const b = bodyOf(req);

  // Honeypot: real visitors never see or fill this field. Pretend success, store nothing.
  if (clean(b.website, 200)) return json(res, 201, { reference: generateOrderRef() });

  const name = clean(b.name, 120);
  const phone = clean(b.phone, 40);
  const email = clean(b.email, 160);
  const fulfilment = clean(b.fulfilment, 20);
  const address = clean(b.address, 300);
  const note = clean(b.note, 1000);
  const lines = parseOrderLines(b.items);

  if (!lines) return json(res, 400, { error: 'Please choose at least one item.' });
  if (!name) return json(res, 400, { error: 'Please enter your name.' });
  if (!phone || !PHONE_RE.test(phone)) return json(res, 400, { error: 'Please enter a valid phone number.' });
  if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'Please enter a valid email address.' });
  if (!FULFILMENT[fulfilment]) return json(res, 400, { error: 'Please choose delivery or collection.' });
  if (fulfilment === 'delivery' && !address) return json(res, 400, { error: 'Please enter the delivery address.' });
  if (b.consent !== true) return json(res, 400, { error: 'Please accept the privacy policy to continue.' });

  try {
    const sql = db();
    const ipHash = crypto
      .createHash('sha256')
      .update(`${clientIp(req)}|${process.env.SESSION_SECRET || ''}`)
      .digest('hex');

    const recent = await sql`
      SELECT count(*)::int AS n FROM supply_orders
      WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 hour'`;
    if (recent[0].n >= MAX_PER_HOUR) {
      return json(res, 429, { error: 'Too many requests. Please try again later or call us.' });
    }

    const wanted = JSON.stringify(lines);
    const deliveryAddress = fulfilment === 'delivery' ? address : null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = generateOrderRef();
      try {
        // One statement = all or nothing. Names and prices come from the database (never from the
        // browser) and are copied onto the order lines. If any chosen item is missing or hidden,
        // no order is created.
        const rows = await sql`
          WITH valid AS (
            SELECT i.id, i.name, i.price_pence, i.sort_order, l.qty
            FROM jsonb_to_recordset(${wanted}::jsonb) AS l(id bigint, qty int)
            JOIN supply_items i ON i.id = l.id AND i.active
          ), o AS (
            INSERT INTO supply_orders
              (reference, customer_name, customer_phone, customer_email, fulfilment, address, note, ip_hash)
            SELECT ${reference}, ${name}, ${phone}, ${email}, ${fulfilment}, ${deliveryAddress}, ${note}, ${ipHash}
            WHERE (SELECT count(*) FROM valid) = ${lines.length}
            RETURNING id
          )
          INSERT INTO supply_order_items (order_id, item_id, name, unit_price_pence, quantity)
          SELECT o.id, v.id, v.name, v.price_pence, v.qty FROM o CROSS JOIN valid v
          ORDER BY v.sort_order, v.id
          RETURNING order_id, name, unit_price_pence, quantity`;
        if (!rows.length) {
          return json(res, 400, { error: 'Some items are no longer available. Please refresh the page and try again.' });
        }
        // Tell the owner (email / WhatsApp). Never throws, never blocks the customer's order.
        await alertSupplyOrder({
          reference, name, phone, email, fulfilment, address: deliveryAddress, note,
          items: rows.map((r) => ({
            name: r.name,
            qty: Number(r.quantity),
            unitPricePence: r.unit_price_pence === null ? null : Number(r.unit_price_pence),
          })),
        });
        return json(res, 201, { reference });
      } catch (err) {
        if (err?.code !== '23505') throw err; // retry only on duplicate reference
      }
    }
    return json(res, 500, { error: 'Could not save your order. Please try again.' });
  } catch (err) {
    console.error('supply order failed', err);
    return json(res, 500, { error: 'Something went wrong. Please try again or call us.' });
  }
}
