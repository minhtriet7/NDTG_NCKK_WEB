import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import {
  Layers,
  Users,
  Scan,
  Landmark,
  MessageSquare,
  Shield,
  Activity,
  Cpu,
  BotMessageSquare,
  SearchCheck,
  GitMerge,
  Clock,
  ArrowRightLeft,
  Database,
  Terminal,
  Settings,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  FileText,
  FileImage,
} from "lucide-react";
import {
  getDashboardSummary,
  getSystemHealth,
  getAgentPerformance,
  getRecentScans,
  getPendingFeedback,
} from "../../services/adminService";
import toast from "react-hot-toast";


function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function unwrap(data) {
  return data?.data && !Array.isArray(data.data) ? data.data : data;
}

function normalizeSummary(data) {
  const raw = unwrap(data) || {};
  const kpis = raw.kpis || raw.summary || raw;

  return {
    ...raw,
    kpis: {
      total_users: Number(kpis.total_users ?? kpis.users_count ?? kpis.users ?? 0),
      active_users: Number(kpis.active_users ?? kpis.active_users_count ?? 0),
      total_scans: Number(kpis.total_scans ?? kpis.scans_count ?? kpis.recognition_count ?? 0),
      completed_scans: Number(kpis.completed_scans ?? kpis.success_scans ?? 0),
      total_revenue_vnd: Number(kpis.total_revenue_vnd ?? kpis.revenue_vnd ?? kpis.revenue ?? 0),
      pending_feedback: Number(kpis.pending_feedback ?? kpis.pending_feedback_count ?? 0),
      tokens_sold: Number(kpis.tokens_sold ?? 0),
      ...(raw.kpis || {}),
    },
    payments: raw.payments || {},
    users_breakdown: raw.users_breakdown || raw.user_breakdown || {},
    banknotes_breakdown: raw.banknotes_breakdown || raw.banknote_breakdown || {},
    last_updated: raw.last_updated || raw.updated_at || new Date().toISOString(),
  };
}

function normalizeHealth(data) {
  const raw = unwrap(data) || {};
  return {
    api_server: raw.api_server || raw.api || raw.backend || raw.status || "online",
    database: raw.database || raw.db || "online",
    ml_dl_agent: raw.ml_dl_agent || raw.yolo || raw.agent_1 || "online",
    llm_agent: raw.llm_agent || raw.llm || raw.agent_2 || "online",
    google_lens_agent: raw.google_lens_agent || raw.lens || raw.agent_3 || "online",
    aggregator: raw.aggregator || raw.agent_aggregator || "online",
    ...raw,
  };
}

function normalizePerformance(data) {
  const raw = unwrap(data) || {};
  return {
    ml_dl_success_rate: Number(raw.ml_dl_success_rate ?? raw.yolo_success_rate ?? raw.agent_1_success_rate ?? 0),
    llm_success_rate: Number(raw.llm_success_rate ?? raw.agent_2_success_rate ?? 0),
    lens_success_rate: Number(raw.lens_success_rate ?? raw.google_lens_success_rate ?? raw.agent_3_success_rate ?? 0),
    consensus_rate: Number(raw.consensus_rate ?? raw.aggregator_success_rate ?? 0),
    conflict_rate: Number(raw.conflict_rate ?? 0),
    average_scan_time_sec: raw.average_scan_time_sec ?? raw.avg_scan_time_sec ?? raw.average_processing_time_sec ?? "0.0",
    ...raw,
  };
}

function getScanImage(scan) {
  return scan?.uploaded_image_url || scan?.image_url || scan?.data?.image_url || scan?.result?.uploaded_image_url || "";
}

function getScanDenomination(scan) {
  const final = scan?.final_result || scan?.result?.final_result || scan?.data || {};
  return final.final_denomination || final.menh_gia || final.denomination || scan?.denomination || "N/A";
}

function getScanCountry(scan) {
  const final = scan?.final_result || scan?.result?.final_result || scan?.data || {};
  return final.quoc_gia || final.country || scan?.country || "N/A";
}

