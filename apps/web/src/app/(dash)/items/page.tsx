'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, businessDate, formatIstDate, formatKg, rupeesToPaise } from '@aram/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData, useLocalName } from '../../../lib/hooks';
import { Button, Card, Empty, Field, FormError, Input, Loading, Modal, PageHeader, THead, Toast, TRow } from '../../../ui';

interface Item {
  id: string;
  code: string;
  nameEn: string;
  nameTa: string;
  isActive: boolean;
  pricePaisePerKg: number | null;
  networkGrams: number;
  changedOn: string | null;
  scheduled: { pricePaisePerKg: number; effectiveFrom: string } | null;
}
interface PriceRow { effectiveFrom: string; pricePaisePerKg: number; by: string }

const rs = (p: number) => (p / 100).toFixed(2);
const COLS = 'minmax(0,1fr) 92px 100px 90px 76px';

export default function ItemsPage() {
  const { t } = useTranslation();
  const name = useLocalName();
  const { can } = useAuth();
  const list = useData<Item[]>('/items');
  const shops = useData<{ shops: number }>('/dashboard/nav');
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!sel && list.data?.length) setSel(list.data[0].id);
  }, [list.data, sel]);

  const item = list.data?.find((i) => i.id === sel) ?? null;

  return (
    <div className="page">
      <PageHeader
        title={t('items.title')}
        sub={t('items.sub', { n: shops.data?.shops ?? '' })}
        actions={can('MANAGE_ITEMS') && <Button variant="primary" onClick={() => setAdding(true)}>{t('items.add')}</Button>}
      />
      <div className="split split-items">
        <Card>
          <div className="scroll-x">
            <THead cols={COLS} minWidth={520}>
              <span>{t('items.item')}</span>
              <span className="right">{t('items.price')}</span>
              <span className="right">{t('items.networkKg')}</span>
              <span className="right">{t('items.changed')}</span>
              <span className="right">{t('items.state')}</span>
            </THead>
            {!list.data && <Loading />}
            {list.data?.map((i) => (
              <TRow key={i.id} cols={COLS} selected={sel === i.id} onClick={() => setSel(i.id)} minWidth={520}>
                <span style={{ minWidth: 0, opacity: i.isActive ? 1 : 0.55 }}>
                  <span className="cell-main ellipsis">{name(i)}</span>
                  <span className="cell-sub mono">{i.code}</span>
                </span>
                <span className="cell-num" style={{ fontSize: 13 }}>
                  {i.pricePaisePerKg != null ? rs(i.pricePaisePerKg) : '—'}
                  {i.scheduled && <span className="mono xsmall t-warn" style={{ display: 'block', marginTop: 3 }}>→ {rs(i.scheduled.pricePaisePerKg)}</span>}
                </span>
                <span className="cell-num-light">{formatKg(Math.round(i.networkGrams / 1000) * 1000)}</span>
                <span className="right mono xsmall t-faint">{i.changedOn ? formatIstDate(i.changedOn) : '—'}</span>
                <span className={`right mono xsmall ${i.isActive ? 't-success' : 't-subtle'}`} style={{ fontWeight: 600 }}>
                  {i.isActive ? t('items.ACTIVE') : t('items.PAUSED')}
                </span>
              </TRow>
            ))}
          </div>
        </Card>
        <Card pad className="sticky">
          {!item ? <Empty /> : <ItemDetail key={item.id} item={item} onChanged={(m) => { setToast(m); void list.reload(); }} />}
        </Card>
      </div>
      {adding && (
        <AddItem
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            setToast(t('common.saved'));
            void list.reload();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function ItemDetail({ item, onChanged }: { item: Item; onChanged: (msg: string) => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const { can } = useAuth();
  const history = useData<PriceRow[]>(`/items/${item.id}/prices`);
  const act = useAction();
  const [price, setPrice] = useState(item.pricePaisePerKg != null ? rs(item.pricePaisePerKg) : '');
  const [names, setNames] = useState({ nameEn: item.nameEn, nameTa: item.nameTa });
  const tomorrow = addDays(businessDate(), 1);

  const updatePrice = () =>
    void act.run(async () => {
      await api(`/items/${item.id}/price`, { body: { pricePaisePerKg: rupeesToPaise(price) } });
      await history.reload();
      onChanged(t('items.scheduled', { price, date: formatIstDate(tomorrow) }));
    });
  const toggleActive = () =>
    void act.run(async () => {
      await api(`/items/${item.id}`, { method: 'PATCH', body: { isActive: !item.isActive } });
      onChanged(t('common.saved'));
    });
  const saveNames = () =>
    void act.run(async () => {
      await api(`/items/${item.id}`, { method: 'PATCH', body: names });
      onChanged(t('common.saved'));
    });

  const rows = history.data ?? [];
  return (
    <div className="stack-sm">
      <div style={{ fontWeight: 600, fontSize: 15 }}>{name(item)}</div>
      <div className="mono xsmall t-subtle">{item.code}</div>
      {item.scheduled && (
        <div className="form-hint t-warn">{t('items.scheduled', { price: rs(item.scheduled.pricePaisePerKg), date: formatIstDate(item.scheduled.effectiveFrom) })}</div>
      )}
      {can('CHANGE_PRICES') && (
        <>
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap', marginTop: 8 }}>
            <Field label={t('items.sellingPrice')}>
              <Input big inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Button variant="primary" disabled={act.busy || !Number(price)} onClick={updatePrice} style={{ padding: '12px 14px' }}>
              {t('items.updatePrice')}
            </Button>
          </div>
          <div className="form-hint">{t('items.priceNote', { date: formatIstDate(tomorrow) })}</div>
        </>
      )}
      <FormError>{act.error}</FormError>
      <div className="small t-muted" style={{ marginTop: 12, fontWeight: 500, fontSize: 12 }}>{t('items.history')}</div>
      {rows.map((p, i) => {
        const prev = rows[i + 1];
        const delta = prev ? p.pricePaisePerKg - prev.pricePaisePerKg : null;
        return (
          <div key={p.effectiveFrom} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--c-divider-faint)', flexWrap: 'nowrap' }}>
            <span className="mono small t-faint" style={{ width: 90 }}>{formatIstDate(p.effectiveFrom)}</span>
            <span className="num" style={{ fontSize: 12 }}>₹{rs(p.pricePaisePerKg)}</span>
            <span className={`mono small ${delta === null ? 't-faint' : delta > 0 ? 't-danger' : 't-success'}`}>
              {delta === null ? t('items.opening') : `${delta > 0 ? '+' : '−'}${rs(Math.abs(delta))}`}
            </span>
            <span className="small t-subtle ellipsis" style={{ marginLeft: 'auto' }}>{p.by}</span>
          </div>
        );
      })}
      {can('MANAGE_ITEMS') && (
        <>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <Field label={t('items.nameEn')}><Input value={names.nameEn} onChange={(e) => setNames({ ...names, nameEn: e.target.value })} /></Field>
            <Field label={t('items.nameTa')}><Input lang="ta" value={names.nameTa} onChange={(e) => setNames({ ...names, nameTa: e.target.value })} /></Field>
          </div>
          <Button disabled={act.busy || (names.nameEn === item.nameEn && names.nameTa === item.nameTa)} onClick={saveNames}>{t('items.saveNames')}</Button>
          <Button block variant="danger-outline" disabled={act.busy} onClick={toggleActive} className="" >
            {item.isActive ? t('items.deactivate') : t('items.activate')}
          </Button>
          <div className="form-hint">{t('items.deactivateNote')}</div>
        </>
      )}
    </div>
  );
}

function AddItem({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [f, setF] = useState({ code: '', nameEn: '', nameTa: '', price: '' });
  const save = () =>
    void act.run(async () => {
      await api('/items', { body: { code: f.code, nameEn: f.nameEn, nameTa: f.nameTa, pricePaisePerKg: rupeesToPaise(f.price) } });
      onDone();
    });
  return (
    <Modal
      title={t('items.add')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || !f.code || !f.nameEn || !f.nameTa || !Number(f.price)} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <span className="notice-plain" style={{ alignSelf: 'flex-start' }}>{t('common.notDesigned')}</span>
      <div className="form-grid">
        <Field label={t('items.code')}><Input value={f.code} placeholder="ITM-31" onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label={t('items.startPrice')}><Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        <Field label={t('items.nameEn')}><Input value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        <Field label={t('items.nameTa')}><Input lang="ta" value={f.nameTa} onChange={(e) => setF({ ...f, nameTa: e.target.value })} /></Field>
      </div>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}
