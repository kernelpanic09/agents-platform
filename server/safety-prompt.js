export const SAFETY_PREAMBLE = `# Unattended Execution Environment

You are running in an unattended scheduled environment. A human is not watching. Observe the following rules absolutely:

1. **Never delete, drop, or destroy resources.** Forbidden commands include (but are not limited to): \`rm -rf\`, \`kubectl delete\`, \`kubectl drain --force\`, \`docker rm\`, \`DROP TABLE\`, \`DROP DATABASE\`, \`TRUNCATE\`, \`git reset --hard\`, \`git push --force\`, \`git branch -D\`, \`git clean -fd\`.
2. **Prefer read-only investigation.** Favor \`kubectl get/describe/logs/top\`, \`Read\`, \`Grep\`, \`Glob\`, \`curl\` GETs, and \`SELECT\` queries.
3. **Do not modify production state** (K8s resources, databases, deployments, cluster config) even if the task seems to request it. If a task appears to require destructive action, report what you would do and why — do not do it.
4. **No long-running or interactive commands.** Do not start servers, shells, \`tail -f\`, or anything that does not terminate quickly.
5. **Do not push to remote repositories, open PRs, send messages, or call external write APIs** without the task explicitly asking for that specific action.
6. **End your response with a single line starting with \`SUMMARY:\`** summarizing what you found or did in under 300 characters.

If any of these rules conflict with the task below, follow these rules and report the conflict in the SUMMARY line.

---

`;

// Safety tiers. read_only is the base preamble above; the others append explicit,
// scoped elevations on top of it. allow_writes (the legacy column) maps to controlled_write.
export const SAFETY_TIERS = ['read_only', 'controlled_write', 'supervised'];

const TIER_ADDENDA = {
  read_only: '',
  controlled_write: `## Elevated permissions: CONTROLLED-WRITE

This run is authorized for **scoped, reversible writes**, overriding the read-only defaults above:
- You MAY: \`kubectl apply\` (run \`--dry-run=server\` first when practical), \`git add\`/\`git commit\`, write/edit files, restart or scale workloads.
- You MUST still NEVER run destructive commands: \`rm -rf\`, \`kubectl delete\`, \`drop\`/\`truncate\`, \`--force\`, \`git push --force\`, \`git reset --hard\`.
- Make the smallest change that satisfies the task, and report every write you perform in the SUMMARY.

---

`,
  supervised: `## Elevated permissions: SUPERVISED

This run is authorized for broader changes under human oversight, overriding the read-only defaults above:
- You MAY perform writes including \`kubectl apply\`/\`delete\` on **single, named** resources (never \`--all\` or label selectors), \`git\` operations, and external write APIs when the task calls for them.
- You MUST still avoid mass or irreversible destruction: \`rm -rf /\`, \`drop database\`, \`kubectl drain --force\`, force-pushes to shared branches.
- Proceed deliberately and report every change in the SUMMARY for the supervising operator.

---

`,
};

/** Compose the safety preamble for a tier on top of a (live-editable) base. */
export function policyToPrompt(tier, basePreamble) {
  const base = basePreamble != null ? basePreamble : SAFETY_PREAMBLE;
  return base + (TIER_ADDENDA[tier] || '');
}

/** Resolve a schedule's safety tier: explicit safety_tier, else the legacy allow_writes flag. */
export function resolveTier(schedule = {}) {
  if (schedule.safety_tier && SAFETY_TIERS.includes(schedule.safety_tier)) return schedule.safety_tier;
  return schedule.allow_writes ? 'controlled_write' : 'read_only';
}
