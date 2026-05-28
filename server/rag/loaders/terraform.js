import { readFile } from 'fs/promises';

export async function loadTerraform(sourcePath) {
  const content = await readFile(sourcePath, 'utf-8');
  return {
    content,
    metadata: { source_type: 'terraform', source_path: sourcePath },
  };
}
