import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import {
  Users,
  Scan,
  Landmark,
  MessageSquare,
  Activity,
  Server,
  Zap,
  CheckSquare,
  Share2,
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
  Layers,
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  ServerCrash
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
      title: "Dashboard",
      subtitle: "Enterprise overview and system analytics.",
      refresh: "Sync Data",
      kpiUsers: "Total Accounts",
      kpiActive: "Active Now",
      kpiScans: "Process Volume",
      kpiCompleted: "Successful",
      kpiRevenue: "Revenue",
      kpiFeedback: "Tickets",
      secHealth: "Infrastructure Health",
      secPerf: "Service Performance",
      secRecent: "Recent Activity Log",
      secFeed: "Support Queue",
      secFin: "Financial Overview",
      secUser: "Account Demographics",
      secBanknote: "Asset Inventory",
      quickAct: "Quick Navigation",
      thTime: "Timestamp",
      thUser: "Account",
      thImage: "Asset",
      thResult: "Classification",
      thCountry: "Region",
      thConsensus: "Match Rate",
      thStatus: "State",
      thAction: "Details",
      noData: "No data available.",
      viewLogs: "System Logs",
      agentConfig: "Configure Services",
      review: "Inspect",
      queueEmpty: "Queue is empty.",
      paymentsSuccess: "Successful Payments",
      paymentsPending: "Pending Transactions",
      paymentsFailed: "Failed Transactions",
      activePackages: "Active Packages",
      usersToday: "New Users (Today)",
      usersWeek: "New Users (This Week)",
      adminAccs: "Admin Accounts",
      oauthAccs: "OAuth Users",
      totalBanknotes: "Total Banknotes",
      supportedRegions: "Supported Regions",
      missingAssets: "Missing Assets",
    },
    VI: {
      title: "Tổng quan",
      subtitle: "Phân tích và giám sát hoạt động hệ thống.",
      refresh: "Đồng bộ",
      kpiUsers: "Tổng tài khoản",
      kpiActive: "Hoạt động",
      kpiScans: "Lượng quét",
      kpiCompleted: "Thành công",
      kpiRevenue: "Doanh thu",
      kpiFeedback: "Hỗ trợ",
      secHealth: "Trạng thái hạ tầng",
      secPerf: "Hiệu suất dịch vụ",
      secRecent: "Nhật ký hoạt động",
      secFeed: "Hàng đợi hỗ trợ",
      secFin: "Tài chính & Doanh thu",
      secUser: "Phân bổ tài khoản",
      secBanknote: "Kho dữ liệu",
      quickAct: "Điều hướng nhanh",
      thTime: "Thời gian",
      thUser: "Tài khoản",
      thImage: "Tài sản",
      thResult: "Phân loại",
      thCountry: "Khu vực",
      thConsensus: "Tỉ lệ khớp",
      thStatus: "Trạng thái",
      thAction: "Chi tiết",
      noData: "Không có dữ liệu.",
      viewLogs: "Xem Nhật ký",
      agentConfig: "Cấu hình Dịch vụ",
      review: "Kiểm tra",
      queueEmpty: "Hàng đợi trống.",
      paymentsSuccess: "Thanh toán thành công",
      paymentsPending: "Giao dịch chờ xử lý",
      paymentsFailed: "Giao dịch thất bại",
      activePackages: "Gói Token hoạt động",
      usersToday: "Người dùng mới (Hôm nay)",
      usersWeek: "Người dùng mới (Tuần này)",
      adminAccs: "Tài khoản Admin",
      oauthAccs: "Tài khoản OAuth",
      totalBanknotes: "Tổng số Tiền giấy",
      supportedRegions: "Khu vực được hỗ trợ",
      missingAssets: "Hình ảnh bị thiếu",
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
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
          Operational
        </span>
      );
    if (s.includes("warning"))
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
          Degraded
        </span>
      );
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
        Outage
      </span>
    );
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-8 pb-10">
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">
            {t.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {summary?.last_updated && (
            <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 shadow-sm">
              <Clock size={12} />
              {new Date(summary.last_updated).toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={loadData}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 transition"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            {t.refresh}
          </button>
        </div>
      </div>

      {/* 2. KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard isDark={isDark} load={isLoading} title={t.kpiUsers} val={summary?.kpis?.total_users} icon={<Users size={16} className="text-slate-400" />} />
        <StatCard isDark={isDark} load={isLoading} title={t.kpiActive} val={summary?.kpis?.active_users} icon={<Activity size={16} className="text-slate-400" />} trend="+12%" positive />
        <StatCard isDark={isDark} load={isLoading} title={t.kpiScans} val={summary?.kpis?.total_scans} icon={<Scan size={16} className="text-slate-400" />} />
        <StatCard isDark={isDark} load={isLoading} title={t.kpiCompleted} val={summary?.kpis?.completed_scans} icon={<CheckCircle size={16} className="text-slate-400" />} />
        <StatCard isDark={isDark} load={isLoading} title={t.kpiRevenue} val={formatVND(summary?.kpis?.total_revenue_vnd)} icon={<Landmark size={16} className="text-slate-400" />} />
        <StatCard isDark={isDark} load={isLoading} title={t.kpiFeedback} val={summary?.kpis?.pending_feedback} icon={<MessageSquare size={16} className="text-slate-400" />} />
      </div>

      {/* 3. HEALTH & PERFORMANCE */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className={`xl:col-span-5 p-6 rounded-xl border shadow-sm flex flex-col h-full ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Server size={16} className="text-slate-400" /> {t.secHealth}
            </h3>
          </div>
          <div className="space-y-4 flex-1">
            <HealthRow label="API Gateway" status={health?.api_server} render={renderHealthBadge} />
            <HealthRow label="Primary Database" status={health?.database} render={renderHealthBadge} />
            <HealthRow label="Vision Model Service" status={health?.ml_dl_agent} render={renderHealthBadge} />
            <HealthRow label="Language Model Service" status={health?.llm_agent} render={renderHealthBadge} />
            <HealthRow label="External Search API" status={health?.google_lens_agent} render={renderHealthBadge} />
            <HealthRow label="Data Aggregator" status={health?.aggregator} render={renderHealthBadge} />
          </div>
        </div>

        <div className={`xl:col-span-7 p-6 rounded-xl border shadow-sm flex flex-col h-full ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Activity size={16} className="text-slate-400" /> {t.secPerf}
            </h3>
            <div className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
              Avg Time: <span className="font-bold text-slate-700 dark:text-slate-300">{performance?.average_scan_time_sec || "0.0"}s</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 flex-1">
            <div className="space-y-6">
              <ProgressRow label="Vision Accuracy Rate" value={performance?.ml_dl_success_rate} />
              <ProgressRow label="Language Processing Rate" value={performance?.llm_success_rate} />
              <ProgressRow label="External Search Hit Rate" value={performance?.lens_success_rate} />
            </div>
            <div className="space-y-6">
              <ProgressRow label="System Consensus Ratio" value={performance?.consensus_rate} color="bg-emerald-500" />
              <ProgressRow label="Service Conflict Rate" value={performance?.conflict_rate} color="bg-rose-500" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. RECENT SCANS & FEEDBACK */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className={`xl:col-span-8 rounded-xl border shadow-sm overflow-hidden ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Terminal size={16} className="text-slate-400" /> {t.secRecent}
            </h3>
            <button onClick={() => navigate("/admin/results")} className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition">
              View All <ChevronRight size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">{t.thTime}</th>
                  <th className="px-5 py-3">{t.thUser}</th>
                  <th className="px-5 py-3">{t.thResult}</th>
                  <th className="px-5 py-3">{t.thCountry}</th>
                  <th className="px-5 py-3">{t.thConsensus}</th>
                  <th className="px-5 py-3 text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentScans.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-slate-400 text-sm">
                      {t.noData}
                    </td>
                  </tr>
                ) : (
                  recentScans.map((s) => (
                    <tr key={s.id || s._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 text-slate-500 text-xs">
                        {s.created_at ? new Date(s.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "N/A"}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-700 dark:text-slate-300">
                        {s.user_id?.slice(-6) || "Guest"}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">
                        {getScanDenomination(s)}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {getScanCountry(s)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                             <div className="h-full bg-slate-500 dark:bg-slate-400" style={{width: `${(getScanConsensus(s)/3)*100}%`}}></div>
                          </div>
                          <span className="text-xs text-slate-500 font-mono">{getScanConsensus(s)}/3</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => navigate(`/admin/results`)} className="text-slate-900 dark:text-white hover:underline text-xs font-bold">
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

        <div className={`xl:col-span-4 rounded-xl border shadow-sm flex flex-col ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <MessageSquare size={16} className="text-slate-400" /> {t.secFeed}
            </h3>
          </div>
          <div className="p-5 space-y-4">
            {pendingFeedback.length === 0 ? (
              <p className="text-center py-6 text-sm text-slate-400">
                {t.queueEmpty}
              </p>
            ) : (
              pendingFeedback.map((f) => (
                <div key={f.id || f._id} className="group cursor-pointer" onClick={() => navigate("/admin/feedbacks")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {f.feedback_type || f.type || "General"}
                    </span>
                    <ArrowRightLeft size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    "{f.message || "No content provided."}"
                  </p>
                  <div className="w-full h-px bg-slate-100 dark:bg-slate-800 mt-4 group-last:hidden"></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OverviewBox isDark={isDark} title={t.secFin} navigate={navigate}>
          <MiniRow label={t.paymentsSuccess} val={summary?.payments?.successful_transactions} />
          <MiniRow label={t.paymentsPending} val={summary?.payments?.pending_transactions} />
          <MiniRow label={t.paymentsFailed} val={summary?.payments?.failed_transactions} />
          <MiniRow label={t.activePackages} val={summary?.payments?.active_packages_count} />
        </OverviewBox>
        <OverviewBox isDark={isDark} title={t.secUser} navigate={navigate}>
          <MiniRow label={t.usersToday} val={summary?.users_breakdown?.new_users_today} />
          <MiniRow label={t.usersWeek} val={summary?.users_breakdown?.new_users_this_week} />
          <MiniRow label={t.adminAccs} val={summary?.users_breakdown?.admin_users} />
          <MiniRow label={t.oauthAccs} val={summary?.users_breakdown?.google_oauth_users} />
        </OverviewBox>
        <OverviewBox isDark={isDark} title={t.secBanknote} navigate={navigate}>
          <MiniRow label={t.totalBanknotes} val={summary?.banknotes_breakdown?.total_banknotes} />
          <MiniRow label={t.supportedRegions} val={summary?.banknotes_breakdown?.supported_countries_count} />
          <MiniRow label={t.missingAssets} val={summary?.banknotes_breakdown?.missing_images_count} />
        </OverviewBox>
      </div>
    </div>
  );
}

// ----- MICRO COMPONENTS -----
function StatCard({ load, isDark, title, val, icon, trend, positive }) {
  return (
    <div className={`p-5 rounded-xl border shadow-sm flex flex-col h-[110px] ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
      <div className="flex justify-between items-center mb-auto">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {title}
        </span>
        <div className={`p-1.5 rounded-md ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
           {icon}
        </div>
      </div>
      {load ? (
        <div className="w-16 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
           <span className="text-2xl font-bold text-slate-900 dark:text-white truncate tracking-tight">
             {val ?? "0"}
           </span>
           {trend && (
             <span className={`text-xs font-bold mb-1 ${positive ? 'text-emerald-500' : 'text-slate-400'}`}>
               {trend}
             </span>
           )}
        </div>
      )}
    </div>
  );
}

function HealthRow({ label, status, render }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {render(status)}
    </div>
  );
}

function ProgressRow({ label, value, color = "bg-slate-800 dark:bg-slate-200" }) {
  const pct = Math.min(Math.max(Number(value) || 0, 0), 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="font-bold text-slate-900 dark:text-white">{pct}%</span>
      </div>
      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OverviewBox({ isDark, title, children }) {
  return (
    <div className={`p-6 rounded-xl border shadow-sm flex flex-col ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function MiniRow({ label, val }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-semibold text-slate-900 dark:text-white">{val ?? "0"}</span>
    </div>
  );
}
