import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { localName, resources } from '@aram/shared';
import { storage } from './storage';

export const LANG_KEY = 'aram.lang';
/** Device choice, saved before login and when offline. Shops default to Tamil. */
export const deviceLanguage = (): 'en' | 'ta' => (storage.get(LANG_KEY) === 'en' ? 'en' : 'ta');

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: deviceLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export const nameIn = (o: { nameEn: string; nameTa?: string | null } | null | undefined) => (o ? localName(o, i18n.language) : '');
export default i18n;
