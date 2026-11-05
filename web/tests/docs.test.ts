import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDocSlug, searchDocs } from '../lib/docs/search.ts';

test('docs route matching accepts nested pages without claiming unrelated routes', () => {
  assert.equal(resolveDocSlug('/docs'), '');
  assert.equal(resolveDocSlug('/docs/'), '');
  assert.equal(resolveDocSlug('/docs/protected/recovery/'), 'protected/recovery');
  assert.equal(resolveDocSlug('/docs-other'), undefined);
  assert.equal(resolveDocSlug('/demo'), undefined);
});

test('search requires every word and ranks a matching page title first', () => {
  const entries = [
    { url: '/docs/sdk', title: 'SDK', group: 'Build', text: 'Recover payment and claim state.' },
    { url: '/docs/protected/recovery', title: 'Payment recovery', group: 'Protected', text: 'Reload from the contract.' },
    { url: '/docs/protected/recovery#pending', title: 'Pending transactions', group: 'Payment recovery', text: 'Check the transaction hash before retrying.' },
  ];
  assert.equal(searchDocs(entries, ' payment   recovery ')[0].url, '/docs/protected/recovery');
  assert.equal(searchDocs(entries, 'transaction hash')[0].url, '/docs/protected/recovery#pending');
  assert.deepEqual(searchDocs(entries, 'payment nonexistent'), []);
  assert.deepEqual(searchDocs(entries, '  ').map(e => e.url), ['/docs/sdk', '/docs/protected/recovery']);
});
