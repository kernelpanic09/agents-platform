// Rich demo content so a freshly cloned repo (DEMO_MODE=true) looks like a
// platform that has been running for weeks — completed runs with tool-call step
// timelines, a Combined Report with metric trends, and agent memories — all
// fabricated, no external services, no real infrastructure.
import { recordTrace } from './observability/telemetry.js';
import { backfill } from './metrics.js';

// Deterministic pseudo-random so the seed is stable across boots (no Math.random
// drift between runs); seeded by an integer counter.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// A believable tool-call step timeline for one agent dispatch.
export function mkSteps(tools, baseMs = 0) {
  const steps = [{ kind: 'init', name: 'session', detail: 'claude-haiku · 42 tools · mcp: kubernetes', atMs: baseMs + 600 }];
  let t = baseMs + 1800;
  steps.push({ kind: 'text', name: 'assistant', detail: 'Gathering live cluster state before assessing health.', atMs: t });
  for (const tc of tools) {
    t += 1500 + Math.round(tc.dt || 0);
    steps.push({ kind: 'tool', name: tc.name, detail: tc.detail, atMs: t });
  }
  steps.push({ kind: 'result', name: 'success', detail: `${tools.length + 1} turns · ${Math.round((t + 1200) / 1000)}s`, atMs: t + 1200 });
  return steps;
}

// Per-schedule canned agent output + step tools. Generic "sanitized homelab":
// a 3-node cluster (node-1/2/3), no real IPs/hostnames/service names.
export const RUN_TEMPLATES = {
  1: { // Nightly Infrastructure Audit (parallel)
    Atlas: {
      verdict: 'ok',
      tools: [
        { name: 'Skill', detail: 'k8s-health-report' },
        { name: 'mcp__kubernetes__kubectl_get', detail: 'nodes' },
        { name: 'mcp__kubernetes__kubectl_get', detail: 'pods -A' },
        { name: 'mcp__kubernetes__kubectl_get', detail: 'pvc -A' },
      ],
      out: '# NODES-SECTION-ALPHA\nAll 3 nodes Ready (node-1, node-2, node-3). No MemoryPressure/DiskPressure conditions.\n\n# WORKLOADS-SECTION-BRAVO\n61 pods Running across 24 namespaces; 0 CrashLoopBackOff; highest restart count is 2 (within tolerance).\n\n# STORAGE-SECTION-CHARLIE\nAll 18 persistent volumes Healthy; 18/18 PVCs Bound; fullest volume at 61%.\n\nMetrics: Nodes Ready 3/3, Pods Running 61, Volumes Healthy 18/18, PVCs Bound 18/18.\nSTATUS: ok\nSUMMARY: Cluster healthy — all nodes Ready, no crashloops, storage nominal.',
    },
    Sentinel: {
      verdict: 'attention',
      tools: [
        { name: 'mcp__kubernetes__kubectl_get', detail: 'pods -A --field-selector status.phase!=Running' },
        { name: 'Bash', detail: 'promql: rate(container_cpu_usage_seconds_total[5m])' },
      ],
      out: 'Peak node memory 84% on node-2 (trending up over 7 days). CPU within bounds (<55%). One noisy alert rule firing on transient pod restarts — recommend tuning the threshold.\nMetrics: Peak Memory 84%, Peak CPU 54%.\nSTATUS: attention\nSUMMARY: node-2 memory trending up (84%); one alert rule needs tuning.',
    },
    Bastion: {
      verdict: 'ok',
      tools: [{ name: 'Bash', detail: 'check volume replica health' }],
      out: 'All volume replicas healthy and scheduled across nodes. No degraded or rebuilding replicas.\nSTATUS: ok\nSUMMARY: Storage replicas healthy, no rebuilds in progress.',
    },
    Patch: {
      verdict: 'ok',
      tools: [{ name: 'Bash', detail: 'list pending OS/security updates' }],
      out: '3 non-security package updates pending across nodes; 0 security updates outstanding; no reboot required.\nSTATUS: ok\nSUMMARY: 3 minor updates pending, none security-critical.',
    },
  },
  2: { // Security & Compliance Sweep (sequential)
    Vault: {
      verdict: 'ok',
      tools: [{ name: 'mcp__kubernetes__kubectl_get', detail: 'clusterrolebindings' }, { name: 'mcp__kubernetes__kubectl_get', detail: 'secrets -n default' }],
      out: 'No cluster-admin bindings outside the platform service account. No secrets sitting in the default namespace. 2 privileged pods (both expected: CNI + storage).\nMetrics: Privileged Pods 2, Exposed Secrets 0.\nSTATUS: ok\nSUMMARY: RBAC clean; 2 expected privileged pods; no exposed secrets.',
    },
    Cipher: {
      verdict: 'attention',
      tools: [{ name: 'Bash', detail: 'check cert-manager certificate expiry' }],
      out: 'All managed certs valid. Nearest expiry in 19 days (ingress wildcard) — within renewal window but worth watching.\nMetrics: Certs Valid 100%, Nearest Cert Expiry 19 days.\nSTATUS: attention\nSUMMARY: Certs valid; nearest renewal in 19 days.',
    },
  },
  6: { // Backup Restore Verification Drill (sequential)
    Bastion: {
      verdict: 'ok',
      tools: [{ name: 'Bash', detail: 'restore latest snapshot to scratch volume' }, { name: 'Bash', detail: 'verify checksum' }],
      out: 'Test-restored the newest snapshot to a scratch volume; checksum verified. 18/18 volumes backed up; newest backup 6h old.\nMetrics: Volumes Backed Up 18/18, Newest Backup Age 6 hours, Restore Check available.\nSTATUS: ok\nSUMMARY: Restore drill passed; backups current (6h).',
    },
    Mirror: {
      verdict: 'ok',
      tools: [{ name: 'Bash', detail: 'measure restore RTO' }],
      out: 'Restore RTO measured at 7m for a 5Gi volume; within the 15m objective.\nSTATUS: ok\nSUMMARY: Restore RTO 7m, within objective.',
    },
  },
  7: { // Expiry & Capacity Forecast (parallel)
    Atlas: {
      verdict: 'attention',
      tools: [{ name: 'mcp__kubernetes__kubectl_get', detail: 'nodes -o wide' }, { name: 'Bash', detail: 'project capacity 30d' }],
      out: 'Peak memory 86% on node-2; at the current 7-day slope the cluster crosses 90% headroom in ~24 days. Recommend rebalancing two memory-heavy workloads.\nMetrics: Peak Memory 86%, Peak CPU 58%, OOMKills 0, Nodes Under Pressure 0%.\nSTATUS: attention\nSUMMARY: Memory headroom tightening on node-2; ~24 days to 90%.',
    },
    Proxy: {
      verdict: 'ok',
      tools: [{ name: 'Bash', detail: 'check load-balancer IP pool' }],
      out: 'Load-balancer IP pool 70% allocated; 6 addresses free. No conflicts.\nSTATUS: ok\nSUMMARY: LB pool 70% used, 6 free.',
    },
  },
};

