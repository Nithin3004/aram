'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIstDateTime, formatIstTime, formatKg, kgToGrams } from '@aram/shared';
import { api, apiBlobUrl } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData, useLocalName } from '../../../lib/hooks';
import { Button, Card, Chip, Empty, Field, FormError, Input, Loading, Modal, PageHeader, Select, StatusBadge, TextArea, THead, Toast, TRow } from '../../../ui';

type Named = { id: string; code: string; nameEn: string; nameTa: string; type?: string };
interface Row { id: string; ref: string; kind: 'DISPATCH' | 'TRANSFER'; status: string; source: Named; dest: Named; totalGrams: number; lineCount: number; createdAt: string; updatedAt: string }
interface Detail {
  id: string;
  ref: string;
  kind: string;
  status: string;
  source: Named;
  dest: Named;
  deliveryCode?: string;
  request: { ref: string } | null;
  createdAt: string;
  createdBy: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  resolvedAt: string | null;
  hasPhoto: boolean;
  lines: { itemId: string; nameEn: string; nameTa: string; orderedGrams?: number; sentGrams: number | null; receivedGrams?: number | null }[];
  issue: null | { id: string; ref: string; status: string; description: string; recountRequestedAt: string | null; recount: { lines: { itemId: string; receivedGrams: number }[]; note: string } | null; recountAt: string | null; resolutionNote: string | null; resolvedAt: string | null };
}
interface Item { id: string; code: string; nameEn: string; nameTa: string; isActive: boolean }
interface ShopRow extends Named { type: 'HO' | 'SUPERVISOR' | 'SMALL'; isActive: boolean }

const FILTERS = ['CREATED', 'DISPATCHED', 'DISCREPANCY', 'MATCHED', 'RESOLVED'];

