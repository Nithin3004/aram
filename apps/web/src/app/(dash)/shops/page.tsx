'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIstDate, formatIstDateTime, formatKg, formatRupees } from '@aram/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData, useLocalName } from '../../../lib/hooks';
import { Bar, Button, Card, Empty, Field, FormError, Input, Loading, Modal, PageHeader, Select, Tag, THead, Toast, TRow } from '../../../ui';
import { ResetPasswordDialog } from '../../../components/PasswordDialogs';

interface ShopRow {
  id: string;
  code: string;
  nameEn: string;
  nameTa: string;
  type: 'HO' | 'SUPERVISOR' | 'SMALL';
  parentId: string | null;
  totalGrams: number;
  lowCount: number;
  closedToday: boolean;
  variancePaise: number | null;
  varianceFlagged: boolean;
}
interface ShopDetail {
  id: string;
  code: string;
  nameEn: string;
  nameTa: string;
  type: 'HO' | 'SUPERVISOR' | 'SMALL';
  parent: { code: string; nameEn: string; nameTa: string } | null;
  totalGrams: number;
  stock: { itemId: string; nameEn: string; nameTa: string; onHandGrams: number; daysLeft: number | null; avgDailySoldGrams: number; low: boolean; watch: boolean }[];
  sales: null | {
    today: null | { expectedRevenuePaise: number; cashPaise: number; upiPaise: number; variancePaise: number; varianceFlagged: boolean };
    lastClosingAt: string | null;
    history: { businessDate: string; expectedRevenuePaise: number; collectedPaise: number; variancePaise: number; varianceFlagged: boolean }[];
  };
}

function flag(s: ShopRow): { key: string; tone: 'danger' | 'warn' | 'success' } {
  if (s.type === 'HO') return { key: 'shops.flagOk', tone: 'success' };
  if (s.varianceFlagged) return { key: 'shops.flagGap', tone: 'danger' };
  if (!s.closedToday) return { key: 'shops.flagNoClosing', tone: 'warn' };
  if (s.lowCount) return { key: 'shops.flagLow', tone: 'warn' };
  return { key: 'shops.flagOk', tone: 'success' };
}
const kg1 = (g: number) => formatKg(Math.round(g / 1000) * 1000);

function ShopsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const lowOnly = params.get('low') === '1';
  const { me, can } = useAuth();
  const name = useLocalName();
  const list = useData<ShopRow[]>('/shops');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const detail = useData<ShopDetail>(sel ? `/shops/${sel}` : null);

  const groups = useMemo(() => {
    const rows = list.data ?? [];
    const needle = q.trim().toLowerCase();
    const match = (s: ShopRow) => !needle || s.code.toLowerCase().includes(needle) || s.nameEn.toLowerCase().includes(needle) || s.nameTa.includes(q.trim());
    const sups = rows.filter((s) => s.type === 'SUPERVISOR');
    return {
      ho: rows.find((s) => s.type === 'HO'),
      small: rows.filter((s) => s.type === 'SMALL').length,
      sups: sups
        .map((sup) => {
          const kids = rows.filter((s) => s.parentId === sup.id).filter((s) => (!lowOnly || s.lowCount > 0) && (match(s) || match(sup)));
          return {
            sup,
            kids,
            gaps: rows.filter((s) => s.parentId === sup.id && s.varianceFlagged).length + (sup.varianceFlagged ? 1 : 0),
            notClosed: rows.filter((s) => s.parentId === sup.id && !s.closedToday).length + (sup.closedToday ? 0 : 1),
            count: rows.filter((s) => s.parentId === sup.id).length,
          };
        })
        .filter((g) => g.kids.length || (!lowOnly && match(g.sup))),
    };
  }, [list.data, q, lowOnly]);

  useEffect(() => {
    if (!sel && list.data) {
      const first = lowOnly ? list.data.find((s) => s.lowCount > 0) : list.data.find((s) => s.type === 'SMALL');
      if (first) {
        setSel(first.id);
        if (first.parentId) setOpen((o) => ({ ...o, [first.parentId!]: true }));
      }
    }
    if (lowOnly && list.data) setOpen(Object.fromEntries(list.data.filter((s) => s.type === 'SUPERVISOR').map((s) => [s.id, true])));
  }, [list.data, sel, lowOnly]);

  if (!list.data) return <Loading />;
  const shown = groups.sups.reduce((a, g) => a + g.kids.length, 0);
  const d = detail.data;
  const today = d?.sales?.today;
  const maxDays = 10;

  const rowFor = (s: ShopRow, indent: boolean) => {
    const f = flag(s);
    return (
      <TRow key={s.id} cols="minmax(0,1fr) 84px 84px" selected={sel === s.id} onClick={() => { setSel(s.id); setShowHistory(false); }}>
        <span style={{ minWidth: 0, paddingLeft: indent ? 18 : 0 }}>
          <span className="cell-main ellipsis">{s.code} {name(s)}</span>
        </span>
        <span className="cell-num-light small">{kg1(s.totalGrams)} {t('common.kg')}</span>
        <span className={`right mono xsmall t-${f.tone === 'success' ? 'success' : f.tone}`} style={{ fontWeight: 500 }}>{t(f.key)}</span>
      </TRow>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title={t('shops.title')}
        actions={me?.role === 'SUPER_ADMIN' && <Button variant="primary" onClick={() => setAdding(true)}>{t('shops.addShop')}</Button>}
      />
      <div className="split split-shops">
        <Card>
          <div className="card-head">
            <Input placeholder={t('shops.search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
            <span className="mono xsmall t-subtle">{t('shops.count', { shown, total: groups.small })}</span>
            {lowOnly && <Button variant="link" onClick={() => router.push('/shops')}>✕ {t('shops.flagLow')}</Button>}
          </div>
          {groups.ho && !lowOnly && rowFor(groups.ho, false)}
          {groups.sups.map((g) => (
            <div key={g.sup.id}>
              <button
                type="button"
                className="trow"
                style={{ gridTemplateColumns: '14px minmax(0,1fr) auto auto', background: 'var(--c-row-alt)' }}
                onClick={() => setOpen((o) => ({ ...o, [g.sup.id]: !o[g.sup.id] }))}
              >
                <span className="mono t-subtle">{open[g.sup.id] ? '▾' : '▸'}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="cell-main ellipsis" style={{ fontWeight: 600, fontSize: 13 }}>{g.sup.code} {name(g.sup)}</span>
                </span>
                <span className="right">
                  <span className="num" style={{ display: 'block', fontSize: 12 }}>{kg1(g.sup.totalGrams)} {t('common.kg')}</span>
                  <span className="mono xsmall t-subtle">{t('common.shops', { count: g.count })}</span>
                </span>
                {g.gaps > 0 ? <Tag tone="danger">{t('shops.gaps', { n: g.gaps })}</Tag> : g.notClosed > 0 ? <Tag tone="warn">{g.notClosed}</Tag> : <span />}
              </button>
              {open[g.sup.id] && (
                <>
                  <TRow cols="minmax(0,1fr) 84px 84px" selected={sel === g.sup.id} onClick={() => setSel(g.sup.id)}>
                    <span className="cell-main ellipsis" style={{ paddingLeft: 18 }}>{t('shopType.SUPERVISOR')} · {g.sup.code}</span>
                    <span />
                    <span className={`right mono xsmall t-${flag(g.sup).tone}`}>{t(flag(g.sup).key)}</span>
                  </TRow>
                  {g.kids.map((s) => rowFor(s, true))}
                </>
              )}
            </div>
          ))}
          {groups.sups.length === 0 && <Empty />}
        </Card>

        <Card className="sticky">
          {!sel && <Empty>{t('shops.select')}</Empty>}
          {sel && !d && <Loading />}
          {d && (
            <>
              <div className="card-head" style={{ alignItems: 'flex-start', padding: '16px 18px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{d.code} {name(d)}</div>
                  <div className="mono small t-subtle" style={{ marginTop: 6 }}>
                    {d.sales?.lastClosingAt
                      ? t('shops.meta', { type: t(`shopType.${d.type}`), parent: d.parent ? `${d.parent.code} ${name(d.parent)}` : '—', when: formatIstDateTime(d.sales.lastClosingAt) })
                      : t('shops.metaNoClosing', { type: t(`shopType.${d.type}`), parent: d.parent ? `${d.parent.code} ${name(d.parent)}` : '—' })}
                  </div>
                </div>
                <div className="row" style={{ marginLeft: 'auto' }}>
                  {d.type !== 'HO' && me?.role === 'SUPER_ADMIN' && <Button onClick={() => setResetting(true)}>{t('auth.resetPassword')}</Button>}
                  {d.type !== 'HO' && <Button onClick={() => setShowHistory((v) => !v)}>{t('shops.salesHistory')}</Button>}
                  {d.type !== 'HO' && can('CREATE_DISPATCH') && (
                    <Button variant="primary" onClick={() => router.push(`/dispatches?new=1&dest=${d.id}`)}>{t('shops.dispatchStock')}</Button>
                  )}
                </div>
              </div>
              <div className="metrics">
                <div className="metric">
                  <div className="label-mono">{t('shops.onHand')}</div>
                  <div className="metric-v">{kg1(d.totalGrams)} {t('common.kg')}</div>
                </div>
                {d.type !== 'HO' && (
                  <>
                    <div className="metric">
                      <div className="label-mono">{t('shops.salesToday')}</div>
                      <div className="metric-v">{today ? formatRupees(today.expectedRevenuePaise, { whole: true }) : '—'}</div>
                    </div>
                    <div className="metric">
                      <div className="label-mono">{t('shops.cashUpi')}</div>
                      <div className="metric-v">
                        {today ? (
                          <>
                            {formatRupees(today.cashPaise, { whole: true })}
                            <span className="t-subtle"> / </span>
                            {formatRupees(today.upiPaise, { whole: true })}
                          </>
                        ) : '—'}
                      </div>
                    </div>
                    <div className={`metric ${today?.varianceFlagged ? 'danger' : today && today.variancePaise ? 'warn' : ''}`}>
                      <div className="label-mono">{t('shops.moneyGap')}</div>
                      <div className={`metric-v ${today?.varianceFlagged ? 't-danger' : today?.variancePaise ? 't-warn' : ''}`}>
                        {today ? formatRupees(today.variancePaise, { whole: true, signed: true }) : t('shops.noClosingToday')}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {showHistory && d.sales && (
                <div>
                  <div className="card-title" style={{ padding: '14px 18px 6px' }}>{t('shops.history')}</div>
                  <THead cols="minmax(0,1fr) 110px 110px 100px">
                    <span>{t('shops.date')}</span>
                    <span className="right">{t('shops.expected')}</span>
                    <span className="right">{t('shops.collected')}</span>
                    <span className="right">{t('shops.variance')}</span>
                  </THead>
                  {d.sales.history.map((h) => (
                    <TRow key={h.businessDate} cols="minmax(0,1fr) 110px 110px 100px" tone={h.varianceFlagged ? 'danger' : undefined}>
                      <span className="mono small">{formatIstDate(h.businessDate)}</span>
                      <span className="cell-num-light">{formatRupees(h.expectedRevenuePaise, { whole: true })}</span>
                      <span className="cell-num-light">{formatRupees(h.collectedPaise, { whole: true })}</span>
                      <span className={`cell-num ${h.varianceFlagged ? 't-danger' : ''}`}>{formatRupees(h.variancePaise, { whole: true, signed: true })}</span>
                    </TRow>
                  ))}
                  {d.sales.history.length === 0 && <Empty />}
                </div>
              )}

              <div className="card-title t-muted" style={{ padding: '14px 18px 6px', fontSize: 12 }}>{t('shops.stockByItem')}</div>
              {d.stock.map((it) => {
                const pct = it.daysLeft === null ? 100 : (it.daysLeft / maxDays) * 100;
                return (
                  <TRow key={it.itemId} cols="minmax(0,1fr) 120px 96px 90px">
                    <span className="cell-main ellipsis">{name(it)}</span>
                    <Bar pct={pct} tone={it.low ? 'danger' : it.watch ? 'warn' : undefined} />
                    <span className="cell-num">{formatKg(it.onHandGrams)} {t('common.kg')}</span>
                    <span className={`right mono xsmall ${it.low ? 't-danger' : 't-warn'}`}>
                      {it.low ? t('shops.flagLow') : it.watch ? t('shops.flagWatch') : ''}
                      {it.daysLeft !== null && (it.low || it.watch) && <span className="t-subtle" style={{ display: 'block' }}>{t('shops.daysLeft', { d: it.daysLeft.toFixed(1) })}</span>}
                    </span>
                  </TRow>
                );
              })}
              {d.stock.length === 0 && <Empty />}
            </>
          )}
        </Card>
      </div>
      {adding && (
        <AddShop
          supervisors={(list.data ?? []).filter((s) => s.type === 'SUPERVISOR')}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            setToast(t('common.saved'));
            void list.reload();
          }}
        />
      )}
      {resetting && d && (
        <ResetPasswordDialog
          name={`${d.code} ${name(d)}`}
          path={`/shops/${d.id}/reset-password`}
          onClose={() => setResetting(false)}
          onDone={() => {
            setResetting(false);
            setToast(t('auth.resetDone', { name: `${d.code} ${name(d)}` }));
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function AddShop({ supervisors, onClose, onDone }: { supervisors: ShopRow[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const act = useAction();
  const [f, setF] = useState({ code: '', nameEn: '', nameTa: '', type: 'SMALL', parentId: supervisors[0]?.id ?? '', username: '', password: '', phone: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () =>
    void act.run(async () => {
      await api('/shops', { body: { ...f, parentId: f.type === 'SMALL' ? f.parentId : undefined } });
      onDone();
    });
  return (
    <Modal
      title={t('shops.addShop')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <span className="notice-plain">{t('common.notDesigned')}</span>
      <div className="form-grid">
        <Field label={t('shops.code')}><Input value={f.code} onChange={set('code')} placeholder="S-370" /></Field>
        <Field label={t('shops.type')}>
          <Select value={f.type} onChange={set('type')}>
            <option value="SMALL">{t('shopType.SMALL')}</option>
            <option value="SUPERVISOR">{t('shopType.SUPERVISOR')}</option>
          </Select>
        </Field>
        <Field label={t('shops.nameEn')}><Input value={f.nameEn} onChange={set('nameEn')} /></Field>
        <Field label={t('shops.nameTa')}><Input value={f.nameTa} onChange={set('nameTa')} lang="ta" /></Field>
        {f.type === 'SMALL' && (
          <Field label={t('shops.parent')}>
            <Select value={f.parentId} onChange={set('parentId')}>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{s.code} {name(s)}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('shops.phone')}><Input value={f.phone} onChange={set('phone')} inputMode="numeric" maxLength={10} /></Field>
        <Field label={t('admin.username')}><Input value={f.username} onChange={set('username')} /></Field>
        <Field label={t('admin.password')}><Input type="password" value={f.password} onChange={set('password')} /></Field>
      </div>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}

export default function ShopsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ShopsScreen />
    </Suspense>
  );
}
