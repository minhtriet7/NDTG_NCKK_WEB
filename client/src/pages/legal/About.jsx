import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPage } from "../../services/adminService";
import SEO from '../../components/SEO';

export default function About() {
  const { i18n } = useTranslation();
  const isVi = i18n.language === 'vi' || i18n.language?.startsWith('vi');
  
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const data = await getPage('about');
        setContent(data);
      } catch (err) {
        console.error("Failed to load about page:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, []);

  return (
    <div className="w-full min-h-screen bg-background dark:bg-[#0B1120] text-foreground dark:text-[#F8FAFC] font-sans transition-colors duration-300 py-12 lg:py-20 relative overflow-hidden">
      <SEO title={isVi ? "Về chúng tôi" : "About Us"} isApp={true} />
      
      {/* Background Gradients */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mx-auto"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3 mx-auto"></div>
            <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded w-full mt-12"></div>
          </div>
        ) : content ? (
          <>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold uppercase tracking-wider mb-6">
                Company Info
              </div>
              <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-500 dark:from-white dark:to-slate-400">
                {isVi ? content.title_vi : content.title_en}
              </h1>
            </div>
            
            <div className="bg-white dark:bg-[#0F172A] shadow-2xl shadow-slate-200/50 dark:shadow-black/40 border border-slate-200/60 dark:border-slate-800/60 rounded-[2rem] p-8 sm:p-12 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-br from-purple-500/5 to-transparent rounded-full pointer-events-none" />
              
              <div className="prose prose-slate dark:prose-invert prose-indigo max-w-none 
                              prose-headings:font-bold prose-headings:tracking-tight
                              prose-h1:text-3xl prose-h1:mb-8
                              prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-3 prose-h2:border-b prose-h2:border-slate-100 dark:prose-h2:border-slate-800/80
                              prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:font-semibold prose-a:no-underline hover:prose-a:underline hover:prose-a:text-indigo-700
                              prose-li:marker:text-indigo-500
                              prose-p:leading-relaxed prose-p:text-slate-600 dark:prose-p:text-slate-300
                              relative z-10">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {isVi ? content.content_vi : content.content_en}
                </ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-slate-500">
            {isVi ? "Nội dung đang được cập nhật." : "Content is being updated."}
          </div>
        )}
      </div>
    </div>
  );
}
