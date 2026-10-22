import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone } from './format-phone';

test('formats complete numbers and pasted U.S. country prefixes', () => {
  for (const value of ['4045550123', '14045550123', '+1 (404) 555-0123', '404.555.0123', ' 404-555-0123 ', '(404) 555-0123']) {
    assert.equal(formatPhone(value), '(404) 555-0123');
    assert.equal(formatPhone(formatPhone(value)), '(404) 555-0123');
  }
});

test('preserves cleared, incomplete, invalid and unsupported numbers', () => {
  for (const value of ['', ' ', '404', '(404) 555-012', '40455501234', '+44 20 7946 0958', '4045550123 ext 2', 'abc4045550123']) {
    assert.equal(formatPhone(value), value);
  }
});
