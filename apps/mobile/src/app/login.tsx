import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorText } from '../lib/flows';
import { useApp } from '../lib/store';
import { colors, fontFamily } from '../theme';
import { CodeBoxes, Cta, Input, LangSwitch, Notice, Txt } from '../ui';

export default function Login() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { signedIn, login, verifyOtp, resendOtp, language, setLanguage } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState<{ challengeId: string; phoneMasked: string; devCode?: string; sentAt: number } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (signedIn) router.replace('/home');
  }, [signedIn]);
  useEffect(() => {
    if (!otp) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [otp]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      const r = await login(username.trim(), password);
      if (r.otpRequired) setOtp({ challengeId: r.challengeId, phoneMasked: r.phoneMasked, devCode: r.devCode, sentAt: Date.now() });
    });
  const verify = (c = code) => run(() => verifyOtp(otp!.challengeId, c));
  const resend = () =>
    run(async () => {
      const r = await resendOtp(otp!.challengeId);
      setOtp({ ...otp!, challengeId: r.challengeId, devCode: r.devCode, sentAt: Date.now() });
      setCode('');
    });
  const wait = otp ? Math.max(0, 30 - Math.floor((now - otp.sentAt) / 1000)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.appCanvas }} contentContainerStyle={{ padding: 20, paddingTop: 28 + insets.top, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt size={22} weight={700} color={colors.gold} style={{ fontFamily: fontFamily('text', 700, 'ta') }}>{t('brand.tamilMark')}</Txt>
          <Txt size={13} weight={600}>{t('brand.name')}</Txt>
        </View>
        <LangSwitch value={language} onChange={setLanguage} />
      </View>

      <View style={{ marginTop: 10 }}>
        <Txt size={24} weight={600}>{t('auth.title')}</Txt>
        <Txt size={13} color={colors.textMuted}>{t('auth.subtitleShop')}</Txt>
      </View>

      {!otp ? (
        <View style={{ gap: 16, marginTop: 10 }}>
          <View>
            <Txt size={15} weight={600} style={{ marginBottom: 6 }}>{t('auth.username')}</Txt>
            <Input big mono autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} placeholder="s001" />
          </View>
          <View>
            <Txt size={15} weight={600} style={{ marginBottom: 6 }}>{t('auth.password')}</Txt>
            <Input big mono secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={() => void submit()} />
          </View>
          {error && <Notice>{error}</Notice>}
          <Cta label={t('auth.continue')} onPress={() => void submit()} busy={busy} disabled={!username || !password} />
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 10, paddingTop: 22, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}>
          <View>
            <Txt size={17} weight={600}>{t('auth.otpTitle')}</Txt>
            <Txt size={12} color={colors.textMuted}>{t('auth.otpSentTo', { phone: otp.phoneMasked })}</Txt>
          </View>
          {otp.devCode && <Txt mono size={12} color={colors.textSubtle}>{t('auth.devOtp', { code: otp.devCode })}</Txt>}
          <CodeBoxes
            autoFocus
            value={code}
            onChange={(v) => {
              setCode(v);
              if (v.length === 6) void verify(v);
            }}
          />
          {error && <Notice>{error}</Notice>}
          <Cta label={t('auth.otpVerify')} onPress={() => void verify()} busy={busy} disabled={code.length !== 6} />
          {wait > 0 ? (
            <Txt size={13} color={colors.textSubtle}>{t('auth.otpResendIn', { s: wait })}</Txt>
          ) : (
            <Cta tone="outline" label={t('auth.otpResend')} onPress={() => void resend()} />
          )}
        </View>
      )}
    </ScrollView>
  );
}
