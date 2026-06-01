import { StateGraph } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AgentState } from './state.js';
import { ragSearch } from '../rag/chat.js';
import { runClaude, extractSummary, parseClaudeJson } from '../executor.js';
import { recordTrace } from '../observability/telemetry.js';

const MODEL_MAP = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6-20250514',
  opus: 'claude-opus-4-7-20250219',
};

function getLLM(model = 'haiku') {
  return new ChatAnthropic({
    model: MODEL_MAP[model] || MODEL_MAP.haiku,
    maxTokens: 4096,
  });
}

async function ragRetrieveNode(state) {
  const results = await ragSearch(state.task, { agentId: state.agentId, limit: 5 });
  return {
    ragContext: results,
    steps: { name: 'rag_retrieve', status: 'done', chunks: results.length },
  };
}

async function ragRespondNode(state) {
  if (state.ragContext.length === 0) {
    return {
      result: 'No relevant documents found for this query.',
      summary: 'No documents found',
      steps: { name: 'rag_respond', status: 'done' },
    };
  }

  const contextText = state.ragContext
    .map((c, i) => `[${i + 1}] ${c.text}`)
    .join('\n\n');

  const llm = getLLM(state.model);
  const startTime = Date.now();
  const response = await llm.invoke([
    new SystemMessage(`You are ${state.agentName}. Answer based on the provided context. Cite sources by number.`),
    new HumanMessage(`Context:\n${contextText}\n\nQuestion: ${state.task}`),
  ]);

  const answer = response.content;
  recordTrace({
    agentId: state.agentId,
    stepName: 'langgraph_rag_respond',
    model: MODEL_MAP[state.model] || MODEL_MAP.haiku,
    inputTokens: response.usage_metadata?.input_tokens || 0,
    outputTokens: response.usage_metadata?.output_tokens || 0,
    latencyMs: Date.now() - startTime,
    inputPreview: state.task,
    outputPreview: answer,
  });
  return {
    result: answer,
    summary: answer.slice(0, 200),
    steps: { name: 'rag_respond', status: 'done' },
  };
}

async function sshDispatchNode(state) {
  const { stdout, stderr, exitCode, timedOut } = await runClaude(
    state.messages.length > 0 ? state.messages[state.messages.length - 1] : state.task,
    { cwd: state.cwd, model: state.model, backend: state.backend, runId: state.runId, agentId: state.agentId }
  );

  if (timedOut) {
    return {
      result: stdout,
      error: 'SSH dispatch timed out',
      summary: 'Timed out',
      steps: { name: 'ssh_dispatch', status: 'timeout' },
    };
  }
  if (exitCode !== 0) {
    return {
      result: stdout,
      error: `SSH exit code ${exitCode}: ${stderr.slice(0, 500)}`,
      summary: `Failed (exit ${exitCode})`,
      steps: { name: 'ssh_dispatch', status: 'failed' },
    };
  }

  const parsed = parseClaudeJson(stdout);
  const summary = extractSummary(parsed.result);
  return {
    result: parsed.result || stdout,
    summary,
    steps: { name: 'ssh_dispatch', status: 'done' },
  };
}

export function buildRagGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('retrieve', ragRetrieveNode)
    .addNode('respond', ragRespondNode)
    .addEdge('__start__', 'retrieve')
    .addEdge('retrieve', 'respond')
    .addEdge('respond', '__end__');

  return graph.compile();
}

export function buildRoutedGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('retrieve', ragRetrieveNode)
    .addNode('respond', ragRespondNode)
    .addNode('ssh', sshDispatchNode)
    .addEdge('__start__', 'retrieve')
    .addConditionalEdges('retrieve', (state) => {
      if (state.routeDecision === 'ssh') return 'ssh';
      return 'respond';
    })
    .addEdge('respond', '__end__')
    .addEdge('ssh', '__end__');

  return graph.compile();
}

export function buildSshGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('ssh', sshDispatchNode)
    .addEdge('__start__', 'ssh')
    .addEdge('ssh', '__end__');

  return graph.compile();
}
