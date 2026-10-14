export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  SHOP: 'SHOP',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ShopType = {
  HO: 'HO',
  SUPERVISOR: 'SUPERVISOR',
  SMALL: 'SMALL',
} as const;
export type ShopType = (typeof ShopType)[keyof typeof ShopType];

/** Admin permissions granted by the Super Admin. An admin with none is view-only. */
export const Permission = {
  APPROVE_REQUESTS: 'APPROVE_REQUESTS',
  CHANGE_PRICES: 'CHANGE_PRICES',
  MANAGE_ITEMS: 'MANAGE_ITEMS',
  MANAGE_VENDORS: 'MANAGE_VENDORS',
  CREATE_DISPATCH: 'CREATE_DISPATCH',
  RESOLVE_ISSUES: 'RESOLVE_ISSUES',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];
export const ALL_PERMISSIONS: Permission[] = Object.values(Permission);

export const DispatchStatus = {
  CREATED: 'CREATED',
  DISPATCHED: 'DISPATCHED',
  RECEIVED: 'RECEIVED',
  MATCHED: 'MATCHED',
  DISCREPANCY: 'DISCREPANCY',
  RESOLVED: 'RESOLVED',
} as const;
export type DispatchStatus = (typeof DispatchStatus)[keyof typeof DispatchStatus];

export const DispatchKind = {
  DISPATCH: 'DISPATCH',
  TRANSFER: 'TRANSFER',
} as const;
export type DispatchKind = (typeof DispatchKind)[keyof typeof DispatchKind];

export const RequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const ApprovalType = {
  FULL: 'FULL',
  PARTIAL: 'PARTIAL',
} as const;
export type ApprovalType = (typeof ApprovalType)[keyof typeof ApprovalType];

export const IssueStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
} as const;
export type IssueStatus = (typeof IssueStatus)[keyof typeof IssueStatus];

export const IssueSource = {
  AUTO: 'AUTO',
  SHOP: 'SHOP',
} as const;
export type IssueSource = (typeof IssueSource)[keyof typeof IssueSource];

export const IssueType = {
  DISPATCH_DISCREPANCY: 'DISPATCH_DISCREPANCY',
  CASH_VARIANCE: 'CASH_VARIANCE',
  NEGATIVE_SOLD: 'NEGATIVE_SOLD',
  MISSING_CLOSING: 'MISSING_CLOSING',
  DAMAGED_GOODS: 'DAMAGED_GOODS',
  TRANSFER_PROBLEM: 'TRANSFER_PROBLEM',
  OTHER: 'OTHER',
} as const;
export type IssueType = (typeof IssueType)[keyof typeof IssueType];
/** Types a shop may pick when raising an issue by hand. */
export const MANUAL_ISSUE_TYPES: IssueType[] = ['DAMAGED_GOODS', 'TRANSFER_PROBLEM', 'OTHER'];

export const LedgerType = {
  PURCHASE: 'PURCHASE',
  DISPATCH_OUT: 'DISPATCH_OUT',
  RECEIVE_IN: 'RECEIVE_IN',
  SOLD: 'SOLD',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];

export const Language = {
  EN: 'en',
  TA: 'ta',
} as const;
export type Language = (typeof Language)[keyof typeof Language];
