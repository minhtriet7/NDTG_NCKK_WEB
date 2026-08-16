import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Brain,
  ScanLine,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Timer,
  Hash,
  ShieldCheck,
  Gavel,
  UploadCloud,
  ChevronRight,
} from "lucide-react";

import {
  startRecognitionTask,
  getRecognitionTaskLightStatus,
  cancelRecognitionTask,
  getRecognitionResult,
  saveActiveRecognitionTask,
  clearActiveRecognitionTask,
  getActiveRecognitionTask,
  getRecognitionFileDebug,
  isValidRecognitionImage,
} from "../../services/recognitionService";

import { useAuthStore } from "../../store/authStore";
import {
  getRecognitionFileFingerprint,
  useRecognitionStore,
} from "../../store/recognitionStore";
import { useLanguageStore } from "../../store/languageStore";
import { normalizeUserResultResponse } from "../../utils/userResultAdapter";

const dict = {
  EN: {
    findingRegion: "Finding banknote region",
    checkingCrop: "Checking crop region",
    analyzingAI: "Analyzing with AI agents",
    aggregating: "Aggregating results",
    completed: "Completed",
    noBanknote: "No valid banknote detected",
    cropGate: "Crop Gate — YOLO + AG0",
    cropGateDesc: "YOLO finds the banknote region, AG0 verifies if the crop is valid.",
    aiAnalysisBoard: "AI Analysis Board",
    aiAnalysisBoardDesc: "Three AI agents analyze independently. This page only shows progress.",
    taskId: "Task ID",
    elapsed: "Elapsed",
    waitingCrop: "Waiting for crop data from backend...",
    cropUnderAnalysis: "Crop region under analysis",
    originalImage: "Original image",
    cropPreview: "Crop preview",
    pipelineTitle: "Analyzing banknote",
    pipelineDesc: "YOLO selects the image region, then GPT, Gemini, and Google Lens analyze it independently before the referee aggregates the results.",
    youCanLeave: "You can leave this page, the task will continue running.",
    waitingImage: "Waiting for uploaded image",
    timelineTitle: "Timeline",
    timelineDesc: "Current steps running in the recognition pipeline.",
    uploadStep: "Upload Image",
    cropGateDetails: "Crop Gate Details",
    reasonSelected: "Selection reason:",
    boxesRejected: "Boxes rejected:",
    notMeetCriteria: "regions did not meet criteria.",
    boxSelectionTrace: "Box selection trace",
    agent1Desc: "Reads visual info, printed text, and denomination signs.",
    agent2Desc: "Analyzes image and context for independent verification.",
    agent3DescErr: "Technical error, not counted in consensus.",
    agent3DescOk: "Cross-checks web via reverse image search.",
    ag4Referee: "AG4 Referee",
    ag4RefereeDesc: "Waiting for AI results to compare and make final decision.",
    ruleTitle: "Rule",
    ruleDesc: "Prioritizes 2/3 agreement of valid results.",
    ruleErr: "Google Lens encountered a technical error, not counted in consensus.",
    failTitle: "Analysis Failed",
    failDesc: "Analysis process failed.",
    retryBtn: "Try Again",
    stopProcessing: "Stop processing",
    stopping: "Stopping...",
    stopConfirmTitle: "Stop this recognition task?",
    stopConfirmDesc: "The backend task will be cancelled at the next safe checkpoint.",
    confirmStop: "Stop task",
    keepRunning: "Keep running",
    retryCancel: "Retry cancel",
    cancelError: "Could not stop the task. It is still running.",
    cancellingStage: "Stopping",
    cancelledTitle: "Recognition stopped",
    cancelledDesc: "This task was cancelled before completion.",
    backToWorkspace: "Back to Workspace",
    scanAnother: "Scan another image",
    pipelineName: "BanknoteAI Pipeline"
  },
  VI: {
    findingRegion: "Đang tìm vùng tiền giấy",
    checkingCrop: "Đang kiểm tra vùng cắt",
    analyzingAI: "Đang phân tích bởi AI",
    aggregating: "Đang tổng hợp kết quả",
    completed: "Hoàn tất",
    noBanknote: "Không phát hiện tiền giấy",
    cropGate: "Cổng cắt ảnh — YOLO + AG0",
    cropGateDesc: "YOLO tìm vùng nghi là tiền giấy, AG0 kiểm tra vùng crop có hợp lệ không.",
    aiAnalysisBoard: "Bảng phân tích AI",
    aiAnalysisBoardDesc: "Ba AI phân tích độc lập. Trang này chỉ hiển thị tiến trình.",
    taskId: "Mã tác vụ",
    elapsed: "Thời gian",
    waitingCrop: "Đang chờ backend trả vùng cắt...",
    cropUnderAnalysis: "Vùng cắt đang được phân tích",
    originalImage: "Ảnh gốc",
    cropPreview: "Vùng cắt",
    pipelineTitle: "Đang phân tích tờ tiền",
    pipelineDesc: "YOLO chọn vùng ảnh, sau đó GPT, Gemini và Google Lens phân tích độc lập trước khi trọng tài tổng hợp kết quả.",
    youCanLeave: "Bạn có thể rời trang, tác vụ vẫn tiếp tục chạy.",
    waitingImage: "Đang chờ ảnh tải lên",
    timelineTitle: "Timeline",
    timelineDesc: "Các bước đang chạy trong pipeline nhận diện.",
    uploadStep: "Upload ảnh",
    cropGateDetails: "Chi tiết Cổng cắt ảnh",
    reasonSelected: "Lý do chọn crop:",
    boxesRejected: "Box bị loại:",
    notMeetCriteria: "vùng không đạt tiêu chí.",
    boxSelectionTrace: "Box selection trace",
    agent1Desc: "Đọc thông tin thị giác, chữ in và dấu hiệu mệnh giá từ ảnh.",
    agent2Desc: "Phân tích ảnh và ngữ cảnh để đối chiếu nhận định độc lập.",
    agent3DescErr: "Lỗi kỹ thuật, không tính vào đồng thuận.",
    agent3DescOk: "Đối chiếu web bằng tìm kiếm ảnh bên ngoài.",
    ag4Referee: "AG4 Referee",
    ag4RefereeDesc: "Đang chờ kết quả từ các AI để so sánh và đưa ra quyết định cuối cùng.",
    ruleTitle: "Rule",
    ruleDesc: "Ưu tiên đồng thuận 2/3 kết quả hợp lệ.",
    ruleErr: "Google Lens lỗi kỹ thuật, không tính vào đồng thuận.",
    failTitle: "Phân tích thất bại",
    failDesc: "Quá trình phân tích thất bại.",
    retryBtn: "Thử lại",
    stopProcessing: "Dừng xử lý",
    stopping: "Đang dừng...",
    stopConfirmTitle: "Dừng tác vụ nhận diện này?",
    stopConfirmDesc: "Tác vụ backend sẽ được hủy tại checkpoint an toàn kế tiếp.",
    confirmStop: "Dừng tác vụ",
    keepRunning: "Tiếp tục chạy",
    retryCancel: "Thử dừng lại",
    cancelError: "Chưa thể dừng tác vụ. Tác vụ vẫn đang chạy.",
    cancellingStage: "Đang dừng",
    cancelledTitle: "Đã dừng nhận diện",
    cancelledDesc: "Tác vụ đã được hủy trước khi hoàn thành.",
    backToWorkspace: "Quay lại không gian làm việc",
    scanAnother: "Quét ảnh khác",
    pipelineName: "BanknoteAI Pipeline"
  }
};