export const WORST = { ok: 1, attention: 2, critical: 3 };

// Content for one agent in a (possibly untemplated) schedule. Falls back to a
// generic but believable infra check so EVERY schedule animates in the demo.
export function agentContent(sid, name) {
  const t = RUN_TEMPLATES[sid]?.[name];
  if (t) return t;
  return {
    verdict: 'ok',
    tools: [
      { name: 'Bash', detail: `inspect ${name.toLowerCase()} domain` },
      { name: 'mcp__kubernetes__kubectl_get', detail: 'pods -A' },
    ],
    out: `${name} reviewed its domain against current state. No blocking issues found; recommendations logged.\nSTATUS: ok\nSUMMARY: ${name} check complete — nominal, no action required.`,
  };
}

export function seedDemoRuns(db) {
  if (db.prepare('SELECT COUNT(*) c FROM runs').get().c > 0) return;
  const schedById = (id) => db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  const agentIdByName = (name) => db.prepare('SELECT id FROM agents WHERE name = ?').get(name)?.id;
  const insRun = db.prepare(`INSERT INTO runs (schedule_id, agent_ids, mode, task_prompt, status, started_at, finished_at, duration_ms, summary, transcript, per_agent_output, exit_code, verdict, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)`);
  const rand = rng(42);
  let count = 0;

  for (const sid of [1, 2, 6, 7]) {
    const sched = schedById(sid);
    if (!sched) continue;
    const tmpl = RUN_TEMPLATES[sid];
    const agentNames = Object.keys(tmpl);
    // ~10 runs per schedule over the last ~20 days
    for (let d = 19; d >= 0; d -= 2) {
      const when = new Date(Date.now() - d * 86400000 - Math.floor(rand() * 6) * 3600000);
      const iso = when.toISOString().replace('T', ' ').slice(0, 19);
      const finishedMs = 8000 + Math.floor(rand() * 40000);
      const outputs = {};
      const verdicts = [];
      const stepsByAgent = {};
      for (const name of agentNames) {
        // occasional drift so trend lines + verdict history vary
        const t = tmpl[name];
        outputs[name] = t.out;
        verdicts.push(t.verdict);
        stepsByAgent[name] = mkSteps(t.tools);
      }
      const verdict = verdicts.reduce((w, v) => (WORST[v] > WORST[w] ? v : w), 'ok');
      const summary = agentNames.map(n => `${n}: ${(tmpl[n].out.match(/SUMMARY:\s*(.+)$/m) || [, ''])[1]}`).join('\n').slice(0, 1500);
      const runId = insRun.run(sid, sched.agent_ids, sched.mode, sched.task_prompt, 'success',
        iso, iso, finishedMs, summary, JSON.stringify(outputs), JSON.stringify(outputs), verdict, iso).lastInsertRowid;
      // persist per-agent step timelines as traces (run detail reads these)
      for (const name of agentNames) {
        recordTrace({
          runId, agentId: agentIdByName(name), stepName: 'ssh_dispatch', model: 'claude-haiku-4-5-20251001',
          inputTokens: 1200 + Math.floor(rand() * 1500), outputTokens: 300 + Math.floor(rand() * 700),
          latencyMs: 4000 + Math.floor(rand() * 8000), source: 'ssh',
          inputPreview: sched.task_prompt, outputPreview: outputs[name], steps: stepsByAgent[name],
        });
      }
      // backdate the trace timestamps to match the run
      db.prepare(`UPDATE traces SET created_at = ? WHERE run_id = ?`).run(iso, runId);
      // last_run_id / last_run_status are derived from the runs table by the
      // schedules route; only last_run_at is a column here.
      db.prepare(`UPDATE schedules SET last_run_at = ? WHERE id = ?`).run(iso, sid);
      count++;
    }
  }
  console.log(`[demo] seeded ${count} completed runs with step timelines`);
}

