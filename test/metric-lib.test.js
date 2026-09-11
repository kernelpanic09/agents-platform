import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetric, healthScore, deltaSense } from '../src/lib/metric.js';

describe('parseMetric', () => {
  test('ratio fills: N/D → (N/D)×100, clamped to [0,100]', () => {
    assert.equal(parseMetric('3/3'), 100);
    assert.equal(parseMetric('0/3'), 0);
    assert.equal(parseMetric('2/4'), 50);
    assert.equal(parseMetric('1/3'), Math.max(0, Math.min(100, (1 / 3) * 100)));
  });

  test('zero denominator returns null (not Infinity)', () => {
    assert.equal(parseMetric('5/0'), null);
  });

  test('percentage fills: clamps negative to 0 and over-100 to 100', () => {
    assert.equal(parseMetric('42%'), 42);
    assert.equal(parseMetric('0%'), 0);
    assert.equal(parseMetric('100%'), 100);
    assert.equal(parseMetric('150%'), 100);
    assert.equal(parseMetric('-5%'), 0);
  });

  test('non-gauge values (durations, plain counts) return null', () => {
    assert.equal(parseMetric('14h'), null);
    assert.equal(parseMetric('17 days'), null);
    assert.equal(parseMetric('available'), null);
    assert.equal(parseMetric('FAILED'), null);
  });

  test('empty and nullish inputs return null', () => {
    assert.equal(parseMetric(''), null);
    assert.equal(parseMetric(null), null);
    assert.equal(parseMetric(undefined), null);
  });

  test('multi-slash strings (compound ratios) return null', () => {
    assert.equal(parseMetric('54/44/35'), null);
    assert.equal(parseMetric('3/3 (a/b)'), null); // two slashes → guarded
  });
});

describe('healthScore', () => {
  test('all-ok → 100, all-critical → 0', () => {
    assert.equal(healthScore([{ verdict: 'ok' }, { verdict: 'ok' }]), 100);
    assert.equal(healthScore([{ verdict: 'critical' }, { verdict: 'critical' }]), 0);
  });

  test('attention scores as 0.5', () => {
    assert.equal(healthScore([{ verdict: 'attention' }]), 50);
  });

  test('unknown verdict defaults to 0.5 (attention-equivalent)', () => {
    assert.equal(healthScore([{ verdict: null }]), 50);
    assert.equal(healthScore([{ verdict: 'whatever' }]), 50);
  });

  test('mixed verdicts are averaged and rounded', () => {
    assert.equal(healthScore([{ verdict: 'ok' }, { verdict: 'critical' }]), 50);
    // (1 + 1 + 0) / 3 × 100 = 66.67 → 67
    assert.equal(healthScore([{ verdict: 'ok' }, { verdict: 'ok' }, { verdict: 'critical' }]), 67);
  });

  test('empty array and falsy inputs return null', () => {
    assert.equal(healthScore([]), null);
    assert.equal(healthScore(null), null);
    assert.equal(healthScore(undefined), null);
  });
});

describe('deltaSense', () => {
  test('null or zero delta → flat regardless of direction', () => {
    assert.equal(deltaSense('up_good', null), 'flat');
    assert.equal(deltaSense('down_good', null), 'flat');
    assert.equal(deltaSense('up_good', 0), 'flat');
  });

  test('up_good: positive is good, negative is bad', () => {
    assert.equal(deltaSense('up_good', 5), 'good');
    assert.equal(deltaSense('up_good', -3), 'bad');
  });

  test('down_good: negative is good, positive is bad', () => {
    assert.equal(deltaSense('down_good', -5), 'good');
    assert.equal(deltaSense('down_good', 3), 'bad');
  });

  test('neutral or unknown direction → flat', () => {
    assert.equal(deltaSense('neutral', 10), 'flat');
    assert.equal(deltaSense(undefined, 10), 'flat');
    assert.equal(deltaSense(null, 10), 'flat');
  });
});
