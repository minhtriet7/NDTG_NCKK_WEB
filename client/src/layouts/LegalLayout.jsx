import { Link, useLocation } from 'react-router-dom';
import { Book, Shield, Scale, Database } from 'lucide-react';

export default function LegalLayout({ children, title, lastUpdated }) {
  const location = useLocation();

  const links = [
    { path: '/legal/privacy', label: 'Privacy Policy', icon: Shield },
    { path: '/legal/terms', label: 'Terms of Service', icon: Book },
    { path: '/legal/data-deletion', label: 'Data Deletion', icon: Database },
    { path: '/legal/ai-disclaimer', label: 'AI Disclaimer', icon: Scale },
  ];

  return (
    <div className="w-full bg-background dark:bg-[#0B1120] text-foreground dark:text-[#F8FAFC] font-sans transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 flex flex-col lg:flex-row gap-12 lg:gap-24 relative">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-purple-500/5 blur-[150px] rounded-full pointer-events-none" />

        {/* Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 relative z-10 lg:border-r lg:border-slate-100 lg:dark:border-slate-800/60 lg:pr-8">
          <div className="lg:sticky lg:top-32">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 pl-3">
              Legal & Policy
            </h3>
            <nav className="flex flex-row overflow-x-auto lg:flex-col gap-1.5 pb-4 lg:pb-0 scrollbar-none">
              {links.map((link) => {
                const isActive = location.pathname.includes(link.path);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap
                      ${isActive 
                        ? 'bg-indigo-50 dark:bg-[#1E293B]/80 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-500/20' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400'}`} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 max-w-3xl relative z-10">
          <div className="mb-10 lg:mb-16">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-4 text-slate-900 dark:text-white">
              {title}
            </h1>
            {lastUpdated && (
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 inline-flex px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700/50">
                Last updated: {lastUpdated}
              </p>
            )}
          </div>
          
          <div className="prose prose-slate dark:prose-invert prose-indigo max-w-none 
                          prose-headings:font-bold prose-headings:tracking-tight
                          prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-200 dark:prose-h2:border-slate-800/50
                          prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                          prose-li:marker:text-indigo-500">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

