import React, { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import HelpAssistant from './HelpAssistant';
import { useCity } from '../context/CityContext';
import { useLanguage } from '../context/LanguageContext';
import { AlertTriangle, Phone, MapPin, Shield, ExternalLink, Building2 } from 'lucide-react';

export default function Layout() {
  const { city } = useCity();
  const { t, lang } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    let pageName = t('nav.home');
    const path = location.pathname;
    if (path === '/') pageName = t('nav.home');
    else if (path.startsWith('/login')) pageName = t('nav.login');
    else if (path.startsWith('/register')) pageName = t('nav.register');
    else if (path.startsWith('/report')) pageName = t('nav.fileGrievance');
    else if (path.startsWith('/my-complaints')) pageName = t('nav.myComplaints');
    else if (path.startsWith('/complaints/')) pageName = t('complaint.grievanceDetails');
    else if (path.startsWith('/public-map')) pageName = t('nav.publicMap');
    else if (path.startsWith('/dashboard')) pageName = t('nav.staff');

    document.title = `${pageName} | Nagar Setu (demo)`;
  }, [location.pathname, lang, t]);

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f6f9] text-slate-800 font-sans">
      <Navbar />
      
      {/* City Emergency Advisory Banner */}
      <div className="bg-[#fff3cd] text-[#856404] border-b border-[#ffeeba] px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>{t('common.emergencyAdvisory')}</span>
      </div>

      {/* Main Content Area with Skip Target */}
      <main id="main-content" className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      {/* Floating Civic Help Assistant */}
      <HelpAssistant />

      {/* Comprehensive Civic Portal Footer */}
      <footer className="bg-[#0c2340] text-slate-300 border-t-4 border-[#c5221f] text-xs">
        {/* Top Footer Section: 4 Structured Columns */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Col 1: About Portal */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <img src="/icon.svg" alt="Nagar Setu" className="h-6 w-6 object-contain" />
                <div>
                  <h3 className="font-bold text-white text-sm tracking-wide">Nagar Setu</h3>
                  <p className="text-[11px] text-slate-400">{t('common.demoTagline')}</p>
                </div>
              </div>
              <span className="inline-block text-[10px] text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                {t('common.demoBadge')}
              </span>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {t('footer.disclaimer')}
              </p>
            </div>

            {/* Col 2: Citizen Grievance Services */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider border-b border-slate-700 pb-1.5">
                {t('common.roles.citizen')}
              </h4>
              <ul className="space-y-1.5 text-[11px] text-slate-300">
                <li>
                  <Link to="/report" className="hover:text-white hover:underline flex items-center gap-1">
                    <span>• {t('nav.fileGrievance')} ({t('report.tabQuick')})</span>
                  </Link>
                </li>
                <li>
                  <Link to="/report" className="hover:text-white hover:underline flex items-center gap-1">
                    <span>• {t('wizard.title')}</span>
                  </Link>
                </li>
                <li>
                  <Link to="/my-complaints" className="hover:text-white hover:underline flex items-center gap-1">
                    <span>• {t('nav.myGrievances')}</span>
                  </Link>
                </li>
                <li>
                  <Link to="/public-map" className="hover:text-white hover:underline flex items-center gap-1">
                    <span>• {t('nav.publicMap')}</span>
                  </Link>
                </li>
                <li>
                  <span className="text-slate-400">• {t('complaint.reopenNotice')}</span>
                </li>
              </ul>
            </div>

            {/* Col 3: Staff Workflow Portals */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider border-b border-slate-700 pb-1.5">
                {t('nav.staff')}
              </h4>
              <ul className="space-y-1.5 text-[11px] text-slate-300">
                <li>
                  <Link to="/dashboard" className="hover:text-white hover:underline">
                    • {t('common.roles.reviewer')} ({t('official.queueTab')})
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white hover:underline">
                    • {t('common.roles.officer')} ({t('official.queueTab')})
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-white hover:underline">
                    • {t('supervisor.title')}
                  </Link>
                </li>
                <li>
                  <span className="text-slate-400">• {t('supervisor.escalationDetails')}</span>
                </li>
              </ul>
            </div>

            {/* Col 4: Emergency Contact */}
            <div className="space-y-2.5">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider border-b border-slate-700 pb-1.5">
                {t('footer.helplineTitle')}
              </h4>
              <div className="space-y-2 text-[11px] text-slate-300">
                <div className="flex items-start gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#e05626] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-white">{t('footer.emergency112')}</span>
                    <span>{t('common.emergencyAdvisory')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legal & Mandatory Demo Note Strip */}
        <div className="bg-[#07172b] border-t border-slate-800 py-4 px-4 text-center">
          <div className="max-w-7xl mx-auto space-y-1.5">
            <p className="font-semibold text-slate-200 text-xs tracking-wide">
              {t('common.demoBadge')}
            </p>
            <p className="text-[11px] text-slate-400">
              {t('footer.copyright')}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-3 pt-2 text-[10px] text-slate-500">
              <span>{t('footer.privacyPolicy')}</span>
              <span>•</span>
              <span>{t('footer.termsOfUse')}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
