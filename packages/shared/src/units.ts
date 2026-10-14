/**
 * Quantities are stored as integer grams and money as integer paise.
 * These helpers are the only place conversions happen.
 */

/** "12.5" kg (string or number) → 12500 g. Rounds to the nearest gram. */
export function kgToGrams(kg: number | string): number {
  const n = typeof kg === 'string' ? Number(kg.trim()) : kg;
  if (!Number.isFinite(n)) throw new Error(`Invalid kg value: ${kg}`);
  return Math.round(n * 1000);
}

/** "44.50" ₹ → 4450 paise. */
export function rupeesToPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? Number(rupees.trim()) : rupees;
  if (!Number.isFinite(n)) throw new Error(`Invalid rupee value: ${rupees}`);
  return Math.round(n * 100);
}

/** Money for `grams` at `pricePaisePerKg`, rounded to the nearest paisa. Integer maths only. */
export function lineValuePaise(grams: number, pricePaisePerKg: number): number {
  // grams * paise/kg / 1000, rounded half away from zero, without floats.
  const num = grams * pricePaisePerKg;
  const sign = num < 0 ? -1 : 1;
  const abs = Math.abs(num);
  return sign * Math.floor((abs + 500) / 1000);
}

const inGroup = new Intl.NumberFormat('en-IN');

/** 12500 → "12.5". Up to 3 decimals, trailing zeros dropped, Indian digit grouping. */
export function formatKg(grams: number): string {
  const sign = grams < 0 ? '-' : '';
  const abs = Math.abs(grams);
  const whole = Math.floor(abs / 1000);
  const frac = abs % 1000;
  const fracStr = frac ? '.' + String(frac).padStart(3, '0').replace(/0+$/, '') : '';
  return sign + inGroup.format(whole) + fracStr;
}

/** 412050 → "₹4,120.50"; set `whole` to drop paise. */
export function formatRupees(paise: number, opts: { whole?: boolean; signed?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  let s = '₹' + inGroup.format(opts.whole ? Math.round(abs / 100) : r);
  if (!opts.whole) s += '.' + String(p).padStart(2, '0');
  if (neg) return '−' + s;
  if (opts.signed && paise > 0) return '+' + s;
  return s;
}

/** Compact Indian money for dashboards: ₹41.8L, ₹2.3Cr, ₹12,480. */
export function formatRupeesCompact(paise: number): string {
  const neg = paise < 0;
  const r = Math.abs(paise) / 100;
  let s: string;
  if (r >= 1e7) s = '₹' + (r / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
  else if (r >= 1e5) s = '₹' + (r / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
  else s = '₹' + inGroup.format(Math.round(r));
  return neg ? '−' + s : s;
}
