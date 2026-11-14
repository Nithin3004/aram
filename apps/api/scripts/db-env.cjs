#!/usr/bin/env node
/**
 * Runs a command with DATABASE_URL pointed at the Postgres schema named in DB_SCHEMA
 * (e.g. "live"), so live data sits apart from the preview/sample data in the same database.
 *   node scripts/db-env.cjs npx prisma migrate deploy
 */
const { spawnSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

// Locally the URL lives in apps/api/.env; on the host it is a real environment variable (which wins).
try {
  for (const line of readFileSync(join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env */
}

const url = process.env.DATABASE_URL;
const schema = process.env.DB_SCHEMA;
if (url && schema) {
  const u = new URL(url);
  u.searchParams.set('schema', schema);
  process.env.DATABASE_URL = u.toString();
}
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
process.exit(r.status ?? 1);
