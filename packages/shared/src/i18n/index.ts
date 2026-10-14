import { en } from './en';
import { ta } from './ta';

export { en, ta };
export type { Translation } from './en';

/** i18next resources for both apps. */
export const resources = {
  en: { translation: en },
  ta: { translation: ta },
} as const;

/** Pick the right side of an HO-entered bilingual name. */
export function localName(obj: { nameEn: string; nameTa?: string | null }, lang: string): string {
  return lang === 'ta' && obj.nameTa ? obj.nameTa : obj.nameEn;
}
