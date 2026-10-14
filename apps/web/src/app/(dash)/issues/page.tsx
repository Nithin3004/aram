'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIstDateTime } from '@aram/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData, useLocalName } from '../../../lib/hooks';
import { Button, Card, Chip, Empty, Field, FormError, Loading, Modal, PageHeader, Tag, TextArea, THead, Toast, TRow } from '../../../ui';

interface Issue {
  id: string;
  ref: string;
  source: 'AUTO' | 'SHOP';
  type: string;
  status: 'OPEN' | 'RESOLVED';
  description: string;
  createdAt: string;
  shop: { code: string; nameEn: string; nameTa: string };
  dispatch: { id: string; ref: string } | null;
  recountRequestedAt: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
}

const COLS = '96px minmax(0,1fr) 170px 110px 120px';

export default function IssuesPage() {
  const { t } = useTranslation();
  const name = useLocalName();
  const router = useRouter();
  const { can } = useAuth();
  const [tab, setTab] = useState<'OPEN' | 'ALL'>('OPEN');
  const list = useData<Issue[]>(tab === 'OPEN' ? '/issues?status=OPEN' : '/issues');
  const [resolving, setResolving] = useState<Issue | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="page">
      <PageHeader title={t('issue.title')} />
      <div className="chips">
        <Chip on={tab === 'OPEN'} onClick={() => setTab('OPEN')}>{t('issue.openOnly')}</Chip>
        <Chip on={tab === 'ALL'} onClick={() => setTab('ALL')}>{t('common.all')}</Chip>
      </div>
      <Card>
        <div className="scroll-x">
          <THead cols={COLS} minWidth={720}>
            <span>{t('issue.source')}</span>
            <span>{t('issue.issue')}</span>
            <span>{t('issue.shop')}</span>
            <span>{t('issue.raised')}</span>
            <span className="right">{t('issue.action')}</span>
          </THead>
          {!list.data && <Loading />}
          {list.data?.length === 0 && <Empty />}
          {list.data?.map((i) => (
            <TRow key={i.id} cols={COLS} tone={i.status === 'RESOLVED' ? 'muted' : undefined} minWidth={720}>
              <Tag tone={i.source === 'AUTO' ? 'danger' : 'neutral'}>{t(`source.${i.source}`)}</Tag>
              <span style={{ minWidth: 0 }}>
                <span className="cell-main">
                  {t(`issueType.${i.type}`)} <span className="mono xsmall t-faint">{i.ref}</span>
                </span>
                <span className="cell-sub" style={{ whiteSpace: 'normal' }}>{i.status === 'RESOLVED' && i.resolutionNote ? `✓ ${i.resolutionNote}` : i.description}</span>
              </span>
              <span className="small t-muted ellipsis">{i.shop.code} {name(i.shop)}</span>
              <span className="cell-time">{formatIstDateTime(i.createdAt)}</span>
              <span className="right">
                {i.status === 'RESOLVED' ? (
                  <Tag tone="resolved">{t('issue.resolved')}</Tag>
                ) : i.dispatch ? (
                  <Button onClick={() => router.push(`/dispatches?id=${i.dispatch!.id}`)}>{i.dispatch.ref} →</Button>
                ) : can('RESOLVE_ISSUES') ? (
                  <Button onClick={() => setResolving(i)}>{t('issue.resolve')}</Button>
                ) : null}
              </span>
            </TRow>
          ))}
        </div>
      </Card>
      {resolving && (
        <ResolveModal
          issue={resolving}
          onClose={() => setResolving(null)}
          onDone={() => {
            setResolving(null);
            setToast(t('status.RESOLVED'));
            void list.reload();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function ResolveModal({ issue, onClose, onDone }: { issue: Issue; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const act = useAction();
  const [note, setNote] = useState('');
  const save = () =>
    void act.run(async () => {
      await api(`/issues/${issue.id}/resolve`, { body: { note } });
      onDone();
    });
  return (
    <Modal
      title={`${t('issue.resolveTitle')} · ${issue.ref}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={act.busy || !note.trim()} onClick={save}>{t('dispatch.markResolved')}</Button>
        </>
      }
    >
      <div className="issue-box" style={{ marginTop: 0 }}>
        <div className="t-danger" style={{ fontWeight: 600, fontSize: 12 }}>{t(`issueType.${issue.type}`)}</div>
        <div className="small" style={{ marginTop: 4 }}>{issue.description}</div>
      </div>
      <Field label={t('issue.note')}>
        <TextArea autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormError>{act.error}</FormError>
    </Modal>
  );
}
