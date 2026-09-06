// Self-heal for stale deploys.
//
// When a browser holds a stale index.html (cached before the no-cache fix, or an
// old tab kept open across a deploy), it references content-hashed chunk filenames
// that no longer exist on the server. A lazy `import()` of a routed page then 404s
// and the app crashes with the ErrorBoundary ("Something went wrong"). Vite fires a
// `vite:preloadError` event on window when such a dynamic import fails — we catch it
// and reload ONCE to pull the fresh (no-cache) index + current chunks.
//
// Loop-guarded: only auto-reload if we haven't reloaded within `windowMs`, so a
// genuinely broken deploy (a truly missing chunk) degrades to the ErrorBoundary
// instead of an infinite reload loop.

const KEY = 'agents-chunk-reload-ts';
const WINDOW_MS = 30000;

/** Pure: should we auto-reload now, given the last auto-reload timestamp? */
export function shouldReload(now, lastTs, windowMs = WINDOW_MS) {
  if (!lastTs) return true;
  return now - lastTs >= windowMs;
}

/** Wire the vite:preloadError → reload-once handler. `win`/`reload` injectable for tests. */
export function installChunkReloadHandler(win = window, reload) {
  const doReload = reload || (() => win.location.reload());
  win.addEventListener('vite:preloadError', (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    let last = 0;
    try { last = Number(win.sessionStorage.getItem(KEY) || 0); } catch { /* no storage */ }
    const now = Date.now();
    if (!shouldReload(now, last)) return;
    try { win.sessionStorage.setItem(KEY, String(now)); } catch { /* no storage */ }
    doReload();
  });
}
