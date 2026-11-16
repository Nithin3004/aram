'use client';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { businessDate, formatKg, formatRupees } from '@aram/shared';
import { useData, useLocalName } from '../../../lib/hooks';
import { Button, Card, Empty, Field, Input, Loading, PageHeader, Select, THead, TRow } from '../../../ui';

type Period = 'day' | 'month' | 'year';
interface Row {
  label: string;
  openingValuePaise: number;
  inPaise: number;
  salesPaise: number;
  cogsPaise: number;
  grossProfitPaise: number;
  gpPct: number;
  closingValuePaise: number;
  openingQty?: number;
  inQty?: number;
  salesQty?: number;
  closingQty?: number;
}
interface Register { period: Period; from: string; to: string; inLabel: 'PURCHASES' | 'RECEIVED'; unit: 'kg' | 'L' | null; rows: Row[]; total: Row }
interface ShopRow { id: string; code: string; nameEn: string; nameTa: string; type: string; parentId: string | null }
interface ItemRow { id: string; nameEn: string; nameTa: string; unit: 'kg' | 'L'; pricePaisePerKg: number | null }

/** Financial year (1 Apr – 31 Mar) containing today. */
function currentFy() {
  const today = businessDate();
  const y = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const name = useLocalName();
  const fy = currentFy();
  const [period, setPeriod] = useState<Period>('month');
  const [from, setFrom] = useState(fy.from);
  const [to, setTo] = useState(fy.to);
  const [supervisorId, setSupervisorId] = useState('');
  const [shopId, setShopId] = useState('');
  const [itemId, setItemId] = useState('');

  const shops = useData<ShopRow[]>('/shops');
  const items = useData<ItemRow[]>('/items');
  const supervisors = (shops.data ?? []).filter((s) => s.type === 'SUPERVISOR');
  const shopChoices = (shops.data ?? []).filter((s) => s.type === 'SMALL' && (!supervisorId || s.parentId === supervisorId));

  const path = useMemo(() => {
    const p = new URLSearchParams({ period, from, to });
    if (shopId) p.set('shopId', shopId);
    else if (supervisorId) p.set('supervisorId', supervisorId);
    if (itemId) p.set('itemId', itemId);
    return `/reports/register?${p}`;
  }, [period, from, to, supervisorId, shopId, itemId]);
  const reg = useData<Register>(path);
  const r = reg.data;
  const qty = !!itemId && !!r?.unit;
  const unit = r?.unit ? t(`unit.${r.unit}`) : '';
  const cols = qty ? '110px repeat(7, minmax(96px,1fr)) repeat(4, minmax(84px,1fr))' : '110px repeat(7, minmax(96px,1fr))';
  const minWidth = qty ? 1300 : 900;
  const rs = (p: number) => formatRupees(p, { whole: true });
  const hasUnpriced = (items.data ?? []).some((i) => i.pricePaisePerKg == null);

  const exportCsv = () => {
    if (!r) return;
    const head = [t('report.rowPeriod'), t('report.opening'), t(`report.${r.inLabel}`), t('report.sales'), t('report.cogs'), t('report.gp'), t('report.gpPct'), t('report.closing')];
    if (qty) head.push(`${t('report.openingQty')} (${unit})`, `${t('report.inQty')} (${unit})`, `${t('report.salesQty')} (${unit})`, `${t('report.closingQty')} (${unit})`);
    const line = (x: Row, label: string) => {
      const v = [label, x.openingValuePaise / 100, x.inPaise / 100, x.salesPaise / 100, x.cogsPaise / 100, x.grossProfitPaise / 100, x.gpPct, x.closingValuePaise / 100].map(String);
      if (qty) v.push(...[x.openingQty, x.inQty, x.salesQty, x.closingQty].map((g) => String((g ?? 0) / 1000)));
      return v.map((s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(',');
    };
    const csv = '﻿' + [head.join(','), ...r.rows.map((x) => line(x, x.label)), line(r.total, t('report.total'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `register-${period}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cells = (x: Row, strong?: boolean) => (
    <>
      <span className={`cell-num-light ${strong ? 'num' : ''}`}>{rs(x.openingValuePaise)}</span>
      <span className="cell-num-light">{rs(x.inPaise)}</span>
      <span className="cell-num">{rs(x.salesPaise)}</span>
      <span className="cell-num-light">{rs(x.cogsPaise)}</span>
      <span className={`cell-num ${x.grossProfitPaise < 0 ? 't-danger' : 't-success'}`}>{rs(x.grossProfitPaise)}</span>
      <span className="cell-num-light">{x.gpPct.toFixed(1)}%</span>
      <span className="cell-num">{rs(x.closingValuePaise)}</span>
      {qty && (
        <>
          <span className="cell-num-light">{formatKg(x.openingQty ?? 0)}</span>
          <span className="cell-num-light">{formatKg(x.inQty ?? 0)}</span>
          <span className="cell-num-light">{formatKg(x.salesQty ?? 0)}</span>
          <span className="cell-num">{formatKg(x.closingQty ?? 0)}</span>
        </>
      )}
    </>
  );

  return (
    <div className="page">
      <PageHeader title={t('report.title')} sub={t('report.sub')} actions={<Button onClick={exportCsv} disabled={!r}>{t('common.exportCsv')}</Button>} />
      <Card pad>
        <div className="form-grid">
          <Field label={t('report.period')}>
            <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="day">{t('report.day')}</option>
              <option value="month">{t('report.month')}</option>
              <option value="year">{t('report.year')}</option>
            </Select>
          </Field>
          <Field label={t('report.from')}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={t('report.to')}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label={t('report.supervisor')}>
            <Select value={supervisorId} onChange={(e) => { setSupervisorId(e.target.value); setShopId(''); }}>
              <option value="">{t('report.all')}</option>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{s.code} {name(s)}</option>)}
            </Select>
          </Field>
          <Field label={t('report.shop')}>
            <Select value={shopId} onChange={(e) => setShopId(e.target.value)}>
              <option value="">{t('report.all')}</option>
              {shopChoices.map((s) => <option key={s.id} value={s.id}>{s.code} {name(s)}</option>)}
            </Select>
          </Field>
          <Field label={t('report.product')}>
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">{t('report.all')}</option>
              {(items.data ?? []).map((i) => <option key={i.id} value={i.id}>{name(i)} ({t(`unit.${i.unit}`)})</option>)}
            </Select>
          </Field>
        </div>
        <div className="form-hint" style={{ marginTop: 10 }}>{qty ? `${t('report.qtyNote')} (${unit})` : t('report.qtyNote')}</div>
        {hasUnpriced && <div className="form-error" style={{ marginTop: 10 }}>{t('report.noPrice')}</div>}
      </Card>

      <Card>
        <div className="scroll-x">
          <THead cols={cols} minWidth={minWidth}>
            <span>{t('report.rowPeriod')}</span>
            <span className="right">{t('report.opening')}</span>
            <span className="right">{r ? t(`report.${r.inLabel}`) : ''}</span>
            <span className="right">{t('report.sales')}</span>
            <span className="right">{t('report.cogs')}</span>
            <span className="right">{t('report.gp')}</span>
            <span className="right">{t('report.gpPct')}</span>
            <span className="right">{t('report.closing')}</span>
            {qty && (
              <>
                <span className="right">{t('report.openingQty')}</span>
                <span className="right">{t('report.inQty')}</span>
                <span className="right">{t('report.salesQty')}</span>
                <span className="right">{t('report.closingQty')}</span>
              </>
            )}
          </THead>
          {reg.loading && !r && <Loading />}
          {reg.error && <div className="form-error" style={{ margin: 16 }}>{reg.error.message}</div>}
          {r && r.rows.length === 0 && <Empty />}
          {r && r.rows.length > 0 && (
            <TRow cols={cols} minWidth={minWidth} tone="muted">
              <span className="mono small" style={{ fontWeight: 600 }}>{t('report.total')}</span>
              {cells(r.total, true)}
            </TRow>
          )}
          {r?.rows.map((x) => (
            <TRow key={x.label} cols={cols} minWidth={minWidth}>
              <span className="mono small">{x.label}</span>
              {cells(x)}
            </TRow>
          ))}
        </div>
      </Card>
    </div>
  );
}
