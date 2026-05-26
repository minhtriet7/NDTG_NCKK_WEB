import React, { useEffect, useState } from "react";
import { Save, Loader2, ScanSearch, Eye, EyeOff, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";
import { getLensConfig, updateLensConfig } from "../../services/adminConfigService";

const DEFAULT_CONFIG = {
  enabled: true,
  api_key: "",
  serpapi_api_key: "",
  imgbb_api_key: "",
  proxy_url: "",
  language_code: "vi",
  country_code: "vn",
  max_results: 5,
  request_timeout_seconds: 30,
};

function normalizeConfig(data) {
  const cfg = data?.config || data?.settings || data?.data || data || {};
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    api_key: cfg.api_key || cfg.serpapi_api_key || "",
    serpapi_api_key: cfg.serpapi_api_key || cfg.api_key || "",
    imgbb_api_key: cfg.imgbb_api_key || "",
    max_results: Number(cfg.max_results ?? DEFAULT_CONFIG.max_results),
    request_timeout_seconds: Number(
      cfg.request_timeout_seconds ?? DEFAULT_CONFIG.request_timeout_seconds,
    ),
    enabled: cfg.enabled !== false,
  };
}

export default function GoogleLensConfig() {
  const { theme, lang } = useAppStore();
  const { token } = useAuthStore();
  const isDark = theme === "dark";

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showKey, setShowKey] = useState(false);
  const [showImgBBKey, setShowImgBBKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const t = {
    EN: {
      title: "Google Lens Config",
      desc: "Configure Agent 3 visual search via SerpApi, ImgBB upload, proxy, language and result limits.",
      key: "SerpApi Key",
      imgbb: "ImgBB API Key",
      proxy: "Proxy URL",
      langCode: "Language Code",
      countryCode: "Country Code",
      max: "Max Results",
      timeout: "Request Timeout Seconds",
      enabled: "Enable Agent 3 Visual Search",
      save: "Save Changes",
      refresh: "Refresh",
      updated: "Google Lens configuration saved.",
      loadFailed: "Failed to load Google Lens config.",
      saveFailed: "Failed to save Google Lens config.",
    },
    VI: {
      title: "Cấu hình Google Lens",
      desc: "Cấu hình Agent 3 tìm kiếm hình ảnh qua SerpApi, ImgBB upload, proxy, ngôn ngữ và giới hạn kết quả.",
      key: "SerpApi Key",
      imgbb: "ImgBB API Key",
      proxy: "URL Proxy",
      langCode: "Mã ngôn ngữ",
      countryCode: "Mã quốc gia",
      max: "Số kết quả tối đa",
      timeout: "Timeout request, giây",
      enabled: "Bật Agent 3 Visual Search",
      save: "Lưu thay đổi",
      refresh: "Tải lại",
      updated: "Đã lưu cấu hình Google Lens.",
      loadFailed: "Không thể tải cấu hình Google Lens.",
      saveFailed: "Không thể lưu cấu hình Google Lens.",
    },
  }[lang || "EN"];

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getLensConfig(token);
      setConfig(normalizeConfig(data));
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, lang]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);

    const payload = {
      ...config,
      api_key: config.api_key || config.serpapi_api_key || "",
      serpapi_api_key: config.serpapi_api_key || config.api_key || "",
      imgbb_api_key: config.imgbb_api_key || "",
      max_results: Number(config.max_results || 5),
      request_timeout_seconds: Number(config.request_timeout_seconds || 30),
      enabled: Boolean(config.enabled),
    };

    try {
      await updateLensConfig(token, payload);
      toast.success(t.updated);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setConfig((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : type === "number" ? Number(value) : value,
    }));
  };

  const cardBg = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const inputCls = `w-full h-11 px-4 rounded-xl border outline-none transition-colors ${
    isDark
      ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500"
      : "bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500 focus:bg-white"
  }`;

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Loader2 className="animate-spin mx-auto mb-2" /> Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${textMain} flex items-center gap-2`}>
            <ScanSearch className="text-teal-600" /> {t.title}
          </h1>
          <p className="mt-1 text-slate-500 text-sm max-w-2xl">{t.desc}</p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className={`px-4 py-2.5 rounded-xl border font-bold text-sm flex items-center gap-2 ${cardBg} text-slate-700 dark:text-slate-300 disabled:opacity-60`}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      <div className={`p-6 md:p-8 rounded-3xl border shadow-sm ${cardBg}`}>
        <form onSubmit={handleSave} className="space-y-6">
          <label className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer">
            <span className={`font-black ${textMain}`}>{t.enabled}</span>
            <input
              type="checkbox"
              name="enabled"
              checked={config.enabled}
              onChange={handleChange}
              className="w-5 h-5 accent-teal-600"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.key}</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  name="api_key"
                  value={config.api_key || ""}
                  onChange={(event) =>
                    setConfig((prev) => ({
                      ...prev,
                      api_key: event.target.value,
                      serpapi_api_key: event.target.value,
                    }))
                  }
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.imgbb}</label>
              <div className="relative">
                <input
                  type={showImgBBKey ? "text" : "password"}
                  name="imgbb_api_key"
                  value={config.imgbb_api_key || ""}
                  onChange={handleChange}
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowImgBBKey(!showImgBBKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showImgBBKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.proxy}</label>
              <input type="text" name="proxy_url" value={config.proxy_url || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.langCode}</label>
              <input type="text" name="language_code" value={config.language_code || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.countryCode}</label>
              <input type="text" name="country_code" value={config.country_code || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.max}</label>
              <input type="number" min="1" name="max_results" value={config.max_results || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.timeout}</label>
              <input type="number" min="5" name="request_timeout_seconds" value={config.request_timeout_seconds || ""} onChange={handleChange} className={inputCls} />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 disabled:opacity-70 flex items-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
