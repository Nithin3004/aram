'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { kgToGrams, rupeesToPaise } from '@aram/shared';
import { api } from '../lib/api';
import { useAction, useData, useLocalName } from '../lib/hooks';
import { Button, Field, FormError, Input, Loading, Modal, Select } from '../ui';

interface Named { id: string; code: string; nameEn: string; nameTa: string; type?: string }

/** Super Admin edits a shop's English/Tamil names, login phone and supervisor. */
export function EditShopDialog({
  shop,
  supervisors,
  onClose,
  onDone,
}: {
  shop: Named & { type: string; phone?: string; parentId?: string | null };
  supervisors: Named[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const name = useLocalName();
  const act = useAction();
  const [f, setF] = useState({ nameEn: shop.nameEn, nameTa: shop.nameTa, phone: shop.phone ?? '', parentId: shop.parentId ?? '' });
  const save = () =>
    void act.run(async () => {
      await api(`/shops/${shop.id}`, {
        method: 'PATCH',
        body: { nameEn: f.nameEn, nameTa: f.nameTa, phone: f.phone.trim(), ...(shop.type === 'SMALL' && f.parentId ? { parentId: f.parentId } : {}) },
      });
      onDone();
    });
  return (
    <Modal
      title={`${t('shops.edit')} · ${shop.code}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || !f.nameEn.trim()} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('shops.nameEn')}><Input value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        <Field label={t('shops.nameTa')}><Input lang="ta" value={f.nameTa} onChange={(e) => setF({ ...f, nameTa: e.target.value })} /></Field>
        <Field label={t('shops.phone')} hint={t('shops.phoneHint')}>
          <Input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} />
        </Field>
        {shop.type === 'SMALL' && (
          <Field label={t('shops.parent')}>
            <Select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{s.code} {name(s)}</option>)}
            </Select>
          </Field>
        )}
      </div>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}

/** Super Admin sets an admin's login phone (for OTP). */
export function AdminPhoneDialog({ admin, onClose, onDone }: { admin: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [phone, setPhone] = useState('');
  const save = () =>
    void act.run(async () => {
      await api(`/admins/${admin.id}`, { method: 'PATCH', body: { phone } });
      onDone();
    });
  return (
    <Modal
      title={`${t('admin.editPhone')} · ${admin.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || !/^\d{10}$/.test(phone)} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <Field label={t('shops.phone')} hint={t('shops.phoneHint')}>
        <Input inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}

/** HO enters a shop's opening stock (quantity + optional cost rate per product), once. */
export function OpeningStockDialog({ shop, onClose, onDone }: { shop: Named; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const act = useAction();
  const items = useData<{ id: string; nameEn: string; nameTa: string; unit: 'kg' | 'L'; isActive: boolean }[]>('/items');
  const [v, setV] = useState<Record<string, { qty: string; rate: string }>>({});
  const save = () =>
    void act.run(async () => {
      const lines = Object.entries(v)
        .filter(([, x]) => x.qty.trim() || x.rate.trim())
        .map(([itemId, x]) => ({ itemId, grams: kgToGrams(x.qty || '0'), ratePaise: x.rate.trim() ? rupeesToPaise(x.rate) : null }));
      await api('/opening-stock', { body: { shopId: shop.id, lines } });
      onDone();
    });
  return (
    <Modal
      wide
      title={t('shops.openingTitle', { shop: `${shop.code} ${name(shop)}` })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="form-hint">{t('shops.openingHint')}</div>
      {!items.data ? (
        <Loading />
      ) : (
        <div className="stack-sm">
          {items.data.filter((i) => i.isActive).map((i) => {
            const unit = t(`unit.${i.unit}`);
            const x = v[i.id] ?? { qty: '', rate: '' };
            return (
              <div key={i.id} className="form-grid" style={{ alignItems: 'end' }}>
                <div style={{ fontWeight: 500, fontSize: 13, paddingBottom: 10 }}>{name(i)}</div>
                <Field label={t('shops.qty', { unit })}><Input numeric inputMode="decimal" value={x.qty} onChange={(e) => setV({ ...v, [i.id]: { ...x, qty: e.target.value } })} /></Field>
                <Field label={t('shops.rate', { unit })}><Input numeric inputMode="decimal" value={x.rate} onChange={(e) => setV({ ...v, [i.id]: { ...x, rate: e.target.value } })} /></Field>
              </div>
            );
          })}
        </div>
      )}
      <FormError>{act.error}</FormError>
    </Modal>
  );
}