function getScanConsensus(scan) {
  const final = scan?.final_result || scan?.result?.final_result || {};
  return Number(final.matched_agents || final.so_luong_dong_thuan || scan?.matched_agents || scan?.consensus?.matched_agents || 0);
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [pendingFeedback, setPendingFeedback] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const t = {
    EN: {
      title: "Admin Dashboard",
      subtitle:
        "Monitor users, scans, payments, feedback, and multi-agent system health.",
      refresh: "Refresh",
      kpiUsers: "Total Users",
      kpiActive: "Active Users",
      kpiScans: "Total Scans",
      kpiCompleted: "Completed Scans",
      kpiRevenue: "Token Revenue",
      kpiFeedback: "Pending Feedback",
      secHealth: "System Health Status",
      secPerf: "Multi-Agent Performance Metrics",
      secRecent: "Recent Recognition Requests",
      secFeed: "Pending Feedback",
      secFin: "Financial & Token Packages",
      secUser: "User Breakdown",
      secBanknote: "Banknote Inventory",
      quickAct: "Administrative Shortcuts",
      thTime: "Time",
      thUser: "User",
      thImage: "Image",
      thResult: "Final Result",
      thCountry: "Country",
      thConsensus: "Consensus",
      thStatus: "Status",
      thAction: "Action",
      noData: "No records found.",
      viewLogs: "View Logs",
      agentConfig: "Agent Config",
      review: "Review",
    },
    VI: {
      title: "Bảng Điều Khiển Quản Trị",
      subtitle:
        "Theo dõi người dùng, lượt quét, thanh toán, phản hồi và hệ thống Multi-Agent.",
      refresh: "Làm mới",
      kpiUsers: "Tổng người dùng",
      kpiActive: "Đang hoạt động",
      kpiScans: "Tổng lượt quét",
      kpiCompleted: "Quét thành công",
      kpiRevenue: "Doanh thu Token",
      kpiFeedback: "Phản hồi chờ duyệt",
      secHealth: "Sức Khỏe Hệ Thống",
      secPerf: "Hiệu Suất Multi-Agent",
      secRecent: "Yêu Cầu Quét Gần Đây",
      secFeed: "Phản Hồi Mới",
      secFin: "Tài Chính & Gói Token",
      secUser: "Cơ Cấu Người Dùng",
      secBanknote: "Kho Dữ Liệu Tiền Giấy",
      quickAct: "Phím Tắt Nhanh",
      thTime: "TG",
      thUser: "User",
      thImage: "Ảnh",
      thResult: "Kết quả",
      thCountry: "Quốc gia",
      thConsensus: "Đồng thuận",
      thStatus: "Trạng thái",
      thAction: "Tác vụ",
      noData: "Chưa có dữ liệu.",
      viewLogs: "Xem Nhật ký",
      agentConfig: "Cấu hình AI",
      review: "Xem",
    },
  }[lang || "EN"];

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [rSum, rHealth, rPerf, rScans, rFeed] = await Promise.all([
        getDashboardSummary(),
        getSystemHealth(),
        getAgentPerformance(),
        getRecentScans(8),
        getPendingFeedback(5),
      ]);

      setSummary(normalizeSummary(rSum));
      setHealth(normalizeHealth(rHealth));
      setPerformance(normalizePerformance(rPerf));
      setRecentScans(asArray(rScans));
      setPendingFeedback(asArray(rFeed));
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Failed to load dashboard data.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [lang]);

  const formatVND = (val) =>
    new Intl.NumberFormat("vi-VN").format(Number(val || 0)) + " đ";

  const renderHealthBadge = (status) => {
    const s = (status || "").toLowerCase();
    if (s === "online" || s === "connected")
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
          Online
        </span>
      );
    if (s.includes("warning"))
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          Warning
        </span>
      );
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
        Down
      </span>
    );
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {t.subtitle}
          </p>
          {summary?.last_updated && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Clock size={12} /> Last Sync:{" "}
              {new Date(summary.last_updated).toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={loadData}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 transition w-fit"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />{" "}
          {t.refresh}
        </button>
      </div>

      {/* 2. KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          isDark={isDark}
          load={isLoading}
          title={t.kpiUsers}
          val={summary?.kpis?.total_users}
          icon={<Users className="text-blue-500" />}
        />
        <StatCard
          isDark={isDark}
          load={isLoading}
          title={t.kpiActive}
          val={summary?.kpis?.active_users}
          icon={<Activity className="text-emerald-500" />}
        />
        <StatCard
          isDark={isDark}
          load={isLoading}
          title={t.kpiScans}
          val={summary?.kpis?.total_scans}
          icon={<Scan className="text-indigo-500" />}
        />
        <StatCard
          isDark={isDark}
          load={isLoading}
          title={t.kpiCompleted}
          val={summary?.kpis?.completed_scans}
          icon={<CheckCircle className="text-teal-500" />}
        />
        <StatCard
          isDark={isDark}
          load={isLoading}
          title={t.kpiRevenue}
          val={formatVND(summary?.kpis?.total_revenue_vnd)}
          icon={<Landmark className="text-amber-500" />}
          isPrice
        />
        <StatCard
          isDark={isDark}
          load={isLoading}
          title={t.kpiFeedback}
          val={summary?.kpis?.pending_feedback}
          icon={<MessageSquare className="text-rose-500" />}
        />
      </div>

      {/* 3. HEALTH & PERFORMANCE */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* System Health */}
        <div
          className={`xl:col-span-5 p-5 rounded-2xl border shadow-sm flex flex-col h-full ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
        >
          <h3 className="text-sm font-black uppercase text-slate-500 mb-4 flex items-center gap-2">
            <Database size={16} /> {t.secHealth}
          </h3>
          <div className="space-y-3 flex-1">
            <HealthRow
              label="API Gateway"
              status={health?.api_server}
              render={renderHealthBadge}
            />
            <HealthRow
              label="Database Cluster"
              status={health?.database}
              render={renderHealthBadge}
            />
            <HealthRow
              label="Agent 1 (ML/DL)"
              status={health?.ml_dl_agent}
              render={renderHealthBadge}
            />
            <HealthRow
              label="Agent 2 (LLM)"
              status={health?.llm_agent}
              render={renderHealthBadge}
            />
            <HealthRow
              label="Agent 3 (Lens)"
              status={health?.google_lens_agent}
              render={renderHealthBadge}
            />
            <HealthRow
              label="Aggregator"
              status={health?.aggregator}
              render={renderHealthBadge}
            />
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => navigate("/admin/logs")}
              className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              {t.viewLogs}
            </button>
            <button
              onClick={() => navigate("/admin/agents/config")}
              className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              {t.agentConfig}
            </button>
          </div>
        </div>

        {/* Multi-Agent Performance */}
        <div
          className={`xl:col-span-7 p-5 rounded-2xl border shadow-sm flex flex-col h-full ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
        >
          <h3 className="text-sm font-black uppercase text-slate-500 mb-4 flex items-center gap-2">
            <Shield size={16} /> {t.secPerf}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 flex-1">
            <div className="space-y-4">
              <ProgressRow
                label="Agent 1 ML/DL Rate"
                value={performance?.ml_dl_success_rate}
                icon={<Cpu size={14} className="text-blue-500" />}
              />
              <ProgressRow
                label="Agent 2 LLM Rate"
                value={performance?.llm_success_rate}
                icon={
                  <BotMessageSquare size={14} className="text-violet-500" />
                }
              />
              <ProgressRow
                label="Agent 3 Lens Rate"
                value={performance?.lens_success_rate}
                icon={<SearchCheck size={14} className="text-amber-500" />}
              />
            </div>
            <div className="space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <ProgressRow
                  label="Consensus Reached Ratio"
                  value={performance?.consensus_rate}
                  icon={<GitMerge size={14} className="text-teal-500" />}
                  color="bg-teal-500"
                />
                <ProgressRow
                  label="Agent Conflict Rate"
                  value={performance?.conflict_rate}
                  icon={<AlertCircle size={14} className="text-rose-500" />}
                  color="bg-rose-500"
                />
              </div>
              <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Clock size={14} /> Avg Scan Time
                </span>
                <span className="font-mono font-black text-teal-600 dark:text-teal-400">
                  {performance?.average_scan_time_sec || "0.0"}s
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. RECENT SCANS & FEEDBACK */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Recent Scans Table */}
        <div
          className={`xl:col-span-8 p-5 rounded-2xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
        >
          <h3 className="text-sm font-black uppercase text-slate-500 mb-4 flex items-center gap-2">
            <Terminal size={16} /> {t.secRecent}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3">{t.thTime}</th>
                  <th className="py-2 pr-3">{t.thUser}</th>
                  <th className="py-2 pr-3">{t.thImage}</th>
                  <th className="py-2 pr-3">{t.thResult}</th>
                  <th className="py-2 pr-3">{t.thCountry}</th>
                  <th className="py-2 pr-3">{t.thConsensus}</th>
                  <th className="py-2 text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {recentScans.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-6 text-slate-400">
                      {t.noData}
                    </td>
                  </tr>
                ) : (
                  recentScans.map((s) => (
                    <tr
                      key={s.id || s._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2 pr-3 font-mono text-slate-500">
                        {s.created_at ? new Date(s.created_at).toLocaleTimeString() : "N/A"}
                      </td>
                      <td className="py-2 pr-3 font-semibold text-slate-700 dark:text-slate-300">
                        ...{s.user_id?.slice(-4) || "Gues"}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="w-8 h-5 bg-slate-200 dark:bg-slate-700 rounded overflow-hidden">
                          {getScanImage(s) && (
                            <img
                              src={getScanImage(s)}
                              alt="img"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-bold text-teal-600 dark:text-teal-400">
                        {getScanDenomination(s)}
                      </td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                        {getScanCountry(s)}
                      </td>
                      <td className="py-2 pr-3 font-mono font-semibold">
                        {getScanConsensus(s)}/3
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => navigate(`/admin/results`)}
                          className="text-teal-600 hover:underline font-bold"
                        >
                          {t.review}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Feedback */}
        <div
          className={`xl:col-span-4 p-5 rounded-2xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
        >
          <h3 className="text-sm font-black uppercase text-slate-500 mb-4 flex items-center gap-2">
            <MessageSquare size={16} /> {t.secFeed}
          </h3>
          <div className="space-y-3">
            {pendingFeedback.length === 0 ? (
              <p className="text-center py-6 text-xs font-semibold text-slate-400">
                No pending feedback.
              </p>
            ) : (
              pendingFeedback.map((f) => (
                <div
                  key={f.id || f._id}
                  className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center gap-3"
                >
                  <div className="overflow-hidden">
                    <span className="text-[10px] font-bold uppercase text-amber-500">
                      {f.feedback_type || f.type || "General"}
                    </span>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate mt-0.5">
                      {f.message || "No message"}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/admin/feedbacks")}
                    className="shrink-0 text-[10px] font-bold px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm hover:text-teal-600 transition"
                  >
                    Review
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OverviewBox
          isDark={isDark}
          icon={<ArrowRightLeft size={14} />}
          title={t.secFin}
          btn1="Transactions"
          link1="/admin/transactions"
          btn2="Packages"
          link2="/admin/token-packages"
          navigate={navigate}
        >
          <MiniRow
            label="Successful Payments"
            val={summary?.payments?.successful_transactions}
          />
          <MiniRow
            label="Pending Transactions"
            val={summary?.payments?.pending_transactions}
            color="text-amber-500"
          />
          <MiniRow
            label="Failed Transactions"
            val={summary?.payments?.failed_transactions}
            color="text-rose-500"
          />
          <MiniRow label="Total Tokens Sold" val={summary?.kpis?.tokens_sold} />
          <MiniRow
            label="Active Packages"
            val={summary?.payments?.active_packages_count}
          />
        </OverviewBox>

        <OverviewBox
          isDark={isDark}
          icon={<Users size={14} />}
          title={t.secUser}
          btn1="Manage Users"
          link1="/admin/users"
          navigate={navigate}
        >
          <MiniRow
            label="New Users (Today)"
            val={summary?.users_breakdown?.new_users_today}
            color="text-emerald-500"
          />
          <MiniRow
            label="New Users (This Week)"
            val={summary?.users_breakdown?.new_users_this_week}
          />
          <MiniRow
            label="Admin Accounts"
            val={summary?.users_breakdown?.admin_users}
          />
          <MiniRow
            label="Normal Accounts"
            val={summary?.users_breakdown?.normal_users}
          />
          <MiniRow
            label="Google OAuth Users"
            val={summary?.users_breakdown?.google_oauth_users}
          />
          <MiniRow
            label="Email Users"
            val={summary?.users_breakdown?.email_users}
          />
        </OverviewBox>

        <OverviewBox
          isDark={isDark}
          icon={<FileImage size={14} />}
          title={t.secBanknote}
          btn1="Banknotes"
          link1="/admin/banknotes"
          btn2="Currency Rates"
          link2="/admin/currency-rates"
          navigate={navigate}
        >
          <MiniRow
            label="Total Banknotes"
            val={summary?.banknotes_breakdown?.total_banknotes}
          />
          <MiniRow
            label="Supported Countries"
            val={summary?.banknotes_breakdown?.supported_countries_count}
          />
          <MiniRow
            label="Missing Images"
            val={summary?.banknotes_breakdown?.missing_images_count}
            color="text-amber-500"
          />
        </OverviewBox>
      </div>

      {/* 6. QUICK ACTIONS */}
      <div className="pt-2">
        <h3 className="text-sm font-black uppercase text-slate-500 mb-4 flex items-center gap-2">
          <Settings size={16} /> {t.quickAct}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          <ActionBtn
            label="Users"
            path="/admin/users"
            icon={<Users size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Packages"
            path="/admin/token-packages"
            icon={<Layers size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Transactions"
            path="/admin/transactions"
            icon={<ArrowRightLeft size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Results"
            path="/admin/results"
            icon={<Terminal size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Feedbacks"
            path="/admin/feedbacks"
            icon={<MessageSquare size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Banknotes"
            path="/admin/banknotes"
            icon={<Database size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Rates"
            path="/admin/currency-rates"
            icon={<Landmark size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Agents"
            path="/admin/agents"
            icon={<Cpu size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Agent Config"
            path="/admin/agents/config"
            icon={<Settings size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Aggregator"
            path="/admin/agents/aggregator"
            icon={<GitMerge size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="System Logs"
            path="/admin/logs"
            icon={<FileText size={16} />}
            nav={navigate}
            isDark={isDark}
          />
          <ActionBtn
            label="Settings"
            path="/admin/settings"
            icon={<Settings size={16} />}
            nav={navigate}
            isDark={isDark}
          />
        </div>
      </div>
    </div>
  );
}

// ----- MICRO COMPONENTS -----
function StatCard({ load, isDark, title, val, icon, isPrice }) {
  return (
    <div
      className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between h-[100px] ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
    >
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          {title}
        </span>
        {icon}
      </div>
      {load ? (
        <div className="w-12 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      ) : (
        <span
          className={`text-xl font-black truncate ${isPrice ? "text-teal-500" : "text-slate-900 dark:text-white"}`}
        >
          {val ?? "N/A"}
        </span>
      )}
    </div>
  );
}
function HealthRow({ label, status, render }) {
  return (
    <div className="flex justify-between items-center text-xs font-semibold">
      <span className="text-slate-500 truncate pr-2">{label}</span>
      {render(status)}
    </div>
  );
}
function ProgressRow({ label, value, icon, color = "bg-teal-600" }) {
  const pct = Math.min(Math.max(Number(value) || 0, 0), 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold">
        <span className="text-slate-400 flex items-center gap-1">
          {icon} {label}
        </span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
function OverviewBox({
  isDark,
  icon,
  title,
  children,
  btn1,
  link1,
  btn2,
  link2,
  navigate,
}) {
  return (
    <div
      className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
    >
      <div>
        <h4 className="text-xs font-black uppercase text-slate-400 mb-3 flex items-center gap-1.5">
          {icon} {title}
        </h4>
        <div className="space-y-2">{children}</div>
      </div>
      <div
        className={`grid ${btn2 ? "grid-cols-2" : "grid-cols-1"} gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800`}
      >
        <button
          onClick={() => navigate(link1)}
          className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          {btn1}
        </button>
        {btn2 && (
          <button
            onClick={() => navigate(link2)}
            className="py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            {btn2}
          </button>
        )}
      </div>
    </div>
  );
}
function MiniRow({ label, val, color = "text-slate-600 dark:text-slate-300" }) {
  return (
    <div className="flex justify-between text-xs border-b border-slate-50 dark:border-slate-800/50 pb-1 last:border-0">
      <span className="text-slate-400 font-medium">{label}</span>
      <span className={`font-bold font-mono ${color}`}>{val ?? "0"}</span>
    </div>
  );
}
function ActionBtn({ label, path, icon, nav, isDark }) {
  return (
    <div
      onClick={() => nav(path)}
      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-teal-500 transition-colors ${isDark ? "bg-slate-900 border-slate-800 text-slate-300" : "bg-white border-slate-200 text-slate-600"}`}
    >
      <div className="text-teal-600 dark:text-teal-400">{icon}</div>
      <span className="text-[10px] font-bold uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
