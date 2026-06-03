import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evalEdgeCondition, computeRoots, routeFromNode,
  validatePipelineGraph, buildPipelineGraph,
} from '../server/workflows/pipeline.js';

test('evalEdgeCondition: empty condition is the default/else edge (always true)', () => {
  assert.equal(evalEdgeCondition('', { output: 'anything' }), true);
  assert.equal(evalEdgeCondition('   ', {}), true);
});

test('evalEdgeCondition: evaluates against output/summary, errors are false', () => {
  assert.equal(evalEdgeCondition("output.includes('CRITICAL')", { output: 'CRITICAL: down' }), true);
  assert.equal(evalEdgeCondition("output.includes('CRITICAL')", { output: 'all healthy' }), false);
  assert.equal(evalEdgeCondition("summary === 'ok'", { summary: 'ok' }), true);
  assert.equal(evalEdgeCondition('output.length > 3', { output: 'abcd' }), true);
  // Reference errors / bad syntax must not throw — they route false.
  assert.equal(evalEdgeCondition('nope.bad()', { output: 'x' }), false);
  assert.equal(evalEdgeCondition('@@@', { output: 'x' }), false);
});

test('evalEdgeCondition: no access to Node globals (sandboxed)', () => {
  assert.equal(evalEdgeCondition('typeof process !== "undefined"', {}), false);
  assert.equal(evalEdgeCondition('typeof require !== "undefined"', {}), false);
});

test('computeRoots: nodes with no incoming edge', () => {
  const g = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] };
  assert.deepEqual(computeRoots(g), ['a']);
  const fan = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }] };
  assert.deepEqual(computeRoots(fan), ['a', 'b']);
});

test('routeFromNode: only targets whose condition passes', () => {
  const g = { nodes: [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'n4' }], edges: [
    { from: 'n1', to: 'n2', condition: "output.includes('CRITICAL')" },
    { from: 'n1', to: 'n3', condition: "!output.includes('CRITICAL')" },
    { from: 'n1', to: 'n4', condition: '' }, // always
  ] };
  assert.deepEqual(routeFromNode(g, 'n1', 'CRITICAL: down').sort(), ['n2', 'n4']);
  assert.deepEqual(routeFromNode(g, 'n1', 'all healthy').sort(), ['n3', 'n4']);
});

test('validatePipelineGraph: accepts a valid DAG', () => {
  const g = { nodes: [{ id: 'a', agent_id: 1 }, { id: 'b', agent_id: 2 }], edges: [{ from: 'a', to: 'b' }] };
  assert.deepEqual(validatePipelineGraph(g), { ok: true, errors: [] });
});

test('validatePipelineGraph: rejects empty, dangling edges, cycles, no root', () => {
  assert.equal(validatePipelineGraph({ nodes: [], edges: [] }).ok, false);

  const missingAgent = validatePipelineGraph({ nodes: [{ id: 'a' }], edges: [] });
  assert.ok(missingAgent.errors.some(e => /no agent/.test(e)));

  const dangling = validatePipelineGraph({ nodes: [{ id: 'a', agent_id: 1 }], edges: [{ from: 'a', to: 'ghost' }] });
  assert.ok(dangling.errors.some(e => /unknown node/.test(e)));

  const cyclic = validatePipelineGraph({ nodes: [{ id: 'a', agent_id: 1 }, { id: 'b', agent_id: 2 }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] });
  assert.ok(cyclic.errors.some(e => /cycle/.test(e)));
});

test('buildPipelineGraph: conditional fan-out routes through LangGraph (no LLM)', async () => {
  // Sentinel -> Atlas (if CRITICAL) | Mirror (else), Relay always fires.
  const g = { nodes: [
    { id: 'sentinel', agent_id: 1, label: 'Sentinel' },
    { id: 'atlas', agent_id: 2, label: 'Atlas' },
    { id: 'mirror', agent_id: 3, label: 'Mirror' },
    { id: 'relay', agent_id: 4, label: 'Relay' },
  ], edges: [
    { from: 'sentinel', to: 'atlas', condition: "output.includes('CRITICAL')" },
    { from: 'sentinel', to: 'mirror', condition: "!output.includes('CRITICAL')" },
    { from: 'sentinel', to: 'relay', condition: '' },
  ] };

  const run = async (sentinelOutput) => {
    const ran = [];
    const runner = (node) => {
      ran.push(node.id);
      const out = node.id === 'sentinel' ? sentinelOutput : `${node.label} done`;
      return { outputs: { [node.id]: out }, summaries: { [node.id]: out } };
    };
    const compiled = buildPipelineGraph(g, runner);
    await compiled.invoke({ task: 't' }, { recursionLimit: 25 });
    return ran.sort();
  };

  assert.deepEqual(await run('CRITICAL: worker down'), ['atlas', 'relay', 'sentinel']);
  assert.deepEqual(await run('cluster is healthy'), ['mirror', 'relay', 'sentinel']);
});

test('buildPipelineGraph: linear chain runs every node in order', async () => {
  const g = { nodes: [{ id: 'a', agent_id: 1, label: 'A' }, { id: 'b', agent_id: 2, label: 'B' }, { id: 'c', agent_id: 3, label: 'C' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] };
  const ran = [];
  const runner = (node) => { ran.push(node.id); return { outputs: { [node.id]: 'x' }, summaries: {} }; };
  await buildPipelineGraph(g, runner).invoke({ task: 't' });
  assert.deepEqual(ran, ['a', 'b', 'c']);
});
