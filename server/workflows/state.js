import { Annotation } from '@langchain/langgraph';

export const AgentState = Annotation.Root({
  task: Annotation({ reducer: (_, v) => v, default: () => '' }),
  agentId: Annotation({ reducer: (_, v) => v, default: () => null }),
  agentName: Annotation({ reducer: (_, v) => v, default: () => '' }),
  mode: Annotation({ reducer: (_, v) => v, default: () => 'parallel' }),
  model: Annotation({ reducer: (_, v) => v, default: () => 'haiku' }),
  cwd: Annotation({ reducer: (_, v) => v, default: () => '/tmp' }),
  backend: Annotation({ reducer: (_, v) => v, default: () => 'subscription' }),
  runId: Annotation({ reducer: (_, v) => v, default: () => null }),
  mcpConfig: Annotation({ reducer: (_, v) => v, default: () => null }),
  skills: Annotation({ reducer: (_, v) => v, default: () => null }),
  ragContext: Annotation({ reducer: (_, v) => v, default: () => [] }),
  routeDecision: Annotation({ reducer: (_, v) => v, default: () => 'rag' }),
  toolResults: Annotation({ reducer: (prev, v) => [...prev, ...v], default: () => [] }),
  messages: Annotation({ reducer: (prev, v) => [...prev, ...v], default: () => [] }),
  result: Annotation({ reducer: (_, v) => v, default: () => '' }),
  summary: Annotation({ reducer: (_, v) => v, default: () => '' }),
  steps: Annotation({ reducer: (prev, v) => [...prev, v], default: () => [] }),
  error: Annotation({ reducer: (_, v) => v, default: () => null }),
});
