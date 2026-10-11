import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const switchLanguage = useCallback((newLang) => {
    i18n.changeLanguage(newLang);
    localStorage.setItem('nagar_setu_lang', newLang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLang;
    }
  }, [i18n]);

  /**
   * Helper to translate backend codes/keys into current language.
   * Prevents raw backend strings from rendering in UI.
   * 
   * @param {'status'|'priority'|'department'|'category'|'role'|'outcome'|'action'} type
   * @param {string} value
   * @param {string} [department] - Optional department context for category translation
   */
  const labelFor = useCallback((type, value, department = null) => {
    if (!value) return '';

    if (type === 'status') {
      return t(`status.${value}`, { defaultValue: value });
    }

    if (type === 'priority') {
      return t(`priority.${value}`, { defaultValue: value });
    }

    if (type === 'department') {
      const code = value.toLowerCase();
      return t(`department.${code}`, { defaultValue: value });
    }

    if (type === 'category') {
      // 1. Try with department prefix if provided
      if (department) {
        const deptKey = department.toLowerCase();
        const translated = t(`category.${deptKey}.${value}`);
        if (translated && !translated.startsWith('category.')) {
          return translated;
        }
      }
      // 2. Try scanning across all departments
      const depts = ['waste', 'roads', 'water', 'others'];
      for (const d of depts) {
        const trans = t(`category.${d}.${value}`);
        if (trans && !trans.startsWith('category.')) {
          return trans;
        }
      }
      return value;
    }

    if (type === 'role') {
      return t(`common.roles.${value.toLowerCase()}`, { defaultValue: value });
    }

    if (type === 'outcome') {
      return t(`common.outcomes.${value.toLowerCase()}`, { defaultValue: value });
    }

    if (type === 'action') {
      // Map action codes like 'Assign Staff', 'Start Work', etc.
      const actionMap = {
        'Submit': 'submit',
        'Transition Attempt': 'startReview',
        'Start Review': 'startReview',
        'Review Started': 'startReview',
        'Accept': 'accept',
        'Grievance Accepted': 'accept',
        'Reject': 'reject',
        'Grievance Rejected': 'reject',
        'Assign Staff': 'assignStaff',
        'Staff Assigned': 'assignStaff',
        'Start Work': 'startWork',
        'Progress Update': 'addProgressNote',
        'Progress Note Added': 'addProgressNote',
        'Resolve': 'resolve',
        'Grievance Resolved': 'resolve',
        'Request Reopening': 'reopenTitle',
        'Reopening Requested': 'reopenTitle',
        'Approve Reopening': 'approveReopening',
        'Reject Reopening': 'rejectReopening',
        'Emergency Flag Verified': 'verifyEmergency',
        'Emergency Flag Dismissed': 'dismissEmergency',
        'Priority Override': 'overridePriority'
      };
      const mappedKey = actionMap[value];
      if (mappedKey) {
        return t(`official.actions.${mappedKey}`, { defaultValue: value });
      }
      return value;
    }

    return value;
  }, [t]);

  /**
   * Helper to format server error responses into localized messages
   */
  const formatError = useCallback((errResponse) => {
    if (!errResponse) return t('errors.GENERIC_ERROR');
    if (typeof errResponse === 'string') return errResponse;

    if (errResponse.errorCode) {
      const trans = t(`errors.${errResponse.errorCode}`, errResponse.params || {});
      if (trans && !trans.startsWith('errors.')) {
        return trans;
      }
    }
    return errResponse.error || errResponse.message || t('errors.GENERIC_ERROR');
  }, [t]);

  /**
   * Helper to format notifications into localized messages
   */
  const formatNotification = useCallback((notif) => {
    if (!notif) return '';
    if (notif.messageKey) {
      const params = { ...(notif.params || {}) };
      // Localize status if present in params
      if (params.status) {
        params.status = labelFor('status', params.status);
      }
      if (params.action) {
        params.action = labelFor('action', params.action);
      }
      if (params.priority) {
        params.priority = labelFor('priority', params.priority);
      }
      const trans = t(`notifications.${notif.messageKey}`, params);
      if (trans && !trans.startsWith('notifications.')) {
        return trans;
      }
    }
    return notif.message || '';
  }, [t, labelFor]);

  /**
   * Localized date and time formatting using selected locale (en-IN or mr-IN)
   */
  const formatDate = useCallback((dateInput, options = {}) => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';

    const locale = lang === 'mr' ? 'mr-IN' : 'en-IN';
    const defaultOpts = {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      ...options
    };

    return new Intl.DateTimeFormat(locale, defaultOpts).format(date);
  }, [lang]);

  /**
   * Localized number formatting
   */
  const formatNumber = useCallback((num) => {
    if (num === null || num === undefined) return '';
    const locale = lang === 'mr' ? 'mr-IN' : 'en-IN';
    return new Intl.NumberFormat(locale).format(num);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{
      lang,
      switchLanguage,
      t,
      labelFor,
      formatError,
      formatNotification,
      formatDate,
      formatNumber
    }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
