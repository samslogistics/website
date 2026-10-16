-- Sam's Logistics UK - database schema (Neon / Postgres)
-- Run once in the Neon SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS shipments (
    id              BIGSERIAL PRIMARY KEY,
    tracking_ref    TEXT        NOT NULL UNIQUE,
    service         TEXT        NOT NULL,   -- air_freight | sea_freight | doorstep | house_removal | store_pickup | courier
    destination     TEXT        NOT NULL,   -- Ghana | Jamaica | UK
    customer_name   TEXT        NOT NULL,
    customer_email  TEXT,
    customer_phone  TEXT,
    receiver_name   TEXT,
    description     TEXT,
    status          TEXT        NOT NULL DEFAULT 'Order received',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipment_events (
    id           BIGSERIAL PRIMARY KEY,
    shipment_id  BIGINT      NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL,
    location     TEXT,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events (shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_created ON shipments (created_at DESC);

-- ---------------------------------------------------------------------------
-- Booking requests (added in phase 2). Safe to re-run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_requests (
    id               BIGSERIAL PRIMARY KEY,
    reference        TEXT        NOT NULL UNIQUE,          -- BR-XXXXXX, shown to the customer
    service          TEXT        NOT NULL,                 -- same keys as shipments.service
    destination      TEXT        NOT NULL,                 -- Ghana | Jamaica | UK
    customer_name    TEXT        NOT NULL,
    customer_email   TEXT,
    customer_phone   TEXT        NOT NULL,
    pickup_address   TEXT        NOT NULL,
    delivery_address TEXT        NOT NULL,
    preferred_date   DATE,
    description      TEXT,
    status           TEXT        NOT NULL DEFAULT 'new',   -- new | accepted | declined
    shipment_ref     TEXT,                                 -- set when accepted
    ip_hash          TEXT,                                 -- salted hash, used only for rate limiting
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON booking_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_requests_ip ON booking_requests (ip_hash, created_at);

-- ---------------------------------------------------------------------------
-- Supplies ordering (added in phase 3). Safe to re-run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supply_items (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT        NOT NULL,
    category     TEXT        NOT NULL DEFAULT 'Other',   -- Boxes | Barrels | Tape | Shrink wrap | Other
    description  TEXT,
    unit         TEXT        NOT NULL DEFAULT 'each',
    price_pence  INTEGER     CHECK (price_pence IS NULL OR price_pence >= 0),  -- NULL = price on request
    active       BOOLEAN     NOT NULL DEFAULT TRUE,      -- inactive items are hidden from the website
    sort_order   INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supply_orders (
    id              BIGSERIAL PRIMARY KEY,
    reference       TEXT        NOT NULL UNIQUE,          -- SO-XXXXXX, shown to the customer
    customer_name   TEXT        NOT NULL,
    customer_phone  TEXT        NOT NULL,
    customer_email  TEXT,
    fulfilment      TEXT        NOT NULL,                 -- delivery | collection
    address         TEXT,                                 -- required for delivery
    note            TEXT,
    status          TEXT        NOT NULL DEFAULT 'new',   -- new | confirmed | completed | cancelled
    ip_hash         TEXT,                                 -- salted hash, used only for rate limiting
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at      TIMESTAMPTZ
);

-- Name and price are copied onto each line, so old orders stay correct when the catalogue changes.
CREATE TABLE IF NOT EXISTS supply_order_items (
    id                BIGSERIAL PRIMARY KEY,
    order_id          BIGINT  NOT NULL REFERENCES supply_orders(id) ON DELETE CASCADE,
    item_id           BIGINT  REFERENCES supply_items(id) ON DELETE SET NULL,
    name              TEXT    NOT NULL,
    unit_price_pence  INTEGER,
    quantity          INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_supply_items_active ON supply_items (active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_supply_orders_status ON supply_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_orders_ip ON supply_orders (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_supply_order_items_order ON supply_order_items (order_id);

-- Starter catalogue (only when the table is empty). No prices yet: items show
-- "Price on request" until you set a price in Admin -> Supplies.
INSERT INTO supply_items (name, category, description, unit, sort_order)
SELECT v.name, v.category, v.description, v.unit, v.sort_order
FROM (VALUES
    ('Cardboard box - small',  'Boxes',       'Strong cardboard box for international freight', 'each', 10),
    ('Cardboard box - medium', 'Boxes',       'Strong cardboard box for international freight', 'each', 20),
    ('Cardboard box - large',  'Boxes',       'Strong cardboard box for international freight', 'each', 30),
    ('Shipping barrel - small',  'Barrels',   'Heavy-duty blue shipping barrel', 'each', 40),
    ('Shipping barrel - medium', 'Barrels',   'Heavy-duty blue shipping barrel', 'each', 50),
    ('Shipping barrel - large',  'Barrels',   'Heavy-duty blue shipping barrel', 'each', 60),
    ('Packing tape - retail',    'Tape',      'Premium brown packing tape', 'roll', 70),
    ('Packing tape - wholesale', 'Tape',      'Premium brown packing tape in bulk', 'each', 80),
    ('Shrink wrap - retail',     'Shrink wrap', 'Clear shrink wrap packaging film', 'roll', 90),
    ('Shrink wrap - wholesale',  'Shrink wrap', 'Clear shrink wrap packaging film in bulk', 'each', 100)
) AS v(name, category, description, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM supply_items);

-- ---- Contact form messages ----
CREATE TABLE IF NOT EXISTS contact_messages (
    id             BIGSERIAL PRIMARY KEY,
    reference      TEXT        NOT NULL UNIQUE,          -- MS-XXXXXX, shown to the customer
    customer_name  TEXT        NOT NULL,
    customer_email TEXT        NOT NULL,
    customer_phone TEXT,
    service        TEXT        NOT NULL,                 -- what the customer chose in the drop-down
    message        TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'new',   -- new | handled
    ip_hash        TEXT,                                 -- salted hash, used only for rate limiting
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_ip ON contact_messages (ip_hash, created_at);
