import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initApiKeys, createKey, verifyKey, revokeKey, listKeys } from '../server/api-keys.js';

test('api keys: create, verify, scope, revoke, never leak secret', () => {
  initApiKeys(new Database(':memory:'));

  const k = createKey('test', ['trigger']);
  assert.match(k.key, /^agk_/);

  const v = verifyKey(k.key);
  assert.ok(v, 'valid key verifies');
  assert.deepEqual(v.scopes, ['trigger']);

  assert.equal(verifyKey('agk_wrong'), null, 'bad key rejected');

  const list = listKeys();
  assert.equal(list.length, 1);
  assert.ok(!('key' in list[0]) && !('key_hash' in list[0]), 'list never exposes secret/hash');
  assert.equal(list[0].key_prefix, k.key_prefix);

  assert.ok(revokeKey(k.id));
  assert.equal(verifyKey(k.key), null, 'revoked key rejected');
});

test('createKey defaults to read scope when none valid', () => {
  initApiKeys(new Database(':memory:'));
  const k = createKey('x', ['nonsense']);
  assert.deepEqual(k.scopes, ['read']);
});