const MAX_POLL_TIME_MS = 4 * 60 * 1000; // 4 phút timeout cứng ở frontend

const MIN_POLL_DELAY_MS = 1000;
const MAX_POLL_DELAY_MS = 5000;
const MISSING_RESULT_RETRY_LIMIT = 3;
const MISSING_RESULT_RETRY_DELAY_MS = 1000;

const TERMINAL_DONE_STATUSES = new Set([
  "done",
  "completed",
  "completed_with_limit",
  "completed_partial",
  "complete",
  "success",
  "succeeded",
  "needs_review",
  "needs review",
  "no_banknote_detected",
  "needs_better_image",
  "invalid_conclusion",
]);

const TERMINAL_FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "timeout",
  "agent_error",
  "technical_error",
]);

const TERMINAL_CANCELLED_STATUSES = new Set([
  "cancelled",
  "canceled",
]);

const CANCELLING_STATUSES = new Set([
  "cancelling",
  "canceling",
]);

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function unwrapApiResponse(response) {
  return response?.data ?? response;
}

function getTaskId(task) {
  return task?.task_id || task?.id || task?.taskId || null;
}

function getTaskResultId(task) {
  return (
    task?.result_id ||
    task?.resultId ||
    task?.result?.result_id ||
    task?.result?.id ||
    task?.data?.result_id ||
    null
  );
}

function getTaskResult(task) {
  return task?.result || task?.data?.result || task?.recognition || null;
}

function isNoBanknoteResult(task) {
  const result = getTaskResult(task) || {};
  const status = normalizeStatus(
    result?.final_result?.status || result?.status || task?.result_status,
  );
  const detectedCount = Number(
    result?.detected_count ?? result?.final_result?.detected_count ?? -1,
  );

  return status === "no_banknote_detected" && detectedCount === 0;
}

function getTaskError(task) {
  return (
    task?.public_error ||
    task?.error_message ||
    task?.error ||
    task?.message ||
    "Quá trình phân tích thất bại."
  );
}

function isAbortError(error) {
  return (
    error?.code === "ERR_CANCELED" ||
    error?.name === "CanceledError" ||
    error?.message === "canceled"
  );
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function normalizeProgress(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), 100);
}

function clampPollDelay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(Math.max(numeric, MIN_POLL_DELAY_MS), MAX_POLL_DELAY_MS);
}

function getNextPollDelay(startedAt, retryAfterMs, networkErrorCount = 0) {
  const backendDelay = clampPollDelay(retryAfterMs);
  if (backendDelay) return backendDelay;

  const elapsed = Date.now() - (startedAt || Date.now());
  const baseDelay =
    elapsed < 15000 ? 1000 :
    elapsed < 60000 ? 2000 :
    5000;

  return Math.min(baseDelay + networkErrorCount * 1000, MAX_POLL_DELAY_MS);
}

function mapPipelineByProgress(stage, progress, t) {
  const safeProgress = normalizeProgress(progress);
  const value = String(stage || "").toLowerCase();
  const isDone = value.includes("done") || value.includes("complete") || value.includes("success") || safeProgress >= 100;
  const isFinalizing = value.includes("final") || safeProgress >= 90;
  const isReferee = value.includes("aggregat") || value.includes("referee") || safeProgress >= 65;
  const isDebate = value.includes("agent") || value.includes("running") || safeProgress >= 20;

  if (isDone) {
    return {
      crop: "success",
      gpt: "completed",
      gemini: "completed",
      lens: "completed",
      referee: "completed",
      currentStep: t.completed,
    };
  }

  if (isFinalizing || isReferee) {
    return {
      crop: "success",
      gpt: "completed",
      gemini: "completed",
      lens: "completed",
      referee: "running",
      currentStep: t.aggregating,
    };
  }

  if (isDebate) {
    return {
      crop: "success",
      gpt: "running",
      gemini: "running",
      lens: "running",
      referee: "waiting",
      currentStep: t.analyzingAI,
    };
  }

  return {
    crop: safeProgress > 0 ? "running" : "waiting",
    gpt: "waiting",
    gemini: "waiting",
    lens: "waiting",
    referee: "waiting",
    currentStep: t.checkingCrop,
  };
}

