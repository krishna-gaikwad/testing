import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './locales/en.json';
import hiTranslation from './locales/hi.json';
import mrTranslation from './locales/mr.json';

const savedLang = localStorage.getItem('nagar_setu_lang') || 'en';
if (typeof document !== 'undefined') {
  document.documentElement.lang = savedLang;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslation },
      hi: { translation: hiTranslation },
      mr: { translation: mrTranslation }
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
