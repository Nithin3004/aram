/* eslint-disable no-console */
/**
 * Loads real master data from CSV files (save from Excel as "CSV UTF-8") into an EMPTY database.
 *
 *   pnpm --filter @aram/api import <folder>
 *
 * Folder must contain: admins.csv, shops.csv, items.csv, vendors.csv, opening_stock.csv
 * (see /data-import/templates). Every row is checked first; if anything is wrong, all problems are
 * listed with file and line number and nothing is written.
 *
 * Database: apps/api/.env.import (DATABASE_URL=...) if present, otherwise apps/api/.env.
 * Initial passwords: IMPORT_ADMIN_PASSWORD and IMPORT_SHOP_PASSWORD (env or .env.import).
 * People should change them after first login (Settings → Change password).
 */
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

// Load .env.import first (it wins), then the normal .env loader fills anything missing.
const importEnv = join(__dirname, '..', '.env.import');
if (existsSync(importEnv)) {
  for (const line of readFileSync(importEnv, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
import '../src/env';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, businessDate, kgToGrams, rupeesToPaise } from '@aram/shared';

// ---- tiny CSV reader (quotes, commas in quotes, BOM, CRLF) -------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

type Row = Record<string, string> & { __line: number };
const errors: string[] = [];

function readTable(dir: string, file: string, required: string[]): Row[] {
  const path = join(dir, file);
  if (!existsSync(path)) {
    errors.push(`${file}: file not found in ${dir}`);
    return [];
  }
  const [header, ...body] = parseCsv(readFileSync(path, 'utf8'));
  const cols = (header ?? []).map((h) => h.trim().toLowerCase());
  for (const r of required) if (!cols.includes(r)) errors.push(`${file}: missing column "${r}"`);
  return body.map((cells, i) => {
    const o: Row = { __line: i + 2 } as Row;
    cols.forEach((c, j) => (o[c] = (cells[j] ?? '').trim()));
    return o;
  });
}

const err = (file: string, r: Row, msg: string) => errors.push(`${file} line ${r.__line}: ${msg}`);
const USERNAME = /^[a-z0-9._-]{3,64}$/;
const PHONE = /^\d{10}$/;

async function main() {
  const dir = resolve(process.argv[2] ?? '');
  if (!process.argv[2]) {
    console.error('Usage: pnpm --filter @aram/api import <folder-with-csv-files>');
    process.exit(1);
  }
  const adminPw = process.env.IMPORT_ADMIN_PASSWORD ?? '';
  const shopPw = process.env.IMPORT_SHOP_PASSWORD ?? '';
  if (adminPw.length < 8) errors.push('IMPORT_ADMIN_PASSWORD must be set (at least 8 characters)');
  if (shopPw.length < 8) errors.push('IMPORT_SHOP_PASSWORD must be set (at least 8 characters)');

  const admins = readTable(dir, 'admins.csv', ['username', 'name', 'phone', 'role', 'permissions']);
  const shops = readTable(dir, 'shops.csv', ['code', 'type', 'name_en', 'name_ta', 'supervisor_code', 'username', 'phone']);
  const items = readTable(dir, 'items.csv', ['code', 'name_en', 'name_ta', 'price_per_kg']);
  const vendors = readTable(dir, 'vendors.csv', ['name_en', 'name_ta', 'phone', 'supplies']);
  const stock = readTable(dir, 'opening_stock.csv', ['shop_code', 'item_code', 'kg']);

  // ---- validate ----------------------------------------------------------------------------
  const usernames = new Set<string>();
  const takeUsername = (file: string, r: Row, u: string) => {
    if (!USERNAME.test(u)) err(file, r, `username "${u}" — use 3+ lowercase letters/numbers/._- only`);
    else if (usernames.has(u)) err(file, r, `username "${u}" is used twice`);
    usernames.add(u);
  };

  let superAdmins = 0;
  for (const a of admins) {
    takeUsername('admins.csv', a, a.username.toLowerCase());
    if (!a.name) err('admins.csv', a, 'name is empty');
    if (!PHONE.test(a.phone)) err('admins.csv', a, `phone "${a.phone}" must be 10 digits`);
    const role = a.role.toUpperCase();
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') err('admins.csv', a, `role "${a.role}" must be SUPER_ADMIN or ADMIN`);
    if (role === 'SUPER_ADMIN') superAdmins++;
    for (const p of a.permissions.split(/[;|]/).map((x) => x.trim().toUpperCase()).filter(Boolean)) {
      if (!ALL_PERMISSIONS.includes(p as never)) err('admins.csv', a, `unknown permission "${p}" (allowed: ${ALL_PERMISSIONS.join(', ')})`);
    }
  }
  if (admins.length && superAdmins === 0) errors.push('admins.csv: at least one row must have role SUPER_ADMIN');

  const shopCodes = new Map<string, Row>();
  for (const s of shops) {
    const code = s.code.toUpperCase();
    if (!code || code === 'HO') err('shops.csv', s, `code "${s.code}" is empty or reserved (HO is created automatically)`);
    else if (shopCodes.has(code)) err('shops.csv', s, `shop code "${code}" is used twice`);
    shopCodes.set(code, s);
    const type = s.type.toUpperCase();
    if (type !== 'SUPERVISOR' && type !== 'SMALL') err('shops.csv', s, `type "${s.type}" must be SUPERVISOR or SMALL`);
    if (!s.name_en) err('shops.csv', s, 'name_en is empty');
    if (!s.name_ta) err('shops.csv', s, 'name_ta (Tamil name) is empty');
    if (!PHONE.test(s.phone)) err('shops.csv', s, `phone "${s.phone}" must be 10 digits`);
    takeUsername('shops.csv', s, s.username.toLowerCase());
  }
  for (const s of shops) {
    const type = s.type.toUpperCase();
    const sup = s.supervisor_code.toUpperCase();
    if (type === 'SMALL') {
      const parent = shopCodes.get(sup);
      if (!sup) err('shops.csv', s, 'a SMALL shop needs supervisor_code');
      else if (!parent || parent.type.toUpperCase() !== 'SUPERVISOR') err('shops.csv', s, `supervisor_code "${sup}" is not a SUPERVISOR shop in this file`);
    } else if (sup) err('shops.csv', s, 'a SUPERVISOR shop must leave supervisor_code empty');
  }

  const itemCodes = new Map<string, Row>();
  const parseNum = (file: string, r: Row, field: string, fn: (v: string) => number) => {
    try {
      const v = fn(r[field]);
      if (v <= 0) throw new Error();
      return v;
    } catch {
      err(file, r, `${field} "${r[field]}" must be a number above 0`);
      return 0;
    }
  };
  for (const it of items) {
    const code = it.code.toUpperCase();
    if (!code) err('items.csv', it, 'code is empty');
    else if (itemCodes.has(code)) err('items.csv', it, `item code "${code}" is used twice`);
    itemCodes.set(code, it);
    if (!it.name_en) err('items.csv', it, 'name_en is empty');
    if (!it.name_ta) err('items.csv', it, 'name_ta (Tamil name) is empty');
    parseNum('items.csv', it, 'price_per_kg', rupeesToPaise);
  }
  for (const v of vendors) if (!v.name_en) err('vendors.csv', v, 'name_en is empty');

  const stockKeys = new Set<string>();
  for (const r of stock) {
    const shop = r.shop_code.toUpperCase();
    const item = r.item_code.toUpperCase();
    if (shop !== 'HO' && !shopCodes.has(shop)) err('opening_stock.csv', r, `shop_code "${r.shop_code}" is not in shops.csv (use HO for the warehouse)`);
    if (!itemCodes.has(item)) err('opening_stock.csv', r, `item_code "${r.item_code}" is not in items.csv`);
    if (stockKeys.has(`${shop}|${item}`)) err('opening_stock.csv', r, `${shop} / ${item} appears twice`);
    stockKeys.add(`${shop}|${item}`);
    if (r.kg !== '0') parseNum('opening_stock.csv', r, 'kg', kgToGrams);
  }

  const prisma = new PrismaClient();
  try {
    if (await prisma.shop.count()) errors.push('The database already has shops. Import only runs on an empty database.');
    if (errors.length) {
      console.error(`\nNothing was imported. Fix these ${errors.length} problem(s) and run again:\n`);
      for (const e of errors) console.error('  • ' + e);
      process.exit(1);
    }

    // ---- write everything in one transaction ---------------------------------------------
    const today = businessDate();
    const adminHash = await bcrypt.hash(adminPw, 10);
    const shopHash = await bcrypt.hash(shopPw, 10);
    await prisma.$transaction(
      async (tx) => {
        await tx.setting.createMany({
          data: [
            { key: 'varianceTolerancePaise', value: '10000' },
            { key: 'lowStockDays', value: '2' },
            { key: 'closingDueTime', value: '21:00' },
            { key: 'requestFrequencyPerWeek', value: '3' },
          ],
        });
        await tx.user.createMany({
          data: admins.map((a) => ({
            username: a.username.toLowerCase(),
            name: a.name,
            phone: a.phone,
            role: a.role.toUpperCase() as 'SUPER_ADMIN' | 'ADMIN',
            permissions: a.role.toUpperCase() === 'SUPER_ADMIN' ? [] : a.permissions.split(/[;|]/).map((x) => x.trim().toUpperCase()).filter(Boolean),
            passwordHash: adminHash,
            language: 'en',
          })),
        });

        const ho = await tx.shop.create({ data: { code: 'HO', nameEn: 'Head Office', nameTa: 'தலைமை அலுவலகம்', type: 'HO' } });
        const ids = new Map<string, string>([['HO', ho.id]]);
        for (const type of ['SUPERVISOR', 'SMALL'] as const) {
          for (const s of shops.filter((x) => x.type.toUpperCase() === type)) {
            const created = await tx.shop.create({
              data: {
                code: s.code.toUpperCase(),
                nameEn: s.name_en,
                nameTa: s.name_ta,
                type,
                parentId: type === 'SMALL' ? ids.get(s.supervisor_code.toUpperCase()) : null,
              },
            });
            ids.set(created.code, created.id);
          }
        }
        await tx.user.createMany({
          data: shops.map((s) => ({
            username: s.username.toLowerCase(),
            name: `${s.code.toUpperCase()} ${s.name_en}`,
            phone: s.phone,
            role: 'SHOP' as const,
            shopId: ids.get(s.code.toUpperCase())!,
            passwordHash: shopHash,
            language: 'ta',
          })),
        });

        const itemIds = new Map<string, string>();
        for (const [i, it] of items.entries()) {
          const created = await tx.item.create({ data: { code: it.code.toUpperCase(), nameEn: it.name_en, nameTa: it.name_ta, sortOrder: i + 1 } });
          itemIds.set(created.code, created.id);
          await tx.itemPrice.create({ data: { itemId: created.id, pricePaisePerKg: rupeesToPaise(it.price_per_kg), effectiveFrom: today } });
        }
        if (vendors.length) {
          await tx.vendor.createMany({ data: vendors.map((v) => ({ nameEn: v.name_en, nameTa: v.name_ta, phone: v.phone, supplies: v.supplies })) });
        }
        // Opening stock is the first ledger entry for each shop/item.
        const ledger = stock
          .filter((r) => r.kg !== '0')
          .map((r) => ({
            shopId: ids.get(r.shop_code.toUpperCase())!,
            itemId: itemIds.get(r.item_code.toUpperCase())!,
            qtyGrams: kgToGrams(r.kg),
            type: 'ADJUSTMENT' as const,
            refType: 'OpeningStock',
            refId: today,
            note: 'Opening stock (import)',
          }));
        for (let i = 0; i < ledger.length; i += 2000) await tx.stockLedger.createMany({ data: ledger.slice(i, i + 2000) });

        await tx.auditLog.create({
          data: {
            actorName: 'System',
            action: 'IMPORT',
            entityType: 'System',
            entityId: 'import',
            summary: `Imported ${admins.length} admins, ${shops.length} shops, ${items.length} items, ${vendors.length} vendors, ${ledger.length} opening stock rows`,
          },
        });
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
    console.log(`\nImported ${admins.length} admins, ${shops.length} shops (+ HO), ${items.length} items, ${vendors.length} vendors, ${stock.length} opening stock rows.`);
    console.log('Everyone should change their password after first login (Settings → Change password).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
