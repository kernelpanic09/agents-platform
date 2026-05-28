export async function loadTranscript(runId, db) {
  const run = db.prepare('SELECT id, transcript, per_agent_output, task_prompt, summary FROM runs WHERE id = ?').get(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const parts = [`Task: ${run.task_prompt}`];
  if (run.summary) parts.push(`Summary: ${run.summary}`);
  if (run.transcript) parts.push(`Transcript:\n${run.transcript}`);

  return {
    content: parts.join('\n\n'),
    metadata: { source_type: 'transcript', source_path: `run:${runId}`, run_id: runId },
  };
}
