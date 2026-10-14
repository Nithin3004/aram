/**
 * End-to-end API tests against a throwaway Postgres database (aram_test).
 * Covers: permissions, dispatch match check, sold-qty/variance at closing,
 * offline-sync de-duplication, login lockout and append-only audit/ledger.
 */
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { businessDate } from '@aram/shared';

// A brand-new schema per run: migrated from scratch, nothing existing is reset or dropped.
const SCHEMA = `test_${Date.now()}`;
const TEST_DB = `postgresql://aram:aram@localhost:5433/aram?schema=${SCHEMA}`;
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.SMS_PROVIDER = 'console';
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? 'aram';
process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? 'aramsecret';

let app: INestApplication;
let prisma: PrismaClient;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

async function makeUser(username: string, role: 'SUPER_ADMIN' | 'ADMIN' | 'SHOP', opts: { shopId?: string; permissions?: string[] } = {}) {
  await prisma.user.create({
    data: { username, name: username, phone: '9000000000', role, passwordHash: await bcrypt.hash('pw-123456', 4), shopId: opts.shopId, permissions: opts.permissions ?? [] },
  });
}

async function login(username: string) {
  const http = request(app.getHttpServer());
  const r = await http.post('/api/auth/login').send({ username, password: 'pw-123456', deviceId: 'device-' + username });
  expect(r.status).toBe(201);
  if (!r.body.otpRequired) return r.body.accessToken as string;
  const v = await http.post('/api/auth/verify-otp').send({ challengeId: r.body.challengeId, code: r.body.devCode });
  expect(v.status).toBe(201);
  return v.body.accessToken as string;
}

const api = (who: string) => {
  const http = request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${tokens[who]}`);
  return {
    get: (u: string) => auth(http.get('/api' + u)),
    post: (u: string, body?: object) => auth(http.post('/api' + u)).send(body ?? {}),
    patch: (u: string, body?: object) => auth(http.patch('/api' + u)).send(body ?? {}),
    upload: (u: string) => auth(http.post('/api' + u)).attach('photo', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'p.jpg', contentType: 'image/jpeg' }),
  };
};

async function balance(shopId: string, itemId: string) {
  const r = await prisma.stockLedger.aggregate({ where: { shopId, itemId }, _sum: { qtyGrams: true } });
  return r._sum.qtyGrams ?? 0;
}

beforeAll(async () => {
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: 'ignore' });
  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });

  const ho = await prisma.shop.create({ data: { code: 'HO', nameEn: 'Head Office', nameTa: 'தலைமை', type: 'HO' } });
  const sup = await prisma.shop.create({ data: { code: 'SUP-01', nameEn: 'Chennai', nameTa: 'சென்னை', type: 'SUPERVISOR' } });
  const s1 = await prisma.shop.create({ data: { code: 'S-001', nameEn: 'Anna Nagar', nameTa: 'அண்ணா நகர்', type: 'SMALL', parentId: sup.id } });
  const s2 = await prisma.shop.create({ data: { code: 'S-002', nameEn: 'Tambaram', nameTa: 'தாம்பரம்', type: 'SMALL', parentId: sup.id } });
  const rice = await prisma.item.create({ data: { code: 'RICE', nameEn: 'Rice', nameTa: 'அரிசி', sortOrder: 1 } });
  const sugar = await prisma.item.create({ data: { code: 'SUGAR', nameEn: 'Sugar', nameTa: 'சர்க்கரை', sortOrder: 2 } });
  await prisma.itemPrice.createMany({
    data: [
      { itemId: rice.id, pricePaisePerKg: 5000, effectiveFrom: '2020-01-01' },
      { itemId: sugar.id, pricePaisePerKg: 4000, effectiveFrom: '2020-01-01' },
    ],
  });
  // HO opening stock: 1000 kg each.
  await prisma.stockLedger.createMany({
    data: [rice, sugar].map((i) => ({ shopId: ho.id, itemId: i.id, qtyGrams: 1_000_000, type: 'PURCHASE' as const, refType: 'Test', refId: 'init' })),
  });
  Object.assign(ids, { ho: ho.id, sup: sup.id, s1: s1.id, s2: s2.id, rice: rice.id, sugar: sugar.id });

  await makeUser('super', 'SUPER_ADMIN');
  await makeUser('ops', 'ADMIN', { permissions: ['CREATE_DISPATCH', 'APPROVE_REQUESTS', 'RESOLVE_ISSUES'] });
  await makeUser('pricer', 'ADMIN', { permissions: ['CHANGE_PRICES'] });
  await makeUser('viewer', 'ADMIN');
  await makeUser('sup01', 'SHOP', { shopId: sup.id });
  await makeUser('s001', 'SHOP', { shopId: s1.id });
  await makeUser('s002', 'SHOP', { shopId: s2.id });
  await makeUser('locky', 'SHOP', { shopId: s2.id });

  const { AppModule } = await import('../src/app.module');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();

  for (const u of ['super', 'ops', 'pricer', 'viewer', 'sup01', 's001', 's002']) tokens[u] = await login(u);
});

afterAll(async () => {
  await app?.close();
  // Remove only the schema this run created.
  await prisma?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`).catch(() => undefined);
  await prisma?.$disconnect();
});

