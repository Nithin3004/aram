import { lineValuePaise } from './units';

// ---------------------------------------------------------------------------
// Dispatch match check
// ---------------------------------------------------------------------------

export interface MatchLineInput {
  itemId: string;
  orderedGrams: number;
  sentGrams: number;
  receivedGrams: number;
}

export interface MatchLineResult extends MatchLineInput {
  matched: boolean;
  /** received − ordered (negative = short). */
  diffGrams: number;
}

export interface MatchResult {
  matched: boolean;
  lines: MatchLineResult[];
  mismatchedLines: MatchLineResult[];
}

/** Per item: ordered vs sent vs received must all be equal for the dispatch to be MATCHED. */
export function matchCheck(lines: MatchLineInput[]): MatchResult {
  if (lines.length === 0) throw new Error('A dispatch must have at least one line');
  const out = lines.map((l) => ({
    ...l,
    matched: l.orderedGrams === l.sentGrams && l.sentGrams === l.receivedGrams,
    diffGrams: l.receivedGrams - l.orderedGrams,
  }));
  const mismatchedLines = out.filter((l) => !l.matched);
  return { matched: mismatchedLines.length === 0, lines: out, mismatchedLines };
}

// ---------------------------------------------------------------------------
// Daily closing: sold qty, expected revenue, variance
// ---------------------------------------------------------------------------

export interface ClosingLineInput {
  itemId: string;
  /** Stock at the previous closing (= today's opening). */
  openingGrams: number;
  /** Received into this shop since the previous closing. */
  receivedGrams: number;
  /** Sent out by this shop since the previous closing (supervisor transfers). */
  sentOutGrams: number;
  /** Net HO adjustments since the previous closing. */
  adjustmentGrams: number;
  /** Counted by the shop at close. */
  closingGrams: number;
  /** Selling price per kg effective on the business date. */
  pricePaisePerKg: number;
}

export interface ClosingLineResult extends ClosingLineInput {
  soldGrams: number;
  expectedPaise: number;
  negativeSold: boolean;
}

export interface ClosingResult {
  lines: ClosingLineResult[];
  expectedRevenuePaise: number;
  collectedPaise: number;
  variancePaise: number;
  varianceFlagged: boolean;
  negativeSoldLines: ClosingLineResult[];
}

/**
 * Sold = opening + received − closing (per item).
 * Supervisor shops also send stock out on HO orders, and HO may post adjustments,
 * so those movements are included: sold = opening + received − sentOut + adjustment − closing.
 * For a small shop with no transfers/adjustments this is exactly the CLAUDE.md formula.
 */
export function soldGrams(l: Omit<ClosingLineInput, 'itemId' | 'pricePaisePerKg'>): number {
  return l.openingGrams + l.receivedGrams - l.sentOutGrams + l.adjustmentGrams - l.closingGrams;
}

export function computeClosing(input: {
  lines: ClosingLineInput[];
  cashPaise: number;
  upiPaise: number;
  varianceTolerancePaise: number;
}): ClosingResult {
  if (input.cashPaise < 0 || input.upiPaise < 0) throw new Error('Cash and UPI cannot be negative');
  const lines = input.lines.map((l) => {
    if (l.closingGrams < 0) throw new Error('Closing stock cannot be negative');
    const sold = soldGrams(l);
    return {
      ...l,
      soldGrams: sold,
      // A negative sold qty is flagged, and contributes no revenue.
      expectedPaise: sold > 0 ? lineValuePaise(sold, l.pricePaisePerKg) : 0,
      negativeSold: sold < 0,
    };
  });
  const expectedRevenuePaise = lines.reduce((s, l) => s + l.expectedPaise, 0);
  const collectedPaise = input.cashPaise + input.upiPaise;
  const variancePaise = collectedPaise - expectedRevenuePaise;
  return {
    lines,
    expectedRevenuePaise,
    collectedPaise,
    variancePaise,
    varianceFlagged: Math.abs(variancePaise) > input.varianceTolerancePaise,
    negativeSoldLines: lines.filter((l) => l.negativeSold),
  };
}

// ---------------------------------------------------------------------------
// Low-stock flags
// ---------------------------------------------------------------------------

export interface LowStockResult {
  avgDailySoldGrams: number;
  /** null when nothing was sold in the window (cannot run out at current rate). */
  daysLeft: number | null;
  low: boolean;
}

/** Average daily sold over the window → days of stock left; flagged below the threshold. */
export function lowStock(input: {
  onHandGrams: number;
  soldInWindowGrams: number;
  windowDays?: number;
  thresholdDays: number;
}): LowStockResult {
  const windowDays = input.windowDays ?? 7;
  const avg = Math.max(0, input.soldInWindowGrams) / windowDays;
  if (avg <= 0) return { avgDailySoldGrams: 0, daysLeft: null, low: input.onHandGrams <= 0 };
  const daysLeft = Math.max(0, input.onHandGrams) / avg;
  return { avgDailySoldGrams: Math.round(avg), daysLeft, low: daysLeft < input.thresholdDays };
}
