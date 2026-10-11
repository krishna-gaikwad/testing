import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function LanguageToggle() {
  const { lang, switchLanguage } = useLanguage();

  return (
    <div className="inline-flex items-center rounded border border-slate-300 bg-white p-0.5 text-xs font-semibold shadow-2xs">
      <button
        type="button"
        onClick={() => switchLanguage('en')}
        className={`px-2 py-0.5 rounded transition ${
          lang === 'en'
            ? 'bg-[#0c2340] text-white font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        aria-label="Switch language to English"
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
      <span className="text-slate-300 px-0.5 select-none">|</span>
      <button
        type="button"
        onClick={() => switchLanguage('hi')}
        className={`px-2 py-0.5 rounded transition font-medium ${
          lang === 'hi'
            ? 'bg-[#0c2340] text-white font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        aria-label="हिन्दी भाषा चुनें"
        aria-pressed={lang === 'hi'}
      >
        हिंदी
      </button>
      <span className="text-slate-300 px-0.5 select-none">|</span>
      <button
        type="button"
        onClick={() => switchLanguage('mr')}
        className={`px-2 py-0.5 rounded transition font-medium ${
          lang === 'mr'
            ? 'bg-[#0c2340] text-white font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        aria-label="मराठी भाषेत बदला"
        aria-pressed={lang === 'mr'}
      >
        मराठी
      </button>
    </div>
  );
}