describe('permissions (server-side)', () => {
  it('rejects unauthenticated calls', async () => {
    const r = await request(app.getHttpServer()).get('/api/items');
    expect(r.status).toBe(401);
  });

  it('keeps shops out of HO endpoints', async () => {
    expect((await api('s001').get('/dashboard/overview')).status).toBe(403);
    expect((await api('s001').post('/dispatches', { destShopId: ids.s2, lines: [{ itemId: ids.rice, grams: 1000 }] })).status).toBe(403);
    expect((await api('s001').post(`/items/${ids.rice}/price`, { pricePaisePerKg: 1 })).status).toBe(403);
  });

  it('checks each admin permission', async () => {
    expect((await api('viewer').post(`/items/${ids.rice}/price`, { pricePaisePerKg: 5100 })).status).toBe(403);
    expect((await api('ops').post(`/items/${ids.rice}/price`, { pricePaisePerKg: 5100 })).status).toBe(403);
    expect((await api('pricer').post(`/items/${ids.rice}/price`, { pricePaisePerKg: 5100 })).status).toBe(201);
    expect((await api('pricer').post('/dispatches', { destShopId: ids.s1, lines: [{ itemId: ids.rice, grams: 1000 }] })).status).toBe(403);
    expect((await api('viewer').get('/dashboard/overview')).status).toBe(200);
  });

  it('schedules price changes for the next day only', async () => {
    const tomorrow = await prisma.itemPrice.findFirst({ where: { itemId: ids.rice, pricePaisePerKg: 5100 } });
    expect(tomorrow!.effectiveFrom > businessDate()).toBe(true);
  });

  it('only Super Admin manages admins, and Super Admin is fixed', async () => {
    const opsUser = await prisma.user.findUniqueOrThrow({ where: { username: 'ops' } });
    const superUser = await prisma.user.findUniqueOrThrow({ where: { username: 'super' } });
    expect((await api('ops').patch(`/admins/${opsUser.id}`, { permissions: [] })).status).toBe(403);
    expect((await api('super').patch(`/admins/${superUser.id}`, { permissions: [] })).status).toBe(400);
  });

  it('supervisor sees child stock but not child sales; small shops see only themselves', async () => {
    const r = await api('sup01').get(`/shops/${ids.s1}`);
    expect(r.status).toBe(200);
    expect(r.body.sales).toBeNull();
    expect((await api('s001').get(`/shops/${ids.s2}`)).status).toBe(403);
    expect((await api('s001').get(`/shops/${ids.sup}`)).status).toBe(403);
    const own = await api('s001').get(`/shops/${ids.s1}`);
    expect(own.body.sales).not.toBeNull();
  });

  it('disabling an admin takes effect immediately', async () => {
    const viewer = await prisma.user.findUniqueOrThrow({ where: { username: 'viewer' } });
    expect((await api('super').patch(`/admins/${viewer.id}`, { isActive: false })).status).toBe(200);
    expect((await api('viewer').get('/items')).status).toBe(401);
    await api('super').patch(`/admins/${viewer.id}`, { isActive: true });
  });
});

