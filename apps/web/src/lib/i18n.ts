'use client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from '@aram/shared';

export const LANG_KEY = 'aram.lang';

export function storedLanguage(): 'en' | 'ta' {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'ta' ? 'ta' : 'en';
  } catch {
    return 'en';
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
