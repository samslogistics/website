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
