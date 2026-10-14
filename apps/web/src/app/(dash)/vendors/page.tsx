'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { businessDate, formatIstDate, formatKg, formatRupeesCompact, kgToGrams, rupeesToPaise } from '@aram/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData, useLocalName } from '../../../lib/hooks';
import { Button, Card, CardHead, Empty, Field, FormError, Input, Loading, Modal, PageHeader, Select, THead, Toast, TRow } from '../../../ui';

interface Vendor { id: string; nameEn: string; nameTa: string; phone: string; supplies: string; isActive: boolean; monthPaise: number }
interface Purchase { id: string; date: string; invoiceNo: string; vendor: { nameEn: string; nameTa: string }; item: { nameEn: string; nameTa: string }; qtyGrams: number; costPaisePerKg: number; totalPaise: number }
interface Item { id: string; nameEn: string; nameTa: string; isActive: boolean }

const COLS = '96px minmax(0,1fr) 110px 80px 90px';

export default function VendorsPage() {
  const { t } = useTranslation();
  const name = useLocalName();
  const { can } = useAuth();
  const vendors = useData<Vendor[]>('/vendors');
  const purchases = useData<Purchase[]>('/purchases');
  const [recording, setRecording] = useState(false);
  const [vendorForm, setVendorForm] = useState<Vendor | 'new' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const manage = can('MANAGE_VENDORS');

  return (
    <div className="page">
      <PageHeader title={t('vendor.title')} actions={manage && <Button variant="primary" onClick={() => setRecording(true)}>{t('vendor.record')}</Button>} />
      <div className="split split-vendors">
        <Card>
          <CardHead title={<span className="t-muted" style={{ fontSize: 12 }}>{t('vendor.vendors')}</span>}>
            {manage && <span style={{ marginLeft: 'auto' }}><Button variant="link" onClick={() => setVendorForm('new')}>+ {t('vendor.add')}</Button></span>}
          </CardHead>
          {!vendors.data && <Loading />}
          {vendors.data?.map((v) => (
            <TRow key={v.id} cols="minmax(0,1fr) auto" onClick={manage ? () => setVendorForm(v) : undefined} tone={v.isActive ? undefined : 'muted'}>
              <span style={{ minWidth: 0, opacity: v.isActive ? 1 : 0.55 }}>
                <span className="cell-main ellipsis">{name(v)}</span>
                <span className="mono xsmall t-faint" style={{ display: 'block', marginTop: 3 }}>{v.supplies}</span>
              </span>
              <span className="right">
                <span className="num" style={{ fontSize: 12 }}>{formatRupeesCompact(v.monthPaise)}</span>
                <span className="mono xsmall t-faint" style={{ display: 'block' }}>{t('vendor.mtd')}</span>
              </span>
            </TRow>
          ))}
        </Card>
        <Card>
          <div className="scroll-x">
            <THead cols={COLS} minWidth={520}>
              <span>{t('vendor.date')}</span>
              <span>{t('vendor.vendorItem')}</span>
              <span className="right">{t('vendor.qty')}</span>
              <span className="right">{t('vendor.rate')}</span>
              <span className="right">{t('vendor.total')}</span>
            </THead>
            {!purchases.data && <Loading />}
            {purchases.data?.length === 0 && <Empty />}
            {purchases.data?.map((p) => (
              <TRow key={p.id} cols={COLS} minWidth={520}>
                <span className="mono small t-faint">{formatIstDate(p.date)}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="cell-main ellipsis">{name(p.item)}</span>
                  <span className="cell-sub ellipsis">{name(p.vendor)} · <span className="mono">{p.invoiceNo}</span></span>
                </span>
                <span className="cell-num">{formatKg(p.qtyGrams)} {t('common.kg')}</span>
                <span className="cell-num-light">{(p.costPaisePerKg / 100).toFixed(2)}</span>
                <span className="cell-num">{formatRupeesCompact(p.totalPaise)}</span>
              </TRow>
            ))}
          </div>
        </Card>
      </div>
      {recording && (
        <RecordPurchase
          vendors={(vendors.data ?? []).filter((v) => v.isActive)}
          onClose={() => setRecording(false)}
          onDone={() => {
            setRecording(false);
            setToast(t('common.saved'));
            void purchases.reload();
            void vendors.reload();
          }}
        />
      )}
      {vendorForm && (
        <VendorForm
          vendor={vendorForm === 'new' ? null : vendorForm}
          onClose={() => setVendorForm(null)}
          onDone={() => {
            setVendorForm(null);
            setToast(t('common.saved'));
            void vendors.reload();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function RecordPurchase({ vendors, onClose, onDone }: { vendors: Vendor[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const items = useData<Item[]>('/items');
  const act = useAction();
  const [f, setF] = useState({ vendorId: vendors[0]?.id ?? '', itemId: '', qty: '', cost: '', date: businessDate(), invoiceNo: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () =>
    void act.run(async () => {
      await api('/purchases', { body: { vendorId: f.vendorId, itemId: f.itemId, qtyGrams: kgToGrams(f.qty), costPaisePerKg: rupeesToPaise(f.cost), date: f.date, invoiceNo: f.invoiceNo } });
      onDone();
    });
  return (
    <Modal
      title={t('vendor.record')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || !f.vendorId || !f.itemId || !Number(f.qty) || !Number(f.cost) || !f.invoiceNo} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <span className="notice-plain" style={{ alignSelf: 'flex-start' }}>{t('common.notDesigned')}</span>
      <div className="form-grid">
        <Field label={t('vendor.vendor')}>
          <Select value={f.vendorId} onChange={set('vendorId')}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{name(v)}</option>)}
          </Select>
        </Field>
        <Field label={t('vendor.item')}>
          <Select value={f.itemId} onChange={set('itemId')}>
            <option value="">—</option>
            {(items.data ?? []).filter((i) => i.isActive).map((i) => <option key={i.id} value={i.id}>{name(i)}</option>)}
          </Select>
        </Field>
        <Field label={t('vendor.qtyKg')}><Input numeric inputMode="decimal" value={f.qty} onChange={set('qty')} /></Field>
        <Field label={t('vendor.costKg')}><Input numeric inputMode="decimal" value={f.cost} onChange={set('cost')} /></Field>
        <Field label={t('vendor.purchaseDate')}><Input type="date" value={f.date} max={businessDate()} onChange={set('date')} /></Field>
        <Field label={t('vendor.invoice')}><Input value={f.invoiceNo} onChange={set('invoiceNo')} /></Field>
      </div>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}

function VendorForm({ vendor, onClose, onDone }: { vendor: Vendor | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [f, setF] = useState({ nameEn: vendor?.nameEn ?? '', nameTa: vendor?.nameTa ?? '', phone: vendor?.phone ?? '', supplies: vendor?.supplies ?? '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = (extra?: { isActive: boolean }) =>
    void act.run(async () => {
      if (vendor) await api(`/vendors/${vendor.id}`, { method: 'PATCH', body: { ...f, ...extra } });
      else await api('/vendors', { body: f });
      onDone();
    });
  return (
    <Modal
      title={vendor ? vendor.nameEn : t('vendor.add')}
      onClose={onClose}
      footer={
        <>
          {vendor && (
            <Button variant="danger-outline" disabled={act.busy} onClick={() => save({ isActive: !vendor.isActive })} style={{ marginRight: 'auto' }}>
              {vendor.isActive ? t('vendor.deactivate') : t('vendor.activate')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || !f.nameEn} onClick={() => save()}>{t('common.save')}</Button>
        </>
      }
    >
      <span className="notice-plain" style={{ alignSelf: 'flex-start' }}>{t('common.notDesigned')}</span>
      <div className="form-grid">
        <Field label={t('vendor.nameEn')}><Input value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('vendor.nameTa')}><Input lang="ta" value={f.nameTa} onChange={set('nameTa')} /></Field>
        <Field label={t('vendor.phone')}><Input value={f.phone} onChange={set('phone')} /></Field>
        <Field label={t('vendor.supplies')}><Input value={f.supplies} onChange={set('supplies')} /></Field>
      </div>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}
