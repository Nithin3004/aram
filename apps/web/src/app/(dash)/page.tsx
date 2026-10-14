'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { formatIstDate, formatIstTime, formatKg, formatRupees, formatRupeesCompact, StatusTone } from '@aram/shared';
import { apiBlobUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useData, useLocalName } from '../../lib/hooks';
import { Bar, Button, Card, CardHead, Empty, Kpi, Loading, PageHeader, Tag } from '../../ui';

type Named = { id?: string; code: string; nameEn: string; nameTa: string };
interface Overview {
  now: string;
  businessDate: string;
  stock: { totalGrams: number; ho: number; supervisors: number; small: number };
  sales: { expectedPaise: number; cashPaise: number; upiPaise: number; collectedPaise: number };
  gaps: { totalPaise: number; shops: number; over1000: number };
  closings: { submitted: number; expected: number; open: number; dueTime: string; overdue: boolean };
  attention: Array<{ tag: string; tone: StatusTone; link: string; shop?: Named; variancePaise?: number; ref?: string; diffGrams?: number; lines?: number; count?: number; shops?: number; days?: number; time?: string }>;
  pipeline: Record<string, number>;
  lowStock: Array<{ shop: Named; parent: Named | null; item: { nameEn: string; nameTa: string }; onHandGrams: number; daysLeft: number | null }>;
  lowStockCount: number;
}

const PIPE: [string, StatusTone][] = [
  ['CREATED', 'created'],
  ['DISPATCHED', 'accent'],
  ['RECEIVED', 'info'],
  ['DISCREPANCY', 'danger'],
  ['MATCHED', 'success'],
];

