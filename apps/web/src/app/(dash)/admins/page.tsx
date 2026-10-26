'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ALL_PERMISSIONS, Permission } from '@aram/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData } from '../../../lib/hooks';
import { Avatar, Button, Card, Field, FormError, Input, Loading, Modal, PageHeader, Tag, THead, Toast, Toggle, TRow } from '../../../ui';
import { ResetPasswordDialog } from '../../../components/PasswordDialogs';

interface Admin { id: string; name: string; username: string; role: 'SUPER_ADMIN' | 'ADMIN'; isActive: boolean; permissions: Permission[]; phoneMasked: string }

const COLS = `minmax(200px,1.3fr) repeat(${ALL_PERMISSIONS.length}, minmax(84px,1fr)) 90px`;
const AVATAR_TONES = ['var(--c-accent)', 'var(--c-resolved)', 'var(--c-info)', 'var(--c-warn)', 'var(--c-success)'];

export default function AdminsPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const list = useData<Admin[]>('/admins');
  const act = useAction();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<Admin | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const isSuper = me?.role === 'SUPER_ADMIN';

  const update = (a: Admin, body: { permissions?: Permission[]; isActive?: boolean }) =>
    void act.run(async () => {
      // Optimistic, then confirm from the server.
      list.setData((list.data ?? []).map((x) => (x.id === a.id ? { ...x, ...body } : x)));
      await api(`/admins/${a.id}`, { method: 'PATCH', body });
    }).then(() => list.reload()); // also reverts the optimistic change if the server refused

  return (
    <div className="page">
      <PageHeader title={t('admin.title')} actions={isSuper && <Button variant="primary" onClick={() => setCreating(true)}>{t('admin.create')}</Button>} />
      <FormError>{act.error}</FormError>
      <Card>
        <div className="scroll-x">
          <THead cols={COLS} minWidth={900}>
            <span>{t('admin.admin')}</span>
            {ALL_PERMISSIONS.map((p) => <span key={p} className="center">{t(`perm.${p}`)}</span>)}
            <span />
          </THead>
          {!list.data && <Loading />}
          {list.data?.map((a, i) => {
            const fixed = a.role === 'SUPER_ADMIN';
            return (
              <TRow key={a.id} cols={COLS} minWidth={900} tone={a.isActive ? undefined : 'muted'}>
                <span className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0 }}>
                  <Avatar name={a.name} color={AVATAR_TONES[i % AVATAR_TONES.length]} />
                  <span style={{ minWidth: 0 }}>
                    <span className="cell-main ellipsis">{a.name}</span>
                    <span className="mono xsmall t-subtle">
                      {t(`role.${a.role}`)} · {a.username}
                      {!fixed && a.permissions.length === 0 && ` · ${t('admin.viewOnly')}`}
                    </span>
                  </span>
                </span>
                {ALL_PERMISSIONS.map((p) => (
                  <span key={p} className="row" style={{ justifyContent: 'center' }}>
                    <Toggle
                      label={t(`perm.${p}`)}
                      fixed={fixed || !isSuper}
                      on={fixed || a.permissions.includes(p)}
                      onChange={(on) => update(a, { permissions: on ? [...a.permissions, p] : a.permissions.filter((x) => x !== p) })}
                    />
                  </span>
                ))}
                <span className="right">
                  {!a.isActive && <Tag tone="danger">{t('admin.disabled')}</Tag>}
                  {!fixed && isSuper && (
                    <span className="stack-sm" style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Button variant="link" onClick={() => update(a, { isActive: !a.isActive })}>{a.isActive ? t('admin.disable') : t('admin.enable')}</Button>
                      <Button variant="link" onClick={() => setResetting(a)}>{t('auth.resetPassword')}</Button>
                    </span>
                  )}
                </span>
              </TRow>
            );
          })}
        </div>
      </Card>
      <div className="form-hint">{t('admin.fixedNote')}</div>
      {creating && (
        <CreateAdmin
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            setToast(t('common.saved'));
            void list.reload();
          }}
        />
      )}
      {resetting && (
        <ResetPasswordDialog
          name={resetting.name}
          path={`/admins/${resetting.id}/reset-password`}
          onClose={() => setResetting(null)}
          onDone={() => {
            setToast(t('auth.resetDone', { name: resetting.name }));
            setResetting(null);
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function CreateAdmin({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [f, setF] = useState({ name: '', username: '', password: '', phone: '' });
  const [perms, setPerms] = useState<Permission[]>([]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () =>
    void act.run(async () => {
      await api('/admins', { body: { ...f, permissions: perms } });
      onDone();
    });
  return (
    <Modal
      title={t('admin.create')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <span className="notice-plain" style={{ alignSelf: 'flex-start' }}>{t('common.notDesigned')}</span>
      <div className="form-grid">
        <Field label={t('admin.name')}><Input value={f.name} onChange={set('name')} /></Field>
        <Field label={t('admin.username')}><Input value={f.username} onChange={set('username')} /></Field>
        <Field label={t('admin.password')}><Input type="password" value={f.password} onChange={set('password')} /></Field>
        <Field label={t('admin.phone')}><Input inputMode="numeric" maxLength={10} value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <div className="stack-sm">
        {ALL_PERMISSIONS.map((p) => (
          <label key={p} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small">{t(`perm.${p}`)}</span>
            <Toggle label={t(`perm.${p}`)} on={perms.includes(p)} onChange={(on) => setPerms(on ? [...perms, p] : perms.filter((x) => x !== p))} />
          </label>
        ))}
      </div>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}
