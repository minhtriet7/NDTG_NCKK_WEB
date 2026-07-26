import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { CheckCircle2, Coins, PlaySquare, Loader2, AlertCircle } from "lucide-react";

import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import {
  clearActiveRecognitionTask,
  getRecognitionTaskStatus,
} from "../../services/recognitionService";

import UploadZone from "../../components/workspace/UploadZone";
import RecentHistorySide from "../../components/workspace/RecentHistorySide";

const FLOW_STEPS_EN = [
  { num: "01", text: "Upload or capture image" },
  { num: "02", text: "Crop Gate verifies banknote region" },
  { num: "03", text: "Recognition agents analyze independently" },
  { num: "04", text: "Referee returns the final result" },
];

const FLOW_STEPS_VI = [
  { num: "01", text: "Tải lên hoặc chụp ảnh tờ tiền" },
  { num: "02", text: "Crop Gate xác minh vùng tiền giấy" },
  { num: "03", text: "Ba agent nhận diện độc lập phân tích ảnh" },
  { num: "04", text: "Trọng tài tổng hợp và trả về kết quả cuối" },
];

const TIPS_EN = [
  "Keep the entire banknote visible.",
  "Avoid glare and motion blur.",
  "Keep printed text readable.",
  "Use a plain, contrasting background.",
  "Do not overlap multiple banknotes.",
];

const TIPS_VI = [
  "Giữ toàn bộ tờ tiền hiển thị trong khung hình.",
  "Tránh phản sáng, phản chiếu và mờ chuyển động.",
  "Đảm bảo chữ in và số seri đọc được rõ ràng.",
  "Dùng nền đơn giản, tương phản rõ.",
  "Không chồng lấp nhiều tờ tiền.",
];

