import { Router } from 'express';
import { spawn } from 'child_process';
import { SAFETY_PREAMBLE } from '../safety-prompt.js';

const APPS_ROOT = process.env.APPS_ROOT || '/home/ubuntu/apps';
const SSH_TARGET = process.env.SSH_TARGET || 'ubuntu@your-host';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '/secrets/ssh/id_ed25519';

// List app directories on the remote host via SSH. The pod's own filesystem
// doesn't contain apps, so we SSH to the build host to enumerate them.
let cachedApps = null;
let cachedAt = 0;

function listAppsOverSsh() {
  return new Promise((resolve) => {
    const child = spawn('ssh', [
      '-i', SSH_KEY_PATH,
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'BatchMode=yes',
      SSH_TARGET,
      `ls -1 ${APPS_ROOT}`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    child.stdout.on('data', (c) => { stdout += c.toString('utf-8'); });
    child.on('close', (code) => {
      if (code !== 0) return resolve([]);
      const apps = stdout
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(name => /^[a-zA-Z0-9_-]+$/.test(name))
        .map(name => ({ name, path: `${APPS_ROOT}/${name}` }))
        .sort((a, b) => a.name.localeCompare(b.name));
      resolve(apps);
    });
    child.on('error', () => resolve([]));
  });
}

export default function appsRouter() {
  const router = Router();

  // GET /api/apps -- list app directories on the remote host.
  // Always returns an array (empty on failure) so the frontend never sees
  // a non-array payload for this endpoint.
  router.get('/', async (req, res) => {
    const now = Date.now();
    if (cachedApps && now - cachedAt < 60_000) {
      return res.json(cachedApps);
    }
    const apps = await listAppsOverSsh();
    cachedApps = apps;
    cachedAt = now;
    res.json(apps);
  });

  // GET /api/apps/safety-preamble — returns the static preamble text so the
  // frontend preview can show users exactly what gets prepended to their prompt.
  router.get('/safety-preamble', (req, res) => {
    res.type('text/plain').send(SAFETY_PREAMBLE);
  });

  return router;
}
