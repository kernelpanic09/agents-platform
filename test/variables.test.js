// test/variables.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidKey, parseEnv, substitute } from '../server/variables.js';

test('isValidKey: uppercase/underscore, must start with a letter', () => {
  for (const k of ['CLUSTER_NAME', 'A', 'X1', 'PRIMARY_DOMAIN']) assert.equal(isValidKey(k), true, k);
  for (const k of ['lower', '1LEAD', 'has-dash', 'has.dot', '', 'WITH SPACE', 'payload.x']) assert.equal(isValidKey(k), false, k);
});

test('substitute: replaces defined keys, repeats, and tolerates inner whitespace', () => {
  const map = { CLUSTER_NAME: 'prod-1', REGISTRY: 'reg.example.com' };
  assert.equal(substitute('on {{CLUSTER_NAME}} push to {{ REGISTRY }} for {{CLUSTER_NAME}}', map),
    'on prod-1 push to reg.example.com for prod-1');
});

test('substitute: leaves undefined tokens literal and never collides with {{payload.x}}', () => {
  const map = { CLUSTER_NAME: 'prod-1' };
  assert.equal(substitute('{{UNKNOWN}} and {{payload.field}} stay; {{CLUSTER_NAME}} goes', map),
    '{{UNKNOWN}} and {{payload.field}} stay; prod-1 goes');
});

test('substitute: a value containing braces is inserted verbatim (no re-expansion)', () => {
  const map = { A: '{{B}}', B: 'deep' };
  assert.equal(substitute('{{A}}', map), '{{B}}');
});

test('substitute: empty/edge inputs', () => {
  assert.equal(substitute('', { A: '1' }), '');
  assert.equal(substitute('no tokens', {}), 'no tokens');
  assert.equal(substitute(null, { A: '1' }), '');
});

test('parseEnv: KEY=value lines, comments, blanks, = in value, trims key', () => {
  const { vars, errors } = parseEnv('# comment\nCLUSTER_NAME=prod-1\n\nDSN = postgres://a?b=c \nBAD KEY=x\nlower=y');
  assert.deepEqual(vars, { CLUSTER_NAME: 'prod-1', DSN: 'postgres://a?b=c' });
  assert.equal(errors.length, 2); // "BAD KEY" and "lower"
});
