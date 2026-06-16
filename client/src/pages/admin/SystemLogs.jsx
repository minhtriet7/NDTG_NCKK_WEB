import React, { useState, useEffect, useRef } from "react";
import { Terminal, Table2, Trash2, Download, Search, Filter, Copy, Eye, RefreshCcw, Activity, AlertTriangle, AlertCircle, FileX, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { getSystemLogs, clearSystemLogs, exportSystemLogs } from "../../services/adminService";


function normalizeLogsResponse(data) {
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.results)
          ? data.results
          : [];

  return {
    items: items.map((item) => ({
      id: item.id || item._id,
      timestamp: item.timestamp || item.created_at || item.time || new Date().toISOString(),
      level: String(item.level || item.severity || "INFO").toUpperCase(),
      module: item.module || item.source || item.category || "general",
      message: item.message || item.msg || item.detail || "",
      request_id: item.request_id || item.trace_id || "",
      user_id: item.user_id || "",
      metadata: item.metadata || item.extra || item.context || null,
      raw: item,
    })),
    total: data?.total || data?.count || items.length,
  };
}

export default function SystemLogs() {
  const { theme, lang } = useAppStore();
  const isDark = theme === "dark";

  const [logs, setLogs] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // UI State
  const [viewMode, setViewMode] = useState("table"); // 'table' | 'console'
  const [detailModal, setDetailModal] = useState({ open: false, log: null });
  const consoleEndRef = useRef(null);

  const t = {
    EN: { 
      title: "System Logs", sub: "Monitor backend events, agent errors, payment webhooks, and admin actions.",
      statTot: "Total Logs", statErr: "Errors", statWarn: "Warnings", statLast: "Last Error",
      search: "Search message, ID...", lvl: "Level", mod: "Module", reset: "Reset",
      autoRef: "Auto Refresh", clear: "Clear Logs", export: "Export CSV",
      thTime: "Time", thLvl: "Level", thMod: "Module", thMsg: "Message", thAct: "Action",
      noData: "No logs found", noDataSub: "Try changing filters or refreshing.",
      modTit: "Log Details", copy: "Copy JSON"
    },
    VI: { 
      title: "Nhật ký Hệ thống", sub: "Theo dõi sự kiện backend, lỗi tác tử, webhook thanh toán và thao tác quản trị.",
      statTot: "Tổng số Log", statErr: "Lỗi (Error)", statWarn: "Cảnh báo (Warn)", statLast: "Lỗi gần nhất",
      search: "Tìm message, ID...", lvl: "Cấp độ", mod: "Phân hệ", reset: "Xóa Lọc",
      autoRef: "Tự động tải", clear: "Xóa Logs", export: "Xuất CSV",
      thTime: "Thời gian", thLvl: "Cấp độ", thMod: "Phân hệ", thMsg: "Nội dung", thAct: "Thao tác",
      noData: "Chưa có nhật ký phù hợp", noDataSub: "Hãy thử đổi bộ lọc hoặc làm mới trang.",
      modTit: "Chi tiết Log", copy: "Copy JSON"
    }
  }[lang || "EN"];

  const loadData = async (showLoad = true) => {
    if (showLoad) setLoading(true);
    try {
      const data = await getSystemLogs({
        page: 1,
        limit: 100,
        search,
        level,
        module: moduleFilter,
      });
      setLogs(normalizeLogsResponse(data));
    } catch (error) {
      console.error("Fetch logs failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Failed to fetch logs",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [level, moduleFilter]);

  // Auto refresh logic
  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => loadData(false), 5000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, search, level, moduleFilter]);

  // Scroll to bottom in Console View
  useEffect(() => {
    if (viewMode === "console" && autoRefresh) {
      consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, viewMode, autoRefresh]);

  const handleClear = async () => {
    if (!window.confirm("Are you sure you want to permanently clear all logs?")) return;
    try {
      await clearSystemLogs();
      toast.success("Logs cleared successfully");
      loadData();
    } catch { toast.error("Failed to clear logs"); }
  };

  const handleExport = async () => {
    try {
      const data = await exportSystemLogs({ search, level, module: moduleFilter });
      const normalized = normalizeLogsResponse(data);
      const csv = ["Timestamp,Level,Module,Message,RequestID,UserID"];
      normalized.items.forEach((log) => {
        csv.push(
          `${log.timestamp},${log.level},${log.module},"${String(log.message || "").replace(/"/g, '""')}",${log.request_id || ""},${log.user_id || ""}`,
        );
      });
      const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logs_${new Date().getTime()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Export successful");
    } catch (error) {
      console.error("Export logs failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Export failed",
      );
    }
  };

  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); };

  const getLevelColor = (lvl) => {
    const l = (lvl || "").toUpperCase();
    if (l === "ERROR") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (l === "WARN") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    if (l === "DEBUG") return "text-slate-500 bg-slate-500/10 border-slate-500/20 dark:text-slate-400";
    return "text-teal-600 bg-teal-600/10 border-teal-600/20 dark:text-teal-400";
  };

  const kpis = {
    tot: logs.total || 0,
    err: logs.items.filter((l) => String(l.level).toUpperCase() === "ERROR").length,
    wrn: logs.items.filter((l) => ["WARN", "WARNING"].includes(String(l.level).toUpperCase())).length,
    lastErr: logs.items.find((l) => String(l.level).toUpperCase() === "ERROR")?.timestamp || null
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">{t.sub}</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button onClick={()=>loadData(true)} className={`p-2.5 rounded-xl border transition ${isDark?"border-slate-700 hover:bg-slate-800 text-slate-300":"border-slate-200 hover:bg-slate-50 text-slate-700"}`}><RefreshCcw size={18} className={loading && !autoRefresh ? "animate-spin":""}/></button>
          <button onClick={handleExport} className={`px-4 py-2.5 rounded-xl border font-bold text-sm transition flex items-center gap-2 ${isDark?"border-slate-700 hover:bg-slate-800 text-slate-300":"border-slate-200 hover:bg-slate-50 text-slate-700"}`}><Download size={16}/> <span className="hidden sm:inline">{t.export}</span></button>
          <button onClick={handleClear} className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500 text-rose-600 dark:text-rose-500 hover:text-white rounded-xl font-bold text-sm transition flex items-center gap-2"><Trash2 size={16}/> <span className="hidden sm:inline">{t.clear}</span></button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-5 rounded-xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.statTot}</span><Activity className="text-blue-500" size={18}/></div>
          <span className={`text-2xl font-black ${isDark?"text-white":"text-slate-900"}`}>{kpis.tot}</span>
        </div>
        <div className={`p-5 rounded-xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.statErr}</span><AlertCircle className="text-rose-500" size={18}/></div>
          <span className="text-2xl font-black text-rose-500">{kpis.err}</span>
        </div>
        <div className={`p-5 rounded-xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.statWarn}</span><AlertTriangle className="text-amber-500" size={18}/></div>
          <span className="text-2xl font-black text-amber-500">{kpis.wrn}</span>
        </div>
        <div className={`p-5 rounded-xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          <div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.statLast}</span><Terminal className="text-slate-500" size={18}/></div>
          <span className={`text-lg font-bold ${isDark?"text-slate-300":"text-slate-700"} truncate block`}>{kpis.lastErr ? new Date(kpis.lastErr).toLocaleTimeString() : "N/A"}</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className={`p-4 rounded-xl border shadow-sm flex flex-wrap gap-4 items-center justify-between ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[300px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder={t.search} value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadData(true)} className={`w-full pl-9 pr-4 py-2 border rounded-xl text-sm outline-none transition-colors ${isDark ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500" : "bg-slate-50 border-slate-200 focus:border-teal-500"}`}/>
          </div>
          <div className="flex items-center gap-2"><Filter size={16} className="text-slate-400"/></div>
          <select value={level} onChange={e=>setLevel(e.target.value)} className={`border text-sm rounded-xl px-3 py-2 outline-none font-semibold ${isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
            <option value="all">{t.lvl}: All</option><option value="info">INFO</option><option value="warn">WARN</option><option value="error">ERROR</option><option value="debug">DEBUG</option>
          </select>
          <select value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)} className={`border text-sm rounded-xl px-3 py-2 outline-none font-semibold ${isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
            <option value="all">{t.mod}: All</option><option value="auth">Auth</option><option value="recognition">Recognition</option><option value="payment">Payment</option><option value="agent">AI Agents</option><option value="general">General</option>
          </select>
        </div>
        
        <div className="flex items-center gap-4 border-l pl-4 border-slate-200 dark:border-slate-800">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)} className="w-4 h-4 accent-teal-600 rounded"/>
            <span className={`text-sm font-bold ${autoRefresh ? "text-teal-600 dark:text-teal-400" : "text-slate-500"}`}>{t.autoRef}</span>
          </label>
          <div className={`flex rounded-xl border p-1 ${isDark?"bg-slate-950 border-slate-800":"bg-slate-100 border-slate-200"}`}>
            <button onClick={()=>setViewMode("table")} className={`p-1.5 rounded-lg transition-all ${viewMode==="table" ? (isDark?"bg-slate-800 text-teal-400":"bg-white text-teal-600 shadow-sm") : "text-slate-400"}`}><Table2 size={16}/></button>
            <button onClick={()=>setViewMode("console")} className={`p-1.5 rounded-lg transition-all ${viewMode==="console" ? (isDark?"bg-slate-800 text-teal-400":"bg-white text-teal-600 shadow-sm") : "text-slate-400"}`}><Terminal size={16}/></button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`rounded-xl border shadow-sm overflow-hidden h-[65vh] flex flex-col ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        {loading && logs.items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin text-teal-500"><RefreshCcw size={32}/></div></div>
        ) : logs.items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <FileX className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-bold text-slate-500 dark:text-slate-400">{t.noData}</p>
            <p className="text-sm mt-1">{t.noDataSub}</p>
          </div>
        ) : viewMode === "table" ? (
          // --- TABLE VIEW ---
          <div className="overflow-auto flex-1 relative">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className={`sticky top-0 z-10 uppercase text-[10px] font-bold tracking-wider backdrop-blur-md ${isDark ? "bg-slate-900/90 text-slate-500 border-slate-800" : "bg-white/90 text-slate-500 border-slate-100 shadow-sm"}`}>
                <tr><th className="px-5 py-3">{t.thTime}</th><th className="px-5 py-3">{t.thLvl}</th><th className="px-5 py-3">{t.thMod}</th><th className="px-5 py-3">{t.thMsg}</th><th className="px-5 py-3 text-right">{t.thAct}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {logs.items.map((l, i) => (
                  <tr key={l.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 text-xs text-slate-500 font-mono">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest border ${getLevelColor(l.level)}`}>{l.level}</span></td>
                    <td className="px-5 py-3 text-xs font-bold uppercase text-slate-500">{l.module}</td>
                    <td className="px-5 py-3 font-mono text-xs truncate max-w-md xl:max-w-xl dark:text-slate-300">{l.message}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={()=>copyToClipboard(l.message)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-teal-500 transition" title="Copy Msg"><Copy size={14}/></button>
                        <button onClick={()=>setDetailModal({open:true, log:l})} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-teal-500 transition" title="View"><Eye size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // --- CONSOLE VIEW ---
          <div className="flex-1 overflow-auto bg-[#0F172A] p-4 font-mono text-xs md:text-sm leading-relaxed scrollbar-thin scrollbar-thumb-slate-700">
            {logs.items.map((l, i) => {
              const isErr = l.level === "ERROR";
              return (
                <div key={l.id || i} className={`flex gap-3 hover:bg-white/5 px-2 py-1 rounded transition-colors ${isErr ? 'bg-rose-900/10' : ''}`}>
                  <span className="text-slate-500 shrink-0 select-none">{new Date(l.timestamp).toLocaleTimeString()}</span>
                  <span className={`shrink-0 font-bold w-12 ${isErr ? 'text-rose-500' : l.level==='WARN'?'text-amber-500':l.level==='DEBUG'?'text-slate-500':'text-teal-500'}`}>{l.level}</span>
                  <span className="text-indigo-400 font-bold shrink-0">[{l.module}]</span>
                  <span className={`break-words whitespace-pre-wrap ${isErr ? 'text-rose-200' : 'text-slate-300'}`}>{l.message}</span>
                </div>
              );
            })}
            <div ref={consoleEndRef} />
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailModal.open && detailModal.log && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDetailModal({open:false, log:null})} />
          <div className={`relative w-full max-w-2xl h-full flex flex-col shadow-2xl animate-[slideInRight_0.3s_ease-out] ${isDark ? "bg-slate-950 border-l border-slate-800" : "bg-white"}`}>
            <div className={`px-6 py-5 border-b flex justify-between items-center ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h3 className={`font-black text-xl flex items-center gap-2 ${isDark?"text-white":"text-slate-900"}`}><Terminal className="text-teal-500" size={20}/> {t.modTit}</h3>
              <button onClick={() => setDetailModal({open:false, log:null})} className="text-slate-400 hover:text-rose-500"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded text-xs font-black tracking-widest border ${getLevelColor(detailModal.log.level)}`}>{detailModal.log.level}</span>
                <span className="px-3 py-1 rounded text-xs font-bold uppercase bg-slate-100 text-slate-500 dark:bg-slate-800">{detailModal.log.module}</span>
              </div>
              
              <div className={`p-4 rounded-xl font-mono text-sm leading-relaxed border ${isDark ? "bg-[#0F172A] border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
                {detailModal.log.message}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-[10px] font-bold text-slate-400 uppercase">Timestamp</p><p className={`font-mono mt-1 ${isDark?"text-white":"text-slate-900"}`}>{new Date(detailModal.log.timestamp).toLocaleString()}</p></div>
                <div><p className="text-[10px] font-bold text-slate-400 uppercase">Log ID</p><p className={`font-mono mt-1 ${isDark?"text-white":"text-slate-900"}`}>{detailModal.log.id || "N/A"}</p></div>
                <div><p className="text-[10px] font-bold text-slate-400 uppercase">Request ID</p><p className={`font-mono mt-1 ${isDark?"text-white":"text-slate-900"}`}>{detailModal.log.request_id || "N/A"}</p></div>
                <div><p className="text-[10px] font-bold text-slate-400 uppercase">User ID</p><p className={`font-mono mt-1 ${isDark?"text-white":"text-slate-900"}`}>{detailModal.log.user_id || "System"}</p></div>
              </div>

              {detailModal.log.error_detail && (
                <div>
                  <p className="text-xs font-bold text-rose-500 uppercase mb-2">Error Stack Trace</p>
                  <pre className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                    {detailModal.log.error_detail}
                  </pre>
                </div>
              )}

              {detailModal.log.raw_data && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-slate-500 uppercase">Raw Payload (JSON)</p>
                    <button onClick={()=>copyToClipboard(JSON.stringify(detailModal.log.raw_data, null, 2))} className="text-xs font-bold text-teal-500 flex items-center gap-1 hover:underline"><Copy size={12}/> {t.copy}</button>
                  </div>
                  <pre className={`p-4 rounded-xl border font-mono text-xs overflow-x-auto ${isDark ? "bg-[#0F172A] border-slate-800 text-teal-400" : "bg-slate-50 border-slate-200 text-teal-700"}`}>
                    {JSON.stringify(detailModal.log.raw_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}