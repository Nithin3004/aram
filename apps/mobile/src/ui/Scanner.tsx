import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { colors, radii } from '../theme';
import { Txt } from './index';

/** QR scanner for the delivery slip. Falls back gracefully when no camera is available. */
export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);

  const box = { width: 200, height: 200, borderRadius: radii.card, overflow: 'hidden' as const, alignSelf: 'center' as const, marginTop: 16 };

  if (!on || failed) {
    return (
      <Pressable
        onPress={async () => {
          const p = permission?.granted ? permission : await requestPermission();
          if (p.granted) setOn(true);
          else setFailed(true);
        }}
        style={[box, { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.scrollbar, backgroundColor: colors.dividerFaint, alignItems: 'center', justifyContent: 'center', padding: 12 }]}
      >
        <Txt mono size={11} color={colors.textSubtle} align="center">{failed ? t('receive.scanUnavailable') : `▣  ${t('receive.scan')}`}</Txt>
      </Pressable>
    );
  }
  return (
    <View style={box}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onMountError={() => setFailed(true)}
        onBarcodeScanned={(r) => {
          const code = String(r.data).replace(/\D/g, '');
          if (code.length === 6) {
            setOn(false);
            onCode(code);
          }
        }}
      />
    </View>
  );
}
