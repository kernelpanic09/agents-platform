import { chatComplete } from '../llm.js';

export async function routeTask(task, agent) {

  const prompt = `Classify this task into exactly one category. Reply with ONLY the category name.

Categories:
- RAG: Questions that can be answered from documentation or knowledge base
- WORKFLOW: Multi-step tasks requiring tool use (kubectl, file reading, analysis)
- SSH: Tasks requiring code generation, file editing, or infrastructure changes

Agent: ${agent.name} (${agent.title})
Task: ${task}

Category:`;

  try {
    const response = await chatComplete([{ role: 'user', content: prompt }], { model: 'haiku', maxTokens: 100, temperature: 0, timeoutMs: 60000 });
    const category = response.content.trim().toUpperCase();
    if (['RAG', 'WORKFLOW', 'SSH'].includes(category)) return category.toLowerCase();
    return 'ssh';
  } catch {
    return 'ssh';
  }
}
