/* eslint-disable no-console */
/**
 * Preview seed: a realistic 380-shop network with a week of history.
 * History is simulated with the same shared rules the API uses (computeClosing,
 * matchCheck) and written straight to the DB; live scenarios are left open so
 * every flow can be clicked through.
 *
 * Run on an empty database (pnpm --filter @aram/api db:reset).
 */
import '../src/env';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { addDays, businessDate, computeClosing, istTimeOn, lineValuePaise } from '@aram/shared';

const prisma = new PrismaClient();

// ---- deterministic randomness ----------------------------------------------
let seed = 20260921;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + rand() * (b - a);
const code6 = () => String(Math.floor(rand() * 1_000_000)).padStart(6, '0');
const roundTo = (g: number, step = 500) => Math.max(0, Math.round(g / step) * step);

// ---- master data -----------------------------------------------------------
// [code, en, ta, price ₹/kg, small-shop daily kg (0 = supervisors only)]
const ITEMS: [string, string, string, number, number][] = [
  ['ITM-01', 'Ponni rice', 'பொன்னி அரிசி', 52, 24],
  ['ITM-02', 'Raw rice', 'பச்சரிசி', 48, 9],
  ['ITM-03', 'Idli rice', 'இட்லி அரிசி', 44, 8],
  ['ITM-04', 'Sugar', 'சர்க்கரை', 44, 11],
  ['ITM-05', 'Toor dal', 'துவரம் பருப்பு', 128, 4],
  ['ITM-06', 'Urad dal', 'உளுத்தம் பருப்பு', 142, 3],
  ['ITM-07', 'Wheat flour', 'கோதுமை மாவு', 42, 6],
  ['ITM-08', 'Groundnut oil', 'கடலை எண்ணெய்', 186, 3.5],
  ['ITM-09', 'Salt', 'உப்பு', 20, 5],
  ['ITM-10', 'Rava', 'ரவை', 46, 3],
  ['ITM-11', 'Jaggery', 'வெல்லம்', 62, 2],
  ['ITM-12', 'Chana dal', 'கடலைப் பருப்பு', 90, 2],
  ['ITM-13', 'Wheat', 'கோதுமை', 38.5, 0],
  ['ITM-14', 'Maida', 'மைதா', 40, 0],
  ['ITM-15', 'Basmati rice', 'பாஸ்மதி அரிசி', 110, 0],
  ['ITM-16', 'Moong dal', 'பாசிப் பருப்பு', 118, 0],
  ['ITM-17', 'Bengal gram', 'கொண்டைக் கடலை', 88, 0],
  ['ITM-18', 'Green gram', 'பச்சைப் பயறு', 110, 0],
  ['ITM-19', 'Groundnut', 'நிலக்கடலை', 130, 0],
  ['ITM-20', 'Gingelly oil', 'நல்லெண்ணெய்', 320, 0],
  ['ITM-21', 'Sunflower oil', 'சூரியகாந்தி எண்ணெய்', 150, 0],
  ['ITM-22', 'Coconut oil', 'தேங்காய் எண்ணெய்', 240, 0],
  ['ITM-23', 'Tamarind', 'புளி', 98, 0],
  ['ITM-24', 'Red chilli', 'மிளகாய் வற்றல்', 220, 0],
  ['ITM-25', 'Coriander seeds', 'மல்லி', 140, 0],
  ['ITM-26', 'Turmeric', 'மஞ்சள்', 180, 0],
  ['ITM-27', 'Mustard', 'கடுகு', 120, 0],
  ['ITM-28', 'Cumin', 'சீரகம்', 380, 0],
  ['ITM-29', 'Pepper', 'மிளகு', 680, 0],
  ['ITM-30', 'Fenugreek', 'வெந்தயம்', 110, 0],
];

