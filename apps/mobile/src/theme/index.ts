/**
 * App theme: shared design tokens plus React Native font mapping.
 * Screens and components take every colour/size from here.
 */
import { colors, radii, space, tones, touch } from '@aram/shared';

export { colors, radii, space, tones, touch };

export type Weight = 400 | 500 | 600 | 700;
const latin: Record<Weight, string> = { 400: 'AnekLatin_400Regular', 500: 'AnekLatin_500Medium', 600: 'AnekLatin_600SemiBold', 700: 'AnekLatin_700Bold' };
const tamil: Record<Weight, string> = { 400: 'AnekTamil_400Regular', 500: 'AnekTamil_500Medium', 600: 'AnekTamil_600SemiBold', 700: 'AnekTamil_700Bold' };
const mono: Record<Weight, string> = { 400: 'IBMPlexMono_400Regular', 500: 'IBMPlexMono_500Medium', 600: 'IBMPlexMono_600SemiBold', 700: 'IBMPlexMono_600SemiBold' };

/** Custom fonts in RN need a family per weight; Tamil UI uses Anek Tamil (which also covers Latin). */
export function fontFamily(kind: 'text' | 'mono', weight: Weight, lang: string): string {
  if (kind === 'mono') return mono[weight];
  return lang === 'ta' ? tamil[weight] : latin[weight];
}

/** Type scale from the design (Android screens). */
export const type = {
  display: { size: 34, weight: 600 as Weight },
  screenTitle: { size: 17, weight: 600 as Weight },
  title: { size: 19, weight: 600 as Weight },
  h2: { size: 16, weight: 600 as Weight },
  body: { size: 15, weight: 500 as Weight },
  sub: { size: 12, weight: 400 as Weight },
  small: { size: 11, weight: 400 as Weight },
  number: { size: 22, weight: 600 as Weight },
};

export const layout = { maxWidth: 480, gutter: 16 };