function StatusBadge({ status }) {
  const labels = {
    waiting: "Waiting",
    running: "Running",
    scanning: "Running",
    success: "Success",
    completed: "Completed",
    review: "Review",
    error: "Error",
    not_counted: "Not counted",
  };
  const classes = {
    waiting: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    running: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    scanning: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    review: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    error: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    not_counted: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-black uppercase tracking-wide ${classes[status] || classes.waiting}`}>
      {(status === "running" || status === "scanning") && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {labels[status] || labels.waiting}
    </span>
  );
}

function getCropDebug(task) {
  const source =
    task?.crop_checker ||
    task?.cropChecker ||
    task?.crop_preview ||
    task?.result?.crop_checker ||
    task?.result?.cropChecker ||
    task?.data?.crop_checker ||
    {};

  const cropUrl =
    task?.crop_image_url ||
    task?.cropped_image_url ||
    task?.selected_crop_url ||
    task?.crop_preview?.selected_crop_url ||
    task?.crop_preview?.crop_image_url ||
    task?.result?.crop_image_url ||
    task?.result?.cropped_image_url ||
    source?.crop_image_url ||
    source?.selected_crop_url ||
    source?.cropped_image_url ||
    null;

  return {
    cropUrl,
    cropBase64: task?.crop_base64 || task?.result?.crop_base64 || source?.crop_base64 || null,
    selectedReason:
      task?.selected_box_reason ||
      task?.selectedBoxReason ||
      source?.selected_box_reason ||
      source?.selectedBoxReason ||
      null,
    rejectedBoxes:
      task?.rejected_boxes ||
      task?.rejectedBoxes ||
      source?.rejected_boxes ||
      source?.rejectedBoxes ||
      [],
    boxTrace:
      task?.box_selection_trace ||
      task?.boxSelectionTrace ||
      source?.box_selection_trace ||
      source?.boxSelectionTrace ||
      [],
    metrics: source?.metrics || null,
  };
}

function getLensStatus(task, fallback) {
  const agentResults = task?.result?.agent_results || task?.agent_results || [];
  const lensFromList = agentResults.find(a =>
    String(a?.agent || a?.agent_name || a?.name || "").toLowerCase().includes("lens") ||
    String(a?.agent || a?.agent_name || a?.name || "").toLowerCase().includes("visual")
  );

  const lens =
    lensFromList?.data ||
    lensFromList?.result ||
    task?.agents?.visual_search ||
    task?.result?.agents?.visual_search ||
    task?.data?.agents?.visual_search ||
    task?.visual_search ||
    null;

  if (!lens) return fallback;

  const status = String(lens?.status || lensFromList?.status || "").toLowerCase();

  if (["failed", "technical_error", "timeout", "no_source", "disabled"].includes(status)) {
    return "not_counted";
  }

  const joined = JSON.stringify(lens).toLowerCase();
  if (
    joined.includes("timeout") ||
    joined.includes("quota") ||
    joined.includes("network") ||
    joined.includes("serpapi") ||
    joined.includes("api error") ||
    joined.includes("no data")
  ) {
    return "not_counted";
  }

  if (["completed", "success", "partial"].includes(status)) {
    return "completed";
  }

  return fallback;
}

function StepCard({ title, desc, status }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm transition-all duration-500 ${
        status === "running" || status === "scanning"
          ? "border-indigo-300/70 bg-white dark:bg-slate-900 shadow-indigo-500/10"
          : status === "completed" || status === "success"
          ? "border-emerald-200 bg-white dark:border-emerald-900/60 dark:bg-slate-900"
          : status === "error" || status === "not_counted"
          ? "border-rose-200 bg-white dark:border-rose-900/60 dark:bg-slate-900"
          : "border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/70"
      }`}
    >
      {(status === "running" || status === "scanning") && (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-500" />
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-slate-900 dark:text-slate-100">{title}</h3>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function TimelineStep({ icon: Icon, title, status, isActive }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
        status === "completed"
          ? "bg-emerald-500 text-white border-emerald-500"
          : isActive
          ? "bg-indigo-600 text-white border-indigo-600"
          : "bg-white text-slate-400 border-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:border-slate-800"
      }`}>
        {status === "completed" ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      </div>
      <p className={`text-sm font-bold ${isActive ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
        {title}
      </p>
    </div>
  );
}

const getApiErrorMessage = (error) => {
  const data = error?.response?.data;

  if (typeof data === "string") return data;

  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((item) => {
        if (typeof item === "string") return item;
        const loc = Array.isArray(item?.loc) ? item.loc.join(".") : "";
        const msg = item?.msg || item?.message || "Validation error";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join("; ");
  }

  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (typeof error?.message === "string") return error.message;

  return "Cannot start analysis. Please try again.";
};

export default function Processing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguageStore();
  const activeLang = lang?.toUpperCase() || "EN";
  const t = dict[activeLang];

  const currentImageFile = useRecognitionStore((state) => state.currentImageFile);
  const currentPreviewUrl = useRecognitionStore((state) => state.currentPreviewUrl);

  const fileToUse = location.state?.imageFile || location.state?.file || currentImageFile;
  const previewDataUrl = location.state?.previewDataUrl;
  const routePreviewUrl = location.state?.previewUrl;
  const routeScanNonce = location.state?.scanNonce || null;
  const routeFileFingerprint = location.state?.fileFingerprint || null;

  const [localObjectURL, setLocalObjectURL] = useState(null);
  const [backendPreviewUrl, setBackendPreviewUrl] = useState(null);

  useEffect(() => {
    let urlToRevoke = null;
    if (fileToUse && typeof fileToUse !== 'string') {
      try {
        urlToRevoke = URL.createObjectURL(fileToUse);
        // React owns the preview URL state; cleanup below still revokes the browser URL.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalObjectURL(urlToRevoke);
      } catch (e) {
        console.error("Could not create object URL from file:", e);
      }
    }
    return () => {
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [fileToUse]);

  const previewUrl = previewDataUrl || localObjectURL || routePreviewUrl || currentPreviewUrl || backendPreviewUrl;

  const updateTokenBalance = useAuthStore((state) => state.updateTokenBalance);
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const tokenBalance = useAuthStore((state) => state.user?.token_balance);

  const setScanSession = useRecognitionStore((state) => state.setScanSession);
  const setActiveTask = useRecognitionStore((state) => state.setActiveTask);
  const clearActiveTask = useRecognitionStore((state) => state.clearActiveTask);
  const peekFreshActiveTask = useRecognitionStore(
    (state) => state.peekFreshActiveTask,
  );
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("queued");
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taskSnapshot, setTaskSnapshot] = useState(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isMissingFileError, setIsMissingFileError] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [cancelState, setCancelState] = useState("idle");
  const [cancelError, setCancelError] = useState(null);

  const [agentsStatus, setAgentsStatus] = useState({
    crop: "running",
    gpt: "waiting",
    gemini: "waiting",
    lens: "waiting",
    referee: "waiting",
  });

  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(false);
  const pollTimerRef = useRef(null);
  const elapsedTimerRef = useRef(null);
  const finishedRef = useRef(false);
  const currentTaskIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const pollInFlightRef = useRef(false);
  const pollAbortControllerRef = useRef(null);
  const cancelAbortControllerRef = useRef(null);
  const resultFetchStartedRef = useRef(false);
  const missingResultRetryCountRef = useRef(0);
  const networkErrorCountRef = useRef(0);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollAbortControllerRef.current) {
      pollAbortControllerRef.current.abort();
      pollAbortControllerRef.current = null;
    }
    pollInFlightRef.current = false;
  };

  const scheduleNextPoll = (taskId, retryAfterMs = null) => {
    if (!taskId || finishedRef.current || !isMountedRef.current) return;

    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const offline =
      typeof navigator !== "undefined" &&
      "onLine" in navigator &&
      navigator.onLine === false;
    const delayMs = offline
      ? MAX_POLL_DELAY_MS
      : getNextPollDelay(
          startTimeRef.current,
          retryAfterMs,
          networkErrorCountRef.current,
        );

    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null;
      void pollTask(taskId);
    }, delayMs);
  };

  const startElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearTimeout(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    const tick = () => {
      if (!isMountedRef.current || finishedRef.current) return;
      setElapsedMs(Date.now() - startTimeRef.current);
      elapsedTimerRef.current = setTimeout(tick, 1000);
    };

    tick();
  };

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearTimeout(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const setVisualStage = (nextStage, nextProgress, nextTaskSnapshot = null) => {
    if (!isMountedRef.current) return;

    const safeStage = nextStage || "processing";
    const safeProgress = normalizeProgress(nextProgress);
    const nextPipeline = mapPipelineByProgress(safeStage, safeProgress, t);

    setStage(safeStage);
    setProgress(safeProgress);
    const snapshotForStatus = nextTaskSnapshot || taskSnapshot;
    setAgentsStatus((prev) => ({
      ...nextPipeline,
      lens: getLensStatus(snapshotForStatus, nextPipeline.lens || prev.lens),
    }));
  };

  const finishSuccessfully = async (taskId, taskStatus) => {
    if (
      finishedRef.current ||
      resultFetchStartedRef.current ||
      !isMountedRef.current
    ) {
      return;
    }

    const resultId = getTaskResultId(taskStatus);
    if (!resultId) {
      failProcessing("Completed task did not return a result id. Please scan again.");
      return;
    }

    resultFetchStartedRef.current = true;
    finishedRef.current = true;
    stopPolling();
    stopElapsedTimer();

    try {
      // API interceptor already unwraps {success,data} envelope.
      // The returned value IS the public payload — do NOT call unwrapApiResponse
      // here because that would access response.data (summary sub-object) and
      // strip consensus, agentVotes, crop, billing, and evidence.
      const response = await getRecognitionResult(resultId);
      const publicResult = response;

      if (!isMountedRef.current) return;

      const result = normalizeUserResultResponse(
        {
          ...publicResult,
          input_image_url:
            publicResult?.input_image_url ||
            publicResult?.image_url ||
            publicResult?.uploaded_image_url ||
            previewUrl ||
            null,
          task_id: taskId,
          result_id: publicResult?.result_id || publicResult?.id || resultId,
        },
        { taskId, previewUrl },
      ) || {
        ...publicResult,
        input_image_url:
          publicResult?.input_image_url ||
          publicResult?.image_url ||
          publicResult?.uploaded_image_url ||
          previewUrl ||
          null,
        task_id: taskId,
        result_id: publicResult?.result_id || publicResult?.id || resultId,
      };

      setVisualStage("done", 100, taskStatus);
      clearActiveRecognitionTask();
      clearActiveTask();
      setScanSession(result.input_image_url || previewUrl, result, taskId);

      const shouldFallbackCharge =
        !isNoBanknoteResult({ result }) &&
        Number(
          result?.billing?.credits_charged ??
            result?.credits_charged ??
            result?.system_tokens_charged ??
            1,
        ) > 0;

      const applyFallbackCharge = () => {
        if (shouldFallbackCharge && typeof tokenBalance !== "undefined") {
          updateTokenBalance(Math.max(Number(tokenBalance || 0) - 1, 0));
        }
      };

      navigate("/result", {
        replace: true,
        state: {
          scanResult: result,
          taskId,
          previewUrl: result.input_image_url || previewUrl,
        },
      });

      void Promise.resolve(syncProfile?.())
        .then((latestProfile) => {
          if (!latestProfile) {
            applyFallbackCharge();
          }
        })
        .catch(() => {
          applyFallbackCharge();
        });
    } catch (err) {
      resultFetchStartedRef.current = false;
      finishedRef.current = false;

      if (!isMountedRef.current || isAbortError(err)) return;

      failProcessing(getApiErrorMessage(err));
    }
  };

  const failProcessing = (message) => {
    if (finishedRef.current || !isMountedRef.current) return;

    finishedRef.current = true;
    stopPolling();
    stopElapsedTimer();

    clearActiveRecognitionTask();
    clearActiveTask();

    setError(message || t.failDesc);
  };

  const finishCancelled = (taskStatus = null) => {
    if (finishedRef.current || !isMountedRef.current) return;

    finishedRef.current = true;
    stopPolling();
    stopElapsedTimer();
    clearActiveRecognitionTask();
    clearActiveTask();
    setCancelError(null);
    setCancelState("cancelled");
    setTaskSnapshot(taskStatus || taskSnapshot);
    setStage("cancelled");
    setProgress(100);
    setAgentsStatus((prev) => ({
      ...prev,
      crop: prev.crop === "waiting" ? "waiting" : "not_counted",
      gpt: "not_counted",
      gemini: "not_counted",
      lens: "not_counted",
      referee: "not_counted",
    }));
  };

  const requestCancelConfirmation = () => {
    setCancelError(null);
    setCancelState("confirming");
  };

  const dismissCancelConfirmation = () => {
    if (cancelState === "confirming" || cancelState === "error") {
      setCancelError(null);
      setCancelState("idle");
    }
  };

  const confirmCancelTask = async () => {
    const taskId = currentTaskIdRef.current || currentTaskId;
    if (!taskId || cancelState === "requesting" || cancelState === "cancelling") {
      return;
    }

    setCancelError(null);
    setCancelState("requesting");
    stopPolling();

    const controller = new AbortController();
    cancelAbortControllerRef.current = controller;

    try {
      const response = await cancelRecognitionTask(taskId, {
        signal: controller.signal,
      });
      const payload = unwrapApiResponse(response);
      if (!isMountedRef.current || finishedRef.current) return;

      const status = normalizeStatus(payload?.status);
      setTaskSnapshot((prev) => ({ ...(prev || {}), ...(payload || {}) }));

      if (TERMINAL_CANCELLED_STATUSES.has(status)) {
        finishCancelled(payload);
        return;
      }

      if (payload?.terminal) {
        setCancelState("idle");
        void pollTask(taskId);
        return;
      }

      setCancelState("cancelling");
      setVisualStage(payload?.stage || t.cancellingStage, progress, payload);
      scheduleNextPoll(taskId, payload?.retry_after_ms || MIN_POLL_DELAY_MS);
    } catch (err) {
      if (isAbortError(err)) return;
      if (!isMountedRef.current || finishedRef.current) return;

      setCancelError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          t.cancelError,
      );
      setCancelState("error");
      scheduleNextPoll(taskId, MIN_POLL_DELAY_MS);
    } finally {
      if (cancelAbortControllerRef.current === controller) {
        cancelAbortControllerRef.current = null;
      }
    }
  };

  const pollTask = async (taskId) => {
    if (
      !taskId ||
      finishedRef.current ||
      !isMountedRef.current ||
      pollInFlightRef.current
    ) {
      return;
    }

    const startedAt = startTimeRef.current || Date.now();
    if (Date.now() - startedAt > MAX_POLL_TIME_MS) {
      failProcessing("Task timeout, please scan again.");
      return;
    }

    const controller = new AbortController();
    pollInFlightRef.current = true;
    pollAbortControllerRef.current = controller;
    let shouldScheduleNext = false;
    let nextDelayMs = null;

    try {
      const response = await getRecognitionTaskLightStatus(taskId, {
        signal: controller.signal,
      });
      const task = unwrapApiResponse(response);

      if (!isMountedRef.current || finishedRef.current) return;

      networkErrorCountRef.current = 0;

      const status = normalizeStatus(task?.status);
      const terminal = Boolean(task?.terminal);
      setTaskSnapshot(task);
      
      // Cập nhật lại ảnh preview nếu frontend bị mất URL do reload tab
      if (!previewUrl && task?.input_image_url) {
        setBackendPreviewUrl(task.input_image_url);
      }

      setVisualStage(
        task?.stage || task?.status || "processing",
        task?.progress,
        task,
      );

      if (TERMINAL_CANCELLED_STATUSES.has(status)) {
        finishCancelled(task);
        return;
      }

      if (CANCELLING_STATUSES.has(status)) {
        setCancelState("cancelling");
        shouldScheduleNext = true;
        nextDelayMs = task?.retry_after_ms;
        return;
      }

      if (
        TERMINAL_DONE_STATUSES.has(status) ||
        (terminal && !TERMINAL_FAILED_STATUSES.has(status) && getTaskResultId(task))
      ) {
        if (!getTaskResultId(task)) {
          missingResultRetryCountRef.current += 1;
          if (missingResultRetryCountRef.current <= MISSING_RESULT_RETRY_LIMIT) {
            shouldScheduleNext = true;
            nextDelayMs = MISSING_RESULT_RETRY_DELAY_MS;
            return;
          }
          failProcessing("Completed task did not return a result id. Please scan again.");
          return;
        }

        await finishSuccessfully(taskId, task);
        return;
      }

      if (TERMINAL_FAILED_STATUSES.has(status)) {
        if (isNoBanknoteResult(task)) {
          await finishSuccessfully(taskId, task);
          return;
        }
        failProcessing(getTaskError(task));
        return;
      }

      shouldScheduleNext = true;
      nextDelayMs = task?.retry_after_ms;
    } catch (err) {
      if (isAbortError(err)) return;
      if (!isMountedRef.current || finishedRef.current) return;

      // Xử lý 404 nếu task hết hạn hoặc không tồn tại trên backend
      if (err?.response?.status === 404) {
        finishedRef.current = true;
        stopPolling();
        clearActiveRecognitionTask();
        clearActiveTask();
        navigate("/recognize", { replace: true });
        return;
      }

      // Không kết thúc flow ngay khi lỗi network tạm thời (network error hoặc 5xx)
      if (!err?.response || err?.response?.status >= 500) {
        networkErrorCountRef.current += 1;
        console.warn("Polling network error, retrying...", err.message);
        shouldScheduleNext = true;
        return; // Return mà không fail, để poll timer vòng sau gọi lại
      }

      failProcessing(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          t.failDesc,
      );
    } finally {
      if (pollAbortControllerRef.current === controller) {
        pollAbortControllerRef.current = null;
      }
      pollInFlightRef.current = false;
      if (shouldScheduleNext && isMountedRef.current && !finishedRef.current) {
        scheduleNextPoll(taskId, nextDelayMs);
      }
    }
  };

  const getKnownTaskId = ({ includeStored = true } = {}) => {
    const queryTaskId = new URLSearchParams(location.search).get("taskId");
    const pathTaskId = location.pathname.startsWith("/processing/")
      ? location.pathname.split("/").filter(Boolean).at(-1)
      : null;
    const storedTask = includeStored ? getActiveRecognitionTask() : null;
    const restoredTask = includeStored ? peekFreshActiveTask?.() : null;

    return (
      currentTaskIdRef.current ||
      location.state?.taskId ||
      queryTaskId ||
      pathTaskId ||
      restoredTask?.taskId ||
      storedTask?.taskId ||
      null
    );
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    startElapsedTimer();

    if (hasStartedRef.current) {
      const resumeTaskId = getKnownTaskId();
      if (resumeTaskId && !finishedRef.current) {
        currentTaskIdRef.current = resumeTaskId;
        setCurrentTaskId(resumeTaskId);
        setIsBootstrapping(false);
        void pollTask(resumeTaskId);
      }

      return () => {
        isMountedRef.current = false;
        stopPolling();
        if (cancelAbortControllerRef.current) {
          cancelAbortControllerRef.current.abort();
          cancelAbortControllerRef.current = null;
        }
        stopElapsedTimer();

      };
    }

    hasStartedRef.current = true;

    const start = async () => {
      try {
        setVisualStage("uploading", 10);

        const startsNewScan = Boolean(
          routeScanNonce || location.state?.imageFile || location.state?.file,
        );
        const explicitTaskId = getKnownTaskId({ includeStored: !startsNewScan });
        const storedTask = startsNewScan ? null : getActiveRecognitionTask();
        const restoredTask = startsNewScan ? null : peekFreshActiveTask?.();
        let taskId =
          explicitTaskId ||
          restoredTask?.taskId ||
          storedTask?.taskId ||
          null;

        if (!taskId) {
          const fileDebug = getRecognitionFileDebug(fileToUse);
          console.debug("[Processing] recognition upload preflight", fileDebug);

          if (!isValidRecognitionImage(fileToUse)) {
            setIsMissingFileError(true);
            failProcessing(
              activeLang === "VI"
                ? "Không tìm thấy file ảnh, vui lòng chọn ảnh lại."
                : "Image file not found. Please choose the image again.",
            );
            return;
          }
          const actualFingerprint = getRecognitionFileFingerprint(fileToUse);
          if (
            routeFileFingerprint &&
            actualFingerprint !== routeFileFingerprint
          ) {
            setIsMissingFileError(true);
            failProcessing(
              activeLang === "VI"
                ? "File ảnh đã thay đổi, vui lòng chọn ảnh lại."
                : "The selected image changed. Please choose it again.",
            );
            return;
          }

          const response = await startRecognitionTask(fileToUse);
          const task = unwrapApiResponse(response);
          taskId = getTaskId(task);
          setTaskSnapshot(task);

          if (!taskId) {
            throw new Error("Backend không trả về task_id.");
          }

          saveActiveRecognitionTask(taskId, {
            filename: fileToUse.name || "unknown",
            size: fileToUse.size || 0,
            type: fileToUse.type || "image/jpeg",
            fileFingerprint: actualFingerprint,
            scanNonce: routeScanNonce,
          });

          setActiveTask(taskId, {
            filename: fileToUse.name || "unknown",
            size: fileToUse.size || 0,
            type: fileToUse.type || "image/jpeg",
            fileFingerprint: actualFingerprint,
            scanNonce: routeScanNonce,
          });

          setVisualStage(
            task?.stage || task?.status || "queued",
            task?.progress || 5,
            task,
          );
        } else {
          setVisualStage("restoring task", 15);
        }

        currentTaskIdRef.current = taskId;
        setCurrentTaskId(taskId);

        void pollTask(taskId);
      } catch (err) {
        if (!isMountedRef.current || finishedRef.current) return;

        // Xử lý 404 trong lần gọi đầu tiên
        if (err?.response?.status === 404) {
          finishedRef.current = true;
          stopPolling();
          clearActiveRecognitionTask();
          clearActiveTask();
          navigate("/recognize", { replace: true });
          return;
        }

        // Không kết thúc flow ngay khi lỗi network tạm thời
        if (!err?.response || err?.response?.status >= 500) {
          console.error("Start task network error:", {
            status: err?.response?.status,
            endpoint: err?.config?.url,
            message: err?.message,
            responseData: err?.response?.data,
            stage: "init"
          });
          // Nếu lỗi ngay từ lần init mà chưa có taskId thì không thể poll được
          if (!currentTaskIdRef.current) {
            failProcessing(`Network error: ${err?.message}. ${err?.response?.status ? `(Status: ${err.response.status})` : ''} Please try again.`);
          }
          return;
        }

        console.error("Start task error:", {
            status: err?.response?.status,
            endpoint: err?.config?.url,
            message: err?.message,
            responseData: err?.response?.data,
            stage: "init"
        });

        failProcessing(getApiErrorMessage(err));
      } finally {
        if (isMountedRef.current) {
          setIsBootstrapping(false);
        }
      }
    };

    start();

    return () => {
      isMountedRef.current = false;
      stopPolling();
      if (cancelAbortControllerRef.current) {
        cancelAbortControllerRef.current.abort();
        cancelAbortControllerRef.current = null;
      }
      stopElapsedTimer();

    };
    // Chỉ chạy 1 lần mỗi lần vào Processing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isBootstrapping && !taskSnapshot) {
    return (
      <div className="page-inner flex min-h-[50vh] items-center justify-center py-10">
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          <span className="font-bold">
            {activeLang === "VI" ? "Đang khôi phục tác vụ..." : "Restoring task..."}
          </span>
        </div>
      </div>
    );
  }

  if (cancelState === "cancelled") {
    return (
      <div className="page-inner relative py-10">
        <div className="mx-auto max-w-3xl px-4 font-sans">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-950" role="status" aria-live="polite">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-600 dark:text-slate-300">
              <AlertCircle className="h-7 w-7" />
            </div>

            <h2 className="mb-2 text-2xl font-black text-slate-900 dark:text-slate-100">
              {t.cancelledTitle}
            </h2>

            <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {t.cancelledDesc}
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate("/workspace", { replace: true })}
                className="w-full rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:focus:ring-offset-slate-950 sm:w-auto"
              >
                {t.backToWorkspace}
              </button>
              <button
                type="button"
                onClick={() => navigate("/recognize", { replace: true, state: { resetScan: true } })}
                className="w-full rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-slate-950 sm:w-auto"
              >
                {t.scanAnother}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-inner relative py-10">
        <div className="mx-auto max-w-3xl px-4 font-sans">
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl shadow-rose-500/10 dark:border-rose-900/60 dark:bg-slate-950" role="alert">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
              <AlertCircle className="h-7 w-7" />
            </div>

            <h2 className="mb-2 text-2xl font-black text-rose-600 dark:text-rose-300">
              {t.failTitle}
            </h2>

            <p className="mb-6 text-sm leading-relaxed text-rose-500 dark:text-rose-300 break-words">{error}</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => {
                  if (isMissingFileError) {
                    navigate("/workspace", { replace: true });
                    return;
                  }
                  window.location.reload();
                }}
                className="w-full sm:w-auto rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
              >
                {isMissingFileError
                  ? activeLang === "VI"
                    ? "Chọn ảnh lại"
                    : "Choose image again"
                  : activeLang === "VI"
                    ? "Thử lại"
                    : "Try Again"}
              </button>

              {!isMissingFileError && (
                <button
                  onClick={() => navigate("/workspace", { replace: true })}
                  className="w-full sm:w-auto rounded-xl bg-slate-200 px-5 py-2.5 font-bold text-slate-700 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
                >
                  {activeLang === "VI" ? "Quay lại Workspace" : "Back to Workspace"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const safeProgress = normalizeProgress(progress);
  const pipeline = mapPipelineByProgress(stage, safeProgress, t);
  const cropDebug = getCropDebug(taskSnapshot);
  const cropImage = cropDebug.cropBase64
    ? `data:image/jpeg;base64,${cropDebug.cropBase64}`
    : cropDebug.cropUrl;
  const lensStatus = getLensStatus(taskSnapshot, agentsStatus.lens);
  const lensHasTechnicalIssue = lensStatus === "not_counted";
  const taskId = currentTaskId || taskSnapshot?.task_id || taskSnapshot?.id || "Đang tạo";
  const isCancelBusy = cancelState === "requesting" || cancelState === "cancelling";
  const showCancelDialogText =
    cancelState === "confirming" ||
    cancelState === "error" ||
    cancelState === "cancelling";
  const taskStatusText = normalizeStatus(taskSnapshot?.status);
  const taskIsTerminal = Boolean(
    taskSnapshot?.terminal ||
      TERMINAL_DONE_STATUSES.has(taskStatusText) ||
      TERMINAL_FAILED_STATUSES.has(taskStatusText) ||
      TERMINAL_CANCELLED_STATUSES.has(taskStatusText),
  );
  const showStopButton = Boolean(
    currentTaskId &&
      !taskIsTerminal &&
      cancelState !== "cancelled",
  );
  const activeTimelineIndex =
    safeProgress >= 95 ? 5 :
    safeProgress >= 75 ? 4 :
    safeProgress >= 25 ? 3 :
    safeProgress >= 12 ? 2 :
    safeProgress >= 5 ? 1 :
    0;
  const timeline = [
    { title: t.uploadStep, icon: UploadCloud },
    { title: t.findingRegion, icon: ScanLine },
    { title: t.checkingCrop, icon: ShieldCheck },
    { title: t.analyzingAI, icon: Brain },
    { title: t.aggregating, icon: Gavel },
    { title: t.completed, icon: CheckCircle2 },
  ];

  return (
    <div className="page-inner relative py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.18),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_55%)]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 font-sans sm:px-6">
        {/* Top: 2 cột chính cho Desktop */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* CỘT TRÁI: Trạng thái tổng quan, progress, timeline */}
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:p-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
                {t.pipelineName}
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {t.pipelineTitle}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {t.pipelineDesc}
              </p>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70" role="status" aria-live="polite">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-slate-100">{pipeline.currentStep}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.youCanLeave}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-3xl font-black text-slate-950 dark:text-white">{Math.round(safeProgress)}%</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{stage || "processing"}</p>
                  </div>
                </div>

                <div className="h-3 overflow-hidden rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-500 transition-all duration-500"
                    style={{ width: `${safeProgress}%` }}
                  />
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <Hash className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">{t.taskId}:</span>
                    <span className="min-w-0 truncate font-mono text-xs">{taskId}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <Timer className="h-4 w-4 text-cyan-500" />
                    <span className="font-semibold">{t.elapsed}:</span>
                    <span className="font-mono text-xs">{formatElapsed(elapsedMs)}</span>
                  </div>
                </div>

                {showStopButton && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-3 dark:border-rose-500/30 dark:bg-slate-950">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      {showCancelDialogText && (
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                            {cancelState === "cancelling" ? t.stopping : t.stopConfirmTitle}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                            {cancelError || t.stopConfirmDesc}
                          </p>
                        </div>
                      )}

                      <div className="flex shrink-0 flex-col gap-2 sm:ml-auto sm:flex-row">
                        {cancelState === "confirming" || cancelState === "error" ? (
                          <>
                            <button
                              type="button"
                              onClick={confirmCancelTask}
                              disabled={isCancelBusy}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-600 px-4 py-2 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40"
                            >
                              {isCancelBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                              {cancelState === "error" ? t.retryCancel : t.confirmStop}
                            </button>
                            <button
                              type="button"
                              onClick={dismissCancelConfirmation}
                              disabled={isCancelBusy}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              {t.keepRunning}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={requestCancelConfirmation}
                            disabled={isCancelBusy}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
                          >
                            {isCancelBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                            <AlertCircle className="h-4 w-4" />
                            {isCancelBusy ? t.stopping : t.stopProcessing}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-slate-950 dark:text-white">{t.timelineTitle}</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t.timelineDesc}</p>
                </div>
                <StatusBadge status={safeProgress >= 100 ? "completed" : "running"} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {timeline.map((item, index) => (
                  <TimelineStep
                    key={item.title}
                    icon={item.icon}
                    title={item.title}
                    status={index < activeTimelineIndex ? "completed" : "waiting"}
                    isActive={index === activeTimelineIndex}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* CỘT PHẢI: Cổng cắt ảnh (Ảnh gốc + Vùng cắt) */}
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-950 dark:text-white">{t.cropGate}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {t.cropGateDesc}
                  </p>
                </div>
                <StatusBadge status={agentsStatus.crop} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Ảnh gốc */}
                <div className="flex flex-col rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.originalImage}</p>
                  <div className="flex aspect-[4/3] min-h-[240px] max-h-[420px] w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-950">
                    {previewUrl ? (
                      <>
                        <img
                          src={previewUrl}
                          alt={t.originalImage}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'flex';
                          }}
                          className="h-full w-full object-contain object-center"
                        />
                        <div className="hidden flex-col items-center gap-2 text-slate-500">
                          <ImageIcon className="h-8 w-8 opacity-50" />
                          <span className="text-xs">Preview unavailable</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500">
                        <ImageIcon className="h-8 w-8" />
                        <span className="text-xs">{t.waitingImage}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vùng cắt */}
                <div className="flex flex-col rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.cropPreview}</p>
                  <div className="flex aspect-[4/3] min-h-[240px] max-h-[420px] w-full items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-slate-950">
                    {cropImage ? (
                      <div className="relative h-full w-full flex items-center justify-center">
                        <img
                          src={cropImage}
                          alt={t.cropUnderAnalysis}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'flex';
                          }}
                          className="h-full w-full object-contain object-center"
                        />
                        <div className="hidden flex-col items-center gap-2 text-slate-500">
                          <ImageIcon className="h-8 w-8 opacity-50" />
                          <span className="text-xs">Crop unavailable</span>
                        </div>
                        <div className="absolute bottom-2 inset-x-0 text-center">
                          <span className="bg-slate-900/80 text-white text-[10px] px-2 py-1.5 rounded-full backdrop-blur-md shadow-lg font-semibold border border-white/10">{t.cropUnderAnalysis}</span>
                        </div>
                      </div>
                    ) : safeProgress < 40 ? (
                      <div className="flex flex-col items-center justify-center space-y-3 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-xs font-semibold">
                          {activeLang === "VI" ? "Đang phát hiện vùng tiền giấy..." : "Detecting banknote region..."}
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-3 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                        <ImageIcon className="w-6 h-6 opacity-50" />
                        <span className="text-xs font-semibold">
                          {activeLang === "VI" ? "Chưa có vùng cắt" : "No crop available"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(cropDebug.selectedReason || cropDebug.rejectedBoxes?.length > 0 || cropDebug.boxTrace?.length > 0 || cropDebug.metrics) && (
                <details className="group mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                    <ChevronRight className="h-4 w-4 transition group-open:rotate-90" />
                    {t.cropGateDetails}
                  </summary>
                  <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    {cropDebug.selectedReason && (
                      <p><span className="font-bold text-slate-900 dark:text-slate-100">{t.reasonSelected}</span> {cropDebug.selectedReason}</p>
                    )}
                    {cropDebug.rejectedBoxes?.length > 0 && (
                      <p><span className="font-bold text-slate-900 dark:text-slate-100">{t.boxesRejected}</span> {cropDebug.rejectedBoxes.length} {t.notMeetCriteria}</p>
                    )}
                    {cropDebug.boxTrace?.length > 0 && (
                      <div>
                        <p className="font-bold text-slate-900 dark:text-slate-100">{t.boxSelectionTrace}</p>
                        <ul className="mt-1 space-y-1">
                          {cropDebug.boxTrace.slice(0, 4).map((item, index) => (
                            <li key={index} className="rounded-xl bg-white px-3 py-2 text-xs dark:bg-slate-950">
                              {String(item?.reason || item?.decision || item?.action || item)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {cropDebug.metrics && (
                      <div className="grid gap-2 text-xs sm:grid-cols-2">
                        {Object.entries(cropDebug.metrics).slice(0, 6).map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-3 rounded-xl bg-white px-3 py-2 dark:bg-slate-950">
                            <span className="text-slate-500">{key}</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              )}
            </section>
          </div>
        </div>

        {/* BOTTOM: Bảng phân tích AI (Agent cards responsive) */}
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-950 dark:text-white">{t.aiAnalysisBoard}</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {t.aiAnalysisBoardDesc}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <StepCard
                title="AG1 GPT Vision"
                status={agentsStatus.gpt}
                desc={t.agent1Desc}
              />
              <StepCard
                title="AG2 Gemini Vision"
                status={agentsStatus.gemini}
                desc={t.agent2Desc}
              />
              <StepCard
                title="AG3 Google Lens"
                status={lensStatus}
                desc={lensHasTechnicalIssue ? t.agent3DescErr : t.agent3DescOk}
              />
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-slate-950 dark:text-white">
                  <Gavel className="h-5 w-5 text-indigo-500" />
                  {t.ag4Referee}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {t.ag4RefereeDesc}
                </p>
              </div>
              <StatusBadge status={agentsStatus.referee} />
            </div>
            <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
              <p className="font-black">{t.ruleTitle}</p>
              <p className="mt-1">{t.ruleDesc}</p>
              {lensHasTechnicalIssue && (
                <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 font-semibold text-rose-700 dark:bg-slate-950/50 dark:text-rose-300">
                  {t.ruleErr}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
