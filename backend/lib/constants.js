// Single source of truth for services, destinations and statuses.

export const SERVICES = {
  air_freight: 'Air Freight',
  sea_freight: 'Sea Freight',
  doorstep: 'Doorstep Delivery',
  house_removal: 'House Removals',
  store_pickup: 'Store Pick-up',
  courier: 'Courier Service',
};

// destination -> code used inside tracking numbers (SL-GH-XXXXXX)
export const DESTINATIONS = {
  Ghana: 'GH',
  Jamaica: 'JM',
  UK: 'UK',
};

export const STATUSES = [
  'Order received',
  'Collected',
  'At UK warehouse',
  'Departed UK',
  'In transit',
  'Arrived at destination',
  'Customs clearance',
  'Out for delivery',
  'Delivered',
  'On hold',
];

// ---- Supplies ordering ----
export const SUPPLY_CATEGORIES = ['Boxes', 'Barrels', 'Tape', 'Shrink wrap', 'Other'];

export const FULFILMENT = {
  delivery: 'Delivery',
  collection: 'Collection',
};

// Order status flow: new -> confirmed -> completed (or cancelled while new/confirmed)
export const SUPPLY_ORDER_STATUSES = ['new', 'confirmed', 'completed', 'cancelled'];

// ---- Contact form ----
// Same service names as the form's drop-down, plus the two extras for general questions.
export const CONTACT_SERVICES = [...Object.values(SERVICES), 'Packaging Supplies', 'Other / general question'];

// Message status flow: new -> handled (and back again with "Reopen")
export const CONTACT_STATUSES = ['new', 'handled'];
