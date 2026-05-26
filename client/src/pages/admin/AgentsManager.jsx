import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import { getAgentsOverview } from "../../services/adminService";
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Cpu,
} from "lucide-react";
import toast from "react-hot-toast";

const AGENT_ROUTE_MAP = {
  agent_1_ml_dl: "/admin/agents/ai-model",
  agent_1: "/admin/agents/ai-model",
  yolo: "/admin/agents/ai-model",
  ml: "/admin/agents/ai-model",
  agent_2_llm: "/admin/agents/llm",
  agent_2: "/admin/agents/llm",
  llm: "/admin/agents/llm",
  gemini: "/admin/agents/llm",
  agent_3_lens: "/admin/agents/google-lens",
  agent_3: "/admin/agents/google-lens",
  lens: "/admin/agents/google-lens",
  visual: "/admin/agents/google-lens",
  aggregator: "/admin/agents/aggregator",
};

function normalizeList(data) {
  const root = data?.data || data;
  const list = Array.isArray(root)
    ? root
    : Array.isArray(root?.items)
      ? root.items
      : Array.isArray(root?.agents)
        ? root.agents
        : Array.isArray(root?.results)
          ? root.results
          : [];

  return list.map((agent) => {
    const rawKey = String(agent?.key || agent?.agent_key || agent?.agent || agent?.name || "").toLowerCase();
    const routeKey = Object.keys(AGENT_ROUTE_MAP).find((key) => rawKey.includes(key));
    return {
      ...agent,
      key: agent?.key || agent?.agent_key || agent?.agent || rawKey || "agent",
      name: agent?.name || agent?.agent_name || agent?.title || agent?.key || "Agent",
      role: agent?.role || agent?.description || agent?.purpose || "N/A",
      status: agent?.status || agent?.health_status || agent?.state || "unknown",
      last_run_at: agent?.last_run_at || agent?.updated_at || agent?.last_checked_at,
      latency_ms: agent?.latency_ms ?? agent?.avg_latency_ms ?? agent?.response_time_ms ?? null,
      success_rate: agent?.success_rate ?? agent?.success_ratio ?? agent?.successRate ?? null,
      route: agent?.route || (routeKey ? AGENT_ROUTE_MAP[routeKey] : "/admin/agents/config"),
    };
  });
}

function normalizeSummary(data) {
  const root = data?.data || data || {};
  return root.summary || root.kpis || root.overview || null;
}

function formatSuccessRate(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  return num <= 1 ? `${Math.round(num * 100)}%` : `${Math.round(num)}%`;
}

