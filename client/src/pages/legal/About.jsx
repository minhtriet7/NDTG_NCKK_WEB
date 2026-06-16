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
              <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-4 text-slate-900 dark:text-white">
                {isVi ? content.title_vi : content.title_en}
              </h1>
            </div>
            
            <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-indigo-600 dark:prose-headings:text-indigo-400 prose-a:text-indigo-500 hover:prose-a:text-indigo-600">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {isVi ? content.content_vi : content.content_en}
              </ReactMarkdown>
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
