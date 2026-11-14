import { z } from 'zod';
import { ALL_PERMISSIONS, MANUAL_ISSUE_TYPES, ShopType } from './enums';

const id = z.string().min(1);
const grams = z.number().int().nonnegative();
const positiveGrams = z.number().int().positive();
const paise = z.number().int().nonnegative();
/** Client-generated id so an offline submission synced twice is stored once. */
const clientId = z.string().uuid();

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
  deviceId: z.string().min(8).max(128),
});

export const verifyOtpSchema = z.object({
  challengeId: id,
  code: z.string().regex(/^\d{6}$/),
});

export const languageSchema = z.object({ language: z.enum(['en', 'ta']) });

const newPassword = z.string().min(8).max(128);
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword });
/** Super Admin sets a new password for someone who forgot theirs. */
export const resetPasswordSchema = z.object({ newPassword });

export const createAdminSchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: z.string().trim().min(3).max(64).regex(/^[a-z0-9._-]+$/),
  password: z.string().min(8).max(128),
  phone: z.string().regex(/^\d{10}$/),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
});

export const updateAdminSchema = z.object({
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).optional(),
  isActive: z.boolean().optional(),
  phone: z.string().regex(/^(\d{10})?$/).optional(),
});

export const createShopSchema = z.object({
  code: z.string().trim().min(2).max(16),
  nameEn: z.string().trim().min(1).max(80),
  nameTa: z.string().trim().min(1).max(80),
  type: z.enum([ShopType.SUPERVISOR, ShopType.SMALL]),
  parentId: id.optional(),
  username: z.string().trim().min(3).max(64).regex(/^[a-z0-9._-]+$/),
  password: z.string().min(8).max(128),
  phone: z.string().regex(/^\d{10}$/),
});

export const UNITS = ['kg', 'L'] as const;
export type Unit = (typeof UNITS)[number];

export const itemSchema = z.object({
  code: z.string().trim().min(2).max(16),
  nameEn: z.string().trim().min(1).max(80),
  nameTa: z.string().trim().min(1).max(80),
  unit: z.enum(UNITS).default('kg'),
  pricePaisePerKg: z.number().int().positive(),
});

export const updateItemSchema = z.object({
  nameEn: z.string().trim().min(1).max(80).optional(),
  nameTa: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  /** Opening cost rate (₹/kg or ₹/L in paise) used for profit before purchases exist; null clears. */
  baseCostPaisePerKg: z.number().int().nonnegative().nullable().optional(),
});

export const priceChangeSchema = z.object({ pricePaisePerKg: z.number().int().positive() });

export const vendorSchema = z.object({
  nameEn: z.string().trim().min(1).max(80),
  nameTa: z.string().trim().max(80).default(''),
  phone: z.string().trim().max(20).default(''),
  supplies: z.string().trim().max(160).default(''),
});

export const updateVendorSchema = vendorSchema.partial().extend({ isActive: z.boolean().optional() });

export const purchaseSchema = z.object({
  vendorId: id,
  itemId: id,
  qtyGrams: positiveGrams,
  costPaisePerKg: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceNo: z.string().trim().min(1).max(40),
});

const lineSchema = z.object({ itemId: id, grams: positiveGrams });

export const createDispatchSchema = z.object({
  /** Omitted = HO warehouse. A supervisor shop id makes this an HO-ordered transfer. */
  sourceShopId: id.optional(),
  destShopId: id,
  lines: z.array(lineSchema).min(1).max(60),
});

export const markDispatchedSchema = z.object({
  lines: z.array(z.object({ itemId: id, sentGrams: grams })).min(1),
});

export const receiveSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  lines: z.array(z.object({ itemId: id, receivedGrams: grams })).min(1),
  photoKey: z.string().min(1),
});

export const lookupCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export const createRequestSchema = z.object({
  clientId,
  lines: z.array(lineSchema).min(1).max(60),
  reason: z.string().trim().min(1).max(500),
});

export const approveRequestSchema = z.object({
  lines: z.array(z.object({ itemId: id, approvedGrams: grams })).min(1),
});

export const rejectRequestSchema = z.object({ reason: z.string().trim().min(1).max(500) });

export const createIssueSchema = z.object({
  clientId,
  type: z.enum(MANUAL_ISSUE_TYPES as [string, ...string[]]),
  description: z.string().trim().min(1).max(1000),
  dispatchId: id.optional(),
});

export const resolveIssueSchema = z.object({
  note: z.string().trim().min(1).max(1000),
  /** Optional logged stock corrections posted as ADJUSTMENT ledger entries. */
  adjustments: z
    .array(z.object({ shopId: id, itemId: id, grams: z.number().int().refine((n) => n !== 0) }))
    .max(60)
    .default([]),
});

export const recountSchema = z.object({
  lines: z.array(z.object({ itemId: id, receivedGrams: grams })).min(1),
  note: z.string().trim().max(500).default(''),
});

/** Loose qty and/or number of ½ and 1 kg/L packs, with a rate (and optional pack prices). */
const packEntrySchema = z.object({
  looseGrams: grams.default(0),
  halfPacks: z.number().int().nonnegative().default(0),
  onePacks: z.number().int().nonnegative().default(0),
  ratePaise: paise.default(0),
  halfPackPricePaise: paise.nullish(),
  onePackPricePaise: paise.nullish(),
});

/** Daily entry (HO workbook): per product, the day's purchases and sales. Closing stock is worked out. */
export const closingSchema = z.object({
  clientId,
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** When the entry was made on the device (UTC ISO). Movements after this belong to the next day. */
  capturedAt: z.string().datetime(),
  lines: z.array(z.object({ itemId: id, purchase: packEntrySchema, sales: packEntrySchema })).min(1).max(60),
  cashPaise: paise,
  upiPaise: paise,
  note: z.string().trim().max(500).default(''),
});

/** Opening stock (quantity + optional cost rate) for a shop, entered once. HO may give shopId. */
export const openingStockSchema = z.object({
  shopId: id.optional(),
  lines: z.array(z.object({ itemId: id, grams, ratePaise: paise.nullish() })).min(1).max(60),
});

export const updateShopSchema = z.object({
  nameEn: z.string().trim().min(1).max(80).optional(),
  nameTa: z.string().trim().max(80).optional(),
  /** Login phone for OTP; empty clears it. */
  phone: z.string().regex(/^(\d{10})?$/).optional(),
  parentId: id.optional(),
});

export const settingsSchema = z.object({
  varianceTolerancePaise: paise.optional(),
  lowStockDays: z.number().positive().max(60).optional(),
  closingDueTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  requestFrequencyPerWeek: z.number().int().positive().max(100).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type ClosingInput = z.infer<typeof closingSchema>;
export type ResolveIssueInput = z.infer<typeof resolveIssueSchema>;
