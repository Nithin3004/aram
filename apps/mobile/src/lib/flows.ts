/** Online-only operations (the code check needs the server) and error text. */
import type { TFunction } from 'i18next';
import { api, ApiError, OfflineError, uploadPhoto } from './api';
import type { DispatchDetail } from './types';

export function errorText(e: unknown, t: TFunction): string {
  if (e instanceof OfflineError) return t('app.needsOnline');
  if (e instanceof ApiError) {
    const translated = e.code.includes('.') ? t(e.code, { ...(e.params ?? {}), defaultValue: '' }) : '';
    return translated || e.message;
  }
  return t('common.error');
}

export const lookupDelivery = (code: string) => api<DispatchDetail>('/dispatches/lookup', { body: { code } });

export async function confirmReceipt(dispatchId: string, code: string, lines: { itemId: string; receivedGrams: number }[], photoUri: string) {
  const photoKey = await uploadPhoto(photoUri);
  return api<{ status: 'MATCHED' | 'DISCREPANCY' }>(`/dispatches/${dispatchId}/receive`, { body: { code, lines, photoKey } });
}

export const getDispatch = (id: string) => api<DispatchDetail>(`/dispatches/${id}`);

export const confirmSent = (id: string, lines: { itemId: string; sentGrams: number }[]) => api(`/dispatches/${id}/dispatch`, { body: { lines } });

export const changePassword = (currentPassword: string, newPassword: string) =>
  api('/auth/change-password', { body: { currentPassword, newPassword } });

export const submitRecount = (issueId: string, lines: { itemId: string; receivedGrams: number }[], note: string) =>
  api(`/issues/${issueId}/recount`, { body: { lines, note } });
