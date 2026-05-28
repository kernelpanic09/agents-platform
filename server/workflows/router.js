import { ChatAnthropic } from '@langchain/anthropic';

const ROUTER_MODEL = 'claude-haiku-4-5-20251001';

export async function routeTask(task, agent) {
  const llm = new ChatAnthropic({
    model: ROUTER_MODEL,
    maxTokens: 100,
    temperature: 0,
  });

  const prompt = `Classify this task into exactly one category. Reply with ONLY the category name.

Categories:
- RAG: Questions that can be answered from documentation or knowledge base
- WORKFLOW: Multi-step tasks requiring tool use (kubectl, file reading, analysis)
- SSH: Tasks requiring code generation, file editing, or infrastructure changes

Agent: ${agent.name} (${agent.title})
Task: ${task}

Category:`;

  try {
    const response = await llm.invoke(prompt);
    const category = response.content.trim().toUpperCase();
    if (['RAG', 'WORKFLOW', 'SSH'].includes(category)) return category.toLowerCase();
    return 'ssh';
  } catch {
    return 'ssh';
  }
}
