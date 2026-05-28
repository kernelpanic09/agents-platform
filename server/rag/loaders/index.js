import { loadMarkdown } from './markdown.js';
import { loadYaml } from './yaml.js';
import { loadTerraform } from './terraform.js';
import { loadUrl } from './url.js';
import { loadTranscript } from './transcript.js';

const loaders = {
  markdown: loadMarkdown,
  yaml: loadYaml,
  terraform: loadTerraform,
  url: loadUrl,
  transcript: loadTranscript,
};

export function getLoader(sourceType) {
  const loader = loaders[sourceType];
  if (!loader) throw new Error(`Unknown source type: ${sourceType}. Valid types: ${Object.keys(loaders).join(', ')}`);
  return loader;
}

export function getSupportedTypes() {
  return Object.keys(loaders);
}