describe('dispatch lifecycle + match check', () => {
  let dispatchId = '';
  let code = '';

  it('HO creates → CREATED with a 6-digit delivery code', async () => {
    const r = await api('ops').post('/dispatches', {
      destShopId: ids.s1,
      lines: [
        { itemId: ids.rice, grams: 100_000 },
        { itemId: ids.sugar, grams: 50_000 },
      ],
    });
    expect(r.status).toBe(201);
    dispatchId = r.body.id;
    const v = await api('ops').get(`/dispatches/${dispatchId}`);
    expect(v.body.status).toBe('CREATED');
    code = v.body.deliveryCode;
    expect(code).toMatch(/^\d{6}$/);
    // The receiver never gets the code from the API.
    expect((await api('s001').get(`/dispatches/${dispatchId}`)).body.deliveryCode).toBeUndefined();
  });

  it('cannot be received before it is dispatched', async () => {
    expect((await api('s001').post('/dispatches/lookup', { code })).status).toBe(400);
  });

  it('sender confirms sent qty → DISPATCHED, stock leaves HO', async () => {
    const before = await balance(ids.ho, ids.rice);
    const r = await api('ops').post(`/dispatches/${dispatchId}/dispatch`, {
      lines: [
        { itemId: ids.rice, sentGrams: 100_000 },
        { itemId: ids.sugar, sentGrams: 50_000 },
      ],
    });
    expect(r.status).toBe(201);
    expect(await balance(ids.ho, ids.rice)).toBe(before - 100_000);
  });

  it('wrong code is rejected; another shop cannot use the right code', async () => {
    const wrong = code === '000000' ? '111111' : '000000';
    expect((await api('s001').post('/dispatches/lookup', { code: wrong })).status).toBe(400);
    expect((await api('s002').post('/dispatches/lookup', { code })).status).toBe(400);
    expect((await api('s001').post('/dispatches/lookup', { code })).status).toBe(201);
  });

  it('receiving needs the valid code and a photo; all equal → MATCHED and ledger updates', async () => {
    const noPhoto = await api('s001').post(`/dispatches/${dispatchId}/receive`, {
      code,
      photoKey: 'receipts/other/x',
      lines: [
        { itemId: ids.rice, receivedGrams: 100_000 },
        { itemId: ids.sugar, receivedGrams: 50_000 },
      ],
    });
    expect(noPhoto.status).toBe(400);

    const photo = await api('s001').upload('/dispatches/photo');
    expect(photo.status).toBe(201);
    const r = await api('s001').post(`/dispatches/${dispatchId}/receive`, {
      code,
      photoKey: photo.body.photoKey,
      lines: [
        { itemId: ids.rice, receivedGrams: 100_000 },
        { itemId: ids.sugar, receivedGrams: 50_000 },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('MATCHED');
    expect(await balance(ids.s1, ids.rice)).toBe(100_000);
    expect(await prisma.issue.count({ where: { dispatchId } })).toBe(0);
  });

  it('the code is one-time', async () => {
    const photo = await api('s001').upload('/dispatches/photo');
    const again = await api('s001').post(`/dispatches/${dispatchId}/receive`, {
      code,
      photoKey: photo.body.photoKey,
      lines: [
        { itemId: ids.rice, receivedGrams: 100_000 },
        { itemId: ids.sugar, receivedGrams: 50_000 },
      ],
    });
    expect(again.status).toBe(400);
    expect(await balance(ids.s1, ids.rice)).toBe(100_000);
  });

  it('any mismatch → DISCREPANCY, auto issue, actual qty booked; HO resolves → RESOLVED', async () => {
    const c = await api('ops').post('/dispatches', { destShopId: ids.s1, lines: [{ itemId: ids.sugar, grams: 20_000 }] });
    const id = c.body.id;
    const dcode = (await api('ops').get(`/dispatches/${id}`)).body.deliveryCode;
    await api('ops').post(`/dispatches/${id}/dispatch`, { lines: [{ itemId: ids.sugar, sentGrams: 20_000 }] });
    const before = await balance(ids.s1, ids.sugar);
    const photo = await api('s001').upload('/dispatches/photo');
    const r = await api('s001').post(`/dispatches/${id}/receive`, { code: dcode, photoKey: photo.body.photoKey, lines: [{ itemId: ids.sugar, receivedGrams: 18_500 }] });
    expect(r.body.status).toBe('DISCREPANCY');
    expect(await balance(ids.s1, ids.sugar)).toBe(before + 18_500);

    const issue = await prisma.issue.findFirstOrThrow({ where: { dispatchId: id } });
    expect(issue.source).toBe('AUTO');
    expect(issue.type).toBe('DISPATCH_DISCREPANCY');

    // Shops cannot resolve; HO needs a note.
    expect((await api('s001').post(`/issues/${issue.id}/resolve`, { note: 'x' })).status).toBe(403);
    expect((await api('ops').post(`/issues/${issue.id}/resolve`, { note: '' })).status).toBe(400);

    expect((await api('ops').post(`/issues/${issue.id}/recount-request`)).status).toBe(201);
    expect((await api('s001').post(`/issues/${issue.id}/recount`, { lines: [{ itemId: ids.sugar, receivedGrams: 19_000 }], note: 'found one bag' })).status).toBe(201);

    const res = await api('ops').post(`/issues/${issue.id}/resolve`, {
      note: 'Recount found 0.5 kg more',
      adjustments: [{ shopId: ids.s1, itemId: ids.sugar, grams: 500 }],
    });
    expect(res.status).toBe(201);
    expect((await prisma.dispatch.findUniqueOrThrow({ where: { id } })).status).toBe('RESOLVED');
    expect(await balance(ids.s1, ids.sugar)).toBe(before + 19_000);
  });

  it('HO-ordered transfer: only the sending supervisor confirms it', async () => {
    // Give the supervisor some stock first.
    await prisma.stockLedger.create({ data: { shopId: ids.sup, itemId: ids.rice, qtyGrams: 200_000, type: 'ADJUSTMENT', refType: 'Test', refId: 'sup' } });
    const c = await api('ops').post('/dispatches', { sourceShopId: ids.sup, destShopId: ids.s2, lines: [{ itemId: ids.rice, grams: 120_000 }] });
    expect(c.status).toBe(201);
    const id = c.body.id;
    expect((await api('s001').post(`/dispatches/${id}/dispatch`, { lines: [{ itemId: ids.rice, sentGrams: 120_000 }] })).status).toBe(403);
    expect((await api('sup01').post(`/dispatches/${id}/dispatch`, { lines: [{ itemId: ids.rice, sentGrams: 120_000 }] })).status).toBe(201);
    expect(await balance(ids.sup, ids.rice)).toBe(80_000);
  });

  it('cannot order more than the source holds', async () => {
    const r = await api('ops').post('/dispatches', { sourceShopId: ids.sup, destShopId: ids.s1, lines: [{ itemId: ids.rice, grams: 500_000 }] });
    expect(r.status).toBe(400);
  });
});

describe('requests & approvals', () => {
  it('same clientId twice → one request (offline sync de-dup)', async () => {
    const clientId = randomUUID();
    const body = { clientId, reason: 'Festival', lines: [{ itemId: ids.rice, grams: 50_000 }, { itemId: ids.sugar, grams: 10_000 }] };
    const a = await api('s002').post('/requests', body);
    const b = await api('s002').post('/requests', body);
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.body.duplicate).toBe(true);
    expect(await prisma.stockRequest.count({ where: { clientId } })).toBe(1);
  });

  it('partial approval auto-creates a dispatch; reject needs a reason; decided requests are final', async () => {
    const r = await prisma.stockRequest.findFirstOrThrow({ where: { shopId: ids.s2 } });
    expect((await api('viewer').post(`/requests/${r.id}/approve`, { lines: [] })).status).toBe(403);
    const ok = await api('ops').post(`/requests/${r.id}/approve`, {
      lines: [
        { itemId: ids.rice, approvedGrams: 30_000 },
        { itemId: ids.sugar, approvedGrams: 0 },
      ],
    });
    expect(ok.status).toBe(201);
    const saved = await prisma.stockRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved.status).toBe('APPROVED');
    expect(saved.approvalType).toBe('PARTIAL');
    const d = await prisma.dispatch.findUniqueOrThrow({ where: { id: ok.body.dispatchId }, include: { lines: true } });
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].orderedGrams).toBe(30_000);
    expect((await api('ops').post(`/requests/${r.id}/reject`, { reason: 'late' })).status).toBe(400);

    const r2 = await api('s002').post('/requests', { clientId: randomUUID(), reason: 'x', lines: [{ itemId: ids.rice, grams: 1000 }] });
    expect((await api('ops').post(`/requests/${r2.body.id}/reject`, { reason: '' })).status).toBe(400);
    expect((await api('ops').post(`/requests/${r2.body.id}/reject`, { reason: 'Not needed' })).status).toBe(201);
  });
});

