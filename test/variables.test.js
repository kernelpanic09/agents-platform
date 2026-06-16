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

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { after } from 'node:test';
import {
  listVariables, getVariable, createVariable, updateVariable, deleteVariable,
  varsMap, replaceAllFromEnv,
} from '../server/variables.js';

const dir = mkdtempSync(join(tmpdir(), 'vars-'));
process.env.DATA_DIR = dir;
const { initDb } = await import('../server/db.js');
const db = initDb();
after(() => { try { db.close(); } catch {} rmSync(dir, { recursive: true, force: true }); });

test('createVariable: validates key, rejects dup, stores', () => {
  const v = createVariable(db, { key: 'CLUSTER_NAME', value: 'prod-1', description: 'cluster' });
  assert.equal(v.key, 'CLUSTER_NAME');
  assert.throws(() => createVariable(db, { key: 'bad key', value: 'x' }), /invalid key/);
  assert.throws(() => createVariable(db, { key: 'CLUSTER_NAME', value: 'y' }), /already exists/);
});

test('update / get / delete', () => {
  updateVariable(db, 'CLUSTER_NAME', { value: 'prod-2', description: 'edited' });
  assert.equal(getVariable(db, 'CLUSTER_NAME').value, 'prod-2');
  assert.equal(updateVariable(db, 'NOPE', { value: 'z' }), null);
  assert.equal(deleteVariable(db, 'CLUSTER_NAME'), true);
  assert.equal(getVariable(db, 'CLUSTER_NAME'), null);
});

test('varsMap: flat key->value object', () => {
  createVariable(db, { key: 'A', value: '1' });
  createVariable(db, { key: 'B', value: '2' });
  assert.deepEqual(varsMap(db), { A: '1', B: '2' });
});

test('replaceAllFromEnv: atomic replace; bad line rejects whole batch', () => {
  assert.throws(() => replaceAllFromEnv(db, 'A=ok\nbad line here'), /invalid|no '='/);
  assert.deepEqual(varsMap(db), { A: '1', B: '2' }); // unchanged after rejection
  const r = replaceAllFromEnv(db, '# sheet\nCLUSTER_NAME=prod-1\nREGION=us-west-2');
  assert.equal(r.count, 2);
  assert.deepEqual(varsMap(db), { CLUSTER_NAME: 'prod-1', REGION: 'us-west-2' });
});
