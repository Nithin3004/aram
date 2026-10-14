'use client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIstDateTime, formatKg, kgToGrams } from '@aram/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData, useLocalName } from '../../../lib/hooks';
import { Button, Card, Chip, Empty, Field, FormError, Input, Loading, Modal, PageHeader, StatusBadge, Tag, TextArea, Toast } from '../../../ui';

interface Req {
  id: string;
  ref: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvalType: 'FULL' | 'PARTIAL' | null;
  reason: string;
  rejectReason: string | null;
  createdAt: string;
  shop: { code: string; nameEn: string; nameTa: string };
  onHandGrams: number;
  avgDailySoldGrams: number;
  frequentCount: number | null;
  dispatch: { ref: string; status: string } | null;
  lines: { itemId: string; nameEn: string; nameTa: string; requestedGrams: number; approvedGrams: number | null; onHandGrams: number }[];
}

export default function RequestsPage() {
  const { t } = useTranslation();
  const name = useLocalName();
  const { can } = useAuth();
  const [tab, setTab] = useState<'PENDING' | 'ALL'>('PENDING');
  const list = useData<Req[]>(tab === 'PENDING' ? '/requests?status=PENDING' : '/requests');
  const [partial, setPartial] = useState<Req | null>(null);
  const [reject, setReject] = useState<Req | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const act = useAction();

  const approveFull = (r: Req) =>
    void act.run(async () => {
      const res = await api<{ dispatchRef: string }>(`/requests/${r.id}/approve`, { body: { lines: r.lines.map((l) => ({ itemId: l.itemId, approvedGrams: l.requestedGrams })) } });
      setToast(t('request.dispatchCreated', { id: res.dispatchRef }));
      await list.reload();
    });

  return (
    <div className="page">
      <PageHeader title={t('request.title')} />
      <div className="chips">
        <Chip on={tab === 'PENDING'} onClick={() => setTab('PENDING')}>{t('request.pendingOnly')}</Chip>
        <Chip on={tab === 'ALL'} onClick={() => setTab('ALL')}>{t('common.all')}</Chip>
      </div>
      <FormError>{act.error}</FormError>
      {!list.data && <Loading />}
      {list.data?.length === 0 && <Card><Empty /></Card>}
      <div className="stack" style={{ gap: 12 }}>
        {list.data?.map((r) => (
          <Card key={r.id} className={r.status === 'REJECTED' ? 'rail-danger' : r.status === 'APPROVED' ? 'rail-success' : ''}>
            <div className="req-body">
              <div style={{ minWidth: 180 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.shop.code} {name(r.shop)}</div>
                <div className="mono xsmall t-faint" style={{ marginTop: 5 }}>{r.ref} · {formatIstDateTime(r.createdAt)}</div>
                {r.frequentCount && <div style={{ marginTop: 6 }}><Tag tone="warn">{t('request.frequent', { n: r.frequentCount })}</Tag></div>}
              </div>
              <div className="req-items">
                {r.lines.map((l) => (
                  <span key={l.itemId} className="item-chip">
                    {name(l)}
                    <span className="kg">
                      {r.status === 'APPROVED' && l.approvedGrams !== l.requestedGrams ? `${formatKg(l.approvedGrams ?? 0)}/` : ''}
                      {formatKg(l.requestedGrams)}{t('common.kg')}
                    </span>
                  </span>
                ))}
              </div>
              <div style={{ minWidth: 170, maxWidth: 260 }}>
                <div className="label-mono">{t('request.reason')}</div>
                <div className="t-body" style={{ fontSize: 12, lineHeight: 1.45 }}>{r.reason}</div>
                {r.rejectReason && <div className="t-danger small" style={{ marginTop: 4 }}>✕ {r.rejectReason}</div>}
              </div>
            </div>
            <div className="card-foot">
              <span className="mono small t-subtle">{t('request.holds', { kg: formatKg(Math.round(r.onHandGrams / 1000) * 1000), burn: formatKg(Math.round(r.avgDailySoldGrams / 100) * 100) })}</span>
              <span className="row" style={{ marginLeft: 'auto' }}>
                {r.status === 'PENDING' && can('APPROVE_REQUESTS') ? (
                  <>
                    <Button variant="danger-outline" onClick={() => setReject(r)}>{t('request.reject')}</Button>
                    <Button onClick={() => setPartial(r)}>{t('request.approvePartial')}</Button>
                    <Button variant="success" disabled={act.busy} onClick={() => approveFull(r)}>{t('request.approveFull')}</Button>
                  </>
                ) : r.status === 'PENDING' ? (
                  <StatusBadge status="PENDING" />
                ) : (
                  <>
                    {r.dispatch && <span className="mono xsmall t-subtle">{r.dispatch.ref}</span>}
                    <StatusBadge status={r.status} label={r.approvalType ? t(`status.${r.approvalType}`) : undefined} />
                  </>
                )}
              </span>
            </div>
          </Card>
        ))}
      </div>
      {partial && (
        <PartialModal
          r={partial}
          onClose={() => setPartial(null)}
          onDone={(ref) => {
            setPartial(null);
            setToast(t('request.dispatchCreated', { id: ref }));
            void list.reload();
          }}
        />
      )}
      {reject && (
        <RejectModal
          r={reject}
          onClose={() => setReject(null)}
          onDone={() => {
            setReject(null);
            setToast(t('status.REJECTED'));
            void list.reload();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function PartialModal({ r, onClose, onDone }: { r: Req; onClose: () => void; onDone: (ref: string) => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const act = useAction();
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(r.lines.map((l) => [l.itemId, formatKg(l.requestedGrams).replace(/,/g, '')])));
  const save = () =>
    void act.run(async () => {
      const res = await api<{ dispatchRef: string }>(`/requests/${r.id}/approve`, { body: { lines: r.lines.map((l) => ({ itemId: l.itemId, approvedGrams: kgToGrams(qty[l.itemId] || '0') })) } });
      onDone(res.dispatchRef);
    });
  return (
    <Modal
      title={`${t('request.partialTitle')} · ${r.ref}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="success" disabled={act.busy} onClick={save}>{t('request.approve')}</Button>
        </>
      }
    >
      {r.lines.map((l) => (
        <div key={l.itemId} className="row" style={{ flexWrap: 'nowrap' }}>
          <span style={{ flex: 1 }}>
            <span className="cell-main">{name(l)}</span>
            <span className="cell-sub mono">{t('request.requested')} {formatKg(l.requestedGrams)} {t('common.kg')}</span>
          </span>
          <Input numeric inputMode="decimal" style={{ width: 120 }} value={qty[l.itemId]} onChange={(e) => setQty({ ...qty, [l.itemId]: e.target.value })} />
          <span className="small t-subtle">{t('common.kg')}</span>
        </div>
      ))}
      <FormError>{act.error}</FormError>
    </Modal>
  );
}

function RejectModal({ r, onClose, onDone }: { r: Req; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [reason, setReason] = useState('');
  const save = () =>
    void act.run(async () => {
      await api(`/requests/${r.id}/reject`, { body: { reason } });
      onDone();
    });
  return (
    <Modal
      title={`${t('request.reject')} · ${r.ref}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={act.busy || !reason.trim()} onClick={save}>{t('request.reject')}</Button>
        </>
      }
    >
      <Field label={t('request.rejectReason')}>
        <TextArea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}
