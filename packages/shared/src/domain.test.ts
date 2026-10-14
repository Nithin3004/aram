import { computeClosing, lowStock, matchCheck, soldGrams } from './domain';
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

describe('sold qty', () => {
  const base = { openingGrams: 740000, receivedGrams: 0, sentOutGrams: 0, adjustmentGrams: 0 };

  it('sold = opening + received − closing', () => {
    expect(soldGrams({ ...base, receivedGrams: 200000, closingGrams: 620000 })).toBe(320000);
  });

  it('subtracts supervisor transfers out', () => {
    expect(soldGrams({ ...base, sentOutGrams: 120000, closingGrams: 600000 })).toBe(20000);
  });

  it('is negative when closing > opening + received', () => {
    expect(soldGrams({ ...base, closingGrams: 750000 })).toBe(-10000);
  });
});

describe('computeClosing / variance', () => {
  const line = (over: Partial<Parameters<typeof computeClosing>[0]['lines'][0]> = {}) => ({
    itemId: 'rice',
    openingGrams: 740000,
    receivedGrams: 0,
    sentOutGrams: 0,
    adjustmentGrams: 0,
    closingGrams: 620000,
    pricePaisePerKg: 5200,
    ...over,
  });

  it('computes expected revenue from sold qty × price', () => {
    const r = computeClosing({ lines: [line()], cashPaise: 400000, upiPaise: 224000, varianceTolerancePaise: 10000 });
    // 120 kg × ₹52 = ₹6,240
    expect(r.expectedRevenuePaise).toBe(624000);
    expect(r.variancePaise).toBe(0);
    expect(r.varianceFlagged).toBe(false);
  });

  it('variance = (cash + UPI) − expected, flagged beyond tolerance', () => {
    const r = computeClosing({ lines: [line()], cashPaise: 400000, upiPaise: 100000, varianceTolerancePaise: 10000 });
    expect(r.variancePaise).toBe(-124000);
    expect(r.varianceFlagged).toBe(true);
  });

  it('does not flag a gap within tolerance', () => {
    const r = computeClosing({ lines: [line()], cashPaise: 400000, upiPaise: 214000, varianceTolerancePaise: 10000 });
    expect(r.variancePaise).toBe(-10000);
    expect(r.varianceFlagged).toBe(false);
  });

  it('flags an excess as well as a shortfall', () => {
    const r = computeClosing({ lines: [line()], cashPaise: 700000, upiPaise: 0, varianceTolerancePaise: 10000 });
    expect(r.variancePaise).toBe(76000);
    expect(r.varianceFlagged).toBe(true);
  });

  it('flags negative sold lines and gives them no revenue', () => {
    const r = computeClosing({
      lines: [line({ closingGrams: 750000 }), line({ itemId: 'salt', openingGrams: 10000, closingGrams: 5000, pricePaisePerKg: 2000 })],
      cashPaise: 10000,
      upiPaise: 0,
      varianceTolerancePaise: 10000,
    });
    expect(r.negativeSoldLines.map((l) => l.itemId)).toEqual(['rice']);
    expect(r.expectedRevenuePaise).toBe(10000);
  });

  it('handles fractional kg exactly in integer paise', () => {
    // 1.235 kg × ₹44.00 = ₹54.34
    expect(lineValuePaise(1235, 4400)).toBe(5434);
    // 0.333 kg × ₹128.50 = 42.7905 → ₹42.79
    expect(lineValuePaise(333, 12850)).toBe(4279);
  });

  it('rejects negative inputs', () => {
    expect(() => computeClosing({ lines: [line({ closingGrams: -1 })], cashPaise: 0, upiPaise: 0, varianceTolerancePaise: 0 })).toThrow();
    expect(() => computeClosing({ lines: [line()], cashPaise: -1, upiPaise: 0, varianceTolerancePaise: 0 })).toThrow();
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
