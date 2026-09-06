import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReload, installChunkReloadHandler } from '../src/lib/chunkReload.js';

describe('shouldReload', () => {
  test('reloads when no prior timestamp', () => {
    assert.equal(shouldReload(1000, 0), true);
    assert.equal(shouldReload(1000, null), true);
  });
  test('suppresses reload inside the window', () => {
    assert.equal(shouldReload(10000, 5000, 30000), false); // 5s < 30s
  });
  test('reloads once the window has elapsed', () => {
    assert.equal(shouldReload(40000, 5000, 30000), true); // 35s >= 30s
  });
});

describe('installChunkReloadHandler', () => {
  function fakeWin() {
    const store = new Map();
    let handler = null;
    return {
      addEventListener: (name, fn) => { if (name === 'vite:preloadError') handler = fn; },
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
      },
      location: { reload: () => {} },
      fire: () => handler && handler({ preventDefault() {} }),
    };
  }

  test('reloads on first preloadError, suppresses immediate second', () => {
    const win = fakeWin();
    let reloads = 0;
    installChunkReloadHandler(win, () => { reloads++; });
    win.fire();
    win.fire(); // within window → guarded
    assert.equal(reloads, 1);
  });
});