const REGIONS: [string, string, [string, string][]][] = [
  ['Chennai', 'சென்னை', [['Anna Nagar', 'அண்ணா நகர்'], ['Tambaram', 'தாம்பரம்'], ['Velachery', 'வேளச்சேரி'], ['Mylapore', 'மயிலாப்பூர்'], ['Adyar', 'அடையாறு'], ['Porur', 'போரூர்'], ['Perambur', 'பெரம்பூர்'], ['Guindy', 'கிண்டி']]],
  ['Coimbatore', 'கோயம்புத்தூர்', [['Gandhipuram', 'காந்திபுரம்'], ['Peelamedu', 'பீளமேடு'], ['Singanallur', 'சிங்காநல்லூர்'], ['Saibaba Colony', 'சாய்பாபா காலனி'], ['Pollachi', 'பொள்ளாச்சி'], ['Mettupalayam', 'மேட்டுப்பாளையம்'], ['Sulur', 'சூலூர்'], ['Annur', 'அன்னூர்']]],
  ['Madurai', 'மதுரை', [['Thirunagar', 'திருநகர்'], ['Usilampatti', 'உசிலம்பட்டி'], ['K. Pudur', 'கே.புதூர்'], ['Thirumangalam', 'திருமங்கலம்'], ['Melur', 'மேலூர்'], ['Vadipatti', 'வாடிப்பட்டி'], ['Othakadai', 'ஒத்தக்கடை'], ['Palanganatham', 'பழங்காநத்தம்']]],
  ['Erode', 'ஈரோடு', [['Erode Town', 'ஈரோடு நகர்'], ['Perundurai', 'பெருந்துறை'], ['Bhavani', 'பவானி'], ['Gobichettipalayam', 'கோபிசெட்டிபாளையம்'], ['Sathyamangalam', 'சத்தியமங்கலம்'], ['Chennimalai', 'சென்னிமலை'], ['Kodumudi', 'கொடுமுடி'], ['Anthiyur', 'அந்தியூர்']]],
  ['Tiruchirappalli', 'திருச்சி', [['Srirangam', 'ஸ்ரீரங்கம்'], ['Thillai Nagar', 'தில்லை நகர்'], ['Manapparai', 'மணப்பாறை'], ['Lalgudi', 'லால்குடி'], ['Musiri', 'முசிறி'], ['Thuraiyur', 'துறையூர்'], ['Woraiyur', 'உறையூர்'], ['Ariyamangalam', 'அரியமங்கலம்']]],
  ['Tirunelveli', 'திருநெல்வேலி', [['Palayamkottai', 'பாளையங்கோட்டை'], ['Tenkasi', 'தென்காசி'], ['Ambasamudram', 'அம்பாசமுத்திரம்'], ['Sankarankovil', 'சங்கரன்கோவில்'], ['Nanguneri', 'நாங்குநேரி'], ['Valliyur', 'வள்ளியூர்'], ['Cheranmahadevi', 'சேரன்மகாதேவி'], ['Alangulam', 'ஆலங்குளம்']]],
  ['Salem', 'சேலம்', [['Kumarapalayam', 'குமாரபாளையம்'], ['Attur', 'ஆத்தூர்'], ['Mettur', 'மேட்டூர்'], ['Omalur', 'ஓமலூர்'], ['Edappadi', 'எடப்பாடி'], ['Sankagiri', 'சங்ககிரி'], ['Vazhapadi', 'வாழப்பாடி'], ['Yercaud', 'ஏற்காடு']]],
  ['Vellore', 'வேலூர்', [['Katpadi', 'காட்பாடி'], ['Gudiyatham', 'குடியாத்தம்'], ['Ambur', 'ஆம்பூர்'], ['Vaniyambadi', 'வாணியம்பாடி'], ['Arcot', 'ஆற்காடு'], ['Ranipet', 'ராணிப்பேட்டை'], ['Sathuvachari', 'சத்துவாச்சாரி'], ['Pernambut', 'பேர்ணாம்பட்டு']]],
  ['Thanjavur', 'தஞ்சாவூர்', [['Kumbakonam', 'கும்பகோணம்'], ['Pattukkottai', 'பட்டுக்கோட்டை'], ['Orathanadu', 'ஒரத்தநாடு'], ['Papanasam', 'பாபநாசம்'], ['Thiruvaiyaru', 'திருவையாறு'], ['Peravurani', 'பேராவூரணி'], ['Budalur', 'பூதலூர்'], ['Vallam', 'வல்லம்']]],
  ['Tiruppur', 'திருப்பூர்', [['Avinashi', 'அவிநாசி'], ['Palladam', 'பல்லடம்'], ['Udumalaipettai', 'உடுமலைப்பேட்டை'], ['Dharapuram', 'தாராபுரம்'], ['Kangeyam', 'காங்கேயம்'], ['Vellakoil', 'வெள்ளகோவில்'], ['Madathukulam', 'மடத்துக்குளம்'], ['Uthukuli', 'ஊத்துக்குளி']]],
];

const VENDORS: [string, string, string, string[]][] = [
  ['Sri Lakshmi Traders', 'ஸ்ரீ லட்சுமி டிரேடர்ஸ்', 'Rice, wheat, flour', ['ITM-01', 'ITM-02', 'ITM-03', 'ITM-07', 'ITM-10', 'ITM-13', 'ITM-14', 'ITM-15']],
  ['Kovai Pulses Co.', 'கோவை பருப்பு நிறுவனம்', 'Toor, urad, moong, gram', ['ITM-05', 'ITM-06', 'ITM-12', 'ITM-16', 'ITM-17', 'ITM-18', 'ITM-19']],
  ['Annai Oil Mills', 'அன்னை எண்ணெய் ஆலை', 'Edible oils', ['ITM-08', 'ITM-20', 'ITM-21', 'ITM-22']],
  ['Thanjavur Jaggery Works', 'தஞ்சாவூர் வெல்லம்', 'Jaggery, sugar, tamarind', ['ITM-04', 'ITM-11', 'ITM-23']],
  ['Virudhunagar Spices', 'விருதுநகர் மசாலா', 'Chilli, spices, salt', ['ITM-09', 'ITM-24', 'ITM-25', 'ITM-26', 'ITM-27', 'ITM-28', 'ITM-29', 'ITM-30']],
];

