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

const billingDraft = (subject: string, request: string) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent([
  'Name: ', 'Business name: ', 'Business phone number: ', '', request,
].join('\n'))}`;
export const CANCELLATION_MAILTO = billingDraft('Annual Listing Cancellation Request', 'Cancellation request details: ');
export const REFUND_MAILTO = billingDraft('Listing Refund Request', 'Refund request details and reason: ');

export const MAILING_CONSENT_TEXT = 'I agree to receive email updates from Indie Film Guide. I can withdraw my consent by emailing support@ayeproducer.com.';
export const MAILING_OPT_OUT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Mailing list opt-out')}`;
