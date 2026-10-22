import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANCELLATION_MAILTO, REFUND_MAILTO, LISTING_UPDATE_MAILTO, SUPPORT_EMAIL, LISTING_UPDATE_SUBJECT, LISTING_UPDATE_BODY } from './support';

test('listing support link opens an addressed draft with the requested prompts', () => {
  const url = new URL(LISTING_UPDATE_MAILTO);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, SUPPORT_EMAIL);
  assert.equal(SUPPORT_EMAIL, 'support@ayeproducer.com');
  assert.equal(url.searchParams.get('subject'), LISTING_UPDATE_SUBJECT);
  assert.equal(url.searchParams.get('body'), LISTING_UPDATE_BODY);
  for (const prompt of ['Name:', 'Business name:', 'Business phone number:', 'Requested changes:']) {
    assert.ok(url.searchParams.get('body')!.includes(prompt));
  }
});

test('billing requests open separate addressed drafts without performing billing actions', () => {
  for (const [href, subject, detail] of [
    [CANCELLATION_MAILTO, 'Annual Listing Cancellation Request', 'Cancellation request details:'],
    [REFUND_MAILTO, 'Listing Refund Request', 'Refund request details and reason:'],
  ]) {
    const url = new URL(href);
    assert.equal(url.protocol, 'mailto:');
    assert.equal(url.pathname, SUPPORT_EMAIL);
    assert.equal(url.searchParams.get('subject'), subject);
    for (const prompt of ['Name:', 'Business name:', 'Business phone number:', detail])
      assert.ok(url.searchParams.get('body')!.includes(prompt));
    assert.notEqual(href, LISTING_UPDATE_MAILTO);
  }
});
