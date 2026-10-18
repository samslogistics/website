# Sam's Logistics UK

Static site (HTML + compiled Tailwind CSS) with a small backend on **Vercel serverless functions + Neon Postgres**.

## Structure

```
index.html, *.html          public pages
admin.html                  admin dashboard (password protected, noindex)
frontend/styles|scripts     CSS and browser JS (tailwind.css [built], global_style.css, global_script.js, admin.js)
assets/                     images, icons
api/                        Vercel function entry points (URL = /api/...)
  track.js                  public: GET /api/track?ref=SL-GH-XXXXXX
  admin/session.js          login / logout / session check
  admin/shipments.js        list + create shipments
  admin/shipment.js         one shipment: details, add status update, delete
  booking.js                public: POST /api/booking (booking request from the home page form)
  admin/bookings.js         admin: list requests, accept (creates a shipment + tracking number) or decline
  supplies.js               public: GET /api/supplies (catalogue) and POST /api/supplies (order request)
  admin/supply-items.js     admin: add, edit, hide or delete catalogue products and set prices
  admin/supply-orders.js    admin: list supply orders, confirm, complete or cancel
  contact.js                public: POST /api/contact (message from the home page contact form)
  admin/messages.js         admin: list contact messages, mark handled, reopen or delete
backend/lib                 shared server code (db, auth, helpers, constants, notify = owner alerts)
backend/db/schema.sql       database schema
backend/tests               node:test unit tests (npm test)
```

## One-time setup

1. **Neon**: create a project, open the SQL Editor and run `backend/db/schema.sql`.
2. **Vercel** -> Project -> Settings -> Environment Variables, add (see `.env.example`):
   - `DATABASE_URL` - Neon pooled connection string
   - `ADMIN_PASSWORD` - long passphrase for `/admin.html`
   - `SESSION_SECRET` - random 32+ character string
3. Deploy (push to the connected repo, or `vercel --prod`).
4. Open `/admin.html`, sign in, create a test shipment, then look it up in the tracking form on the home page.

## Local development

```
npm install
cp .env.example .env     # fill in values
npx vercel dev
```
Opening the HTML files directly (file://) works for the layout, but `/api/*` only exists under `vercel dev` or on Vercel.

## Tracking numbers

Format `SL-<GH|JM|UK>-XXXXXX`, generated when you create a shipment. Customers only see status, service, destination and the timeline; names, emails and phone numbers are admin-only.

## Supplies shop

- The home page loads the catalogue from `/api/supplies` and customers send an order request (no online payment).
- Run `backend/db/schema.sql` once more in Neon (it is safe to re-run). It adds the supplies tables and a starter catalogue of boxes, barrels, tape and shrink wrap with **no prices**.
- In **/admin -> Supplies** set the prices (blank = "Price on request"), add products, or untick "Show on website" to hide one.
- In **/admin -> Orders** confirm, complete or cancel orders. Each order keeps its own copy of product names and prices, so changing the catalogue later never changes past orders.
- Order references look like `SO-XXXXXX`.
- Vercel's free plan allows 12 serverless functions per project; this project uses 11 (4 public, 7 admin). One slot is left; if you need more, merge related endpoints first.

## Owner alerts (email + WhatsApp)

When a booking request or supply order arrives, you get a short alert telling you to check `/admin`. Each channel switches on by itself when its Vercel environment variables exist (Production + Preview); with none set, nothing is sent and nothing breaks.

| Channel | Variables |
| --- | --- |
| Email (Resend) | `RESEND_API_KEY`, `ALERT_EMAIL_TO` (optional `ALERT_EMAIL_FROM`) |
| WhatsApp (CallMeBot) | `CALLMEBOT_PHONE` (with country code, e.g. `+447...`), `CALLMEBOT_APIKEY` |
| Link in alerts | `SITE_URL` (optional, defaults to `https://samslogistics.co.uk`) |

- The email has the full details (customer, items, addresses). The WhatsApp message only has the reference and a link, never phone numbers or addresses.
- An alert can never block or fail a customer's request: each call times out after 3 seconds and failures are only logged in Vercel -> Logs.
- Redeploy after adding or changing a variable; variables only apply to new deployments.
- CallMeBot is a free service for personal use. If it ever stops working, only `sendWhatsApp()` in `backend/lib/notify.js` needs replacing.

## Admin lists: search and paging

Shipments, Requests, Orders and Messages show 25 rows at a time, newest first, with "Showing X of Y" and a **Load more** button under the table. The search box above each list matches references, names, emails and phone numbers (messages also match the message text). Search and the status filter work together, and any change starts again from the first page.

## Customer emails

When a customer gives an email address, they get plain-text service emails (not marketing) from `alerts@samslogistics.co.uk` via Resend. Replies go to the contact inbox.

- **Received**: after a booking request or supplies order.
- **Accepted**: when you accept a booking in /admin, with the tracking number and a link (`/?track=SL-...`) that opens the tracking lookup automatically.
- **Declined**: a polite notice when you decline a request.
- **Status updates**: when you add an update to a shipment, the "Email the customer about this update" box is ticked by default (disabled if no email is saved). Untick it to save quietly.

No email address means no email. A failed send never blocks the booking or the update; /admin tells you if an email could not be sent.

Optional settings: `REPLY_TO_EMAIL` (default `samslogistics.gh@gmail.com`) and `CUSTOMER_EMAIL_FROM` (default `ALERT_EMAIL_FROM`).

## Contact form

- The home page contact form posts to `/api/contact` (our own backend; the old third-party form service is no longer used and its account can be closed).
- Run the contact section of `backend/db/schema.sql` once in Neon (safe to re-run). It adds the `contact_messages` table.
- Messages show up in **/admin -> Messages** (with a badge for new ones). Reply by email or call from the message, mark it handled, reopen it, or delete it for good (also the way to honour a deletion request).
- Each message also triggers an owner alert (see above). The form needs a ticked consent box, has a hidden spam-trap field, and allows 5 messages per visitor per hour.
- Reference format `MS-XXXXXX`.

## Styles (Tailwind)
The pages use a compiled stylesheet, `frontend/styles/tailwind.css` (about 32 KB), instead of the Tailwind CDN.
Brand colours and fonts live in `tailwind.config.cjs`. The built file is committed, so Vercel needs no build step.

After you add or change Tailwind classes in any `.html` file or in `frontend/scripts/*.js`, rebuild and commit it:

    npm install        (once)
    npm run build:css

Write full class names in scripts (`'text-red-600'`), never pieces joined together (`'text-' + colour`), or the builder cannot see them.

## Legal pages (shared header and footer)

The header and footer of `disclaimer.html`, `imprint.html`, `legal_notice.html` and `privacy_policy.html` live in `frontend/partials/header.html` and `footer.html`. To change a menu item, a footer link, or the contact details in the footer, edit the partial, run `npm run build:pages`, and commit the four pages. The pages stay plain static HTML. The tests fail if a page is out of date. The small menu script is `frontend/scripts/legal.js`.

## Next phases

- `Admin_manual.md`: a manual for whoever works as an admin
- Alerts on status changes for customers
