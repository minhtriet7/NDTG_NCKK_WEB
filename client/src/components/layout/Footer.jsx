import { Link } from 'react-router-dom';
import { Globe, Mail, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="relative bg-background dark:bg-[#0B1120] pt-24 pb-12 overflow-hidden font-sans border-t border-border-theme dark:border-[#1E293B]">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-16">
          
          {/* Brand Column */}
          <div className="col-span-2 lg:col-span-2 pr-8">
            <Link to="/" className="flex items-center gap-2 mb-6 group inline-flex">
              <div className="h-10 w-10 flex items-center justify-center transform transition-transform duration-300 group-hover:scale-110">
                <img src="/logo.png" alt="Banknote AI Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground dark:text-white flex items-center">
                Banknote
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600 ml-1 font-black">
                  AI
                </span>
              </span>
            </Link>
            <p className="text-secondary dark:text-slate-400 text-sm leading-relaxed mb-8 max-w-xs">
              {t('footer.slogan', 'The enterprise-grade multi-agent computer vision platform for secure banknote verification.')}
            </p>
            <div className="flex items-center gap-4 text-secondary dark:text-slate-400">
              <a href="#" className="p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-300">
                <MessageSquare className="w-5 h-5" />
              </a>
              <a href="#" className="p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-300">
                <Globe className="w-5 h-5" />
              </a>
              <a href="mailto:contact@banknoteai.com" className="p-2 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-300">
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links Columns */}
          <div>
            <h4 className="text-foreground dark:text-white font-semibold mb-6 tracking-wide text-sm uppercase">
              {t('footer.platform', 'Platform')}
            </h4>
            <ul className="space-y-3.5 text-sm text-secondary dark:text-slate-400">
              <li><Link to="/workspace" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.workspace', 'Workspace')}</Link></li>
              <li><Link to="/directory" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.directory', 'Directory')}</Link></li>
              <li><Link to="/pricing" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.pricing', 'Pricing')}</Link></li>
              <li><Link to="/exchange" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.exchange', 'Currency Exchange')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-foreground dark:text-white font-semibold mb-6 tracking-wide text-sm uppercase">
              {t('footer.company', 'Company')}
            </h4>
            <ul className="space-y-3.5 text-sm text-secondary dark:text-slate-400">
              <li><Link to="/about" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.about', 'About Us')}</Link></li>
              <li><Link to="/support" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.support', 'Support')}</Link></li>
              <li><Link to="/contact" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.contact', 'Contact')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-foreground dark:text-white font-semibold mb-6 tracking-wide text-sm uppercase">
              {t('footer.legal', 'Legal')}
            </h4>
            <ul className="space-y-3.5 text-sm text-secondary dark:text-slate-400">
              <li><Link to="/legal/privacy" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.privacy', 'Privacy Policy')}</Link></li>
              <li><Link to="/legal/terms" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.terms', 'Terms of Service')}</Link></li>
              <li><Link to="/legal/data-deletion" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.dataDeletion', 'Data Deletion')}</Link></li>
              <li><Link to="/legal/ai-disclaimer" className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:translate-x-1 inline-block transition-all duration-300">{t('footer.links.aiDisclaimer', 'AI Disclaimer')}</Link></li>
            </ul>
          </div>
          
        </div>

        <div className="pt-8 border-t border-border-theme dark:border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-secondary dark:text-slate-500 text-xs">
            &copy; {new Date().getFullYear()} BanknoteAI Platform. {t('footer.allRightsReserved', 'All rights reserved.')}
          </p>
          <p className="text-xs font-mono text-slate-400 dark:text-slate-600">
            {t('footer.systemsOperational', 'All systems operational')}
          </p>
        </div>
      </div>
    </footer>
  );
}
