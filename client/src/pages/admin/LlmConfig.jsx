import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { getLlmConfig, updateLlmConfig } from "../../services/adminService";
import { Brain, RefreshCw, Save, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

export default function LlmConfig() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [form, setForm] = useState({
    enabled: true,
    api_key_configured: false,
    main_model: "gemini-2.5-flash",
    fallback_models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    max_attempts_per_model: 2,
    temperature: 0.1,
    response_mime_type: "application/json",
    quota_fallback_enabled: true,
    prompt_template: "",
  });

  const [fallbackText, setFallbackText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const t = {
    EN: {
      title: "LLM Config",
      subtitle: "Configure Agent 2 Gemini model, fallback behavior, and structured JSON response settings.",
      refresh: "Refresh",
      save: "Save Changes",
      saving: "Saving...",
      model: "Model settings",
      safety: "Fallback and format",
      enabled: "Enable Agent 2 Gemini LLM",
      apiKey: "Google API Key",
      configured: "Configured",
      missing: "Missing",
      mainModel: "Main model",
      fallbackModels: "Fallback models",
      attempts: "Max attempts per model",
      temperature: "Temperature",
      mime: "Response MIME type",
      quotaFallback: "Switch model when quota is exceeded",
      prompt: "Prompt template override",
      saved: "LLM configuration saved.",
      failedLoad: "Failed to load LLM config.",
      failedSave: "Failed to save LLM config.",
    },
    VI: {
      title: "Cấu hình LLM",
      subtitle: "Cấu hình Agent 2 Gemini, model dự phòng và định dạng JSON có cấu trúc.",
      refresh: "Tải lại",
      save: "Lưu thay đổi",
      saving: "Đang lưu...",
      model: "Thiết lập model",
      safety: "Dự phòng và định dạng",
      enabled: "Bật Agent 2 Gemini LLM",
      apiKey: "Google API Key",
      configured: "Đã cấu hình",
      missing: "Thiếu",
      mainModel: "Model chính",
      fallbackModels: "Model dự phòng",
      attempts: "Số lần thử mỗi model",
      temperature: "Temperature",
      mime: "Response MIME type",
      quotaFallback: "Đổi model khi hết quota",
      prompt: "Prompt template ghi đè",
      saved: "Đã lưu cấu hình LLM.",
      failedLoad: "Không thể tải cấu hình LLM.",
      failedSave: "Không thể lưu cấu hình LLM.",
    },
  }[lang || "EN"];

  const cardClass = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const inputClass = isDark
    ? "bg-slate-950 border-slate-800 text-white"
    : "bg-slate-50 border-slate-200 text-slate-900";

  const normalizeConfig = (data) => {
    const cfg = data?.config || data?.settings || data?.data || data || {};
    return {
      ...cfg,
      fallback_models: Array.isArray(cfg.fallback_models)
        ? cfg.fallback_models
        : String(cfg.fallback_models || "")
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean),
    };
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getLlmConfig();
      const next = { ...form, ...normalizeConfig(data) };
      setForm(next);
      setFallbackText(Array.isArray(next.fallback_models) ? next.fallback_models.join("\n") : "");
    } catch (error) {
      console.error(error);
      toast.error(t.failedLoad);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const handleSave = async (e) => {
    e.preventDefault();

    const fallbackModels = fallbackText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    setIsSaving(true);
    try {
      await updateLlmConfig({
        ...form,
        fallback_models: fallbackModels,
        max_attempts_per_model: Number(form.max_attempts_per_model),
        temperature: Number(form.temperature),
        enabled: Boolean(form.enabled),
        quota_fallback_enabled: Boolean(form.quota_fallback_enabled),
      });
      toast.success(t.saved);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || t.failedSave);
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = (field) => setForm((prev) => ({ ...prev, [field]: !prev[field] }));

  return (
    <form onSubmit={handleSave} className="w-full max-w-[1200px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-5 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400 mb-2">
            Agent 2 Gemini
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">{t.subtitle}</p>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={loadData} disabled={isLoading} className={`h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 ${cardClass} text-slate-700 dark:text-slate-300 disabled:opacity-60`}>
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            {t.refresh}
          </button>
          <button type="submit" disabled={isSaving} className="h-11 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-sm flex items-center gap-2 disabled:opacity-60">
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? t.saving : t.save}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className={`rounded-xl border shadow-sm p-6 space-y-5 ${cardClass}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
              <Brain size={18} />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{t.model}</h2>
          </div>

          <button
            type="button"
            onClick={() => toggle("enabled")}
            className={`w-full p-4 rounded-xl border flex justify-between items-center ${form.enabled ? "border-teal-300 bg-teal-50/50 dark:bg-teal-900/20" : "border-slate-200 dark:border-slate-800"}`}
          >
            <span className="font-black text-slate-900 dark:text-white">{t.enabled}</span>
            <div className={`w-11 h-6 rounded-full p-1 ${form.enabled ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"}`}>
              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${form.enabled ? "translate-x-5" : ""}`} />
            </div>
          </button>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-black text-slate-900 dark:text-white">{t.apiKey}</div>
              <div className="text-xs text-slate-500 mt-1">{form.api_key_configured ? t.configured : t.missing}</div>
            </div>
            <ShieldCheck className={form.api_key_configured ? "text-emerald-500" : "text-rose-500"} size={22} />
          </div>

          <div>
            <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">{t.mainModel}</label>
            <input
              value={form.main_model}
              onChange={(e) => setForm({ ...form, main_model: e.target.value })}
              className={`w-full h-12 px-4 rounded-xl border outline-none text-sm font-semibold ${inputClass}`}
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">{t.fallbackModels}</label>
            <textarea
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              rows={4}
              className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-mono ${inputClass}`}
            />
          </div>
        </div>

        <div className={`rounded-xl border shadow-sm p-6 space-y-5 ${cardClass}`}>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">{t.safety}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">{t.attempts}</label>
              <input
                type="number"
                min="1"
                value={form.max_attempts_per_model}
                onChange={(e) => setForm({ ...form, max_attempts_per_model: Number(e.target.value) })}
                className={`w-full h-12 px-4 rounded-xl border outline-none font-mono font-bold ${inputClass}`}
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">{t.temperature}</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                className={`w-full h-12 px-4 rounded-xl border outline-none font-mono font-bold ${inputClass}`}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">{t.mime}</label>
            <input
              value={form.response_mime_type}
              onChange={(e) => setForm({ ...form, response_mime_type: e.target.value })}
              className={`w-full h-12 px-4 rounded-xl border outline-none text-sm font-semibold ${inputClass}`}
            />
          </div>

          <button
            type="button"
            onClick={() => toggle("quota_fallback_enabled")}
            className={`w-full p-4 rounded-xl border flex justify-between items-center ${form.quota_fallback_enabled ? "border-teal-300 bg-teal-50/50 dark:bg-teal-900/20" : "border-slate-200 dark:border-slate-800"}`}
          >
            <span className="font-black text-slate-900 dark:text-white">{t.quotaFallback}</span>
            <div className={`w-11 h-6 rounded-full p-1 ${form.quota_fallback_enabled ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"}`}>
              <div className={`w-4 h-4 bg-white rounded-full transition-transform ${form.quota_fallback_enabled ? "translate-x-5" : ""}`} />
            </div>
          </button>

          <div>
            <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">{t.prompt}</label>
            <textarea
              value={form.prompt_template || ""}
              onChange={(e) => setForm({ ...form, prompt_template: e.target.value })}
              rows={8}
              placeholder="Optional. Leave empty to use backend default prompt."
              className={`w-full px-4 py-3 rounded-xl border outline-none text-sm ${inputClass}`}
            />
          </div>
        </div>
      </div>
    </form>
  );
}