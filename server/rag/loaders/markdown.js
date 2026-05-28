import { readFile } from 'fs/promises';

export async function loadMarkdown(sourcePath) {
  const content = await readFile(sourcePath, 'utf-8');
  return {
    content,
    metadata: { source_type: 'markdown', source_path: sourcePath },
  };
}