// ---- Combined Report with metric trends ----

// Synthesis JSON for one build at a given health level. Metric values drift over
// time so the Trends charts show movement.
function buildContent(k) {
  const mem = 78 + Math.round(k * 9);          // climbs 78 -> ~87
  const certDays = 40 - Math.round(k * 21);    // 40 -> 19
  const backupAge = 5 + Math.round(k * 3);     // 5 -> 8h
  const overall = mem >= 86 ? 'attention' : 'ok';
  return {
    headline: overall === 'attention'
      ? 'Cluster healthy overall; memory headroom on node-2 is tightening.'
      : 'All systems nominal across infrastructure, security, backups, and capacity.',
    overall_verdict: overall,
    executive_summary: 'Nodes Ready and storage healthy. Security posture clean with one cert renewal approaching. Backups current and a restore drill passed. Capacity is the one watch item: node-2 memory is trending up.',
    sections: [
      { schedule_id: 1, title: 'Infrastructure Audit', verdict: 'ok', summary: 'All nodes Ready, no crashloops, storage nominal.',
        findings: ['3/3 nodes Ready', '61 pods Running, 0 CrashLoopBackOff', '18/18 volumes Healthy'],
        metrics: [{ label: 'Nodes Ready', value: '3/3' }, { label: 'Volumes Healthy', value: '18/18' }, { label: 'Pods Running', value: '61' }] },
      { schedule_id: 2, title: 'Security & Compliance', verdict: 'ok', summary: 'RBAC clean; certs valid; no exposed secrets.',
        findings: ['No cluster-admin outside platform SA', `Nearest cert expiry ${certDays}d`, '2 expected privileged pods'],
        metrics: [{ label: 'Certs Valid', value: '100%' }, { label: 'Nearest Cert Expiry', value: `${certDays} days` }, { label: 'Privileged Pods', value: '2' }] },
      { schedule_id: 6, title: 'Backup Verification', verdict: 'ok', summary: 'Restore drill passed; backups current.',
        findings: ['18/18 volumes backed up', `Newest backup ${backupAge}h old`, 'Restore RTO 7m (objective 15m)'],
        metrics: [{ label: 'Volumes Backed Up', value: '18/18' }, { label: 'Newest Backup Age', value: `${backupAge}h` }] },
      { schedule_id: 7, title: 'Capacity Forecast', verdict: overall, summary: 'Memory headroom tightening on node-2.',
        findings: [`Peak memory ${mem}% on node-2`, 'Crosses 90% in ~24 days at current slope', 'OOMKills: 0'],
        metrics: [{ label: 'Peak Memory', value: `${mem}%` }, { label: 'Peak CPU', value: '58%' }, { label: 'OOMKills', value: '0' }] },
    ],
    cross_cutting: ['Memory pressure on node-2 is the single thread connecting capacity and monitoring findings — rebalancing two workloads addresses both.'],
    action_items: [
      { title: 'Rebalance two memory-heavy workloads off node-2', priority: 'high', owner: 'Atlas' },
      { title: 'Schedule ingress wildcard cert renewal', priority: 'medium', owner: 'Cipher' },
      { title: 'Tune the transient-restart alert rule', priority: 'low', owner: 'Sentinel' },
    ],
  };
}

