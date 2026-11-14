import { computeDailyEntry, DailyLineInput, emptyPack, lowStock, matchCheck, packTotal } from './domain';
import { businessDate, istDayStart } from './dates';
import { formatKg, formatRupees, kgToGrams, lineValuePaise, rupeesToPaise } from './units';
import { en } from './i18n/en';
import { ta } from './i18n/ta';

describe('matchCheck', () => {
  it('is MATCHED when ordered = sent = received on every line', () => {
    const r = matchCheck([
      { itemId: 'rice', orderedGrams: 200000, sentGrams: 200000, receivedGrams: 200000 },
      { itemId: 'salt', orderedGrams: 100000, sentGrams: 100000, receivedGrams: 100000 },
    ]);
    expect(r.matched).toBe(true);
    expect(r.mismatchedLines).toHaveLength(0);
  });

  it('flags a line received short', () => {
    const r = matchCheck([
      { itemId: 'sugar', orderedGrams: 150000, sentGrams: 150000, receivedGrams: 140000 },
      { itemId: 'rice', orderedGrams: 200000, sentGrams: 200000, receivedGrams: 200000 },
    ]);
    expect(r.matched).toBe(false);
    expect(r.mismatchedLines.map((l) => l.itemId)).toEqual(['sugar']);
    expect(r.mismatchedLines[0].diffGrams).toBe(-10000);
  });

  it('flags sender sending less than ordered even if receiver got what was sent', () => {
    const r = matchCheck([{ itemId: 'toor', orderedGrams: 80000, sentGrams: 70000, receivedGrams: 70000 }]);
    expect(r.matched).toBe(false);
  });

  it('flags extra received', () => {
    const r = matchCheck([{ itemId: 'oil', orderedGrams: 40000, sentGrams: 40000, receivedGrams: 40500 }]);
    expect(r.matched).toBe(false);
    expect(r.lines[0].diffGrams).toBe(500);
  });

  it('rejects an empty dispatch', () => {
    expect(() => matchCheck([])).toThrow();
  });
});

describe('packTotal (loose + packs → qty and amount)', () => {
  it('converts loose + ½ and 1 packs, like the workbook example (4 kg + 20 × ½ + 10 × 1 = 24 kg)', () => {
    const r = packTotal({ looseGrams: 4000, halfPacks: 20, onePacks: 10, ratePaise: 5000 });
    expect(r.grams).toBe(24_000);
    expect(r.paise).toBe(120_000); // 24 kg × ₹50
  });
  it('uses pack prices when given', () => {
    // 10 × ½ kg packs at ₹27 each + 2 kg loose at ₹50 = ₹270 + ₹100
    const r = packTotal({ looseGrams: 2000, halfPacks: 10, onePacks: 0, ratePaise: 5000, halfPackPricePaise: 2700 });
    expect(r.grams).toBe(7000);
    expect(r.paise).toBe(37_000);
  });
  it('rejects negatives', () => {
    expect(() => packTotal({ looseGrams: -1, halfPacks: 0, onePacks: 0, ratePaise: 0 })).toThrow();
  });
});

