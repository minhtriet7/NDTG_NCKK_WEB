import React, { useState, useEffect } from "react";
import { useAppStore } from "../../store/appStore";
import {
  getAdminFeedbacks, updateFeedbackStatus, updateFeedbackPriority, replyFeedback, deleteFeedback
} from "../../services/adminService";
import { 
  Search, Filter, RotateCcw, Edit, MessageSquare, Trash2, 
  CheckCircle2, AlertTriangle, Clock, X, Star, Send, ShieldAlert, FileX
} from "lucide-react";
import toast from "react-hot-toast";

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function getId(item) {
  return item?.id || item?._id;
}

function normalizeFeedback(item = {}) {
  const user = item.user || item.owner || {};
  return {
    ...item,
    id: getId(item),
    type: item.feedback_type || item.type || 'suggestion',
    status: String(item.status || 'new').toLowerCase(),
    priority: String(item.priority || 'medium').toLowerCase(),
    subject: item.subject || 'User feedback',
    message: item.message || item.content || '',
    user_email: item.user_email || user.email || item.email || item.user_id || 'N/A',
    rating: item.rating,
    related_scan_id: item.related_scan_id || item.related_result_id || item.result_id,
    admin_reply: item.admin_reply || item.reply || '',
    created_at: item.created_at || item.updated_at || new Date().toISOString(),
  };
}

function normalizePagination(data) {
  const items = normalizeList(data).map(normalizeFeedback);
  return {
    items,
    total: Number(data?.total ?? data?.count ?? items.length),
  };
}

