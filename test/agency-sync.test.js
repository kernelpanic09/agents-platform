import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColor, parseFrontmatter } from '../server/agency-sync.js';

describe('resolveColor', () => {
  test('maps known Tailwind color names to hex', () => {
    assert.equal(resolveColor('blue'), '#3B82F6');
    assert.equal(resolveColor('EMERALD'), '#10B981'); // case-insensitive
  });

  test('passes through an already-hex color unchanged', () => {
    assert.equal(resolveColor('#ABCDEF'), '#ABCDEF');
  });

  test('falls back to the default violet for missing or unknown colors', () => {
    assert.equal(resolveColor(undefined), '#8B5CF6');
    assert.equal(resolveColor(''), '#8B5CF6');
    assert.equal(resolveColor('not-a-color'), '#8B5CF6');
  });
});

describe('parseFrontmatter', () => {
  test('returns empty meta and the full content as body when there is no frontmatter block', () => {
    const { meta, body } = parseFrontmatter('just a plain markdown body');
    assert.deepEqual(meta, {});
    assert.equal(body, 'just a plain markdown body');
  });

  test('parses top-level keys and strips surrounding quotes', () => {
    const content = `---
name: "Ada"
color: 'indigo'
emoji: 🤖
---
# Ada

Body text.
`;
    const { meta, body } = parseFrontmatter(content);
    assert.equal(meta.name, 'Ada');
    assert.equal(meta.color, 'indigo');
    assert.equal(meta.emoji, '🤖');
    assert.equal(body, '# Ada\n\nBody text.\n');
  });

  test('collects nested services list items into meta.services', () => {
    const content = `---
name: Grace
services:
  - name: github
    url: https://github.com
    tier: free
  - name: linear
    url: https://linear.app
---
body
`;
    const { meta } = parseFrontmatter(content);
    assert.equal(meta.services.length, 2);
    assert.deepEqual(meta.services[0], { name: 'github', url: 'https://github.com', tier: 'free' });
    assert.deepEqual(meta.services[1], { name: 'linear', url: 'https://linear.app' });
  });
});
