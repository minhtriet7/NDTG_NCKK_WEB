import React, { useEffect, useState } from "react";
import {
  Save,
  Loader2,
  ScanSearch,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Route,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { getLensConfig, updateLensConfig } from "../../services/adminConfigService";

const DEFAULT_CONFIG = {
  enable_agent_3: true,
  lens_enabled: true,

  // serpapi = Agent 3 v1, selenium/v2 = Agent 3 v2, disabled = bỏ qua Agent 3
  lens_provider: "serpapi",
  agent3_provider: "serpapi",

  agent3_v1_enabled: true,
  agent3_v2_enabled: true,

  lens_fallback_enabled: true,
  lens_fallback_provider: "serpapi",
  agent3_fallback_enabled: true,
  agent3_fallback_provider: "serpapi",

  api_key: "",
  serpapi_api_key: "",
  imgbb_api_key: "",
  proxy_url: "",
  language_code: "vi",
  country_code: "vn",
  max_results: 5,
  max_visual_matches: 10,
  max_exact_matches: 5,
  request_timeout_seconds: 30,
  no_cache: true,
  raw_fallback_enabled: true,
  formatter_model: "gemini-2.5-flash",
};

function normalizeConfig(data) {
  const cfg = data?.config || data?.settings || data?.data || data || {};

  const provider =
    cfg.lens_provider ||
    cfg.agent3_provider ||
    DEFAULT_CONFIG.lens_provider;

  const fallbackProvider =
    cfg.lens_fallback_provider ||
    cfg.agent3_fallback_provider ||
    DEFAULT_CONFIG.lens_fallback_provider;

  const lensEnabled =
    cfg.lens_enabled ??
    cfg.enabled ??
    cfg.enable_agent_3 ??
    DEFAULT_CONFIG.lens_enabled;

  const fallbackEnabled =
    cfg.lens_fallback_enabled ??
    cfg.agent3_fallback_enabled ??
    DEFAULT_CONFIG.lens_fallback_enabled;

  return {
    ...DEFAULT_CONFIG,
    ...cfg,

    enable_agent_3: Boolean(cfg.enable_agent_3 ?? lensEnabled),
    lens_enabled: Boolean(lensEnabled),

    lens_provider: provider,
    agent3_provider: provider,

    agent3_v1_enabled: Boolean(cfg.agent3_v1_enabled ?? true),
    agent3_v2_enabled: Boolean(cfg.agent3_v2_enabled ?? true),

    lens_fallback_enabled: Boolean(fallbackEnabled),
    agent3_fallback_enabled: Boolean(fallbackEnabled),
    lens_fallback_provider: fallbackProvider,
    agent3_fallback_provider: fallbackProvider,

    api_key: cfg.api_key || cfg.serpapi_api_key || "",
    serpapi_api_key: cfg.serpapi_api_key || cfg.api_key || "",
    imgbb_api_key: cfg.imgbb_api_key || "",

    max_results: Number(cfg.max_results ?? DEFAULT_CONFIG.max_results),
    max_visual_matches: Number(cfg.max_visual_matches ?? DEFAULT_CONFIG.max_visual_matches),
    max_exact_matches: Number(cfg.max_exact_matches ?? DEFAULT_CONFIG.max_exact_matches),
    request_timeout_seconds: Number(
      cfg.request_timeout_seconds ?? DEFAULT_CONFIG.request_timeout_seconds,
    ),
  };
}

export default function GoogleLensConfig() {
  const { theme, lang } = useAppStore();
  const isDark = theme === "dark";

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [showKey, setShowKey] = useState(false);
  const [showImgBBKey, setShowImgBBKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const t = {
    EN: {
      title: "Google Lens / Agent 3 Config",
      desc: "Choose Agent 3 provider: SerpApi v1, Selenium v2, or disabled. Configure fallback, keys, proxy, language and result limits.",
      provider: "Agent 3 Provider",
      providerDesc: "SerpApi is the current stable v1. Selenium is the new v2.",
      serpapi: "SerpApi / v1",
      selenium: "Selenium / v2",
      disabled: "Disabled",
      fallback: "Enable fallback when selected provider fails",
      fallbackProvider: "Fallback Provider",
      enableAgent3: "Enable Agent 3",
      enableLens: "Enable Visual Search",
      enableV2: "Enable Agent 3 v2",
      key: "SerpApi Key",
      imgbb: "ImgBB API Key",
      proxy: "Proxy URL",
      langCode: "Language Code",
      countryCode: "Country Code",
      max: "Max Results",
      maxVisual: "Max Visual Matches",
      maxExact: "Max Exact Matches",
      timeout: "Request Timeout Seconds",
      noCache: "No cache",
      rawFallback: "Raw fallback enabled",
      formatterModel: "Formatter Model",
      save: "Save Changes",
      refresh: "Refresh",
      updated: "Google Lens / Agent 3 configuration saved.",
      loadFailed: "Failed to load Google Lens config.",
      saveFailed: "Failed to save Google Lens config.",
    },
    VI: {
      title: "Cấu hình Google Lens / Agent 3",
      desc: "Chọn Agent 3 provider: SerpApi v1, Selenium v2 hoặc tắt Agent 3. Cấu hình fallback, key, proxy, ngôn ngữ và giới hạn kết quả.",
      provider: "Provider Agent 3",
      providerDesc: "SerpApi là bản v1 đang ổn. Selenium là bản v2 mới.",
      serpapi: "SerpApi / v1",
      selenium: "Selenium / v2",
      disabled: "Tắt Agent 3",
      fallback: "Bật fallback khi provider được chọn bị lỗi",
      fallbackProvider: "Provider fallback",
      enableAgent3: "Bật Agent 3",
      enableLens: "Bật Visual Search",
      enableV2: "Bật Agent 3 v2",
      key: "SerpApi Key",
      imgbb: "ImgBB API Key",
      proxy: "URL Proxy",
      langCode: "Mã ngôn ngữ",
      countryCode: "Mã quốc gia",
      max: "Số kết quả tối đa",
      maxVisual: "Số visual matches tối đa",
      maxExact: "Số exact matches tối đa",
      timeout: "Timeout request, giây",
      noCache: "Không dùng cache",
      rawFallback: "Bật raw fallback",
      formatterModel: "Model format kết quả",
      save: "Lưu thay đổi",
      refresh: "Tải lại",
      updated: "Đã lưu cấu hình Google Lens / Agent 3.",
      loadFailed: "Không thể tải cấu hình Google Lens.",
      saveFailed: "Không thể lưu cấu hình Google Lens.",
    },
  }[lang || "EN"];

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getLensConfig();
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
  }, [lang]);

  const buildPayload = () => {
    const provider = config.lens_provider || config.agent3_provider || "serpapi";
    const fallbackProvider = config.lens_fallback_provider || config.agent3_fallback_provider || "serpapi";
    const isDisabled = provider === "disabled";

    return {
      enable_agent_3: !isDisabled && Boolean(config.enable_agent_3),
      lens_enabled: !isDisabled && Boolean(config.lens_enabled),

      lens_provider: provider,
      agent3_provider: provider,

      agent3_v1_enabled: Boolean(config.agent3_v1_enabled),
      agent3_v2_enabled: Boolean(config.agent3_v2_enabled),

      lens_fallback_enabled: Boolean(config.lens_fallback_enabled),
      lens_fallback_provider: fallbackProvider,
      agent3_fallback_enabled: Boolean(config.lens_fallback_enabled),
      agent3_fallback_provider: fallbackProvider,

      api_key: config.api_key || config.serpapi_api_key || "",
      serpapi_api_key: config.serpapi_api_key || config.api_key || "",
      imgbb_api_key: config.imgbb_api_key || "",
      proxy_url: config.proxy_url || "",

      language_code: config.language_code || "vi",
      country_code: config.country_code || "vn",

      max_results: Number(config.max_results || 5),
      max_visual_matches: Number(config.max_visual_matches || 10),
      max_exact_matches: Number(config.max_exact_matches || 5),
      request_timeout_seconds: Number(config.request_timeout_seconds || 30),

      no_cache: Boolean(config.no_cache),
      raw_fallback_enabled: Boolean(config.raw_fallback_enabled),
      formatter_model: config.formatter_model || "gemini-2.5-flash",
    };
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      await updateLensConfig(buildPayload());
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

    setConfig((prev) => {
      const next = {
        ...prev,
        [name]: type === "checkbox" ? checked : type === "number" ? Number(value) : value,
      };

      if (name === "lens_provider") {
        next.agent3_provider = value;

        if (value === "disabled") {
          next.enable_agent_3 = false;
          next.lens_enabled = false;
        } else {
          next.enable_agent_3 = true;
          next.lens_enabled = true;
        }
      }

      if (name === "lens_fallback_provider") {
        next.agent3_fallback_provider = value;
      }

      return next;
    });
  };

  const toggle = (name) => {
    setConfig((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const cardBg = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const textMain = isDark ? "text-white" : "text-slate-900";
  const inputCls = `w-full h-11 px-4 rounded-xl border outline-none transition-colors ${
    isDark
      ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500"
      : "bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500 focus:bg-white"
  }`;

  const ToggleRow = ({ label, field }) => (
    <button
      type="button"
      onClick={() => toggle(field)}
      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between gap-4 transition-colors ${
        config[field]
          ? "border-teal-300 bg-teal-50/50 dark:bg-teal-900/20 dark:border-teal-800"
          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
      }`}
    >
      <span className={`font-black ${textMain}`}>{label}</span>
      <span
        className={`w-11 h-6 rounded-full p-1 transition-colors ${
          config[field] ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
            config[field] ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Loader2 className="animate-spin mx-auto mb-2" /> Loading...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${textMain} flex items-center gap-2`}>
            <ScanSearch className="text-teal-600" /> {t.title}
          </h1>
          <p className="mt-1 text-slate-500 text-sm max-w-3xl">{t.desc}</p>
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

      <form onSubmit={handleSave} className={`p-6 md:p-8 rounded-3xl border shadow-sm ${cardBg} space-y-8`}>
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Route className="text-teal-600" size={18} />
            <h2 className={`text-lg font-black ${textMain}`}>{t.provider}</h2>
          </div>
          <p className="text-sm text-slate-500">{t.providerDesc}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { value: "serpapi", label: t.serpapi },
              { value: "selenium", label: t.selenium },
              { value: "disabled", label: t.disabled },
            ].map((option) => (
              <label
                key={option.value}
                className={`p-4 rounded-2xl border cursor-pointer font-black transition-colors ${
                  config.lens_provider === option.value
                    ? "border-teal-400 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300"
                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-300"
                }`}
              >
                <input
                  type="radio"
                  name="lens_provider"
                  value={option.value}
                  checked={config.lens_provider === option.value}
                  onChange={handleChange}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ToggleRow label={t.enableAgent3} field="enable_agent_3" />
            <ToggleRow label={t.enableLens} field="lens_enabled" />
            <ToggleRow label={t.enableV2} field="agent3_v2_enabled" />
          </div>
        </section>

        <section className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-blue-600" size={18} />
            <h2 className={`text-lg font-black ${textMain}`}>Fallback</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToggleRow label={t.fallback} field="lens_fallback_enabled" />

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>
                {t.fallbackProvider}
              </label>
              <select
                name="lens_fallback_provider"
                value={config.lens_fallback_provider || "serpapi"}
                onChange={handleChange}
                className={inputCls}
              >
                <option value="serpapi">SerpApi / v1</option>
                <option value="selenium">Selenium / v2</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className={`text-lg font-black ${textMain}`}>API / Upload</h2>

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
              <input
                type="text"
                name="proxy_url"
                value={config.proxy_url || ""}
                onChange={handleChange}
                className={inputCls}
                placeholder="http://host:port hoặc socks5://host:port"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
          <h2 className={`text-lg font-black ${textMain}`}>Lens Options</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.maxVisual}</label>
              <input type="number" min="1" name="max_visual_matches" value={config.max_visual_matches || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.maxExact}</label>
              <input type="number" min="1" name="max_exact_matches" value={config.max_exact_matches || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.timeout}</label>
              <input type="number" min="5" name="request_timeout_seconds" value={config.request_timeout_seconds || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.formatterModel}</label>
              <input type="text" name="formatter_model" value={config.formatter_model || ""} onChange={handleChange} className={inputCls} />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <ToggleRow label={t.noCache} field="no_cache" />
              <ToggleRow label={t.rawFallback} field="raw_fallback_enabled" />
            </div>
          </div>
        </section>

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
  );
}
