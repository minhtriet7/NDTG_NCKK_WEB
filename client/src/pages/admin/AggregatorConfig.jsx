import React, { useState, useEffect } from "react";
import { Save, Loader2, AlertCircle, GitMerge, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";
import { getAggregatorConfig, updateAggregatorConfig } from "../../services/adminService";

const DEFAULT_CONFIG = {
  enabled: true,
  strategy: "majority_vote",
  min_consensus_ratio: 0.66,
  ml_weight: 1.0,
  llm_weight: 1.0,
  lens_weight: 1.0,
  require_country_match: true,
  require_currency_match: true,
  conflict_policy: "needs_review",
  allow_partial_consensus: true,
};

function normalizeConfig(data) {
  const cfg = data?.config || data?.settings || data?.data || data || {};
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    enabled: cfg.enabled !== false,
    min_consensus_ratio: Number(cfg.min_consensus_ratio ?? DEFAULT_CONFIG.min_consensus_ratio),
    ml_weight: Number(cfg.ml_weight ?? DEFAULT_CONFIG.ml_weight),
    llm_weight: Number(cfg.llm_weight ?? DEFAULT_CONFIG.llm_weight),
    lens_weight: Number(cfg.lens_weight ?? DEFAULT_CONFIG.lens_weight),
  };
}

export default function AggregatorConfig() {
  const { theme, lang } = useAppStore();
  const { token } = useAuthStore();
  const isDark = theme === "dark";

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const t = {
    EN: {
      title: "Aggregator Configuration",
      desc: "Set voting logic, agent weights, conflict policy and final decision rules.",
      enabled: "Enable Aggregator",
      strategy: "Voting Strategy",
      ratio: "Minimum Consensus Ratio (0-1)",
      mlWeight: "ML/DL Weight",
      llmWeight: "LLM/API Weight",
      lensWeight: "Visual Search Weight",
      countryMatch: "Require country match",
      currencyMatch: "Require currency match",
      partial: "Allow partial consensus",
      conflictPolicy: "Conflict Policy",
      save: "Save Changes",
      refresh: "Refresh",
      saving: "Saving...",
      success: "Aggregator configuration updated successfully.",
      loadFailed: "Failed to load aggregator config.",
      saveFailed: "Update failed.",
    },
    VI: {
      title: "Cấu hình Tổng hợp (Aggregator)",
      desc: "Thiết lập logic biểu quyết, trọng số agents, chính sách xung đột và luật chốt kết quả.",
      enabled: "Bật Aggregator",
      strategy: "Chiến lược biểu quyết",
      ratio: "Tỷ lệ đồng thuận tối thiểu (0-1)",
      mlWeight: "Trọng số ML/DL",
      llmWeight: "Trọng số LLM/API",
      lensWeight: "Trọng số Visual Search",
      countryMatch: "Bắt buộc khớp quốc gia",
      currencyMatch: "Bắt buộc khớp mã tiền",
      partial: "Cho phép đồng thuận một phần",
      conflictPolicy: "Chính sách khi xung đột",
      save: "Lưu thay đổi",
      refresh: "Tải lại",
      saving: "Đang lưu...",
      success: "Cập nhật cấu hình thành công.",
      loadFailed: "Không thể tải cấu hình Aggregator.",
      saveFailed: "Cập nhật thất bại.",
    },
  }[lang || "EN"];

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const data = await getAggregatorConfig(token);
      setConfig(normalizeConfig(data));
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || t.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, lang]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);

    const payload = {
      ...config,
      enabled: Boolean(config.enabled),
      min_consensus_ratio: Number(config.min_consensus_ratio),
      ml_weight: Number(config.ml_weight),
      llm_weight: Number(config.llm_weight),
      lens_weight: Number(config.lens_weight),
      require_country_match: Boolean(config.require_country_match),
      require_currency_match: Boolean(config.require_currency_match),
      allow_partial_consensus: Boolean(config.allow_partial_consensus),
    };

    try {
      await updateAggregatorConfig(token, payload);
      toast.success(t.success);
      await fetchConfig();
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
          <p className="mt-1 text-slate-500 max-w-2xl">{t.desc}</p>
        </div>

        <button
          type="button"
          onClick={fetchConfig}
          disabled={loading}
          className={`px-4 py-2.5 rounded-xl border font-bold text-sm flex items-center gap-2 ${cardBg} text-slate-700 dark:text-slate-300 disabled:opacity-60`}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      <div className={`p-6 md:p-8 rounded-xl border shadow-sm ${cardBg}`}>
        <form onSubmit={handleSave} className="space-y-6">
          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
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
            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.strategy}</label>
              <select name="strategy" value={config.strategy} onChange={handleChange} className={inputCls}>
                <option value="majority_vote">Majority Vote</option>
                <option value="unanimous">Unanimous</option>
                <option value="weighted">Weighted Vote</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.ratio}</label>
              <input type="number" step="0.01" min="0" max="1" name="min_consensus_ratio" value={config.min_consensus_ratio} onChange={handleChange} className={inputCls} required />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.mlWeight}</label>
              <input type="number" step="0.1" min="0" name="ml_weight" value={config.ml_weight} onChange={handleChange} className={inputCls} required />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.llmWeight}</label>
              <input type="number" step="0.1" min="0" name="llm_weight" value={config.llm_weight} onChange={handleChange} className={inputCls} required />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.lensWeight}</label>
              <input type="number" step="0.1" min="0" name="lens_weight" value={config.lens_weight} onChange={handleChange} className={inputCls} required />
            </div>

            <div>
              <label className={`block text-sm font-semibold mb-2 ${textMain}`}>{t.conflictPolicy}</label>
              <select name="conflict_policy" value={config.conflict_policy} onChange={handleChange} className={inputCls}>
                <option value="needs_review">Needs Review</option>
                <option value="rerun">Rerun</option>
                <option value="highest_confidence">Highest Confidence</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {[
              ["require_country_match", t.countryMatch],
              ["require_currency_match", t.currencyMatch],
              ["allow_partial_consensus", t.partial],
            ].map(([field, label]) => (
              <label key={field} className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <input type="checkbox" name={field} checked={Boolean(config[field])} onChange={handleChange} className="w-5 h-5 accent-teal-600" />
                <span className={`text-sm font-bold ${textMain}`}>{label}</span>
              </label>
            ))}
          </div>

          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 flex gap-3 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p>
              Majority vote nên giữ min_consensus_ratio khoảng 0.66 để chấp nhận 2/3 agents. Weighted vote dùng khi muốn ưu tiên Agent 1 hoặc Agent 2.
            </p>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 disabled:opacity-70 shadow-sm">
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? t.saving : t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