describe('daily closing', () => {
  it('computes sold qty, expected revenue and flags variance; locks the day; de-dups sync', async () => {
    // S-001 holds rice 100 kg, sugar 69 kg (50 matched + 19 after the resolved mismatch).
    const draft = await api('s001').get('/closings/draft');
    expect(draft.status).toBe(200);
    const rice = draft.body.lines.find((l: { itemId: string }) => l.itemId === ids.rice);
    expect(rice.openingGrams + rice.receivedGrams).toBe(100_000);

    const clientId = randomUUID();
    const body = {
      clientId,
      businessDate: businessDate(),
      capturedAt: new Date().toISOString(),
      // Sold rice 40 kg (₹2,000) and sugar 9 kg (₹360) → expected ₹2,360.
      lines: [
        { itemId: ids.rice, closingGrams: 60_000 },
        { itemId: ids.sugar, closingGrams: 60_000 },
      ],
      cashPaise: 150_000,
      upiPaise: 60_000, // collected ₹2,100 → gap −₹260
      note: 'change given wrongly',
    };
    const a = await api('s001').post('/closings', body);
    expect(a.status).toBe(201);
    expect(a.body.expectedRevenuePaise).toBe(236_000);
    expect(a.body.variancePaise).toBe(-26_000);
    expect(a.body.varianceFlagged).toBe(true);
    expect(await balance(ids.s1, ids.rice)).toBe(60_000);

    const b = await api('s001').post('/closings', body);
    expect(b.status).toBe(201);
    expect(b.body.duplicate).toBe(true);
    expect(await prisma.dailyClosing.count({ where: { shopId: ids.s1 } })).toBe(1);
    expect(await balance(ids.s1, ids.rice)).toBe(60_000);
    expect(await prisma.issue.count({ where: { shopId: ids.s1, type: 'CASH_VARIANCE' } })).toBe(1);

    // A second, different submission for the same day is refused (locked).
    const c = await api('s001').post('/closings', { ...body, clientId: randomUUID() });
    expect(c.status).toBe(409);
  });

  it('flags negative sold qty', async () => {
    // S-002 has no stock; claiming 5 kg left means closing > opening + received.
    const r = await api('s002').post('/closings', {
      clientId: randomUUID(),
      businessDate: businessDate(),
      capturedAt: new Date().toISOString(),
      lines: [{ itemId: ids.sugar, closingGrams: 5_000 }],
      cashPaise: 0,
      upiPaise: 0,
    });
    expect(r.status).toBe(201);
    expect(await prisma.issue.count({ where: { shopId: ids.s2, type: 'NEGATIVE_SOLD' } })).toBe(1);
  });

  it('issues raised offline are de-duplicated too', async () => {
    const body = { clientId: randomUUID(), type: 'DAMAGED_GOODS', description: 'Wet bags' };
    const a = await api('s002').post('/issues', body);
    const b = await api('s002').post('/issues', body);
    expect(b.body.id).toBe(a.body.id);
    expect(await prisma.issue.count({ where: { clientId: body.clientId } })).toBe(1);
  });
});