// Local preview defaults; a deployed seed takes them from secret env vars so a public repo doesn't reveal them.
const PASSWORD = process.env.SEED_SHOP_PASSWORD || 'Shop@123';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';

async function main() {
  if (await prisma.shop.count()) {
    // --if-empty: used by the deploy build, so redeploys never touch existing data.
    if (process.argv.includes('--if-empty')) {
      console.log('Database already has data — seed skipped.');
      return;
    }
    console.error('Database is not empty. Run `pnpm --filter @aram/api db:reset` first.');
    process.exit(1);
  }
  const now = new Date();
  const today = businessDate(now);
  const day = (offset: number) => addDays(today, offset);
  const at = (offset: number, hhmm: string) => istTimeOn(day(offset), hhmm);
  const shopHash = await bcrypt.hash(PASSWORD, 10);
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  // ---- admins ----------------------------------------------------------------
  const karthik = await prisma.user.create({
    data: { username: 'karthik', name: 'R. Karthikeyan', phone: '9840012345', role: 'SUPER_ADMIN', passwordHash: adminHash, language: 'en' },
  });
  const anitha = await prisma.user.create({
    data: { username: 'anitha', name: 'M. Anitha', phone: '9840023456', role: 'ADMIN', passwordHash: adminHash, permissions: ['APPROVE_REQUESTS', 'MANAGE_VENDORS', 'CREATE_DISPATCH', 'RESOLVE_ISSUES'] },
  });
  const vignesh = await prisma.user.create({
    data: { username: 'vignesh', name: 'P. Vignesh', phone: '9840034567', role: 'ADMIN', passwordHash: adminHash, permissions: ['APPROVE_REQUESTS', 'CHANGE_PRICES', 'MANAGE_ITEMS', 'MANAGE_VENDORS', 'CREATE_DISPATCH'] },
  });
  await prisma.user.create({
    data: { username: 'nandhini', name: 'S. Nandhini', phone: '9840045678', role: 'ADMIN', passwordHash: adminHash, permissions: ['CREATE_DISPATCH', 'RESOLVE_ISSUES'] },
  });
  await prisma.user.create({
    data: { username: 'viewer', name: 'K. Ramesh', phone: '9840056789', role: 'ADMIN', passwordHash: adminHash, permissions: [] },
  });

  // ---- settings --------------------------------------------------------------
  await prisma.setting.createMany({
    data: [
      { key: 'varianceTolerancePaise', value: '10000' },
      { key: 'lowStockDays', value: '2' },
      { key: 'closingDueTime', value: '21:00' },
      { key: 'requestFrequencyPerWeek', value: '3' },
    ],
  });

  // ---- items & prices --------------------------------------------------------
  const items = [];
  for (const [i, [code, en, ta]] of ITEMS.entries()) {
    items.push(await prisma.item.create({ data: { code, nameEn: en, nameTa: ta, sortOrder: i + 1, createdAt: at(-60, '09:00') } }));
  }
  const itemByCode = new Map(items.map((i) => [i.code, i]));
  const price = new Map<string, number>(); // itemId → current paise/kg
  for (const [code, , , rs] of ITEMS) {
    const it = itemByCode.get(code)!;
    const p = Math.round(rs * 100);
    price.set(it.id, p);
    await prisma.itemPrice.create({ data: { itemId: it.id, pricePaisePerKg: p - (code === 'ITM-04' ? 400 : 0), effectiveFrom: day(-60), createdById: null } });
  }
  // Sugar: a few historical changes; latest applied 11 days ago.
  const sugar = itemByCode.get('ITM-04')!;
  await prisma.itemPrice.create({ data: { itemId: sugar.id, pricePaisePerKg: 4350, effectiveFrom: day(-45), createdById: karthik.id } });
  await prisma.itemPrice.create({ data: { itemId: sugar.id, pricePaisePerKg: 4200, effectiveFrom: day(-30), createdById: anitha.id } });
  await prisma.itemPrice.create({ data: { itemId: sugar.id, pricePaisePerKg: 4400, effectiveFrom: day(-11), createdById: karthik.id } });
  // Toor dal: scheduled change for tomorrow.
  const toor = itemByCode.get('ITM-05')!;
  await prisma.itemPrice.create({ data: { itemId: toor.id, pricePaisePerKg: 13200, effectiveFrom: day(1), createdById: vignesh.id } });

  // ---- shops -----------------------------------------------------------------
  const ho = await prisma.shop.create({ data: { code: 'HO', nameEn: 'Head Office', nameTa: 'தலைமை அலுவலகம்', type: 'HO', createdAt: at(-60, '09:00') } });
  type SimShop = { id: string; code: string; nameEn: string; type: 'SUPERVISOR' | 'SMALL'; parentId: string | null; items: string[]; rate: Map<string, number> };
  const sims: SimShop[] = [];
  let n = 0;
  const smallItems = ITEMS.filter((x) => x[4] > 0).map((x) => itemByCode.get(x[0])!.id);
  const allItemIds = items.map((i) => i.id);
  const baseRate = new Map(ITEMS.map((x) => [itemByCode.get(x[0])!.id, x[4]]));

  for (const [ri, [region, regionTa, locs]] of REGIONS.entries()) {
    const supCode = `SUP-${String(ri + 1).padStart(2, '0')}`;
    const sup = await prisma.shop.create({
      data: { code: supCode, nameEn: region, nameTa: `${regionTa} மேற்பார்வை`, type: 'SUPERVISOR', createdAt: at(-60, '09:00') },
    });
    await prisma.user.create({
      data: { username: supCode.toLowerCase().replace('-', ''), name: `${supCode} ${region}`, phone: `94440${String(ri + 1).padStart(5, '0')}`, role: 'SHOP', shopId: sup.id, passwordHash: shopHash, language: 'ta' },
    });
    const supRate = new Map<string, number>();
    for (const id of allItemIds) supRate.set(id, (baseRate.get(id) || between(1, 4)) * between(1.3, 1.8));
    sims.push({ id: sup.id, code: supCode, nameEn: region, type: 'SUPERVISOR', parentId: null, items: allItemIds, rate: supRate });

    const count = ri === REGIONS.length - 1 ? 36 : 37;
    const smallRows = [];
    for (let k = 0; k < count; k++) {
      n++;
      const code = `S-${String(n).padStart(3, '0')}`;
      const [en, ta] = locs[k] ?? [`${region} ${String(k + 1).padStart(2, '0')}`, `${regionTa} கடை ${String(k + 1).padStart(2, '0')}`];
      smallRows.push({ code, nameEn: en, nameTa: ta, type: 'SMALL' as const, parentId: sup.id, createdAt: at(-60, '09:00') });
    }
    await prisma.shop.createMany({ data: smallRows });
    const created = await prisma.shop.findMany({ where: { parentId: sup.id }, orderBy: { code: 'asc' } });
    await prisma.user.createMany({
      data: created.map((s, k) => ({
        username: s.code.toLowerCase().replace('-', ''),
        name: `${s.code} ${s.nameEn}`,
        phone: `98${String(ri).padStart(2, '0')}${String(k + 1).padStart(6, '0')}`,
        role: 'SHOP' as const,
        shopId: s.id,
        passwordHash: shopHash,
        language: 'ta',
      })),
    });
    for (const s of created) {
      const size = between(0.6, 1.5);
      const rate = new Map<string, number>();
      for (const id of smallItems) rate.set(id, baseRate.get(id)! * size);
      sims.push({ id: s.id, code: s.code, nameEn: s.nameEn, type: 'SMALL', parentId: sup.id, items: smallItems, rate });
    }
  }
  const byCode = new Map(sims.map((s) => [s.code, s]));

  // ---- vendors & purchases ----------------------------------------------------
  const ledger: Prisma.StockLedgerCreateManyInput[] = [];
  const stock = new Map<string, Map<string, number>>(); // shopId → itemId → grams
  const bump = (shopId: string, itemId: string, g: number) => {
    if (!stock.has(shopId)) stock.set(shopId, new Map());
    const m = stock.get(shopId)!;
    m.set(itemId, (m.get(itemId) ?? 0) + g);
  };
  const post = (e: Prisma.StockLedgerCreateManyInput) => {
    ledger.push(e);
    bump(e.shopId, e.itemId, e.qtyGrams);
  };

  // Network demand per item for ~12 days → HO buys that plus a buffer.
  const demand = new Map<string, number>();
  for (const s of sims) for (const id of s.items) demand.set(id, (demand.get(id) ?? 0) + s.rate.get(id)! * 1000);
  const vendorRows = [];
  for (const [en, ta, supplies] of VENDORS) vendorRows.push(await prisma.vendor.create({ data: { nameEn: en, nameTa: ta, supplies, phone: '04' + String(Math.floor(between(20000000, 99999999))) } }));
  let inv = 4100;
  for (const [vi, v] of VENDORS.entries()) {
    for (const code of v[3]) {
      const it = itemByCode.get(code)!;
      for (const [off, share] of [[-10, 0.8], [-5, 0.7]] as const) {
        const qty = roundTo(demand.get(it.id)! * 13 * share, 1000);
        const cost = Math.round(price.get(it.id)! * between(0.82, 0.9));
        const p = await prisma.purchase.create({
          data: { vendorId: vendorRows[vi].id, itemId: it.id, qtyGrams: qty, costPaisePerKg: cost, date: day(off), invoiceNo: `INV-${inv++}`, createdById: anitha.id, createdAt: at(off, '10:00') },
        });
        post({ shopId: ho.id, itemId: it.id, qtyGrams: qty, type: 'PURCHASE', refType: 'Purchase', refId: p.id, effectiveAt: at(off, '10:00'), createdById: anitha.id });
      }
    }
  }

  // ---- matched historical dispatches -----------------------------------------
  const dispatchRows: { dest: SimShop; offset: number; days: number }[] = [];
  for (const s of sims) dispatchRows.push({ dest: s, offset: -8, days: 5.5 });
  for (const s of sims) dispatchRows.push({ dest: s, offset: -3, days: 7 });
  for (const row of dispatchRows) {
    const lines = row.dest.items.map((id) => ({ itemId: id, g: roundTo(row.dest.rate.get(id)! * 1000 * row.days * between(0.9, 1.1)) })).filter((l) => l.g > 0);
    const created = at(row.offset, '07:30');
    const sent = at(row.offset, '08:30');
    const recv = at(row.offset, row.dest.type === 'SUPERVISOR' ? '11:00' : '13:00');
    const d = await prisma.dispatch.create({
      data: {
        kind: 'DISPATCH',
        sourceShopId: ho.id,
        destShopId: row.dest.id,
        status: 'MATCHED',
        deliveryCode: code6(),
        codeUsedAt: recv,
        createdById: vignesh.id,
        createdAt: created,
        dispatchedAt: sent,
        dispatchedById: vignesh.id,
        receivedAt: recv,
        photoKey: null,
        lines: { create: lines.map((l) => ({ itemId: l.itemId, orderedGrams: l.g, sentGrams: l.g, receivedGrams: l.g })) },
      },
    });
    for (const l of lines) {
      post({ shopId: ho.id, itemId: l.itemId, qtyGrams: -l.g, type: 'DISPATCH_OUT', refType: 'Dispatch', refId: d.id, effectiveAt: sent, createdById: vignesh.id });
      post({ shopId: row.dest.id, itemId: l.itemId, qtyGrams: l.g, type: 'RECEIVE_IN', refType: 'Dispatch', refId: d.id, effectiveAt: recv });
    }
  }

  // ---- daily closings --------------------------------------------------------
  // Shops left open today so the demo accounts can run the closing themselves.
  const keepOpenToday = new Set(['S-001', 'S-002', 'SUP-07', 'S-223', 'S-224', 'SUP-01']);
  // A shop that skipped its last two closings (→ auto "no closing" issue).
  const skipped = new Set(['S-076']);
  const nowIst = now.getTime();
  const issuesToCreate: Prisma.IssueCreateManyInput[] = [];
  const lastCapture = new Map<string, Date>();
  const closingLineRows: Prisma.ClosingLineCreateManyInput[] = [];
  const tolerance = 10000;
  // Per-shop index of ledger entries so stock "as of" any moment is cheap to compute.
  const t = (e: Prisma.StockLedgerCreateManyInput) => new Date(e.effectiveAt as Date).getTime();
  const idx = new Map<string, Prisma.StockLedgerCreateManyInput[]>();
  for (const e of ledger) {
    if (!idx.has(e.shopId)) idx.set(e.shopId, []);
    idx.get(e.shopId)!.push(e);
  }

  for (let off = -7; off <= 0; off++) {
    const closingRows: Prisma.DailyClosingCreateManyInput[] = [];
    const perClosingLines: { clientId: string; shop: SimShop; lines: ReturnType<typeof computeClosing>['lines']; capturedAt: Date }[] = [];
    for (const s of sims) {
      if (skipped.has(s.code) && off >= -2) continue;
      if (off === 0 && keepOpenToday.has(s.code)) continue;
      const hh = off === 0 ? between(17.5, 20) : between(19.5, 21.5);
      const capturedAt = at(off, `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}`);
      if (capturedAt.getTime() > nowIst - 5 * 60 * 1000) continue;
      const prev = lastCapture.get(s.id);
      const upTo = (idx.get(s.id) ?? []).filter((e) => t(e) <= capturedAt.getTime());

      // Opening/received/sent within the window (prev, capturedAt], from the simulated ledger.
      const lines = s.items.map((itemId) => {
        const mine = upTo.filter((e) => e.itemId === itemId);
        const onHand = mine.reduce((a, e) => a + e.qtyGrams, 0);
        const win = mine.filter((e) => !prev || t(e) > prev.getTime());
        const received = win.filter((e) => e.type === 'RECEIVE_IN').reduce((a, e) => a + e.qtyGrams, 0);
        const sentOut = -win.filter((e) => e.type === 'DISPATCH_OUT').reduce((a, e) => a + e.qtyGrams, 0);
        const opening = onHand - received + sentOut;
        // Busy festival week: sugar sells faster in some Chennai shops.
        const boost = itemId === sugar.id && s.code <= 'S-010' ? 1.6 : 1;
        const want = roundTo(s.rate.get(itemId)! * 1000 * between(0.75, 1.25) * boost * (prev ? 1 : 0.6), 250);
        const sold = Math.min(onHand, want);
        return { itemId, openingGrams: opening, receivedGrams: received, sentOutGrams: sentOut, adjustmentGrams: 0, closingGrams: onHand - sold, pricePaisePerKg: price.get(itemId)! };
      });
      const expected = lines.reduce((a, l) => a + lineValuePaise(l.openingGrams + l.receivedGrams - l.sentOutGrams - l.closingGrams, l.pricePaisePerKg), 0);
      // Mostly exact or a few rupees off; ~1.5% of closings short beyond tolerance, ~0.5% over.
      const r = rand();
      const gap = r < 0.015 ? -Math.round(between(150, 2400)) * 100 : r < 0.02 ? Math.round(between(150, 600)) * 100 : r < 0.2 ? -Math.round(between(0, 90)) * 100 : 0;
      const collected = Math.max(0, expected + gap);
      const cash = Math.round((collected * between(0.5, 0.7)) / 100) * 100;
      const result = computeClosing({ lines, cashPaise: cash, upiPaise: collected - cash, varianceTolerancePaise: tolerance });
      const clientId = `seed:${s.code}:${day(off)}`;
      closingRows.push({
        clientId,
        shopId: s.id,
        businessDate: day(off),
        capturedAt,
        cashPaise: cash,
        upiPaise: collected - cash,
        expectedRevenuePaise: result.expectedRevenuePaise,
        variancePaise: result.variancePaise,
        varianceFlagged: result.varianceFlagged,
        submittedById: karthik.id, // replaced below with the shop user id
        submittedAt: new Date(capturedAt.getTime() + 60 * 1000),
      });
      perClosingLines.push({ clientId, shop: s, lines: result.lines, capturedAt });
      lastCapture.set(s.id, capturedAt);
    }
    const users = await prisma.user.findMany({ where: { shopId: { in: perClosingLines.map((p) => p.shop.id) } }, select: { id: true, shopId: true } });
    const userByShop = new Map(users.map((u) => [u.shopId!, u.id]));
    for (const c of closingRows) c.submittedById = userByShop.get(c.shopId)!;
    await prisma.dailyClosing.createMany({ data: closingRows });
    const saved = await prisma.dailyClosing.findMany({ where: { businessDate: day(off) }, select: { id: true, clientId: true, shopId: true, variancePaise: true, varianceFlagged: true, expectedRevenuePaise: true, cashPaise: true, upiPaise: true } });
    const idByClient = new Map(saved.map((c) => [c.clientId, c]));
    for (const p of perClosingLines) {
      const c = idByClient.get(p.clientId)!;
      for (const l of p.lines) {
        closingLineRows.push({ closingId: c.id, itemId: l.itemId, openingGrams: l.openingGrams, receivedGrams: l.receivedGrams, sentOutGrams: l.sentOutGrams, adjustmentGrams: 0, closingGrams: l.closingGrams, soldGrams: l.soldGrams, pricePaisePerKg: l.pricePaisePerKg, expectedPaise: l.expectedPaise });
        if (l.soldGrams) {
          const e = { shopId: p.shop.id, itemId: l.itemId, qtyGrams: -l.soldGrams, type: 'SOLD' as const, refType: 'DailyClosing', refId: c.id, effectiveAt: p.capturedAt, createdById: userByShop.get(p.shop.id) };
          ledger.push(e);
          idx.get(p.shop.id)!.push(e);
        }
      }
      if (c.varianceFlagged) {
        const resolved = off < -1;
        issuesToCreate.push({
          clientId: `auto:variance:${c.id}`,
          shopId: p.shop.id,
          source: 'AUTO',
          type: 'CASH_VARIANCE',
          closingId: c.id,
          description: `${p.shop.code} ${day(off)}: money ${c.variancePaise < 0 ? 'short' : 'over'} by ₹${(Math.abs(c.variancePaise) / 100).toLocaleString('en-IN')} (expected ₹${(c.expectedRevenuePaise / 100).toLocaleString('en-IN')}, collected ₹${((c.cashPaise + c.upiPaise) / 100).toLocaleString('en-IN')})`,
          status: resolved ? 'RESOLVED' : 'OPEN',
          createdAt: new Date(p.capturedAt.getTime() + 2 * 60 * 1000),
          ...(resolved ? { resolutionNote: 'Shop recounted cash; shortfall recovered from staff advance.', resolvedById: anitha.id, resolvedAt: at(off + 1, '11:30') } : {}),
        });
      }
    }
  }
  await prisma.closingLine.createMany({ data: closingLineRows });

  // ---- live scenarios ----------------------------------------------------------
  const s001 = byCode.get('S-001')!; // Anna Nagar (demo small shop)
  const sup07 = byCode.get('SUP-07')!; // Salem (demo supervisor)
  const kumarapalayam = sims.find((s) => s.parentId === sup07.id && s.nameEn === 'Kumarapalayam')!;
  const it = (code: string) => itemByCode.get(code)!.id;
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  const audit = (a: Omit<Prisma.AuditLogCreateManyInput, 'entityType'> & { entityType?: string }) => audits.push({ entityType: 'Dispatch', ...a });

  // 1) Discrepancy: HO → S-001, sugar & toor short (as in the design).
  {
    const lines = [
      [it('ITM-04'), 150000, 150000, 140000],
      [it('ITM-01'), 200000, 200000, 200000],
      [it('ITM-05'), 80000, 70000, 70000],
      [it('ITM-08'), 40000, 40000, 40000],
      [it('ITM-09'), 100000, 100000, 100000],
    ] as const;
    const created = at(0, '09:10');
    const sent = at(0, '13:35');
    const recv = new Date(Math.min(at(0, '17:12').getTime(), nowIst - 20 * 60 * 1000));
    const d = await prisma.dispatch.create({
      data: {
        kind: 'DISPATCH', sourceShopId: ho.id, destShopId: s001.id, status: 'DISCREPANCY', deliveryCode: code6(), codeUsedAt: recv,
        createdById: anitha.id, createdAt: created, dispatchedAt: sent, dispatchedById: anitha.id, receivedAt: recv,
        lines: { create: lines.map(([itemId, o, s, r]) => ({ itemId, orderedGrams: o, sentGrams: s, receivedGrams: r })) },
      },
    });
    for (const [itemId, , s, r] of lines) {
      post({ shopId: ho.id, itemId, qtyGrams: -s, type: 'DISPATCH_OUT', refType: 'Dispatch', refId: d.id, effectiveAt: sent, createdById: anitha.id });
      post({ shopId: s001.id, itemId, qtyGrams: r, type: 'RECEIVE_IN', refType: 'Dispatch', refId: d.id, effectiveAt: recv });
    }
    const ref = 'DSP-' + String(d.number).padStart(4, '0');
    issuesToCreate.push({
      clientId: `auto:dispatch:${d.id}`, shopId: s001.id, source: 'AUTO', type: 'DISPATCH_DISCREPANCY', dispatchId: d.id, createdAt: new Date(recv.getTime() + 60000),
      description: `${ref} — Sugar: ordered 150, sent 150, received 140 kg; Toor dal: ordered 80, sent 70, received 70 kg`,
    });
    audit({ at: created, actorId: anitha.id, actorName: anitha.name, action: 'DISPATCH_CREATE', entityId: d.id, summary: `Created dispatch ${ref} · HO → S-001 · 5 items, 570 kg` });
    audit({ at: sent, actorId: anitha.id, actorName: anitha.name, action: 'DISPATCH_SENT', entityId: d.id, summary: `${ref} marked dispatched (560 kg)` });
    audit({ at: new Date(recv.getTime() + 60000), actorId: null, actorName: 'System', action: 'ISSUE_AUTO', entityId: d.id, entityType: 'Issue', summary: `Discrepancy raised on ${ref} (received 550 of 570 kg ordered)` });
  }

  // 2) On the way to S-001 — the demo shop can receive this one (code shown on the HO dashboard).
  for (const [lines, status] of [
    [[[it('ITM-01'), 120000], [it('ITM-02'), 60000], [it('ITM-11'), 40000]], 'DISPATCHED'],
    [[[it('ITM-06'), 30000], [it('ITM-10'), 25000]], 'DISPATCHED'],
  ] as const) {
    const created = at(0, '10:40');
    const sent = at(0, '14:05');
    const d = await prisma.dispatch.create({
      data: {
        kind: 'DISPATCH', sourceShopId: ho.id, destShopId: s001.id, status, deliveryCode: code6(), createdById: vignesh.id, createdAt: created,
        dispatchedAt: sent, dispatchedById: vignesh.id,
        lines: { create: lines.map(([itemId, g]) => ({ itemId, orderedGrams: g, sentGrams: g })) },
      },
    });
    for (const [itemId, g] of lines) post({ shopId: ho.id, itemId, qtyGrams: -g, type: 'DISPATCH_OUT', refType: 'Dispatch', refId: d.id, effectiveAt: sent, createdById: vignesh.id });
  }

  // 3) HO-ordered transfer SUP-07 Salem → Kumarapalayam, waiting for the supervisor to send.
  {
    const d = await prisma.dispatch.create({
      data: {
        kind: 'TRANSFER', sourceShopId: sup07.id, destShopId: kumarapalayam.id, status: 'CREATED', deliveryCode: code6(), createdById: vignesh.id, createdAt: at(0, '16:40'),
        lines: { create: [{ itemId: it('ITM-01'), orderedGrams: 120000 }] },
      },
    });
    audit({ at: at(0, '16:40'), actorId: vignesh.id, actorName: vignesh.name, action: 'TRANSFER_ORDER', entityId: d.id, summary: `Ordered transfer TRF-${String(d.number).padStart(4, '0')} · SUP-07 → ${kumarapalayam.code} · Ponni rice 120 kg` });
  }

  // 4) Created but not yet sent from HO (HO confirms sent quantities on the web).
  for (const code of ['S-045', 'SUP-03']) {
    const dest = byCode.get(code)!;
    const lines = dest.items.slice(0, dest.type === 'SUPERVISOR' ? 6 : 4).map((id) => ({ itemId: id, orderedGrams: roundTo(dest.rate.get(id)! * 1000 * 3, 5000) }));
    await prisma.dispatch.create({
      data: { kind: 'DISPATCH', sourceShopId: ho.id, destShopId: dest.id, status: 'CREATED', deliveryCode: code6(), createdById: vignesh.id, createdAt: at(-1, '17:20'), lines: { create: lines } },
    });
  }

  // 5) Pending requests (one shop requesting unusually often).
  const shopUser = async (shopId: string) => (await prisma.user.findFirstOrThrow({ where: { shopId } })).id;
  const reqs: [string, number, string, [string, number][]][] = [
    ['S-001', -0.02, 'Sugar sold out by noon, festival week', [['ITM-04', 150000], ['ITM-05', 80000]]],
    ['S-003', -0.05, 'Rice will finish tomorrow morning', [['ITM-01', 200000]]],
    ['SUP-03', -0.13, 'Restocking four small shops this week', [['ITM-01', 1200000], ['ITM-13', 600000], ['ITM-11', 150000]]],
    ['S-150', -0.21, 'Oil cans damaged in transit, need replacement', [['ITM-08', 40000]]],
    ['S-003', -2.3, 'Weekend rush', [['ITM-01', 150000]]],
    ['S-003', -4.4, 'Running low on rice', [['ITM-01', 100000], ['ITM-02', 50000]]],
  ];
  for (const [i, [code, dayOff, reason, lines]] of reqs.entries()) {
    const s = byCode.get(code)!;
    const createdAt = new Date(nowIst + dayOff * 24 * 3600 * 1000);
    const decided = dayOff < -1;
    const r = await prisma.stockRequest.create({
      data: {
        clientId: `seed-req-${i}`, shopId: s.id, reason, createdById: await shopUser(s.id), createdAt,
        status: decided ? 'REJECTED' : 'PENDING',
        ...(decided ? { rejectReason: 'Replenishment already scheduled', decidedById: anitha.id, decidedAt: new Date(createdAt.getTime() + 3600000) } : {}),
        lines: { create: lines.map(([c, g]) => ({ itemId: it(c), requestedGrams: g })) },
      },
    });
    audits.push({ at: createdAt, actorId: null, actorName: `${s.code} ${s.nameEn}`, action: 'REQUEST_CREATE', entityType: 'StockRequest', entityId: r.id, summary: `REQ-${String(r.number).padStart(4, '0')} raised: ${reason}` });
  }

  // 6) Shop-raised issues.
  const manual: [string, 'DAMAGED_GOODS' | 'TRANSFER_PROBLEM' | 'OTHER', string, number][] = [
    ['S-002', 'OTHER', 'Weighing scale showing wrong reading', -0.2],
    ['SUP-07', 'TRANSFER_PROBLEM', 'Vehicle broke down, previous transfer delayed by a day', -1.1],
    ['S-230', 'DAMAGED_GOODS', 'Two bags of rava wet due to roof leak', -0.6],
  ];
  for (const [i, [code, type, desc, off]] of manual.entries()) {
    const s = byCode.get(code)!;
    issuesToCreate.push({ clientId: `seed-issue-${i}`, shopId: s.id, source: 'SHOP', type, description: desc, raisedById: await shopUser(s.id), createdAt: new Date(nowIst + off * 24 * 3600 * 1000) });
  }

  // ---- write ledger, issues, audit ---------------------------------------------
  for (let i = 0; i < ledger.length; i += 5000) await prisma.stockLedger.createMany({ data: ledger.slice(i, i + 5000) });
  issuesToCreate.sort((a, b) => new Date(a.createdAt as Date).getTime() - new Date(b.createdAt as Date).getTime());
  for (const iss of issuesToCreate) await prisma.issue.create({ data: iss });

  audits.push(
    { at: at(-11, '12:08'), actorId: karthik.id, actorName: karthik.name, action: 'PRICE_CHANGE', entityType: 'Item', entityId: sugar.id, summary: 'Sugar price ₹42.00 → ₹44.00, effective next day open' },
    { at: at(0, '12:05'), actorId: vignesh.id, actorName: vignesh.name, action: 'PRICE_CHANGE', entityType: 'Item', entityId: toor.id, summary: `Toor dal price ₹128.00 → ₹132.00, effective ${day(1)}` },
    { at: at(-2, '15:22'), actorId: karthik.id, actorName: karthik.name, action: 'PERMS_CHANGE', entityType: 'User', entityId: 'nandhini', summary: 'S. Nandhini: turned off "CHANGE_PRICES"' },
    { at: at(-5, '10:00'), actorId: anitha.id, actorName: anitha.name, action: 'PURCHASE', entityType: 'Purchase', entityId: 'seed', summary: 'Recorded purchases from 5 vendors' },
    { at: at(-60, '09:00'), actorId: null, actorName: 'System', action: 'SEED', entityType: 'System', entityId: 'seed', summary: 'Preview data loaded: 380 shops, 30 items, 5 vendors' },
  );
  audits.sort((a, b) => new Date(a.at as Date).getTime() - new Date(b.at as Date).getTime());
  await prisma.auditLog.createMany({ data: audits });

  // Tamarind is paused (history kept).
  await prisma.item.update({ where: { id: itemByCode.get('ITM-23')!.id }, data: { isActive: false } });

  console.log(`Seeded ${sims.length + 1} shops, ${items.length} items, ${ledger.length} ledger entries, ${closingLineRows.length} closing lines.`);
  // Passwords are not printed: build logs on the host are not a safe place for them.
  console.log('HO logins: karthik / anitha / vignesh / nandhini / viewer');
  console.log('Shop logins: s001 (small), sup07 (supervisor), s003 …');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
