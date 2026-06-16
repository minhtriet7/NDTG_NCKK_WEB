import React, { useEffect, useState } from "react";
import { RefreshCw, Save, FileText, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { getPages, updatePageContent } from "../../services/adminService";

export default function PagesManager() {
  const { theme, lang } = useAppStore();
  const isDark = theme === "dark";

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [selectedPage, setSelectedPage] = useState(null);
  const [formData, setFormData] = useState(null);

  const text = {
    EN: {
      title: "Content Manager",
      sub: "Manage static pages like About, Contact, Terms.",
      pagesList: "Available Pages",
      editPage: "Edit Content",
      save: "Save Changes",
      saving: "Saving...",
      refresh: "Sync",
      titleEn: "Title (English)",
      titleVi: "Title (Vietnamese)",
      contentEn: "Content (English) - Markdown supported",
      contentVi: "Content (Vietnamese) - Markdown supported",
      selectToEdit: "Select a page to edit",
    },
    VI: {
      title: "Quản lý Nội dung",
      sub: "Quản lý các trang thông tin như Giới thiệu, Liên hệ, Điều khoản.",
      pagesList: "Danh sách Trang",
      editPage: "Chỉnh sửa Nội dung",
      save: "Lưu thay đổi",
      saving: "Đang lưu...",
      refresh: "Đồng bộ",
      titleEn: "Tiêu đề (Tiếng Anh)",
      titleVi: "Tiêu đề (Tiếng Việt)",
      contentEn: "Nội dung (Tiếng Anh) - Hỗ trợ Markdown",
      contentVi: "Nội dung (Tiếng Việt) - Hỗ trợ Markdown",
      selectToEdit: "Chọn một trang để chỉnh sửa",
    },
  }[lang || "EN"];

  // Giả lập các slug mặc định nếu DB trống
  const defaultSlugs = ["about", "contact", "terms", "privacy"];

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getPages();
      // Nếu DB rỗng, tạo các trang mẫu dựa trên defaultSlugs
      let loadedPages = [...data];
      defaultSlugs.forEach(slug => {
        if (!loadedPages.find(p => p.slug === slug)) {
          loadedPages.push({
            slug,
            title_en: slug.charAt(0).toUpperCase() + slug.slice(1),
            title_vi: slug.charAt(0).toUpperCase() + slug.slice(1),
            content_en: `# ${slug.toUpperCase()}\n\nAdd content here...`,
            content_vi: `# ${slug.toUpperCase()}\n\nThêm nội dung tại đây...`
          });
        }
      });
      setPages(loadedPages);
      if (loadedPages.length > 0 && !selectedPage) {
        handleSelectPage(loadedPages[0]);
      } else if (selectedPage) {
        const updatedSelected = loadedPages.find(p => p.slug === selectedPage.slug);
        if (updatedSelected) handleSelectPage(updatedSelected);
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to load pages.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSelectPage = (page) => {
    setSelectedPage(page);
    setFormData({ ...page });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!formData) return;
    setSaving(true);
    try {
      await updatePageContent(formData.slug, {
        title_en: formData.title_en,
        title_vi: formData.title_vi,
        content_en: formData.content_en,
        content_vi: formData.content_vi
      });
      toast.success(lang === "VI" ? "Đã lưu nội dung trang." : "Page content saved.");
      await loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to save page.");
    } finally {
      setSaving(false);
    }
  };

  const pageBg = isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900";
  const panelCls = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const inputCls = `w-full px-3 py-2 rounded-md border outline-none transition-colors text-sm font-medium ${
    isDark ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-teal-500 focus:bg-white"
  }`;
  const labelCls = "block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5";

  if (loading && pages.length === 0) {
    return (
      <div className={`min-h-[70vh] flex items-center justify-center ${pageBg}`}>
        <RefreshCw className="animate-spin text-teal-600" size={24} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-20 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{text.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">{text.sub}</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={loadData} disabled={loading} className={`h-10 px-4 rounded-lg font-bold text-sm border flex items-center gap-2 transition ${isDark ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300" : "border-slate-300 bg-white hover:bg-slate-50 text-slate-700"}`}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {text.refresh}
          </button>
          <button onClick={handleSave} disabled={saving || !formData} className="h-10 px-6 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white font-bold rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-2">
            <Save size={14} /> {saving ? text.saving : text.save}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Sidebar Danh sách trang */}
        <div className={`w-full lg:w-64 shrink-0 rounded-xl border p-4 space-y-2 shadow-sm ${panelCls}`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-2">{text.pagesList}</h2>
          {pages.map((page) => {
            const isSelected = selectedPage?.slug === page.slug;
            return (
              <button
                key={page.slug}
                onClick={() => handleSelectPage(page)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                  isSelected 
                    ? (isDark ? "bg-teal-500/10 text-teal-400 border border-teal-500/20" : "bg-teal-50 text-teal-700 border border-teal-200") 
                    : (isDark ? "text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent")
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText size={16} className={isSelected ? "text-teal-500" : "text-slate-400"} />
                  <span className="capitalize">{page.slug}</span>
                </div>
                {isSelected && <ChevronRight size={14} />}
              </button>
            );
          })}
        </div>

        {/* Khu vực chỉnh sửa nội dung */}
        <div className="flex-1 w-full space-y-6">
          {!formData ? (
            <div className={`rounded-xl border shadow-sm p-12 text-center flex flex-col items-center justify-center min-h-[400px] ${panelCls}`}>
              <FileText size={48} className="text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-slate-500 font-medium">{text.selectToEdit}</p>
            </div>
          ) : (
            <div className={`rounded-xl border shadow-sm p-6 space-y-6 ${panelCls}`}>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 capitalize">
                  {text.editPage}: {formData.slug}
                </h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelCls}>{text.titleEn}</label>
                  <input name="title_en" value={formData.title_en} onChange={handleInputChange} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{text.titleVi}</label>
                  <input name="title_vi" value={formData.title_vi} onChange={handleInputChange} className={inputCls} />
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <div>
                  <label className={labelCls}>{text.contentEn}</label>
                  <textarea
                    name="content_en"
                    value={formData.content_en}
                    onChange={handleInputChange}
                    className={`${inputCls} min-h-[300px] resize-y font-mono text-xs`}
                  />
                </div>
                <div>
                  <label className={labelCls}>{text.contentVi}</label>
                  <textarea
                    name="content_vi"
                    value={formData.content_vi}
                    onChange={handleInputChange}
                    className={`${inputCls} min-h-[300px] resize-y font-mono text-xs`}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
