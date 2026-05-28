// Smoke test for RAG pipeline
// Requires: Qdrant at QDRANT_URL, Ollama at OLLAMA_URL with nomic-embed-text
//
// Run: node test/rag-smoke.js

import { initDb } from '../server/db.js';
import { ingestDocument, removeDocument } from '../server/rag/ingest.js';
import { ragSearch } from '../server/rag/chat.js';
import { checkOllamaHealth } from '../server/rag/embeddings.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const TEMP_FILE = join(import.meta.dirname, '_test_doc.md');

async function run() {
  console.log('--- RAG Smoke Test ---\n');

  console.log('1. Checking Ollama health...');
  const health = await checkOllamaHealth();
  if (!health.healthy) {
    console.error('   FAIL: Ollama not reachable:', health.error);
    process.exit(1);
  }
  if (!health.hasEmbedModel) {
    console.error(`   FAIL: Embed model not found. Run: ollama pull nomic-embed-text`);
    process.exit(1);
  }
  console.log('   OK:', health.models.join(', '));

  console.log('2. Initializing database...');
  const db = initDb();
  console.log('   OK');

  console.log('3. Creating test document...');
  writeFileSync(TEMP_FILE, '# Kubernetes Troubleshooting\n\nWhen pods are in CrashLoopBackOff, check the logs with `kubectl logs <pod>`. Common causes include missing environment variables, failed health checks, and OOM kills. For OOM issues, increase the memory limit in the deployment spec.\n\n## Node Pressure\n\nIf nodes show MemoryPressure or DiskPressure conditions, pods may be evicted. Use `kubectl describe node <name>` to check conditions and `kubectl top node` to see resource usage.');
  console.log('   OK');

  console.log('4. Ingesting document...');
  const result = await ingestDocument(db, {
    sourceType: 'markdown',
    sourcePath: TEMP_FILE,
  });
  console.log(`   OK: ${result.chunks} chunks ingested into ${result.collection}`);

  console.log('5. Searching for "pod crashing"...');
  const searchResults = await ragSearch('pod crashing', { limit: 3 });
  if (searchResults.length === 0) {
    console.error('   FAIL: No search results returned');
    process.exit(1);
  }
  console.log(`   OK: ${searchResults.length} results, top score: ${searchResults[0].score.toFixed(3)}`);
  console.log(`   Top result preview: "${searchResults[0].text.slice(0, 80)}..."`);

  console.log('6. Cleaning up...');
  await removeDocument(db, result.docId);
  unlinkSync(TEMP_FILE);
  db.close();
  console.log('   OK');

  console.log('\n--- All checks passed ---');
}

run().catch(err => {
  console.error('FAIL:', err.message);
  try { unlinkSync(TEMP_FILE); } catch {}
  process.exit(1);
});
