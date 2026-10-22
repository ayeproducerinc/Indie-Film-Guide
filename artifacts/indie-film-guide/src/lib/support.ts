export const SUPPORT_EMAIL = 'support@ayeproducer.com';
export const LISTING_UPDATE_SUBJECT = 'Listing Update Request';
export const LISTING_UPDATE_BODY = [
  'Name: ',
  'Business name: ',
  'Business phone number: ',
  '',
  'Requested changes: ',
].join('\n');
export const LISTING_UPDATE_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(LISTING_UPDATE_SUBJECT)}&body=${encodeURIComponent(LISTING_UPDATE_BODY)}`;
