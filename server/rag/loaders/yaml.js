import { readFile } from 'fs/promises';

export async function loadYaml(sourcePath) {
  const content = await readFile(sourcePath, 'utf-8');
  return {
    content,
    metadata: { source_type: 'yaml', source_path: sourcePath },
  };
}