describe('login security & append-only records', () => {
  it('locks an account after 5 wrong passwords and logs every attempt', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 5; i++) await http.post('/api/auth/login').send({ username: 'locky', password: 'nope', deviceId: 'dev-lock-1' });
    const r = await http.post('/api/auth/login').send({ username: 'locky', password: 'pw-123456', deviceId: 'dev-lock-1' });
    expect(r.status).toBe(423);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'locky' } });
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: 'LOGIN_FAILED' } })).toBeGreaterThanOrEqual(6);
  });

  it('shops skip OTP on a trusted device, admins never do', async () => {
    const http = request(app.getHttpServer());
    const shop = await http.post('/api/auth/login').send({ username: 's001', password: 'pw-123456', deviceId: 'device-s001' });
    expect(shop.body.otpRequired).toBe(false);
    const shopNew = await http.post('/api/auth/login').send({ username: 's001', password: 'pw-123456', deviceId: 'brand-new-phone' });
    expect(shopNew.body.otpRequired).toBe(true);
    const admin = await http.post('/api/auth/login').send({ username: 'ops', password: 'pw-123456', deviceId: 'device-ops' });
    expect(admin.body.otpRequired).toBe(true);
  });

  it('audit log and stock ledger reject UPDATE and DELETE', async () => {
    await expect(prisma.$executeRawUnsafe('UPDATE "AuditLog" SET "summary" = \'x\'')).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('DELETE FROM "AuditLog"')).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('UPDATE "StockLedger" SET "qtyGrams" = 0')).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('DELETE FROM "StockLedger"')).rejects.toThrow(/append-only/);
  });
});