export default function Recognition() {
  const { user } = useAuthStore();
  const { lang } = useAppStore();
  const {
    activeTask,
    scanNonce,
    getFreshActiveTask,
    clearActiveTask,
    resetScanSession,
  } = useRecognitionStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [completedTask, setCompletedTask] = useState(null);

  const isVI = lang === "VI";

  const t = {
    title: isVI ? "Không gian Nhận diện" : "Recognition Workspace",
    subtitle: isVI
      ? "Tải lên hoặc chụp ảnh tờ tiền để phân tích thông qua các agent chuyên sâu."
      : "Upload or capture a banknote image to analyze via independent recognition agents.",
    helper: isVI
      ? "Tải ảnh tờ tiền rõ nét hoặc chụp trực tiếp từ camera."
      : "Upload a clear banknote image or capture directly from camera.",
    tokenBal: isVI ? "Số dư Token" : "Token Balance",
    completedTitle: isVI ? "Phân tích đã hoàn tất" : "Analysis completed",
    completedDesc: isVI
      ? "Tác vụ nền đã kết thúc. Bạn có thể xem kết quả ngay."
      : "The background task has finished. View the result now.",
    viewResult: isVI ? "Xem kết quả" : "View Result",
    activeTitle: isVI ? "Có tiến trình đang chạy" : "Analysis in progress",
    activeDesc: isVI
      ? "Bạn có thể rời trang, tác vụ vẫn tiếp tục."
      : "You can leave this page — the task continues running.",
    resume: isVI ? "Tiếp tục xem" : "Resume",
    hide: isVI ? "Ẩn" : "Dismiss",
    tipsTitle: isVI ? "Mẹo chụp ảnh" : "Image quality tips",
    flowTitle: isVI ? "Quy trình nhận diện" : "Recognition flow",
    buyTokens: isVI ? "Mua Token" : "Buy tokens",
    noToken: isVI ? "Không đủ Token" : "Insufficient tokens",
    supportedTitle: isVI ? "Ảnh được hỗ trợ" : "Supported images",
    supportedFormats: isVI ? "Định dạng" : "Supported formats",
    maximumSize: isVI ? "Dung lượng tối đa" : "Maximum size",
    bestFor: isVI ? "Phù hợp nhất" : "Best for",
    supports: isVI ? "Hỗ trợ" : "Supports",
    imageNote: isVI ? "Lưu ý" : "Note",
    bestForValue: isVI ? "Tiền giấy Đông Nam Á" : "Southeast Asian banknotes",
    supportsValue: isVI ? "Một hoặc nhiều tờ tiền" : "Single or multiple banknotes",
    imageNoteValue: isVI ? "Dùng ảnh rõ, không cắt mất mép tờ tiền" : "Use clear, uncropped images",
    noTokenDesc: isVI
      ? "Bạn cần ít nhất 1 token để bắt đầu phân tích."
      : "You need at least 1 token to run an analysis.",
  };

  const flowSteps = isVI ? FLOW_STEPS_VI : FLOW_STEPS_EN;
  const tips = isVI ? TIPS_VI : TIPS_EN;

  const hasEnoughTokens = Number(user?.token_balance || 0) > 0;

  useEffect(() => {
    if (location.state?.resetScan) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompletedTask(null);
      resetScanSession(location.state?.nonce);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, resetScanSession, navigate, location.pathname]);

  useEffect(() => {
    if (location.state?.resetScan) return undefined;

    const task = getFreshActiveTask();
    if (!task?.taskId) return undefined;

    let cancelled = false;
    let timerId = null;

    const terminalStatuses = new Set([
      "completed", "completed_with_review", "completed_partial",
      "completed_with_limit", "no_banknote_detected", "needs_better_image",
      "needs_review", "agent_error", "technical_error", "failed",
      "timeout", "cancelled", "canceled", "error", "done", "success",
    ]);

    const normalizeStatus = (value) =>
      String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

    const checkTask = async () => {
      try {
        const response = await getRecognitionTaskStatus(task.taskId);
        if (cancelled) return;

        const payload = response?.data ?? response ?? {};
        const result =
          payload?.result || payload?.data?.result || payload?.recognition || null;
        const statuses = [
          payload?.status,
          payload?.result_status,
          result?.status,
          result?.final_result?.status,
        ].map(normalizeStatus);

        if (statuses.some((s) => terminalStatuses.has(s))) {
          setCompletedTask({
            taskId: task.taskId,
            result: result || payload,
            previewUrl:
              result?.input_image_url ||
              result?.uploaded_image_url ||
              payload?.input_image_url ||
              payload?.uploaded_image_url ||
              null,
          });
          clearActiveTask();
          clearActiveRecognitionTask();
          return;
        }

        timerId = window.setTimeout(checkTask, 3000);
      } catch (error) {
        if (cancelled) return;
        if (error?.response?.status === 404) {
          clearActiveTask();
          clearActiveRecognitionTask();
          return;
        }
        timerId = window.setTimeout(checkTask, 5000);
      }
    };

    checkTask();

    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [activeTask?.taskId, clearActiveTask, getFreshActiveTask, location.state?.resetScan]);

  return (
    <div className="min-h-screen bg-slate-100/70 pb-20 dark:bg-slate-950">
      <div className="mx-auto max-w-[1280px] space-y-5 px-4 pt-6 md:px-6 md:pt-8">

        {/* ─── Header ─── */}
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {t.title}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
              {t.subtitle}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              {t.helper}
            </p>
          </div>

          {/* Token Card */}
          <div
            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 shadow-sm transition-colors sm:w-auto sm:min-w-[190px] ${
              !hasEnoughTokens
                ? "border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/10"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                !hasEnoughTokens
                  ? "bg-amber-100 dark:bg-amber-800/30 text-amber-600 dark:text-amber-400"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                {t.tokenBal}
              </p>
              <p
                className={`text-xl font-extrabold leading-none mt-0.5 ${
                  !hasEnoughTokens
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {user?.token_balance ?? 0}
              </p>
            </div>
            {!hasEnoughTokens && (
              <Link
                to="/pricing"
                className="ml-2 text-xs font-bold text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:text-amber-600 transition-colors"
              >
                {t.buyTokens}
              </Link>
            )}
          </div>
        </div>

        {/* ─── No-token warning ─── */}
        {!hasEnoughTokens && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t.noTokenDesc}{" "}
              <Link
                to="/pricing"
                className="font-bold underline underline-offset-2 hover:text-amber-600 transition-colors"
              >
                {t.buyTokens}
              </Link>
            </p>
          </div>
        )}

        {/* ─── Completed Task Notification ─── */}
        {completedTask && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-4 rounded-xl border border-emerald-300 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/10 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-800/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  {t.completedTitle}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400/80 mt-0.5">
                  {t.completedDesc}
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                navigate("/result", {
                  state: {
                    scanResult: completedTask.result,
                    taskId: completedTask.taskId,
                    previewUrl: completedTask.previewUrl,
                  },
                })
              }
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition-colors shrink-0"
            >
              <PlaySquare className="w-4 h-4" />
              {t.viewResult}
            </button>
          </div>
        )}

        {/* ─── Active Task Banner ─── */}
        {activeTask && !completedTask && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-4 rounded-xl border border-blue-200 dark:border-blue-700/40 bg-blue-50 dark:bg-blue-900/10 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800/30 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800 dark:text-blue-300">
                  {t.activeTitle}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-400/80 mt-0.5">
                  {activeTask?.inputMeta?.filename
                    ? `${activeTask.inputMeta.filename} — `
                    : ""}
                  {t.activeDesc}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  clearActiveTask();
                  clearActiveRecognitionTask();
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                {t.hide}
              </button>
              <button
                onClick={() =>
                  navigate(
                    activeTask?.taskId
                      ? `/processing/${activeTask.taskId}`
                      : "/processing",
                    { replace: true }
                  )
                }
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-colors"
              >
                <PlaySquare className="w-3.5 h-3.5" />
                {t.resume}
              </button>
            </div>
          </div>
        )}

        {/* ─── Main Grid ─── */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
          {/* Left: Workspace */}
          <div className="min-w-0">
            <UploadZone key={scanNonce || "scan-initial"} />
          </div>

          {/* Right: Sidebar */}
          <div className="flex min-w-0 flex-col gap-4">
            <RecentHistorySide />

            {/* Tips Card */}
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {t.tipsTitle}
                </h3>
              </div>
              <ul className="px-5 py-4 space-y-3">
                {tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 mt-1.5 shrink-0" />
                    <span className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {tip}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {t.supportedTitle}
                </h3>
              </div>
              <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
                <dt className="text-slate-500 dark:text-slate-400">{t.supportedFormats}</dt>
                <dd className="text-right font-semibold text-slate-800 dark:text-slate-200">JPG, PNG, WEBP</dd>
                <dt className="text-slate-500 dark:text-slate-400">{t.maximumSize}</dt>
                <dd className="text-right font-semibold text-slate-800 dark:text-slate-200">5 MB</dd>
                <dt className="text-slate-500 dark:text-slate-400">{t.bestFor}</dt>
                <dd className="text-right font-semibold text-slate-800 dark:text-slate-200">{t.bestForValue}</dd>
                <dt className="text-slate-500 dark:text-slate-400">{t.supports}</dt>
                <dd className="text-right font-semibold text-slate-800 dark:text-slate-200">{t.supportsValue}</dd>
                <dt className="text-slate-500 dark:text-slate-400">{t.imageNote}</dt>
                <dd className="text-right font-semibold text-slate-800 dark:text-slate-200">{t.imageNoteValue}</dd>
              </dl>
            </section>

            {/* Flow Card */}
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {t.flowTitle}
                </h3>
              </div>
              <div className="px-5 py-4 relative">
                {/* Vertical connector line */}
                <div className="absolute left-[27px] top-6 bottom-6 w-px bg-slate-200 dark:bg-slate-700" />
                <div className="space-y-4">
                  {flowSteps.map((step, i) => (
                    <div key={i} className="flex items-start gap-4 relative z-10">
                      <div className="w-7 h-7 rounded-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-extrabold text-slate-500 dark:text-slate-400 font-mono">
                          {step.num}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug pt-0.5">
                        {step.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
