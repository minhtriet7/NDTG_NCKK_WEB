import React from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, Globe, Link as LinkIcon, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-background border-t border-border-theme pt-12 md:pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 mb-12">
          
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <ScanLine className="w-4 h-4 text-primary" />
              </div>
              <span className="text-lg font-black tracking-tight text-foreground">
                Banknote<span className="text-primary">AI</span>
              </span>
            </Link>
            <p className="text-sm text-secondary max-w-xs">
              {t('footer.slogan', 'Empowering verification with Multi-Agent AI.')}
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold mb-4 text-foreground">{t('footer.product', 'Product')}</h4>
            <ul className="space-y-3">
              <li><Link to="/workspace" className="text-sm text-secondary hover:text-primary transition-colors">{t('footer.links.workspace', 'Workspace')}</Link></li>
              <li><Link to="/directory" className="text-sm text-secondary hover:text-primary transition-colors">{t('footer.links.directory', 'Directory')}</Link></li>
              <li><Link to="/pricing" className="text-sm text-secondary hover:text-primary transition-colors">{t('footer.links.pricing', 'Pricing')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold mb-4 text-foreground">{t('footer.support', 'Support')}</h4>
            <ul className="space-y-3">
              <li><Link to="/guide" className="text-sm text-secondary hover:text-primary transition-colors">{t('footer.links.guide', 'User Guide')}</Link></li>
              <li><Link to="/feedback" className="text-sm text-secondary hover:text-primary transition-colors">{t('footer.links.feedback', 'Feedback')}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-bold mb-4 text-foreground">{t('footer.legal', 'Legal')}</h4>
            <ul className="space-y-3">
              <li><Link to="/privacy" className="text-sm text-secondary hover:text-primary transition-colors">{t('footer.links.privacy', 'Privacy Policy')}</Link></li>
              <li><Link to="/terms" className="text-sm text-secondary hover:text-primary transition-colors">{t('footer.links.terms', 'Terms of Service')}</Link></li>
            </ul>
          </div>

        </div>

        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-border-theme gap-4">
          <p className="text-xs text-secondary text-center md:text-left">
            &copy; {currentYear} BanknoteAI Workspace. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-secondary hover:text-primary transition-colors">
              <Globe className="w-4 h-4" />
            </a>
            <a href="#" className="text-secondary hover:text-primary transition-colors">
              <LinkIcon className="w-4 h-4" />
            </a>
            <a href="#" className="text-secondary hover:text-primary transition-colors">
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
