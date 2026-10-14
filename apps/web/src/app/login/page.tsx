'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { getDeviceId, useAuth } from '../../lib/auth';
import { useAction } from '../../lib/hooks';
import { Button, Card, Field, FormError, Input, LangSwitch } from '../../ui';

type LoginResult = { otpRequired: false; accessToken: string } | { otpRequired: true; challengeId: string; phoneMasked: string; devCode?: string };

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, ready, language, setLanguage, signedIn, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState<{ challengeId: string; phoneMasked: string; devCode?: string; sentAt: number } | null>(null);
  const [code, setCode] = useState('');
  const [now, setNow] = useState(Date.now());
  const act = useAction();

  useEffect(() => {
    if (ready && me) router.replace('/');
  }, [ready, me, router]);
  useEffect(() => {
    if (!otp) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [otp]);

  const finish = async (token: string) => {
    const u = await signedIn(token);
    if (u.role === 'SHOP') {
      signOut();
      act.setError(t('auth.hoOnly'));
      return;
    }
    window.location.href = '/';
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void act.run(async () => {
      const r = await api<LoginResult>('/auth/login', { body: { username, password, deviceId: getDeviceId() } });
      if (r.otpRequired) setOtp({ challengeId: r.challengeId, phoneMasked: r.phoneMasked, devCode: r.devCode, sentAt: Date.now() });
      else await finish(r.accessToken);
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    void act.run(async () => {
      const r = await api<{ accessToken: string }>('/auth/verify-otp', { body: { challengeId: otp.challengeId, code } });
      await finish(r.accessToken);
    });
  };

  const resend = () =>
    void act.run(async () => {
      if (!otp) return;
      const r = await api<{ challengeId: string; devCode?: string }>('/auth/resend-otp', { body: { challengeId: otp.challengeId } });
      setOtp({ ...otp, challengeId: r.challengeId, devCode: r.devCode, sentAt: Date.now() });
      setCode('');
    });

  const wait = otp ? Math.max(0, 30 - Math.floor((now - otp.sentAt) / 1000)) : 0;

  return (
    <div className="login-wrap">
      <div className="login-card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="brand">
            <span className="brand-mark" style={{ borderColor: 'var(--c-border)' }}>
              <span className="brand-ta">{t('brand.tamilMark')}</span>
              <span className="brand-en">{t('brand.short')}</span>
            </span>
            <span className="brand-name">{t('brand.name')}</span>
          </span>
          <LangSwitch light value={language} onChange={setLanguage} />
        </div>
        <Card pad>
          {!otp ? (
            <form className="stack" onSubmit={submit}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22 }}>{t('auth.title')}</h1>
                <div className="small t-muted">{t('auth.subtitleHo')}</div>
              </div>
              <Field label={t('auth.username')}>
                <Input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field label={t('auth.password')}>
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <FormError>{act.error}</FormError>
              <Button type="submit" variant="primary" block disabled={act.busy || !username || !password}>
                {t('auth.continue')}
              </Button>
            </form>
          ) : (
            <form className="stack" onSubmit={verify}>
              <div>
                <h1 style={{ margin: 0, fontSize: 20 }}>{t('auth.otpTitle')}</h1>
                <div className="small t-muted">{t('auth.otpSentTo', { phone: otp.phoneMasked })}</div>
              </div>
              {otp.devCode && <div className="form-hint mono">{t('auth.devOtp', { code: otp.devCode })}</div>}
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                big
                style={{ textAlign: 'center', letterSpacing: '.4em', fontSize: 24 }}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <FormError>{act.error}</FormError>
              <Button type="submit" variant="primary" block disabled={act.busy || code.length !== 6}>
                {t('auth.otpVerify')}
              </Button>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <Button variant="link" onClick={() => { setOtp(null); setCode(''); }}>{t('common.back')}</Button>
                {wait > 0 ? <span className="small t-subtle">{t('auth.otpResendIn', { s: wait })}</span> : <Button variant="link" onClick={resend}>{t('auth.otpResend')}</Button>}
              </div>
            </form>
          )}
        </Card>
        <div className="xsmall t-faint mono center">{t('common.notDesigned')}</div>
      </div>
    </div>
  );
}
