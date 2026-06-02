import { EventEmitter } from 'events';

// In-process registry of live run event streams, keyed by runId. Each run gets an
// emitter plus a small replay buffer, so a client connecting mid-run still sees the
// events that already happened. Used by the SSE endpoint (routes/runs.js) and the
// run executor (workflows/runner.js) for the "Live Run Theater".
const runs = new Map(); // runId -> { emitter, buffer }
const MAX_BUFFER = 300;

function bucket(runId) {
  let b = runs.get(runId);
  if (!b) {
    b = { emitter: new EventEmitter(), buffer: [] };
    b.emitter.setMaxListeners(0);
    runs.set(runId, b);
  }
  return b;
}

/** Emit a run event (e.g. run_start, agent_start, agent_done, done). */
export function emitRunEvent(runId, event) {
  if (runId == null) return;
  const b = bucket(runId);
  b.buffer.push(event);
  if (b.buffer.length > MAX_BUFFER) b.buffer.shift();
  b.emitter.emit('event', event);
  if (event.type === 'done') {
    // Keep the buffer briefly for late subscribers, then release.
    setTimeout(() => runs.delete(runId), 30000);
  }
}

/** True while a run is actively streaming (present in the registry). */
export function isRunLive(runId) {
  return runs.has(runId);
}

/**
 * Subscribe to a run's events. Replays any buffered events immediately, then
 * streams new ones. Returns an unsubscribe function.
 */
export function subscribeRun(runId, listener) {
  const b = bucket(runId);
  // Replay buffered events on a microtask (not synchronously) so callers can
  // finish wiring up (e.g. keepalive timers / the unsub handle) before any fire.
  const buffered = [...b.buffer];
  queueMicrotask(() => {
    for (const ev of buffered) {
      try { listener(ev); } catch { /* ignore listener errors */ }
    }
  });
  b.emitter.on('event', listener);
  return () => b.emitter.off('event', listener);
}
