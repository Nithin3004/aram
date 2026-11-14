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
// Daily entry (as in the HO workbook): purchases and sales typed per product,
// loose quantity and/or packs, with a rate. Closing stock is worked out.
// ---------------------------------------------------------------------------

/** Pack sizes in grams (or millilitres for litre products): ½ kg/L and 1 kg/L. */
export const PACK_SMALL_G = 500;
export const PACK_LARGE_G = 1000;

/** One purchase or sales entry for a product, exactly like a Daily_Entry row block. */
export interface PackEntry {
  /** Loose quantity in grams / millilitres. */
  looseGrams: number;
  /** Number of ½ kg/L packs. */
  halfPacks: number;
  /** Number of 1 kg/L packs. */
  onePacks: number;
  /** Rate in paise per kg/L — used for loose stock and for packs without their own price. */
  ratePaise: number;
  /** Optional price of one ½ pack (paise) if packs sell/buy at a different price. */
  halfPackPricePaise?: number | null;
  /** Optional price of one 1 pack (paise). */
  onePackPricePaise?: number | null;
}

export const emptyPack = (ratePaise = 0): PackEntry => ({ looseGrams: 0, halfPacks: 0, onePacks: 0, ratePaise });

/** Converts loose + packs into one quantity and amount (workbook "grey block": qty in kg/L and value). */
export function packTotal(p: PackEntry): { grams: number; paise: number } {
  if (p.looseGrams < 0 || p.halfPacks < 0 || p.onePacks < 0 || p.ratePaise < 0) throw new Error('Quantities and rates cannot be negative');
  const grams = p.looseGrams + p.halfPacks * PACK_SMALL_G + p.onePacks * PACK_LARGE_G;
  const halfPrice = p.halfPackPricePaise ?? lineValuePaise(PACK_SMALL_G, p.ratePaise);
  const onePrice = p.onePackPricePaise ?? lineValuePaise(PACK_LARGE_G, p.ratePaise);
  const paise = lineValuePaise(p.looseGrams, p.ratePaise) + p.halfPacks * halfPrice + p.onePacks * onePrice;
  return { grams, paise };
}

export interface DailyLineInput {
  itemId: string;
  /** Stock at the previous entry (= today's opening). */
  openingGrams: number;
  /** Received from HO / another shop since the previous entry (dispatches). */
  receivedGrams: number;
  /** Sent out on HO-ordered transfers since the previous entry. */
  sentOutGrams: number;
  /** Net HO adjustments since the previous entry. */
  adjustmentGrams: number;
  purchase: PackEntry;
  sales: PackEntry;
}

export interface DailyLineResult extends DailyLineInput {
  purchaseGrams: number;
  purchasePaise: number;
  salesGrams: number;
  salesPaise: number;
  /** Closing = opening + received − sent out + adjustments + purchases − sales. */
  closingGrams: number;
  /** Sales larger than the stock available — flagged for HO. */
  negativeClosing: boolean;
}

export interface DailyResult {
  lines: DailyLineResult[];
  purchasePaise: number;
  salesPaise: number;
  collectedPaise: number;
  /** (cash + UPI) − sales amount. */
  variancePaise: number;
  varianceFlagged: boolean;
  negativeLines: DailyLineResult[];
}

/**
 * Workbook rule: Closing Qty = Opening Qty + Purchase Qty − Sales Qty (per shop and product).
 * Stock received from HO, sent out on transfers, and HO adjustments are movements too, so they
 * are included. Sales amount = sales qty × the rate typed (or pack prices). Money check:
 * cash + UPI against the sales amount.
 */
export function computeDailyEntry(input: { lines: DailyLineInput[]; cashPaise: number; upiPaise: number; varianceTolerancePaise: number }): DailyResult {
  if (input.cashPaise < 0 || input.upiPaise < 0) throw new Error('Cash and UPI cannot be negative');
  const lines = input.lines.map((l) => {
    const p = packTotal(l.purchase);
    const s = packTotal(l.sales);
    const closing = l.openingGrams + l.receivedGrams - l.sentOutGrams + l.adjustmentGrams + p.grams - s.grams;
    return {
      ...l,
      purchaseGrams: p.grams,
      purchasePaise: p.paise,
      salesGrams: s.grams,
      salesPaise: s.paise,
      closingGrams: closing,
      negativeClosing: closing < 0,
    };
  });
  const salesPaise = lines.reduce((a, l) => a + l.salesPaise, 0);
  const purchasePaise = lines.reduce((a, l) => a + l.purchasePaise, 0);
  const collectedPaise = input.cashPaise + input.upiPaise;
  const variancePaise = collectedPaise - salesPaise;
  return {
    lines,
    purchasePaise,
    salesPaise,
    collectedPaise,
    variancePaise,
    varianceFlagged: Math.abs(variancePaise) > input.varianceTolerancePaise,
    negativeLines: lines.filter((l) => l.negativeClosing),
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
