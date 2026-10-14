'use client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rupeesToPaise } from '@aram/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useAction, useData } from '../../../lib/hooks';
import { Button, Card, Field, FormError, Input, Loading, PageHeader, Toast } from '../../../ui';

interface Settings { varianceTolerancePaise: number; lowStockDays: number; closingDueTime: string; requestFrequencyPerWeek: number }

export default function SettingsPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const s = useData<Settings>('/settings');
  const act = useAction();
  const [f, setF] = useState({ tolerance: '', lowDays: '', due: '', freq: '' });
  const [toast, setToast] = useState<string | null>(null);
  const editable = me?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (s.data)
      setF({
        tolerance: String(s.data.varianceTolerancePaise / 100),
        lowDays: String(s.data.lowStockDays),
        due: s.data.closingDueTime,
        freq: String(s.data.requestFrequencyPerWeek),
      });
  }, [s.data]);

  if (!s.data) return <Loading />;
  const save = () =>
    void act.run(async () => {
      await api('/settings', {
        method: 'PATCH',
        body: { varianceTolerancePaise: rupeesToPaise(f.tolerance), lowStockDays: Number(f.lowDays), closingDueTime: f.due, requestFrequencyPerWeek: Number(f.freq) },
      });
      await s.reload();
      setToast(t('common.saved'));
    });

  return (
    <div className="page">
      <PageHeader title={t('settings.title')} plain />
      <Card pad style={{ maxWidth: 640 }}>
        <div className="stack">
          <Field label={t('settings.tolerance')} hint={t('settings.toleranceHint')}>
            <Input numeric disabled={!editable} inputMode="decimal" value={f.tolerance} onChange={(e) => setF({ ...f, tolerance: e.target.value })} />
          </Field>
          <Field label={t('settings.lowDays')} hint={t('settings.lowDaysHint')}>
            <Input numeric disabled={!editable} inputMode="decimal" value={f.lowDays} onChange={(e) => setF({ ...f, lowDays: e.target.value })} />
          </Field>
          <Field label={t('settings.due')}>
            <Input disabled={!editable} type="time" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          </Field>
          <Field label={t('settings.freq')}>
            <Input numeric disabled={!editable} inputMode="numeric" value={f.freq} onChange={(e) => setF({ ...f, freq: e.target.value })} />
          </Field>
          <FormError>{act.error}</FormError>
          {editable && (
            <div>
              <Button variant="primary" disabled={act.busy} onClick={save}>{t('common.save')}</Button>
            </div>
          )}
        </div>
      </Card>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