export default function FeedbacksManager() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [data, setData] = useState({ items: [], total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [rating, setRating] = useState("all");

  const [detailModal, setDetailModal] = useState({ open: false, fb: null });
  const [replyModal, setReplyModal] = useState({ open: false, fb: null, msg: "", nextStatus: "resolved" });
  const [isProcessing, setIsProcessing] = useState(false);

  const t = {
    EN: {
      title: "Feedback Management", subtitle: "Review user reports, recognition issues, payment questions, and suggestions.",
      searchPlaceholder: "Search subject, message, user...",
      thTime: "Time", thUser: "User", thType: "Type & Subject", thPriority: "Priority", thStatus: "Status", thAction: "Actions",
      noDataTitle: "No feedback found", noDataDesc: "User reports submitted from the Feedback page will appear here.",
      btnReply: "Reply", btnDelete: "Delete", btnSave: "Save", btnCancel: "Cancel",
      statTotal: "Total Feedback", statNew: "New", statReviewing: "Reviewing", statResolved: "Resolved", statHigh: "High Priority"
    },
    VI: {
      title: "Quản lý Phản hồi", subtitle: "Xem xét báo cáo, lỗi nhận diện, câu hỏi thanh toán và góp ý từ người dùng.",
      searchPlaceholder: "Tìm tiêu đề, nội dung, user...",
      thTime: "Thời gian", thUser: "Người dùng", thType: "Phân loại & Tiêu đề", thPriority: "Ưu tiên", thStatus: "Trạng thái", thAction: "Thao tác",
      noDataTitle: "Chưa có phản hồi", noDataDesc: "Các báo cáo từ trang Phản hồi của người dùng sẽ hiển thị tại đây.",
      btnReply: "Trả lời", btnDelete: "Xóa", btnSave: "Lưu", btnCancel: "Hủy",
      statTotal: "Tổng phản hồi", statNew: "Mới", statReviewing: "Đang xem xét", statResolved: "Đã xử lý", statHigh: "Ưu tiên Cao"
    }
  }[lang || "EN"];

  const loadData = async () => {
    setIsLoading(true);

    try {
      const res = await getAdminFeedbacks({
        page: 1,
        limit: 50,
        search: search.trim(),
        type,
        status,
        priority,
        rating,
      });

      setData(normalizePagination(res));
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          "Failed to load feedbacks.",
      );
      setData({ items: [], total: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [type, status, priority, rating]);

  const handleSearchSubmit = (e) => { if (e.key === "Enter") loadData(); };
  const handleReset = () => { setSearch(""); setType("all"); setStatus("all"); setPriority("all"); setRating("all"); setTimeout(() => loadData(), 100); };

  const kpis = {
    total: data.total || data.items.length,
    new: data.items.filter(i => ["new", "pending"].includes(String(i.status).toLowerCase())).length,
    reviewing: data.items.filter(i => String(i.status).toLowerCase() === "reviewing").length,
    resolved: data.items.filter(i => ["resolved", "closed"].includes(String(i.status).toLowerCase())).length,
    high: data.items.filter(i => String(i.priority).toLowerCase() === "high").length
  };

  const actionStatus = async (id, val) => {
    try { await updateFeedbackStatus(id, val); toast.success("Status updated"); loadData(); } 
    catch { toast.error("Failed"); }
  };
  const actionPriority = async (id, val) => {
    try { await updateFeedbackPriority(id, val); toast.success("Priority updated"); loadData(); } 
    catch { toast.error("Failed"); }
  };
  const actionDelete = async (id) => {
    if (!window.confirm("Delete this feedback permanently?")) return;
    try { await deleteFeedback(id); toast.success("Deleted"); setDetailModal({open:false}); loadData(); } 
    catch { toast.error("Failed"); }
  };

  const submitReply = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await replyFeedback(getId(replyModal.fb), { admin_reply: replyModal.msg, message: replyModal.msg, status: replyModal.nextStatus });
      toast.success("Reply sent & Status updated");
      setReplyModal({ open: false, fb: null });
      setDetailModal({ open: false });
      loadData();
    } catch (err) { toast.error("Failed to send reply"); }
    finally { setIsProcessing(false); }
  };

  const renderBadge = (val, type = "status") => {
    if (type === "status") {
      if (val === "resolved") return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>Resolved</span>;
      if (val === "reviewing") return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-700"}`}>Reviewing</span>;
      if (val === "closed") return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>Closed</span>;
      return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isDark ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-700"}`}>New</span>;
    }
    if (type === "priority") {
      if (val === "high") return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isDark ? "bg-rose-900/30 text-rose-400" : "bg-rose-50 text-rose-700"}`}>High</span>;
      if (val === "medium") return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isDark ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-700"}`}>Med</span>;
      return <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>Low</span>;
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{t.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: t.statTotal, val: kpis.total, icon: <MessageSquare size={16} className="text-blue-500"/> },
          { label: t.statNew, val: kpis.new, icon: <AlertTriangle size={16} className="text-amber-500"/> },
          { label: t.statReviewing, val: kpis.reviewing, icon: <Clock size={16} className="text-indigo-500"/> },
          { label: t.statResolved, val: kpis.resolved, icon: <CheckCircle2 size={16} className="text-emerald-500"/> },
          { label: t.statHigh, val: kpis.high, icon: <ShieldAlert size={16} className="text-rose-500"/> }
        ].map((k, i) => (
          <div key={i} className={`p-4 rounded-2xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{k.label}</span>{k.icon}</div>
            <span className={`text-xl font-black ${isDark ? "text-white" : "text-slate-900"}`}>{k.val}</span>
          </div>
        ))}
      </div>

      <div className={`p-4 rounded-2xl border shadow-sm flex flex-wrap gap-3 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input type="text" placeholder={t.searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearchSubmit} className={`w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:border-teal-500 ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200"}`}/>
        </div>
        <select value={type} onChange={e => setType(e.target.value)} className={`border text-sm rounded-xl px-3 outline-none ${isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200"}`}><option value="all">Type: All</option><option value="bug">Bug</option><option value="wrong_result">Wrong Result</option><option value="payment">Payment</option><option value="suggestion">Suggestion</option></select>
        <select value={status} onChange={e => setStatus(e.target.value)} className={`border text-sm rounded-xl px-3 outline-none ${isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200"}`}><option value="all">Status: All</option><option value="new">New</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        <select value={priority} onChange={e => setPriority(e.target.value)} className={`border text-sm rounded-xl px-3 outline-none ${isDark ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200"}`}><option value="all">Priority: All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        <button onClick={handleReset} className={`p-2.5 border rounded-xl transition ${isDark ? "text-slate-400 bg-slate-950 border-slate-800 hover:text-rose-400" : "text-slate-400 bg-slate-50 border-slate-200 hover:text-rose-600"}`}><RotateCcw size={16} /></button>
      </div>

      <div className={`rounded-3xl border shadow-sm overflow-hidden ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className={`uppercase text-[10px] font-bold tracking-wider border-b ${isDark ? "bg-slate-950/50 text-slate-500 border-slate-800" : "bg-slate-50 text-slate-500 border-slate-100"}`}>
              <tr><th className="px-5 py-4">{t.thTime}</th><th className="px-5 py-4">{t.thUser}</th><th className="px-5 py-4">{t.thType}</th><th className="px-5 py-4">{t.thPriority}</th><th className="px-5 py-4">{t.thStatus}</th><th className="px-5 py-4 text-right">{t.thAction}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {isLoading ? Array(5).fill(0).map((_,i) => <tr key={i}><td colSpan="6" className="px-5 py-4"><div className="w-full h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"/></td></tr>) 
               : data.items.length === 0 ? <tr><td colSpan="6" className="text-center py-20"><FileX className="w-10 h-10 mx-auto text-slate-300 mb-2"/><p className="text-slate-500 font-bold">{t.noDataTitle}</p></td></tr>
               : data.items.map(fb => (
                <tr key={getId(fb)} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40`}>
                  <td className="px-5 py-4 text-xs text-slate-500">{new Date(fb.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4"><p className={`font-semibold text-xs truncate max-w-[150px] ${isDark ? "text-slate-200" : "text-slate-800"}`}>{fb.user_email}</p></td>
                  <td className="px-5 py-4"><p className={`font-bold text-xs ${isDark ? "text-white" : "text-slate-900"}`}>{String(fb.type || "suggestion").toUpperCase()}</p><p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px]">{fb.subject}</p></td>
                  <td className="px-5 py-4"><select value={fb.priority} onChange={(e) => actionPriority(getId(fb), e.target.value)} className="bg-transparent text-xs font-bold uppercase outline-none cursor-pointer"><option value="low">Low</option><option value="medium">Med</option><option value="high">High</option></select></td>
                  <td className="px-5 py-4"><select value={fb.status} onChange={(e) => actionStatus(getId(fb), e.target.value)} className="bg-transparent text-xs font-bold uppercase outline-none cursor-pointer"><option value="new">New</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></td>
                  <td className="px-5 py-4 text-right"><button onClick={() => setDetailModal({ open: true, fb })} className={`p-2 rounded-lg border transition ${isDark ? "border-slate-700 hover:bg-slate-800 hover:text-teal-400" : "border-slate-200 hover:bg-slate-50 hover:text-teal-600"}`}><Edit size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailModal.open && detailModal.fb && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDetailModal({ open: false, fb: null })} />
          <div className={`relative w-full max-w-lg h-full flex flex-col shadow-2xl animate-[slideInRight_0.3s_ease-out] ${isDark ? "bg-slate-950 border-l border-slate-800" : "bg-white"}`}>
            <div className={`px-6 py-5 border-b flex justify-between items-center ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <h3 className={`font-black text-xl flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}><MessageSquare className="w-5 h-5 text-teal-500"/> Ticket Details</h3>
              <button onClick={() => setDetailModal({ open: false, fb: null })} className={`p-2 rounded-xl transition ${isDark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="flex gap-2 mb-4">{renderBadge(detailModal.fb.status)}{renderBadge(detailModal.fb.priority, "priority")}</div>
              <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Subject</p><h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{detailModal.fb.subject}</h2></div>
              <div className={`p-4 rounded-xl text-sm leading-relaxed border ${isDark ? "bg-slate-900 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-100 text-slate-700"}`}>{detailModal.fb.message}</div>
              <div className={`rounded-xl border p-4 text-xs space-y-2 ${isDark ? "border-slate-800" : "border-slate-100"}`}>
                <div className="flex justify-between"><span className="text-slate-500">Client Email:</span><span className="font-medium">{detailModal.fb.user_email}</span></div>
                {detailModal.fb.rating && <div className="flex justify-between"><span className="text-slate-500">Rating:</span><span className="font-medium text-amber-500 flex items-center gap-1">{detailModal.fb.rating}/5 <Star size={10} fill="currentColor"/></span></div>}
                {detailModal.fb.related_scan_id && <div className="flex justify-between"><span className="text-slate-500">Related Scan ID:</span><span className="font-mono">{detailModal.fb.related_scan_id}</span></div>}
              </div>
              {detailModal.fb.admin_reply && (
                <div className={`p-4 rounded-xl border ${isDark ? "bg-teal-900/10 border-teal-500/20" : "bg-teal-50 border-teal-100"}`}>
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-2">Admin Reply</p>
                  <p className={`text-sm ${isDark ? "text-teal-100" : "text-teal-900"}`}>{detailModal.fb.admin_reply}</p>
                </div>
              )}
            </div>
            <div className={`p-6 border-t flex gap-3 ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"}`}>
              <button onClick={() => actionDelete(getId(detailModal.fb))} className="px-4 py-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl font-bold text-sm transition"><Trash2 size={16}/></button>
              <button onClick={() => setReplyModal({ open: true, fb: detailModal.fb, msg: detailModal.fb.admin_reply || "", nextStatus: "resolved" })} className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold text-sm transition flex justify-center gap-2"><Send size={16}/> {t.btnReply}</button>
            </div>
          </div>
        </div>
      )}

      {replyModal.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form onSubmit={submitReply} className={`w-full max-w-md rounded-3xl shadow-2xl p-6 border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <h3 className={`text-xl font-black mb-4 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-900"}`}><Send size={20} className="text-teal-500"/> Send Reply</h3>
            <textarea required rows="4" value={replyModal.msg} onChange={(e) => setReplyModal(m => ({ ...m, msg: e.target.value }))} placeholder="Type your response to the user..." className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none mb-4 resize-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}/>
            <select value={replyModal.nextStatus} onChange={(e) => setReplyModal(m => ({ ...m, nextStatus: e.target.value }))} className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none mb-6 ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}><option value="reviewing">Set to Reviewing</option><option value="resolved">Set to Resolved</option><option value="closed">Set to Closed</option></select>
            <div className="flex gap-3">
              <button type="button" onClick={() => setReplyModal({ open: false })} className={`flex-1 py-2.5 rounded-xl font-bold text-sm border ${isDark ? "border-slate-700 text-slate-300" : "border-slate-200 text-slate-700"}`}>Cancel</button>
              <button type="submit" disabled={isProcessing} className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">{isProcessing ? "..." : "Send & Update"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}