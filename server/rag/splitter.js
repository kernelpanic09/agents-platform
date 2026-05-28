const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

export function splitText(text, { chunkSize = DEFAULT_CHUNK_SIZE, chunkOverlap = DEFAULT_CHUNK_OVERLAP, separators = DEFAULT_SEPARATORS } = {}) {
  if (text.length <= chunkSize) {
    return [text.trim()].filter(Boolean);
  }

  const chunks = [];
  recursiveSplit(text, separators, chunkSize, chunkOverlap, chunks);
  return chunks.filter(c => c.trim().length > 0);
}

function recursiveSplit(text, separators, chunkSize, chunkOverlap, chunks) {
  if (text.length <= chunkSize) {
    chunks.push(text.trim());
    return;
  }

  const separator = separators.find(sep => text.includes(sep)) || '';
  const parts = separator ? text.split(separator) : [text];

  let current = '';
  for (const part of parts) {
    const candidate = current ? current + separator + part : part;
    if (candidate.length > chunkSize && current) {
      chunks.push(current.trim());
      const overlapStart = Math.max(0, current.length - chunkOverlap);
      current = current.slice(overlapStart) + separator + part;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
}

export function splitWithMetadata(text, metadata, options = {}) {
  const chunks = splitText(text, options);
  return chunks.map((chunk, index) => ({
    text: chunk,
    metadata: {
      ...metadata,
      chunk_index: index,
      total_chunks: chunks.length,
    },
  }));
}
