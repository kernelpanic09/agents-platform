import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitRunEvent, subscribeRun, isRunLive } from '../server/run-stream.js';

test('subscribeRun replays buffered events (async) then streams new ones', async () => {
  emitRunEvent(101, { type: 'run_start', mode: 'parallel' });
  emitRunEvent(101, { type: 'agent_start', agent: 'Atlas' });
  const seen = [];
  const unsub = subscribeRun(101, (ev) => seen.push(ev.type));
  await new Promise(r => setTimeout(r, 5)); // buffered replay runs on a microtask
  assert.deepEqual(seen, ['run_start', 'agent_start']);
  emitRunEvent(101, { type: 'agent_done', agent: 'Atlas', status: 'success' });
  assert.equal(seen[seen.length - 1], 'agent_done');
  unsub();
  emitRunEvent(101, { type: 'done', status: 'success' });
  assert.ok(!seen.includes('done')); // no events after unsubscribe
});

test('isRunLive tracks active runs', () => {
  assert.equal(isRunLive(99999), false);
  emitRunEvent(102, { type: 'run_start' });
  assert.equal(isRunLive(102), true);
});