function DispatchesScreen() {
  const { t } = useTranslation();
  const name = useLocalName();
  const params = useSearchParams();
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = useState<string | null>(params.get('status'));
  const list = useData<{ counts: Record<string, number>; rows: Row[] }>(`/dispatches${status ? `?status=${status}` : ''}`);
  const [sel, setSel] = useState<string | null>(params.get('id'));
  const det = useData<Detail>(sel ? `/dispatches/${sel}` : null);
  const [creating, setCreating] = useState<null | 'DISPATCH' | 'TRANSFER'>(params.get('new') ? 'DISPATCH' : null);
  const [sending, setSending] = useState(false);
  const [slip, setSlip] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!sel && list.data?.rows.length) setSel(list.data.rows.find((r) => r.status === 'DISCREPANCY')?.id ?? list.data.rows[0].id);
  }, [list.data, sel]);

  const refresh = async (msg?: string) => {
    await Promise.all([list.reload(), det.reload()]);
    if (msg) setToast(msg);
  };

  const all = list.data ? Object.values(list.data.counts).reduce((a, b) => a + b, 0) : 0;
  const d = det.data;

  return (
    <div className="page">
      <PageHeader
        title={t('dispatch.title')}
        actions={
          can('CREATE_DISPATCH') && (
            <>
              <Button onClick={() => setCreating('TRANSFER')}>{t('dispatch.orderTransfer')}</Button>
              <Button variant="primary" onClick={() => setCreating('DISPATCH')}>{t('dispatch.newDispatch')}</Button>
            </>
          )
        }
      />
      <div className="split split-dispatch">
        <Card>
          <div className="card-head chips">
            <Chip on={!status} n={all} onClick={() => { setStatus(null); setSel(null); }}>{t('common.all')}</Chip>
            {FILTERS.map((f) => (
              <Chip key={f} on={status === f} n={list.data?.counts[f] ?? 0} onClick={() => { setStatus(f); setSel(null); }}>
                {t(`status.${f}`)}
              </Chip>
            ))}
          </div>
          {!list.data && <Loading />}
          {list.data?.rows.length === 0 && <Empty />}
          {list.data?.rows.map((r) => (
            <TRow key={r.id} cols="minmax(0,1fr) 92px 112px" selected={sel === r.id} onClick={() => setSel(r.id)}>
              <span style={{ minWidth: 0 }}>
                <span className="row" style={{ gap: 7 }}>
                  <span className="mono t-muted" style={{ fontWeight: 600, fontSize: 11 }}>{r.ref}</span>
                  <span className="tag-outline">{t(`dispatch.type${r.kind}`)}</span>
                </span>
                <span className="cell-main ellipsis" style={{ marginTop: 4, fontSize: 13 }}>
                  {r.kind === 'TRANSFER' ? `${r.source.code} → ` : ''}
                  {r.dest.code} {name(r.dest)}
                </span>
              </span>
              <span className="right">
                <span className="num" style={{ display: 'block', fontSize: 12 }}>{formatKg(r.totalGrams)} {t('common.kg')}</span>
                <span className="mono xsmall t-subtle">{t('dispatch.items', { n: r.lineCount })}</span>
              </span>
              <span className="right">
                <StatusBadge status={r.status} />
                <span className="cell-time" style={{ display: 'block', marginTop: 4 }}>{formatIstDateTime(r.updatedAt)}</span>
              </span>
            </TRow>
          ))}
        </Card>

        <Card className="sticky">
          {!sel && <Empty>{t('dispatch.select')}</Empty>}
          {sel && !d && <Loading />}
          {d && (
            <DetailView
              d={d}
              onSend={() => setSending(true)}
              onSlip={() => setSlip(true)}
              onChanged={(msg) => void refresh(msg)}
            />
          )}
        </Card>
      </div>

      {creating && (
        <CreateDispatch
          kind={creating}
          initialDest={params.get('dest') ?? undefined}
          onClose={() => {
            setCreating(null);
            if (params.get('new')) router.replace('/dispatches');
          }}
          onDone={(id) => {
            setCreating(null);
            setSel(id);
            setStatus(null);
            void refresh(t('common.saved'));
            setSlip(true);
          }}
        />
      )}
      {sending && d && <ConfirmSent d={d} onClose={() => setSending(false)} onDone={() => { setSending(false); void refresh(t('common.saved')); }} />}
      {slip && d && <Slip d={d} onClose={() => setSlip(false)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function DetailView({ d, onSend, onSlip, onChanged }: { d: Detail; onSend: () => void; onSlip: () => void; onChanged: (msg?: string) => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const { can } = useAuth();
  const act = useAction();
  const [note, setNote] = useState('');
  const [adj, setAdj] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setAdj({});
    setPhoto(null);
    if (d.hasPhoto) apiBlobUrl(`/dispatches/${d.id}/photo`).then(setPhoto).catch(() => setPhoto(null));
  }, [d.id, d.hasPhoto]);

  const trail = [
    { label: t('status.CREATED'), when: d.createdAt, dot: 'var(--c-text-muted)' },
    { label: t('status.DISPATCHED'), when: d.dispatchedAt, dot: 'var(--c-accent)' },
    { label: t('status.RECEIVED'), when: d.receivedAt, dot: 'var(--c-info)' },
    d.status === 'DISCREPANCY'
      ? { label: t('status.DISCREPANCY'), when: null, pending: t('dispatch.awaitingHo'), dot: 'var(--c-danger)', danger: true }
      : d.status === 'RESOLVED'
        ? { label: t('status.RESOLVED'), when: d.resolvedAt, dot: 'var(--c-resolved)' }
        : { label: t('status.MATCHED'), when: d.status === 'MATCHED' ? d.receivedAt : null, dot: 'var(--c-success-text)' },
  ];

  const resolve = () =>
    void act.run(async () => {
      const adjustments = Object.entries(adj)
        .filter(([, v]) => v.trim() && Number(v) !== 0)
        .map(([itemId, v]) => ({ shopId: d.dest.id, itemId, grams: kgToGrams(v) }));
      await api(`/issues/${d.issue!.id}/resolve`, { body: { note, adjustments } });
      onChanged(t('status.RESOLVED'));
    });
  const recount = () =>
    void act.run(async () => {
      await api(`/issues/${d.issue!.id}/recount-request`, { method: 'POST' });
      onChanged(t('dispatch.askRecount'));
    });

  const canSend = d.status === 'CREATED' && d.source.type === 'HO' && can('CREATE_DISPATCH');
  const cols = 'minmax(0,1fr) 72px 72px 72px 78px';

  return (
    <>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--c-divider)' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="mono" style={{ fontWeight: 600, fontSize: 16 }}>{d.ref}</span>
          <StatusBadge status={d.status} />
          {d.deliveryCode && <span className="mono small t-subtle" style={{ marginLeft: 'auto' }}>{t('dispatch.code', { code: d.deliveryCode })}</span>}
        </div>
        <div style={{ marginTop: 8, fontWeight: 500, fontSize: 14 }}>
          {t('dispatch.route', { from: d.source.type === 'HO' ? name(d.source) : `${d.source.code} ${name(d.source)}`, to: `${d.dest.code} ${name(d.dest)}` })}
        </div>
        {d.request && <div className="mono xsmall t-subtle">{t('dispatch.fromRequest', { id: d.request.ref })}</div>}
        <div className="row" style={{ marginTop: 10 }}>
          {canSend && <Button variant="primary" onClick={onSend}>{t('dispatch.markDispatched')}</Button>}
          {d.deliveryCode && (d.status === 'CREATED' || d.status === 'DISPATCHED') && <Button onClick={onSlip}>{t('dispatch.printSlip')}</Button>}
        </div>
      </div>
      <div className="trail">
        {trail.map((s, i) => (
          <div key={i} className="trail-step">
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <span className="dot" style={{ background: s.when || s.pending ? s.dot : 'var(--c-border)' }} />
              <span className={s.danger ? 't-danger' : ''} style={{ fontSize: 11, fontWeight: 500 }}>{s.label}</span>
            </div>
            <div className="mono xsmall t-faint" style={{ paddingLeft: 14, marginTop: 4 }}>{s.when ? formatIstDateTime(s.when) : s.pending ?? '—'}</div>
          </div>
        ))}
      </div>
      <div className="scroll-x">
        <THead cols={cols} minWidth={440}>
          <span>{t('dispatch.item')}</span>
          <span className="right">{t('dispatch.ordered')}</span>
          <span className="right">{t('dispatch.sent')}</span>
          <span className="right">{t('dispatch.received')}</span>
          <span className="right">{t('dispatch.diff')}</span>
        </THead>
        {d.lines.map((l) => {
          const done = l.receivedGrams != null;
          const diff = done ? l.receivedGrams! - (l.orderedGrams ?? 0) : 0;
          const bad = done && (l.receivedGrams !== l.orderedGrams || l.sentGrams !== l.orderedGrams);
          return (
            <TRow key={l.itemId} cols={cols} tone={bad ? 'danger' : undefined} minWidth={440}>
              <span className="cell-main ellipsis">{name(l)}</span>
              <span className="cell-num-light">{l.orderedGrams != null ? formatKg(l.orderedGrams) : '—'}</span>
              <span className="cell-num-light">{l.sentGrams != null ? formatKg(l.sentGrams) : '—'}</span>
              <span className="cell-num">{done ? formatKg(l.receivedGrams!) : '—'}</span>
              <span className={`cell-num ${bad ? 't-danger' : 't-faint'}`}>{!done || !bad ? '—' : (diff > 0 ? '+' : '') + formatKg(diff)}</span>
            </TRow>
          );
        })}
      </div>

      {(d.issue || d.hasPhoto) && (
        <div className="detail-grid">
          <div>
            {d.issue && (
              <>
                <div className="small t-muted" style={{ fontWeight: 500, fontSize: 12 }}>{t('dispatch.autoIssue')} · <span className="mono">{d.issue.ref}</span></div>
                <div className={`issue-box ${d.issue.status === 'RESOLVED' ? 'resolved' : ''}`}>
                  <div className={d.issue.status === 'RESOLVED' ? 't-resolved' : 't-danger'} style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.4 }}>
                    {d.issue.status === 'RESOLVED' ? t('dispatch.resolvedNote', { note: d.issue.resolutionNote }) : d.issue.description}
                  </div>
                  {d.issue.recountRequestedAt && !d.issue.recountAt && d.issue.status === 'OPEN' && (
                    <div className="mono xsmall t-danger" style={{ marginTop: 6 }}>{t('dispatch.recountAsked', { when: formatIstTime(d.issue.recountRequestedAt) })}</div>
                  )}
                  {d.issue.recount && (
                    <div className="small" style={{ marginTop: 6 }}>
                      {t('dispatch.recountDone', {
                        note: d.issue.recount.lines.map((rl) => `${name(d.lines.find((l) => l.itemId === rl.itemId))} ${formatKg(rl.receivedGrams)} kg`).join(', ') + (d.issue.recount.note ? ` — ${d.issue.recount.note}` : ''),
                      })}
                    </div>
                  )}
                  {d.issue.status === 'OPEN' && can('RESOLVE_ISSUES') && (
                    <>
                      <TextArea placeholder={t('dispatch.resolutionNote')} value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 10, background: 'var(--c-card)' }} />
                      <details style={{ marginTop: 8 }}>
                        <summary className="small t-muted" style={{ cursor: 'pointer' }}>{t('dispatch.adjust')}</summary>
                        <div className="form-hint">{t('dispatch.adjustHint')}</div>
                        <div className="stack-sm" style={{ marginTop: 6 }}>
                          {d.lines.map((l) => (
                            <div key={l.itemId} className="row" style={{ flexWrap: 'nowrap' }}>
                              <span className="small ellipsis" style={{ flex: 1 }}>{name(l)}</span>
                              <Input numeric style={{ width: 100 }} placeholder="± kg" value={adj[l.itemId] ?? ''} onChange={(e) => setAdj({ ...adj, [l.itemId]: e.target.value })} />
                            </div>
                          ))}
                        </div>
                      </details>
                      <FormError>{act.error}</FormError>
                      <div className="row" style={{ marginTop: 8 }}>
                        <Button variant="danger" disabled={act.busy || !note.trim()} onClick={resolve}>{t('dispatch.markResolved')}</Button>
                        {!d.issue.recountRequestedAt && <Button variant="danger-outline" disabled={act.busy} onClick={recount}>{t('dispatch.askRecount')}</Button>}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div>
            <div className="small t-muted" style={{ fontWeight: 500, fontSize: 12 }}>{t('dispatch.photo')}</div>
            <div style={{ marginTop: 8 }}>
              {photo ? (
                <a href={photo} target="_blank" rel="noreferrer">
                  <img className="photo" src={photo} alt={t('dispatch.photo')} />
                </a>
              ) : (
                <div className="hatch" style={{ height: 140, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 10 }}>
                  <span className="mono xsmall t-subtle">{d.hasPhoto ? t('common.loading') : t('dispatch.noPhoto')}</span>
                </div>
              )}
              {d.receivedAt && <div className="mono xsmall t-subtle" style={{ marginTop: 4 }}>{t('dispatch.photoFrom', { time: formatIstTime(d.receivedAt) })}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConfirmSent({ d, onClose, onDone }: { d: Detail; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const act = useAction();
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(d.lines.map((l) => [l.itemId, formatKg(l.orderedGrams ?? 0).replace(/,/g, '')])));
  const save = () =>
    void act.run(async () => {
      await api(`/dispatches/${d.id}/dispatch`, { body: { lines: d.lines.map((l) => ({ itemId: l.itemId, sentGrams: kgToGrams(qty[l.itemId] || '0') })) } });
      onDone();
    });
  return (
    <Modal
      title={`${t('dispatch.markDispatched')} · ${d.ref}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy} onClick={save}>{t('common.confirm')}</Button>
        </>
      }
    >
      {d.lines.map((l) => (
        <div key={l.itemId} className="row" style={{ flexWrap: 'nowrap' }}>
          <span style={{ flex: 1 }}>
            <span className="cell-main">{name(l)}</span>
            <span className="cell-sub mono">{t('dispatch.ordered')} {formatKg(l.orderedGrams ?? 0)} {t('common.kg')}</span>
          </span>
          <Input numeric inputMode="decimal" style={{ width: 120 }} value={qty[l.itemId]} onChange={(e) => setQty({ ...qty, [l.itemId]: e.target.value })} />
          <span className="small t-subtle">{t('common.kg')}</span>
        </div>
      ))}
      <FormError>{act.error}</FormError>
    </Modal>
  );
}

function Slip({ d, onClose }: { d: Detail; onClose: () => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    // The QR carries only the one-time delivery code.
    void QRCode.toDataURL(d.deliveryCode!, { margin: 1, width: 180 }).then(setQr);
  }, [d.deliveryCode]);
  return (
    <Modal
      wide
      title={t('dispatch.slipTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" onClick={() => window.print()}>{t('common.print')}</Button>
        </>
      }
    >
      <div className="slip">
        {qr && <img src={qr} alt="QR" width={180} height={180} />}
        <div className="stack-sm" style={{ flex: 1, minWidth: 220 }}>
          <div className="mono" style={{ fontWeight: 600 }}>{d.ref}</div>
          <div>{t('dispatch.route', { from: d.source.type === 'HO' ? name(d.source) : `${d.source.code} ${name(d.source)}`, to: `${d.dest.code} ${name(d.dest)}` })}</div>
          <div className="label-mono">{t('dispatch.slipCode')}</div>
          <div className="slip-code">{d.deliveryCode}</div>
          <div className="form-hint">{t('dispatch.slipScan')}</div>
        </div>
      </div>
      <div>
        {d.lines.map((l) => (
          <div key={l.itemId} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--c-divider-faint)', padding: '6px 0' }}>
            <span>{l.nameEn} · <span lang="ta">{l.nameTa}</span></span>
            <span className="num">{formatKg(l.orderedGrams ?? 0)} kg</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function CreateDispatch({ kind, initialDest, onClose, onDone }: { kind: 'DISPATCH' | 'TRANSFER'; initialDest?: string; onClose: () => void; onDone: (id: string) => void }) {
  const { t } = useTranslation();
  const name = useLocalName();
  const act = useAction();
  const shops = useData<ShopRow[]>('/shops');
  const items = useData<Item[]>('/items');
  const ho = shops.data?.find((s) => s.type === 'HO');
  const supervisors = useMemo(() => (shops.data ?? []).filter((s) => s.type === 'SUPERVISOR' && s.isActive), [shops.data]);
  const [source, setSource] = useState<string>('');
  const [dest, setDest] = useState<string>(initialDest ?? '');
  const [destQ, setDestQ] = useState('');
  const [lines, setLines] = useState<{ itemId: string; kg: string }[]>([{ itemId: '', kg: '' }]);
  const srcId = kind === 'DISPATCH' ? ho?.id : source;
  const srcStock = useData<{ stock: { itemId: string; onHandGrams: number }[] }>(srcId ? `/shops/${srcId}` : null);
  const avail = new Map((srcStock.data?.stock ?? []).map((s) => [s.itemId, s.onHandGrams]));

  useEffect(() => {
    if (kind === 'TRANSFER' && !source && supervisors[0]) setSource(supervisors[0].id);
  }, [kind, source, supervisors]);

  const destOptions = (shops.data ?? []).filter(
    (s) => s.type !== 'HO' && s.isActive && s.id !== srcId && (!destQ || `${s.code} ${s.nameEn} ${s.nameTa}`.toLowerCase().includes(destQ.toLowerCase())),
  );
  const activeItems = (items.data ?? []).filter((i) => i.isActive);

  const save = () =>
    void act.run(async () => {
      const r = await api<{ id: string }>('/dispatches', {
        body: {
          sourceShopId: kind === 'TRANSFER' ? source : undefined,
          destShopId: dest,
          lines: lines.filter((l) => l.itemId && l.kg).map((l) => ({ itemId: l.itemId, grams: kgToGrams(l.kg) })),
        },
      });
      onDone(r.id);
    });

  return (
    <Modal
      wide
      title={kind === 'TRANSFER' ? t('dispatch.orderTransfer') : t('dispatch.newDispatch')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={act.busy || !dest || !lines.some((l) => l.itemId && Number(l.kg) > 0)} onClick={save}>
            {kind === 'TRANSFER' ? t('dispatch.createTransfer') : t('dispatch.create')}
          </Button>
        </>
      }
    >
      <span className="notice-plain" style={{ alignSelf: 'flex-start' }}>{t('common.notDesigned')}</span>
      {!shops.data || !items.data ? (
        <Loading />
      ) : (
        <>
          <div className="form-grid">
            <Field label={t('dispatch.source')}>
              {kind === 'DISPATCH' ? (
                <Input value={t('dispatch.hoWarehouse')} disabled />
              ) : (
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  {supervisors.map((s) => <option key={s.id} value={s.id}>{s.code} {name(s)}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('dispatch.dest')}>
              <Input placeholder={t('shops.search')} value={destQ} onChange={(e) => setDestQ(e.target.value)} />
              <Select value={dest} onChange={(e) => setDest(e.target.value)} size={5}>
                {destOptions.slice(0, 200).map((s) => (
                  <option key={s.id} value={s.id}>{s.code} {name(s)}</option>
                ))}
              </Select>
            </Field>
          </div>
          {kind === 'TRANSFER' && <div className="form-hint">{t('dispatch.transferHint')}</div>}
          <div className="stack-sm">
            {lines.map((l, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                <Select value={l.itemId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))} style={{ flex: 1 }}>
                  <option value="">—</option>
                  {activeItems.map((it) => (
                    <option key={it.id} value={it.id} disabled={lines.some((x, j) => j !== i && x.itemId === it.id)}>
                      {name(it)} · {t('dispatch.available', { kg: formatKg(avail.get(it.id) ?? 0) })}
                    </option>
                  ))}
                </Select>
                <Input numeric inputMode="decimal" placeholder="kg" style={{ width: 110 }} value={l.kg} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)))} />
                <Button variant="link" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [{ itemId: '', kg: '' }])}>✕</Button>
              </div>
            ))}
            <div>
              <Button onClick={() => setLines([...lines, { itemId: '', kg: '' }])}>+ {t('dispatch.addLine')}</Button>
            </div>
          </div>
          <FormError>{act.error}</FormError>
        </>
      )}
    </Modal>
  );
}

export default function DispatchesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DispatchesScreen />
    </Suspense>
  );
}
