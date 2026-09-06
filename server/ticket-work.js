// server/ticket-work.js — in-progress ticket pickup for works_tickets schedules.
// Pure helpers: the runner composes them around a dispatch (see workflows/runner.js).
import { addEvent, getTicket, updateTicket } from './tickets.js';

const MAX_TICKETS_PER_RUN = 3;
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

// Up to 3 global in_progress tickets: priority-first, then stalest updated_at
// first (rotates the backlog across runs when more than 3 exist).
export function selectTicketsForRun(db, schedule) {
  if (!schedule?.works_tickets) return [];
  const rows = db.prepare("SELECT * FROM tickets WHERE status = 'in_progress' LIMIT 100").all();
  return rows
    .sort((a, b) =>
      ((PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
      || String(a.updated_at).localeCompare(String(b.updated_at)))
    .slice(0, MAX_TICKETS_PER_RUN);
}

export function ticketPromptSection(tickets) {
  if (!Array.isArray(tickets) || !tickets.length) return '';
  const parts = ['\n\n---\n\n# In-Progress Tickets\n\n'];
  parts.push('These project tickets are in progress and assigned to this run. After completing the main task, attempt to resolve each one within your safety tier. Never mark a ticket done — a human verifies every fix. If your tier blocks the fix, diagnose and report exactly what is needed.\n\n');
  for (const t of tickets) {
    parts.push(`## ${t.key}: ${t.title}\n`);
    parts.push(`Priority: ${t.priority} · occurrences: ${t.occurrence_count ?? 1}\n`);
    if (t.description) parts.push(`${String(t.description).slice(0, 500)}\n`);
    parts.push('\n');
  }
  parts.push('Immediately BEFORE your final STATUS line, add exactly one line:\n');
  parts.push('TICKETS: [{"key":"<ticket key>","outcome":"resolved|progress|blocked","note":"<what you did / found / what blocks you, under 300 chars>"}]\n');
  parts.push('One entry per ticket listed above. Use outcome=resolved ONLY if you verified the fix works.');
  return parts.join('');
}

const OUTCOMES = ['resolved', 'progress', 'blocked'];
const OUTCOME_RANK = { resolved: 2, progress: 1, blocked: 0 };

// Last TICKETS: line wins (sequential mode embeds prior transcripts, which may
// contain earlier blocks). Malformed anything → [] — degradation, never a throw.
export function parseTicketBlock(text) {
  const matches = [...String(text || '').matchAll(/^\s*TICKETS:\s*(\[.*\])\s*$/gm)];
  if (!matches.length) return [];
  let arr;
  try { arr = JSON.parse(matches[matches.length - 1][1]); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const e of arr) {
    if (!e || typeof e.key !== 'string' || !e.key.trim()) continue;
    out.push({
      key: e.key.trim(),
      outcome: OUTCOMES.includes(e.outcome) ? e.outcome : 'progress',
      note: String(e.note ?? '').slice(0, 500),
    });
  }
  return out;
}

// Merge per-agent outcome lists: best outcome per key wins, its note rides along.
export function mergeTicketOutcomes(perAgentLists) {
  const byKey = new Map();
  for (const list of perAgentLists || []) {
    for (const o of list || []) {
      const cur = byKey.get(o.key);
      if (!cur || OUTCOME_RANK[o.outcome] > OUTCOME_RANK[cur.outcome]) byKey.set(o.key, o);
    }
  }
  return byKey;
}

// Every OFFERED ticket gets an attempt comment (the audit trail). A resolved
// claim moves in_progress → in_review — only if the ticket is still in_progress
// (a user move mid-run wins). Unknown keys can't be touched: we iterate the
// offered set, never the parsed keys. Per-ticket try/catch: bookkeeping never
// fails the run path.
export function applyTicketOutcomes(db, tickets, outcomesByKey, { runId }) {
  for (const t of tickets || []) {
    try {
      const o = outcomesByKey.get(t.key);
      const note = o
        ? `[run #${runId}] ${o.outcome}: ${o.note || '(no note)'}`
        : `[run #${runId}] attempted — no structured outcome reported`;
      addEvent(db, t.id, { event_type: 'comment', actor: 'agent', note });
      if (o?.outcome === 'resolved') {
        const fresh = getTicket(db, t.id);
        if (fresh?.status === 'in_progress') updateTicket(db, t.id, { status: 'in_review' }, 'agent');
      }
    } catch (e) {
      console.error(`[tickets] apply outcome for ${t.key} failed: ${e.message}`);
    }
  }
}