export function seedDemoReport(db) {
  if (db.prepare('SELECT COUNT(*) c FROM report_groups').get().c > 0) return;
  const ids = [1, 2, 6, 7].filter(id => db.prepare('SELECT 1 FROM schedules WHERE id = ?').get(id));
  if (ids.length < 2) return;
  const gid = db.prepare(`INSERT INTO report_groups (name, slug, description, schedule_ids, model)
    VALUES (?, ?, ?, ?, 'sonnet')`)
    .run('Homelab Operations Briefing', 'homelab-operations-briefing',
      'Nightly fusion of the infrastructure, security, backup, and capacity sweeps into one operator briefing.',
      JSON.stringify(ids)).lastInsertRowid;
  const group = db.prepare('SELECT * FROM report_groups WHERE id = ?').get(gid);

  // ~12 successful builds over the last ~24 days (one every other day)
  const insBuild = db.prepare(`INSERT INTO report_builds (report_id, status, content, source_runs, duration_ms, created_at)
    VALUES (?, 'success', ?, '[]', ?, ?)`);
  const N = 12;
  const rand = rng(7); // seeded so build durations are stable across boots
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1); // 0 -> 1
    const when = new Date(Date.now() - (N - 1 - i) * 2 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    insBuild.run(gid, JSON.stringify(buildContent(k)), 9000 + Math.floor(rand() * 6000), when);
  }
  // derive metric points from the builds so the Trends tab renders
  try { backfill(db, group); } catch (e) { console.error('[demo] report backfill:', e.message); }
  console.log(`[demo] seeded report "${group.slug}" with ${N} builds + metric trends`);
}

// ---- Pipeline (conditional DAG) ----

export function seedDemoPipeline(db) {
  if (db.prepare('SELECT COUNT(*) c FROM pipelines').get().c > 0) return;
  const idOf = (name) => db.prepare('SELECT id FROM agents WHERE name = ?').get(name)?.id;
  const atlas = idOf('Atlas'), mirror = idOf('Mirror'), relay = idOf('Relay');
  if (!atlas || !mirror || !relay) return;
  // Atlas audits the cluster; if it reports STATUS: critical the run escalates to
  // Mirror (disaster recovery), and Relay always notifies. Conditional edge uses
  // the upstream node's parsed verdict — the platform's routing primitive.
  const graph = {
    nodes: [
      { id: 'n1', agent_id: atlas, label: 'Infrastructure Audit' },
      { id: 'n2', agent_id: mirror, label: 'Failover Plan' },
      { id: 'n3', agent_id: relay, label: 'Notify On-Call' },
    ],
    edges: [
      { from: 'n1', to: 'n2', condition: "verdict === 'critical'" },
      { from: 'n1', to: 'n3', condition: '' },
    ],
  };
  db.prepare(`INSERT INTO pipelines (name, description, graph) VALUES (?, ?, ?)`)
    .run('Incident Escalation', 'Audit the cluster; escalate to disaster recovery only when a member reports critical, and always notify on-call.', JSON.stringify(graph));
  console.log('[demo] seeded conditional DAG pipeline');
}

// ---- Agent memories ----

export function seedDemoMemories(db) {
  if (db.prepare('SELECT COUNT(*) c FROM agent_memories').get().c > 0) return;
  const idOf = (name) => db.prepare('SELECT id FROM agents WHERE name = ?').get(name)?.id;
  const add = (name, content, kind = 'learning', pinned = 0) => {
    const id = idOf(name); if (!id) return;
    db.prepare(`INSERT INTO agent_memories (agent_id, content, kind, pinned) VALUES (?,?,?,?)`).run(id, content, kind, pinned);
  };
  add('Atlas', 'node-2 has the least memory headroom in the cluster and trends up first under load — check it first when capacity alarms fire.', 'manual', 1);
  add('Atlas', 'At the current 7-day slope, node-2 crosses 90% memory in ~24 days; rebalancing two workloads buys headroom.', 'learning');
  add('Sentinel', 'The transient-pod-restart alert rule is noisy; a >3-in-1h threshold removed the false pages.', 'learning');
  add('Bastion', 'Restore RTO for a 5Gi volume measured ~7m, comfortably inside the 15m objective.', 'learning');
  add('Cipher', 'The ingress wildcard cert is the nearest renewal; queue it ~30 days out to avoid a scramble.', 'incident');
  console.log('[demo] seeded agent memories');
}
