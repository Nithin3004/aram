/** Timestamps are stored in UTC; business days and display are in IST (UTC+05:30, no DST). */
export const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The IST calendar date ("YYYY-MM-DD") of a UTC instant. */
export function businessDate(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 IST on a business date. */
export function istDayStart(date: string): Date {
  return new Date(Date.parse(date + 'T00:00:00.000Z') - IST_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC instant of "HH:MM" IST on a business date. */
export function istTimeOn(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(istDayStart(date).getTime() + (h * 60 + m) * 60 * 1000);
}

function istParts(at: Date) {
  const d = new Date(new Date(at).getTime() + IST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth(),
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    wd: d.getUTCDay(),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "18:40" in IST. */
export function formatIstTime(at: Date | string): string {
  const p = istParts(new Date(at));
  return `${pad(p.h)}:${pad(p.mi)}`;
}

/** "21 Sep 18:40" in IST. */
export function formatIstDateTime(at: Date | string): string {
  const p = istParts(new Date(at));
  return `${p.d} ${MONTHS[p.mo]} ${pad(p.h)}:${pad(p.mi)}`;
}

/** "21 Sep 2026" for a business date string or instant. */
export function formatIstDate(at: Date | string): string {
  const d = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at) ? istDayStart(at) : new Date(at);
  const p = istParts(d);
  return `${p.d} ${MONTHS[p.mo]} ${p.y}`;
}
