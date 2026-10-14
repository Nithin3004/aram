'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIstDateTime, StatusTone } from '@aram/shared';
import { api } from '../../../lib/api';
import { Button, Card, Chip, Empty, Input, Loading, PageHeader, Tag, TRow } from '../../../ui';

interface Entry { id: string; at: string; actorName: string; action: string; entityType: string; entityId: string; summary: string }

const KINDS = ['approvals', 'prices', 'dispatches', 'permissions', 'logins'];
const TONE: Record<string, StatusTone> = {
  ISSUE_RESOLVE: 'resolved',
  REQUEST_APPROVE: 'success',
  REQUEST_REJECT: 'danger',
  ISSUE_AUTO: 'danger',
  LOGIN_FAILED: 'danger',
  RECEIVE_CODE_WRONG: 'danger',
  DISPATCH_CREATE: 'accent',
  DISPATCH_SENT: 'accent',
  TRANSFER_ORDER: 'accent',
  DISPATCH_RECEIVE: 'info',
  PRICE_CHANGE: 'warn',
  CLOSING_SUBMIT: 'success',
};

export default function AuditPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [more, setMore] = useState(true);

  const load = async (append: boolean) => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (kind) params.set('kind', kind);
    if (append && rows?.length) params.set('before', rows[rows.length - 1].id);
    const r = await api<Entry[]>(`/audit?${params}`);
    setRows(append ? [...(rows ?? []), ...r] : r);
    setMore(r.length === 60);
  };

  useEffect(() => {
    const id = setTimeout(() => void load(false), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kind]);

  return (
    <div className="page">
      <PageHeader title={t('audit.title')} sub={t('audit.sub')} />
      <div className="row">
        <Input placeholder={t('audit.filter')} value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, background: 'var(--c-card)' }} />
        <div className="chips">
          {KINDS.map((k) => (
            <Chip key={k} on={kind === k} onClick={() => setKind(kind === k ? null : k)}>{t(`audit.kinds.${k}`)}</Chip>
          ))}
        </div>
      </div>
      <Card>
        {!rows && <Loading />}
        {rows?.length === 0 && <Empty />}
        {rows?.map((a) => (
          <TRow key={a.id} cols="118px 128px minmax(0,1fr) 130px">
            <span className="mono small t-faint">{formatIstDateTime(a.at)}</span>
            <Tag tone={TONE[a.action] ?? 'neutral'}>{a.action.replace(/_/g, ' ')}</Tag>
            <span style={{ fontSize: 12, lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' }}>{a.summary}</span>
            <span className="small t-muted right ellipsis">{a.actorName}</span>
          </TRow>
        ))}
      </Card>
      {rows && more && (
        <div>
          <Button onClick={() => void load(true)}>{t('audit.loadMore')}</Button>
        </div>
      )}
    </div>
  );
}
