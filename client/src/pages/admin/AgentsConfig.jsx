import React, { useEffect, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { getAgentsConfig, updateAgentsConfig } from "../../services/adminService";
import { RefreshCw, Save, Settings, Timer, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";

export default function AgentsConfig() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    enable_agent_1: true,
    enable_agent_2: true,
    enable_agent_3: true,
    enable_aggregator: true,
    parallel_execution: true,
    retry_failed_agents: true,
    save_raw_agent_output: true,
    agent_timeout_seconds: 60,
    max_retry_count: 1,
  });

  const t = {
    EN: {
      title: "Agents Config",
      subtitle: "Control which agents run, how long they can run, and how the pipeline handles failures.",
      refresh: "Refresh",
      save: "Save Changes",
      saving: "Saving...",
      pipeline: "Pipeline switches",
      runtime: "Runtime behavior",
      agent1: "Enable Agent 1 ML/DL",
      agent2: "Enable Agent 2 LLM",
      agent3: "Enable Agent 3 Visual Search",
      aggregator: "Enable Aggregator",
      parallel: "Run agents in parallel",
      retry: "Retry failed agents",
      raw: "Save raw agent outputs",
      timeout: "Agent timeout seconds",
      retries: "Max retry count",
      saved: "Agent configuration saved.",
      failedLoad: "Failed to load agent configuration.",
      failedSave: "Failed to save agent configuration.",
    },
    VI: {
      title: "Cấu hình Agents",
      subtitle: "Điều khiển Agent nào được chạy, thời gian chạy tối đa và cách pipeline xử lý lỗi.",
      refresh: "Tải lại",
      save: "Lưu thay đổi",
      saving: "Đang lưu...",
      pipeline: "Công tắc pipeline",
      runtime: "Cách chạy hệ thống",
      agent1: "Bật Agent 1 ML/DL",
      agent2: "Bật Agent 2 LLM",
      agent3: "Bật Agent 3 Visual Search",
      aggregator: "Bật Aggregator",
      parallel: "Chạy agents song song",
      retry: "Thử lại agent bị lỗi",
      raw: "Lưu raw output của agents",
      timeout: "Timeout mỗi agent, giây",
      retries: "Số lần retry tối đa",
      saved: "Đã lưu cấu hình agents.",
      failedLoad: "Không thể tải cấu hình agents.",
      failedSave: "Không thể lưu cấu hình agents.",
    },
  }[lang || "EN"];

  const cardClass = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const inputClass = isDark
    ? "bg-slate-950 border-slate-800 text-white"
    : "bg-slate-50 border-slate-200 text-slate-900";

  const normalizeConfig = (data) => data?.config || data?.settings || data?.data || data || {};

  const buildPayload = () => ({
    enable_agent_1: Boolean(form.enable_agent_1),
    enable_agent_2: Boolean(form.enable_agent_2),
    enable_agent_3: Boolean(form.enable_agent_3),
    enable_aggregator: Boolean(form.enable_aggregator),
    parallel_execution: Boolean(form.parallel_execution),
    retry_failed_agents: Boolean(form.retry_failed_agents),
    save_raw_agent_output: Boolean(form.save_raw_agent_output),
    agent_timeout_seconds: Number(form.agent_timeout_seconds || 60),
    max_retry_count: Number(form.max_retry_count || 0),
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getAgentsConfig();
      setForm((prev) => ({ ...prev, ...normalizeConfig(data) }));
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

  const handleToggle = (key) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateAgentsConfig(buildPayload());
      toast.success(t.saved);
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || t.failedSave);
    } finally {
      setIsSaving(false);
    }
  };

  const ToggleRow = ({ label, field, desc }) => (
    <button
      type="button"
      onClick={() => handleToggle(field)}
      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between gap-4 transition-colors ${
        form[field]
          ? "border-teal-300 bg-teal-50/50 dark:bg-teal-900/20 dark:border-teal-800"
          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
      }`}
    >
      <div>
        <div className="font-black text-slate-900 dark:text-white">{label}</div>
        {desc && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{desc}</div>}
      </div>
      <div
        className={`w-11 h-6 rounded-full p-1 transition-colors ${
          form[field] ? "bg-teal-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white transition-transform ${
            form[field] ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  );

  return (
    <form onSubmit={handleSave} className="w-full max-w-[1200px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-5 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400 mb-2">
            AI Agents
          </p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            {t.subtitle}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className={`h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 ${cardClass} text-slate-700 dark:text-slate-300 disabled:opacity-60`}
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            {t.refresh}
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="h-11 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? t.saving : t.save}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className={`rounded-3xl border shadow-sm p-6 space-y-4 ${cardClass}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400">
              <Settings size={18} />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{t.pipeline}</h2>
          </div>

          <ToggleRow label={t.agent1} field="enable_agent_1" />
          <ToggleRow label={t.agent2} field="enable_agent_2" />
          <ToggleRow label={t.agent3} field="enable_agent_3" />
          <ToggleRow label={t.aggregator} field="enable_aggregator" />
        </div>

        <div className={`rounded-3xl border shadow-sm p-6 space-y-4 ${cardClass}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Timer size={18} />
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">{t.runtime}</h2>
          </div>

          <ToggleRow label={t.parallel} field="parallel_execution" />
          <ToggleRow label={t.retry} field="retry_failed_agents" />
          <ToggleRow label={t.raw} field="save_raw_agent_output" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">
                {t.timeout}
              </label>
              <input
                type="number"
                min="5"
                value={form.agent_timeout_seconds}
                onChange={(e) =>
                  setForm({ ...form, agent_timeout_seconds: Number(e.target.value) })
                }
                className={`w-full h-12 px-4 rounded-2xl border outline-none font-mono font-bold ${inputClass}`}
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 mb-2 block">
                {t.retries}
              </label>
              <input
                type="number"
                min="0"
                value={form.max_retry_count}
                onChange={(e) =>
                  setForm({ ...form, max_retry_count: Number(e.target.value) })
                }
                className={`w-full h-12 px-4 rounded-2xl border outline-none font-mono font-bold ${inputClass}`}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 flex gap-3 text-sm text-slate-500 dark:text-slate-400">
            <RotateCcw size={16} className="mt-0.5 shrink-0" />
            <p>
              Timeout và retry nên đặt vừa phải để tránh giữ request scan quá lâu khi API Gemini hoặc Lens bị quota.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}