describe('computeDailyEntry (closing = opening + purchase − sales; money check)', () => {
  const line = (over: Partial<DailyLineInput> = {}): DailyLineInput => ({
    itemId: 'dal',
    openingGrams: 50_000,
    receivedGrams: 0,
    sentOutGrams: 0,
    adjustmentGrams: 0,
    purchase: emptyPack(),
    sales: emptyPack(),
    ...over,
  });

  it('works out closing stock and amounts', () => {
    const r = computeDailyEntry({
      lines: [line({ purchase: { looseGrams: 20_000, halfPacks: 0, onePacks: 0, ratePaise: 8000 }, sales: { looseGrams: 10_000, halfPacks: 4, onePacks: 3, ratePaise: 9000 } })],
      cashPaise: 100_000,
      upiPaise: 35_000,
      varianceTolerancePaise: 10_000,
    });
    const l = r.lines[0];
    expect(l.purchaseGrams).toBe(20_000);
    expect(l.purchasePaise).toBe(160_000);
    expect(l.salesGrams).toBe(15_000); // 10 kg + 2 kg + 3 kg
    expect(l.salesPaise).toBe(135_000);
    expect(l.closingGrams).toBe(55_000); // 50 + 20 − 15
    expect(r.variancePaise).toBe(0);
    expect(r.varianceFlagged).toBe(false);
  });

  it('includes stock received from HO and sent out on transfers', () => {
    const r = computeDailyEntry({ lines: [line({ receivedGrams: 30_000, sentOutGrams: 5000, sales: { looseGrams: 10_000, halfPacks: 0, onePacks: 0, ratePaise: 0 } })], cashPaise: 0, upiPaise: 0, varianceTolerancePaise: 0 });
    expect(r.lines[0].closingGrams).toBe(65_000);
  });

  it('flags a money gap beyond tolerance, short or over', () => {
    const sales = { looseGrams: 10_000, halfPacks: 0, onePacks: 0, ratePaise: 5000 }; // ₹500
    expect(computeDailyEntry({ lines: [line({ sales })], cashPaise: 30_000, upiPaise: 0, varianceTolerancePaise: 10_000 }).variancePaise).toBe(-20_000);
    expect(computeDailyEntry({ lines: [line({ sales })], cashPaise: 30_000, upiPaise: 0, varianceTolerancePaise: 10_000 }).varianceFlagged).toBe(true);
    expect(computeDailyEntry({ lines: [line({ sales })], cashPaise: 45_000, upiPaise: 0, varianceTolerancePaise: 10_000 }).varianceFlagged).toBe(false);
    expect(computeDailyEntry({ lines: [line({ sales })], cashPaise: 70_000, upiPaise: 0, varianceTolerancePaise: 10_000 }).varianceFlagged).toBe(true);
  });

  it('flags sales larger than the stock available', () => {
    const r = computeDailyEntry({ lines: [line({ openingGrams: 5000, sales: { looseGrams: 8000, halfPacks: 0, onePacks: 0, ratePaise: 1000 } })], cashPaise: 8000, upiPaise: 0, varianceTolerancePaise: 0 });
    expect(r.lines[0].closingGrams).toBe(-3000);
    expect(r.negativeLines).toHaveLength(1);
  });

  it('handles fractional kg exactly in integer paise', () => {
    expect(lineValuePaise(1235, 4400)).toBe(5434);
    expect(lineValuePaise(333, 12850)).toBe(4279);
  });

  it('rejects negative cash', () => {
    expect(() => computeDailyEntry({ lines: [line()], cashPaise: -1, upiPaise: 0, varianceTolerancePaise: 0 })).toThrow();
  });
});

describe('lowStock', () => {
  it('computes days left from 7-day average', () => {
    const r = lowStock({ onHandGrams: 14000, soldInWindowGrams: 70000, thresholdDays: 2 });
    expect(r.avgDailySoldGrams).toBe(10000);
    expect(r.daysLeft).toBeCloseTo(1.4);
    expect(r.low).toBe(true);
  });
  it('is not low with plenty of cover', () => {
    expect(lowStock({ onHandGrams: 100000, soldInWindowGrams: 70000, thresholdDays: 2 }).low).toBe(false);
  });
  it('handles no sales', () => {
    expect(lowStock({ onHandGrams: 5000, soldInWindowGrams: 0, thresholdDays: 2 })).toEqual({ avgDailySoldGrams: 0, daysLeft: null, low: false });
  });
});

describe('units & dates', () => {
  it('converts without floats leaking', () => {
    expect(kgToGrams('12.5')).toBe(12500);
    expect(kgToGrams(0.1 + 0.2)).toBe(300);
    expect(rupeesToPaise('44.10')).toBe(4410);
    expect(formatKg(1842500)).toBe('1,842.5');
    expect(formatRupees(-124000)).toBe('−₹1,240.00');
  });
  it('uses the IST calendar day', () => {
    expect(businessDate(new Date('2026-09-21T18:29:00Z'))).toBe('2026-09-21');
    expect(businessDate(new Date('2026-09-21T18:31:00Z'))).toBe('2026-09-22');
    expect(istDayStart('2026-09-22').toISOString()).toBe('2026-09-21T18:30:00.000Z');
  });
});

describe('translations', () => {
  const keys = (o: object, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, p + k + '.') : [p + k]));
  it('Tamil covers every English key with a non-empty string', () => {
    const t = ta as unknown as Record<string, unknown>;
    for (const k of keys(en)) {
      const v = k.split('.').reduce<unknown>((o, s) => (o as Record<string, unknown>)?.[s], t);
      expect(typeof v === 'string' && v.length > 0).toBe(true);
    }
  });
});
