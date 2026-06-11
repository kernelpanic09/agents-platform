// Per-agent episodic memory: after each successful run, durable learnings are
// distilled from the agent's output and stored; at the next dispatch the
// agent's most relevant memories (pinned first, then newest) are injected into
// its prompt. Distillation rides the unified LLM layer (llm.js), so with no
// API key it runs on the local OpenAI-compatible backend at $0; with no aux
// backend at all it falls back to a rule: runs that ended attention/critical
// store their SUMMARY line (incidents are worth remembering even without an
// LLM to do the remembering).
import { chatComplete, auxBackend } from './llm.js';
import { extractVerdict, extractSummary } from './executor.js';
import { getSetting } from './settings.js';

const MAX_MEMORIES_PER_AGENT = 30; // non-pinned cap; oldest pruned
const INJECT_LIMIT = 8;
const MAX_MEMORY_CHARS = 500;
const MAX_OUTPUT_CHARS_FOR_DISTILL = 6000;

export function listMemories(db, agentId) {
  return db.prepare(`
    SELECT * FROM agent_memories WHERE agent_id = ?
    ORDER BY pinned DESC, id DESC
  `).all(agentId).map(r => ({ ...r, pinned: !!r.pinned }));
}

/** Insert a memory; exact-duplicate content (per agent) is skipped. */
export function addMemory(db, agentId, content, { kind = 'learning', sourceRunId = null, pinned = false } = {}) {
  const text = String(content || '').trim().slice(0, MAX_MEMORY_CHARS);
  if (!text) return null;
  const dup = db.prepare('SELECT id FROM agent_memories WHERE agent_id = ? AND content = ?').get(agentId, text);
  if (dup) return { id: dup.id, duplicate: true };
  const res = db.prepare(`
    INSERT INTO agent_memories (agent_id, content, kind, source_run_id, pinned)
    VALUES (?, ?, ?, ?, ?)
  `).run(agentId, text, kind, sourceRunId, pinned ? 1 : 0);
  pruneMemories(db, agentId);
  return { id: res.lastInsertRowid, duplicate: false };
}

export function updateMemory(db, id, patch = {}) {
  const existing = db.prepare('SELECT * FROM agent_memories WHERE id = ?').get(id);
  if (!existing) return null;
  const content = patch.content !== undefined ? String(patch.content).trim().slice(0, MAX_MEMORY_CHARS) : existing.content;
  const pinned = patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : existing.pinned;
  if (!content) return null;
  db.prepare(`UPDATE agent_memories SET content = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?`).run(content, pinned, id);
  const row = db.prepare('SELECT * FROM agent_memories WHERE id = ?').get(id);
  return { ...row, pinned: !!row.pinned };
}

export function deleteMemory(db, id) {
  return db.prepare('DELETE FROM agent_memories WHERE id = ?').run(id).changes > 0;
}

/** Keep the newest MAX_MEMORIES_PER_AGENT non-pinned memories; pinned never pruned. */
export function pruneMemories(db, agentId) {
  db.prepare(`
    DELETE FROM agent_memories
    WHERE agent_id = ? AND pinned = 0 AND id NOT IN (
      SELECT id FROM agent_memories WHERE agent_id = ? AND pinned = 0 ORDER BY id DESC LIMIT ?
    )
  `).run(agentId, agentId, MAX_MEMORIES_PER_AGENT);
}

/** Memories to inject at dispatch: pinned first, then newest, capped. */
export function memoriesForPrompt(db, agentId, limit = INJECT_LIMIT) {
  if (String(getSetting('memory_injection')) === 'off') return [];
  return db.prepare(`
    SELECT content, kind, created_at FROM agent_memories
    WHERE agent_id = ?
    ORDER BY pinned DESC, id DESC LIMIT ?
  `).all(agentId, limit);
}

/** Pull a JSON string-array out of model output (tolerates prose around it). */
export function parseDistilledItems(text) {
  const m = String(text || '').match(/\[[\s\S]*?\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 3);
  } catch {
    return [];
  }
}

const DISTILL_SYSTEM = 'You distill an AI agent\'s run output into durable memories for future runs. A good memory is a non-obvious, reusable fact about THIS environment (names, versions, quirks, recurring problems, decisions). NOT good: generic best practices, restating the task, transient states. Return a STRICT JSON array of 0-3 short strings (each under 200 chars). Return [] if nothing is worth remembering.';

/**
 * Distill memories from one finished run's per-agent outputs. Fire-and-forget:
 * never throws, never blocks the run path. Returns a summary for tests/logs.
 */
export async function distillRunMemories({ db, runId, agents, outputs, _chat = null }) {
  const result = { stored: 0, skipped: null };
  try {
    if (String(getSetting('memory_distillation')) === 'off') {
      result.skipped = 'distillation off';
      return result;
    }
    const byName = new Map(agents.map(a => [a.name, a]));
    const backend = auxBackend();

    for (const [name, rawOut] of Object.entries(outputs || {})) {
      const agent = byName.get(name);
      const out = String(rawOut || '');
      if (!agent || !out || out.startsWith('[timed out]') || out.startsWith('[failed]') || out.startsWith('[exit ')) continue;

      if (backend === 'none' && !_chat) {
        // No LLM anywhere: remember incidents only (verdict-gated SUMMARY line).
        const verdict = extractVerdict(out);
        if (verdict === 'attention' || verdict === 'critical') {
          const summary = extractSummary(out).slice(0, 300);
          const r = addMemory(db, agent.id, `[${verdict}] ${summary}`, { kind: 'incident', sourceRunId: runId });
          if (r && !r.duplicate) result.stored++;
        }
        continue;
      }

      const chat = _chat || chatComplete;
      const resp = await chat([
        { role: 'system', content: DISTILL_SYSTEM },
        { role: 'user', content: `Agent: ${name}\n\nRun output:\n${out.slice(0, MAX_OUTPUT_CHARS_FOR_DISTILL)}\n\nJSON array of 0-3 memories:` },
      ], { model: 'haiku', maxTokens: backend === 'openai' ? 256 : 512, timeoutMs: 120000 });

      for (const item of parseDistilledItems(resp.content)) {
        const r = addMemory(db, agent.id, item, { kind: 'learning', sourceRunId: runId });
        if (r && !r.duplicate) result.stored++;
      }
    }
  } catch (err) {
    result.skipped = err.message;
  }
  return result;
}
