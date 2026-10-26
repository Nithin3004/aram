'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAction } from '../lib/hooks';
import { Button, Field, FormError, Input, Modal } from '../ui';

/** Signed-in user changes their own password. */
export function ChangePasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const save = () => {
    if (f.next !== f.again) return act.setError(t('auth.passwordMismatch'));
    void act.run(async () => {
      await api('/auth/change-password', { body: { currentPassword: f.current, newPassword: f.next } });
      onDone();
    });
  };
  return (
    <Modal
      title={t('auth.changePassword')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || !f.current || f.next.length < 8} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <Field label={t('auth.currentPassword')}><Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
      <Field label={t('auth.newPassword')}><Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      <Field label={t('auth.confirmPassword')}><Input type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></Field>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}

/** Super Admin sets a new password for an admin or a shop login. */
export function ResetPasswordDialog({ name, path, onClose, onDone }: { name: string; path: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [pw, setPw] = useState('');
  const save = () =>
    void act.run(async () => {
      await api(path, { body: { newPassword: pw } });
      onDone();
    });
  return (
    <Modal
      title={t('auth.resetPassword')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || pw.length < 8} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="small t-muted">{t('auth.resetFor', { name })}</div>
      <Field label={t('auth.newPassword')}><Input type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}
