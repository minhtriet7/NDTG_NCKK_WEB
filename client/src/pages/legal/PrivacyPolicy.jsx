import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LegalLayout from '../../layouts/LegalLayout';
import { getPage } from "../../services/adminService";

export default function PrivacyPolicy() {
  const { i18n } = useTranslation();
  const isVi = i18n.language === 'vi' || i18n.language?.startsWith('vi');

  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const data = await getPage('privacy');
        setContent(data);
      } catch (err) {
        console.error("Failed to load Privacy Policy:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, []);

  return (
    <LegalLayout title={isVi ? (content?.title_vi || "Chính sách Bảo mật") : (content?.title_en || "Privacy Policy")}>
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-5/6"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-4/6"></div>
        </div>
      ) : content ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {isVi ? content.content_vi : content.content_en}
        </ReactMarkdown>
      ) : (
        <div className="text-center py-20 text-slate-500">
          {isVi ? "Nội dung đang được cập nhật." : "Content is being updated."}
        </div>
      )}
    </LegalLayout>
  );
}