export default function AgentsManager() {
  const navigate = useNavigate();
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [agents, setAgents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const t = {
    EN: {
      title: "Agents Manager",
      subtitle: "Monitor the health, runtime status, and recent behavior of the multi-agent recognition pipeline.",
      refresh: "Refresh",
      configure: "Configure",
      online: "Online",
      offline: "Offline",
      warning: "Warning",
      totalAgents: "Total Agents",
      onlineAgents: "Online Agents",
      warnings: "Warnings",
      avgLatency: "Avg Latency",
      agent: "Agent",
      role: "Role",
      status: "Status",
      lastRun: "Last Run",
      latency: "Latency",
      successRate: "Success Rate",
      action: "Action",
      noAgents: "No agent status found",
      noAgentsDesc: "Agent health data will appear after the backend reports pipeline status.",
      loading: "Loading agents...",
      failed: "Failed to load agents.",
    },
    VI: {
      title: "Quản lý Agents",
      subtitle: "Theo dõi trạng thái, sức khỏe và hoạt động gần đây của pipeline nhận diện đa tác tử.",
      refresh: "Tải lại",
      configure: "Cấu hình",
      online: "Hoạt động",
      offline: "Tắt",
      warning: "Cảnh báo",
      totalAgents: "Tổng Agents",
      onlineAgents: "Đang hoạt động",
      warnings: "Cảnh báo",
      avgLatency: "Độ trễ TB",
      agent: "Agent",
      role: "Vai trò",
      status: "Trạng thái",
      lastRun: "Lần chạy cuối",
      latency: "Độ trễ",
      successRate: "Tỷ lệ thành công",
      action: "Thao tác",
      noAgents: "Chưa có trạng thái Agent",
      noAgentsDesc: "Dữ liệu sức khỏe Agent sẽ hiển thị khi backend trả trạng thái pipeline.",
      loading: "Đang tải Agents...",
      failed: "Không thể tải Agents.",
    },
  }[lang || "EN"];

  const fallbackAgents = [
    {
      key: "agent_1_ml_dl",
      name: "Agent 1 ML/DL",
      role: "YOLO + RES Classifier",
      status: "unknown",
      last_run_at: null,
      latency_ms: null,
      success_rate: null,
      route: "/admin/agents/ai-model",
    },
    {
      key: "agent_2_llm",
      name: "Agent 2 Gemini LLM",
      role: "Gemini image reasoning",
      status: "unknown",
      last_run_at: null,
      latency_ms: null,
      success_rate: null,
      route: "/admin/agents/llm",
    },
    {
      key: "agent_3_lens",
      name: "Agent 3 Visual Search",
      role: "ImgBB + SerpApi Google Lens",
      status: "unknown",
      last_run_at: null,
      latency_ms: null,
      success_rate: null,
      route: "/admin/agents/google-lens",
    },
    {
      key: "aggregator",
      name: "Aggregator",
      role: "Rule-based majority vote",
      status: "unknown",
      last_run_at: null,
      latency_ms: null,
      success_rate: null,
      route: "/admin/agents/aggregator",
    },
  ];

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getAgentsOverview();
      const list = normalizeList(data);
      setAgents(list.length ? list : fallbackAgents);
      setSummary(normalizeSummary(data));
    } catch (error) {
      console.error(error);
      toast.error(t.failed);
      setAgents(fallbackAgents);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const kpis = useMemo(() => {
    const total = agents.length;
    const online = agents.filter((a) =>
      ["online", "healthy", "active", "ok"].includes(String(a.status || "").toLowerCase())
    ).length;
    const warnings = agents.filter((a) =>
      ["warning", "degraded", "missing_key", "quota_error"].includes(String(a.status || "").toLowerCase())
    ).length;

    const latencyValues = agents
      .map((a) => Number(a.latency_ms))
      .filter((n) => Number.isFinite(n) && n > 0);

    const avgLatency =
      latencyValues.length > 0
        ? Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length)
        : null;

    return {
      total: summary?.total_agents ?? total,
      online: summary?.online_agents ?? online,
      warnings: summary?.warnings ?? warnings,
      avgLatency: summary?.avg_latency_ms ?? avgLatency,
    };
  }, [agents, summary]);

  const formatDate = (value) => {
    if (!value) return "N/A";
    try {
      return new Intl.DateTimeFormat(lang === "VI" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return "N/A";
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || "unknown").toLowerCase();

    if (["online", "healthy", "active", "ok"].includes(s)) {
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    }

    if (["warning", "degraded", "missing_key", "quota_error"].includes(s)) {
      return "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    }

    if (["offline", "failed", "error"].includes(s)) {
      return "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
    }

    return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
  };

  const cardClass = isDark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
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

        <button
          onClick={loadData}
          disabled={isLoading}
          className={`h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 transition-colors ${cardClass} text-slate-700 dark:text-slate-300 hover:border-teal-400 disabled:opacity-60`}
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          {t.refresh}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: t.totalAgents, value: kpis.total, icon: Cpu, tone: "text-slate-900 dark:text-white" },
          { label: t.onlineAgents, value: kpis.online, icon: CheckCircle2, tone: "text-teal-600 dark:text-teal-400" },
          { label: t.warnings, value: kpis.warnings, icon: AlertTriangle, tone: kpis.warnings > 0 ? "text-amber-500" : "text-emerald-500" },
          { label: t.avgLatency, value: kpis.avgLatency ? `${kpis.avgLatency}ms` : "N/A", icon: Activity, tone: "text-blue-600 dark:text-blue-400" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={`p-5 rounded-3xl border shadow-sm ${cardClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">
                    {item.label}
                  </div>
                  <div className={`text-3xl font-black ${item.tone}`}>{item.value}</div>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`rounded-3xl border shadow-sm overflow-hidden ${cardClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="uppercase text-[10px] font-black tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <tr>
                <th className="px-6 py-4">{t.agent}</th>
                <th className="px-6 py-4">{t.role}</th>
                <th className="px-6 py-4">{t.status}</th>
                <th className="px-6 py-4">{t.lastRun}</th>
                <th className="px-6 py-4">{t.latency}</th>
                <th className="px-6 py-4">{t.successRate}</th>
                <th className="px-6 py-4 text-right">{t.action}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index}>
                    {Array.from({ length: 7 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="px-6 py-5">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center">
                    <div className="text-lg font-black text-slate-900 dark:text-white">{t.noAgents}</div>
                    <div className="text-sm text-slate-500 mt-2">{t.noAgentsDesc}</div>
                  </td>
                </tr>
              ) : (
                agents.map((agent, index) => (
                  <tr key={agent.id || agent.key || index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-5">
                      <div className="font-black text-slate-900 dark:text-white">
                        {agent.name || agent.agent_name || agent.key}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {agent.key || agent.agent_key || "agent"}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-slate-600 dark:text-slate-300">
                      {agent.role || agent.description || "N/A"}
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${getStatusBadge(agent.status)}`}>
                        {agent.status || "unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-slate-600 dark:text-slate-300">
                      {formatDate(agent.last_run_at || agent.updated_at)}
                    </td>
                    <td className="px-6 py-5 font-mono text-slate-600 dark:text-slate-300">
                      {agent.latency_ms ? `${agent.latency_ms}ms` : "N/A"}
                    </td>
                    <td className="px-6 py-5 font-mono text-teal-600 dark:text-teal-400 font-black">
                      {agent.success_rate !== null && agent.success_rate !== undefined
                        ? formatSuccessRate(agent.success_rate)
                        : "N/A"}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button
                        onClick={() => navigate(agent.route || "/admin/agents/config")}
                        className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 font-bold text-xs transition-colors"
                      >
                        <Settings size={14} />
                        {t.configure}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}