export interface Named {
  id: string;
  code: string;
  nameEn: string;
  nameTa: string;
  type?: 'HO' | 'SUPERVISOR' | 'SMALL';
}

export interface Me {
  id: string;
  name: string;
  username: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'SHOP';
  language: 'en' | 'ta';
  shop: (Named & { type: 'SUPERVISOR' | 'SMALL'; parent: Named | null }) | null;
}

export interface StockItem {
  itemId: string;
  nameEn: string;
  nameTa: string;
  onHandGrams: number;
  daysLeft: number | null;
  low: boolean;
  watch: boolean;
}

export interface DispatchRow {
  id: string;
  ref: string;
  kind: 'DISPATCH' | 'TRANSFER';
  status: string;
  source: Named;
  dest: Named;
  totalGrams: number;
  lineCount: number;
  updatedAt: string;
}

export interface DispatchDetail {
  id: string;
  ref: string;
  kind: string;
  status: string;
  source: Named;
  dest: Named;
  deliveryCode?: string;
  lines: { itemId: string; nameEn: string; nameTa: string; orderedGrams?: number; sentGrams: number | null; receivedGrams?: number | null }[];
}

export interface IssueRow {
  id: string;
  ref: string;
  source: 'AUTO' | 'SHOP';
  type: string;
  status: 'OPEN' | 'RESOLVED';
  description: string;
  createdAt: string;
  dispatch: { id: string; ref: string } | null;
  recountRequestedAt: string | null;
  recountAt: string | null;
  resolutionNote: string | null;
}

export interface RequestRow {
  id: string;
  ref: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvalType: 'FULL' | 'PARTIAL' | null;
  reason: string;
  rejectReason: string | null;
  createdAt: string;
  lines: { itemId: string; nameEn: string; nameTa: string; requestedGrams: number; approvedGrams: number | null }[];
}

export interface ClosingDraft {
  businessDate: string;
  alreadySubmitted: boolean;
  previousClosingAt: string | null;
  varianceTolerancePaise: number;
  closingDueTime: string;
  lines: { itemId: string; nameEn: string; nameTa: string; openingGrams: number; receivedGrams: number; sentOutGrams: number; adjustmentGrams: number; pricePaisePerKg: number }[];
}

export interface ChildShop {
  id: string;
  code: string;
  nameEn: string;
  nameTa: string;
  totalGrams: number;
  low: boolean;
}

export interface CatalogItem {
  id: string;
  nameEn: string;
  nameTa: string;
  pricePaisePerKg: number | null;
}

/** Everything the app shows, cached so it can be viewed offline. */
export interface Snapshot {
  me: Me;
  stock: StockItem[];
  totalGrams: number;
  incoming: DispatchRow[];
  outgoing: (DispatchDetail & { createdAt?: string })[];
  issues: IssueRow[];
  requests: RequestRow[];
  draft: ClosingDraft;
  items: CatalogItem[];
  children: ChildShop[];
  syncedAt: string;
}

export type QueueKind = 'closing' | 'request' | 'issue';
export interface QueueItem {
  clientId: string;
  kind: QueueKind;
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
  /** Shown in the offline list. */
  label: { key: string; params: Record<string, unknown> };
  error?: string;
}
