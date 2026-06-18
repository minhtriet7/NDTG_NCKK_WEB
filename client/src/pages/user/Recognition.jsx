import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Coins, PlaySquare, Loader2 } from "lucide-react";

import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import { clearActiveRecognitionTask, getRecognitionTaskStatus } from "../../services/recognitionService";

import UploadZone from "../../components/workspace/UploadZone";
import RecentHistorySide from "../../components/workspace/RecentHistorySide";

export default function Recognition() {
  const { user } = useAuthStore();
  const { lang } = useAppStore();
  const { activeTask, getFreshActiveTask, clearActiveTask, resetScanSession } = useRecognitionStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Khi bấm "Scan Another" từ Result, route state có { resetScan: true }.
  // Reset tại đây để đảm bảo Workspace luôn trống, kể cả khi store chưa
  // được clear đủ trước khi navigate (belt-and-suspenders).
  useEffect(() => {
    if (location.state?.resetScan) {
      resetScanSession();
      // Xoá flag để tránh reset lại khi user refresh trang.
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, resetScanSession, navigate, location.pathname]);

  useEffect(() => {
    // Chỉ check fresh task nếu KHÔNG đang trong flow "Scan Another"
    if (!location.state?.resetScan) {
      const task = getFreshActiveTask();
      if (!task || !task.taskId) {
        resetScanSession();
        return;
      }
      
      // Kiểm tra trạng thái thật của task từ API
      getRecognitionTaskStatus(task.taskId)
        .then((res) => {
          const status = String(res?.data?.status || res?.status || "").toLowerCase();
          const terminalStatuses = [
            "completed", "completed_with_review", "needs_review", 
            "failed", "timeout", "cancelled", "error", "done", "success", "canceled"
          ];
          
          if (terminalStatuses.includes(status)) {
            resetScanSession();
          }
          // Nếu task đang chạy thì kệ, UI sẽ hiển thị phần cảnh báo
        })
        .catch(() => {
          resetScanSession();
        });
    }
  }, [getFreshActiveTask, location.state, resetScanSession]);

  const hasEnoughTokens = Number(user?.token_balance || 0) > 0;

  const t = {
    EN: {
      title: "Banknote Recognition Workspace",
      subtitle: "Upload a Southeast Asian banknote image and compare results from multiple analysis agents.",
      tokenBal: "Token Balance",
    },
    VI: {
      title: "Không gian Nhận diện Tiền",
      subtitle: "Tải ảnh tờ tiền Đông Nam Á lên để hệ thống so sánh kết quả từ nhiều tác nhân phân tích.",
      tokenBal: "Số dư Token",
    }
  }[lang || "EN"];

  return (
    <div className="page-inner pb-20 p-4 md:p-8 relative">
      <div className="page-orb-indigo top-0 left-[-10%]" />
      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-2">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-black tracking-tight text-foreground">
              {t.title}
            </h1>
            <p className="mt-2 leading-relaxed text-secondary">
              {t.subtitle}
            </p>
          </div>

          <div className={`flex items-center gap-3 px-5 py-3 border rounded-2xl shadow-sm transition-colors ${!hasEnoughTokens ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-surface'}`}>
            <div className={`p-2 rounded-xl ${!hasEnoughTokens ? 'bg-amber-500/20' : 'bg-primary/10'}`}>
              <Coins className={`w-5 h-5 ${!hasEnoughTokens ? 'text-amber-500' : 'text-primary'}`} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">
                {t.tokenBal}
              </p>
              <p className={`text-xl font-black leading-none ${!hasEnoughTokens ? 'text-amber-500' : 'text-foreground'}`}>
                {user?.token_balance || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Cảnh báo có Task đang chạy nền */}
        {activeTask && (
          <div className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-primary/30 bg-primary/5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl mt-0.5 bg-primary/20">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
              <div>
                <p className="font-bold text-primary">
                  {lang === "VI" ? "Có một tiến trình đang xử lý" : "An analysis is currently running"}
                </p>
                <p className="text-sm mt-0.5 text-secondary">
                  {activeTask.inputMeta?.filename || "Banknote Image"} • {lang === "VI" ? "Bạn có thể tiếp tục xem tiến trình." : "You can resume viewing the progress."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  clearActiveTask();
                  clearActiveRecognitionTask();
                }}
                className="px-3 py-2 rounded-xl text-sm font-semibold border border-border text-secondary hover:bg-surface transition"
              >
                {lang === "VI" ? "Ẩn khỏi màn hình" : "Hide locally"}
              </button>
              <button
                onClick={() => navigate("/processing", { replace: true })}
                className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold shadow-sm hover:bg-primary-hover transition flex items-center gap-2"
              >
                <PlaySquare className="w-4 h-4" />
                {lang === "VI" ? "Tiếp tục xem" : "Resume"}
              </button>
            </div>
          </div>
        )}

        {/* 2-Column Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-stretch">
          <div className="lg:col-span-8 xl:col-span-8">
            <UploadZone />
          </div>
          <div className="lg:col-span-4 xl:col-span-4">
            <RecentHistorySide />
          </div>
        </div>

      </div>
    </div>
  );
}
