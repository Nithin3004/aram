import { readFileSync } from 'fs';
import { join } from 'path';

/** Minimal .env loader (avoids an extra dependency). Real env vars win. Import first. */
try {
  const text = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env */
}

// DB_SCHEMA (e.g. "live") selects which Postgres schema holds the data; same as scripts/db-env.cjs.
if (process.env.DATABASE_URL && process.env.DB_SCHEMA) {
  const u = new URL(process.env.DATABASE_URL);
  u.searchParams.set('schema', process.env.DB_SCHEMA);
  process.env.DATABASE_URL = u.toString();
}