export default function OverviewPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useAuth();
  const name = useLocalName();
  const { data: o } = useData<Overview>('/dashboard/overview');

  if (!o) return <Loading />;

  const exportDay = async () => {
    const url = await apiBlobUrl('/dashboard/day-sheet.csv');
    const a = document.createElement('a');
    a.href = url;
    a.download = `day-sheet-${o.businessDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cashPct = o.sales.collectedPaise ? Math.round((o.sales.cashPaise / o.sales.collectedPaise) * 100) : 0;
  const shopLabel = (s?: Named) => (s ? `${s.code} ${name(s)}` : '');

  const attention = o.attention.map((a) => {
    switch (a.tag) {
      case 'CASH_GAP':
        return { ...a, title: t('overview.att.cashGap', { shop: shopLabel(a.shop), amt: formatRupees(a.variancePaise!, { whole: true }) }), value: formatRupees(a.variancePaise!, { whole: true }) };
      case 'MISMATCH':
        return { ...a, title: t('overview.att.mismatch', { id: a.ref, kg: formatKg(Math.abs(a.diffGrams!)) }), value: t('common.items', { count: a.lines }) };
      case 'NO_CLOSING':
        return { ...a, title: t('overview.att.noClosing', { n: a.count }), value: a.time };
      case 'LOW_STOCK':
        return { ...a, title: t('overview.att.lowStock', { n: a.count, days: a.days }), value: t('common.shops', { count: a.shops }) };
      case 'REQUEST':
        return { ...a, title: t('overview.att.requests', { n: a.count }), value: String(a.count) };
      case 'FREQUENT':
        return { ...a, title: t('overview.att.frequent', { n: a.count }), value: String(a.count) };
      default:
        return { ...a, title: t('overview.att.issues', { n: a.count }), value: String(a.count) };
    }
  });

  return (
    <div className="page">
      <PageHeader
        title={t('overview.title')}
        actions={
          <>
            <span className="mono small t-subtle">
              {formatIstDate(o.now)} · {formatIstTime(o.now)} IST
            </span>
            <Button onClick={exportDay}>{t('overview.exportDay')}</Button>
            {can('CREATE_DISPATCH') && (
              <Button variant="primary" onClick={() => router.push('/dispatches?new=1')}>
                {t('overview.newDispatch')}
              </Button>
            )}
          </>
        }
      />

      <div className="kpis">
        <Kpi
          label={t('overview.stockNetwork')}
          value={formatKg(Math.round(o.stock.totalGrams / 1000) * 1000)}
          unit={t('common.kg')}
          sub={t('overview.stockSplit', { ho: formatKg(Math.round(o.stock.ho / 1000) * 1000), sup: formatKg(Math.round(o.stock.supervisors / 1000) * 1000), small: formatKg(Math.round(o.stock.small / 1000) * 1000) })}
        />
        <Kpi label={t('overview.salesToday')} value={formatRupeesCompact(o.sales.expectedPaise)}>
          <div className="kpi-sub row" style={{ flexWrap: 'nowrap' }}>
            <Bar pct={cashPct} />
            <span>{t('overview.cashShare', { pct: cashPct })}</span>
          </div>
        </Kpi>
        <Kpi
          danger={o.gaps.shops > 0}
          label={t('overview.moneyGaps')}
          value={formatRupees(o.gaps.totalPaise, { whole: true })}
          sub={t('overview.moneyGapsSub', { shops: o.gaps.shops, big: o.gaps.over1000 })}
        />
        <Kpi
          label={t('overview.closings')}
          value={
            <>
              {o.closings.submitted}
              <span className="kpi-unit mono">/{o.closings.expected}</span>
            </>
          }
          sub={
            <span className={o.closings.open ? 't-warn' : ''}>
              {o.closings.overdue
                ? t('overview.closingsOverdue', { n: o.closings.open, due: o.closings.dueTime })
                : t('overview.closingsOpen', { n: o.closings.open, time: formatIstTime(o.now) })}
            </span>
          }
        />
      </div>

      <div className="cols-2">
        <Card>
          <CardHead live title={t('overview.attention')}>
            <span className="mono small t-subtle" style={{ marginLeft: 'auto' }}>
              {t('overview.attentionCount', { n: attention.length })}
            </span>
          </CardHead>
          {attention.length === 0 && <Empty />}
          {attention.map((a, i) => (
            <button
              key={i}
              type="button"
              className="trow"
              style={{ gridTemplateColumns: '92px minmax(0,1fr) auto', gap: 12 }}
              onClick={() => router.push('/' + a.link)}
            >
              <Tag tone={a.tone}>{t(`overview.tag.${a.tag}`)}</Tag>
              <span className="cell-main ellipsis" style={{ fontSize: 13 }}>{a.title}</span>
              <span className={`num ${a.tone === 'danger' ? 't-danger' : a.tone === 'warn' ? 't-warn' : 't-body'}`} style={{ fontSize: 13 }}>
                {a.value}
              </span>
            </button>
          ))}
        </Card>

        <div className="stack">
          <Card pad>
            <div className="card-title" style={{ marginBottom: 14 }}>{t('overview.pipeline')}</div>
            <div className="pipeline">
              {PIPE.map(([s, tone]) => (
                <Link key={s} href={`/dispatches?status=${s}`} className={`pipe-step tone-${tone}`} style={{ textDecoration: 'none' }}>
                  <div className="pipe-n">{o.pipeline[s] ?? 0}</div>
                  <div className="pipe-label">{t(`status.${s}`)}</div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title={t('overview.lowStock')}>
              {o.lowStockCount > 0 && (
                <span style={{ marginLeft: 'auto' }}>
                  <Button variant="link" onClick={() => router.push('/shops?low=1')}>
                    {t('overview.viewAll', { n: o.lowStockCount })}
                  </Button>
                </span>
              )}
            </CardHead>
            {o.lowStock.length === 0 && <Empty />}
            {o.lowStock.slice(0, 6).map((l, i) => (
              <div key={i} className="trow" style={{ gridTemplateColumns: 'minmax(0,1fr) 110px 70px' }}>
                <span style={{ minWidth: 0 }}>
                  <span className="cell-main ellipsis">{shopLabel(l.shop)}</span>
                  <span className="cell-sub mono ellipsis">{l.parent ? `${l.parent.code} ${name(l.parent)}` : ''}</span>
                </span>
                <span className="small t-muted ellipsis">{name(l.item)}</span>
                <span className="cell-num t-warn">
                  {formatKg(l.onHandGrams)} {t('common.kg')}
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
