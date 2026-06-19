import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Brain,
  ScanLine,
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Timer,
  Hash,
  ShieldCheck,
  Sparkles,
  Gavel,
  UploadCloud,
  ChevronRight,
} from "lucide-react";

import {
  startRecognitionTask,
  getRecognitionTaskStatus,
  saveActiveRecognitionTask,
  clearActiveRecognitionTask,
  getActiveRecognitionTask,
} from "../../services/recognitionService";

import { useAuthStore } from "../../store/authStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useLanguageStore } from "../../store/languageStore";

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
    pipelineName: "BanknoteAI Pipeline"
  }
};

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 4 * 60 * 1000; // 4 phút timeout cứng ở frontend

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
]);

const TERMINAL_FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "cancelled",
  "canceled",
  "timeout",
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
    task?.error_message ||
    task?.error ||
    task?.message ||
    "Quá trình phân tích thất bại."
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
    task?.result?.crop_checker ||
    task?.result?.cropChecker ||
    task?.data?.crop_checker ||
    {};

  const cropUrl =
    task?.crop_image_url ||
    task?.cropped_image_url ||
    task?.selected_crop_url ||
    task?.result?.crop_image_url ||
    task?.result?.cropped_image_url ||
    source?.crop_image_url ||
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
  const lens =
    task?.agents?.visual_search ||
    task?.result?.agents?.visual_search ||
    task?.data?.agents?.visual_search ||
    task?.visual_search ||
    null;
  const joined = JSON.stringify(lens || {}).toLowerCase();
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
  return fallback;
}

function StepCard({ icon: Icon, title, desc, status }) {
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
      <div className="flex items-center gap-3">
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
            status === "completed" || status === "success"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
              : status === "running" || status === "scanning"
              ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
              : status === "error" || status === "not_counted"
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {status === "completed" || status === "success" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : status === "running" || status === "scanning" ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Icon className="w-5 h-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="font-black text-slate-900 dark:text-slate-100">{title}</h3>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{desc}</p>
        </div>
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

export default function Processing() {
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useLanguageStore();
  const activeLang = lang?.toUpperCase() || "EN";
  const t = dict[activeLang];

  const currentImageFile = useRecognitionStore((state) => state.currentImageFile);
  const currentPreviewUrl = useRecognitionStore((state) => state.currentPreviewUrl);

  const imageFile = currentImageFile;
  const initialPreviewUrl = currentPreviewUrl;
  const [previewUrl, setPreviewUrl] = useState(initialPreviewUrl);

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
  const navigateTimerRef = useRef(null);
  const finishedRef = useRef(false);
  const currentTaskIdRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
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

  const finishSuccessfully = async (taskId, task) => {
    if (finishedRef.current || !isMountedRef.current) return;

    finishedRef.current = true;
    stopPolling();

    setVisualStage("done", 100);
    clearActiveRecognitionTask();
    clearActiveTask();

    const rawResult = getTaskResult(task) || task;

    const result = {
      ...rawResult,
      input_image_url:
        rawResult?.input_image_url ||
        task?.input_image_url ||
        task?.image_url ||
        task?.uploaded_image_url ||
        null,
      task_id: taskId,
      result_id:
        rawResult?.result_id ||
        task?.result_id ||
        rawResult?.id ||
        task?.result?.id ||
        null,
    };

    if (result) {
      setScanSession(result.input_image_url || previewUrl, result, taskId);
    }

    const shouldFallbackCharge =
      !isNoBanknoteResult({ result }) &&
      Number(result?.system_tokens_charged ?? 1) > 0;

    try {
      const latestProfile = await syncProfile?.();

      if (
        !latestProfile &&
        shouldFallbackCharge &&
        typeof tokenBalance !== "undefined"
      ) {
        updateTokenBalance(Math.max(Number(tokenBalance || 0) - 1, 0));
      }
    } catch {
      if (shouldFallbackCharge && typeof tokenBalance !== "undefined") {
        updateTokenBalance(Math.max(Number(tokenBalance || 0) - 1, 0));
      }
    }

    navigateTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;

      navigate("/result", {
        replace: true,
        state: {
          scanResult: result,
          taskId,
          previewUrl: result.input_image_url || previewUrl,
        },
      });
    }, 500);
  };

  const failProcessing = (message) => {
    if (finishedRef.current || !isMountedRef.current) return;

    finishedRef.current = true;
    stopPolling();

    clearActiveRecognitionTask();
    clearActiveTask();

    setError(message || t.failDesc);
  };

  const pollTask = async (taskId) => {
    if (!taskId || finishedRef.current || !isMountedRef.current) return;

    if (Date.now() - startTimeRef.current > MAX_POLL_TIME_MS) {
      failProcessing("Task timeout, please scan again.");
      return;
    }

    try {
      const response = await getRecognitionTaskStatus(taskId);
      const task = unwrapApiResponse(response);

      if (!isMountedRef.current || finishedRef.current) return;

      const status = normalizeStatus(task?.status);
      setTaskSnapshot(task);
      
      // Cập nhật lại ảnh preview nếu frontend bị mất URL do reload tab
      if (!previewUrl && task?.input_image_url) {
        setPreviewUrl(task.input_image_url);
      }

      setVisualStage(
        task?.stage || task?.status || "processing",
        task?.progress,
        task,
      );

      if (TERMINAL_DONE_STATUSES.has(status)) {
        await finishSuccessfully(taskId, task);
        return;
      }

      if (TERMINAL_FAILED_STATUSES.has(status)) {
        if (isNoBanknoteResult(task)) {
          await finishSuccessfully(taskId, task);
          return;
        }
        failProcessing(getTaskError(task));
      }
    } catch (err) {
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

      failProcessing(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          t.failDesc,
      );
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    elapsedTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 1000);

    if (hasStartedRef.current) {
      return () => {
        isMountedRef.current = false;
        stopPolling();
        if (elapsedTimerRef.current) {
          clearInterval(elapsedTimerRef.current);
          elapsedTimerRef.current = null;
        }

        if (navigateTimerRef.current) {
          clearTimeout(navigateTimerRef.current);
          navigateTimerRef.current = null;
        }
      };
    }

    hasStartedRef.current = true;

    const start = async () => {
      try {
        setVisualStage("uploading", 10);

        const storedTask = getActiveRecognitionTask();
        const restoredTask = peekFreshActiveTask?.();
        const queryTaskId = new URLSearchParams(location.search).get("taskId");
        const pathTaskId = location.pathname.startsWith("/processing/")
          ? location.pathname.split("/").filter(Boolean).at(-1)
          : null;
        let taskId =
          location.state?.taskId ||
          queryTaskId ||
          pathTaskId ||
          restoredTask?.taskId ||
          storedTask?.taskId ||
          null;

        if (!taskId) {
          if (!imageFile) {
            navigate("/workspace", { replace: true });
            return;
          }

          const response = await startRecognitionTask(imageFile);
          const task = unwrapApiResponse(response);
          taskId = getTaskId(task);
          setTaskSnapshot(task);

          if (!taskId) {
            throw new Error("Backend không trả về task_id.");
          }

          saveActiveRecognitionTask(taskId, {
            filename: imageFile.name,
            size: imageFile.size,
            type: imageFile.type,
          });

          setActiveTask(taskId, {
            filename: imageFile.name,
            size: imageFile.size,
            type: imageFile.type,
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

        await pollTask(taskId);

        if (!finishedRef.current && isMountedRef.current) {
          stopPolling();
          pollTimerRef.current = setInterval(() => {
            pollTask(taskId);
          }, POLL_INTERVAL_MS);
        }
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

        failProcessing(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            err?.message ||
            t.failDesc,
        );
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
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      if (navigateTimerRef.current) {
        clearTimeout(navigateTimerRef.current);
        navigateTimerRef.current = null;
      }
    };
    // Chỉ chạy 1 lần mỗi lần vào Processing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isBootstrapping && !taskSnapshot) {
    return (
      <div className="page-inner flex min-h-[50vh] items-center justify-center py-10">
        <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          <span className="font-bold">
            {activeLang === "VI" ? "Đang khôi phục tác vụ..." : "Restoring task..."}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-inner relative py-10">
        <div className="mx-auto max-w-3xl px-4 font-sans">
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl shadow-rose-500/10 dark:border-rose-900/60 dark:bg-slate-950">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
              <AlertCircle className="h-7 w-7" />
            </div>

            <h2 className="mb-2 text-2xl font-black text-rose-600 dark:text-rose-300">
              {t.failTitle}
            </h2>

            <p className="mb-6 text-sm leading-relaxed text-rose-500 dark:text-rose-300">{error}</p>

            <button
              onClick={() => navigate("/workspace", { replace: true })}
              className="rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
            >
              {t.retryBtn}
            </button>
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
  const taskId = currentTaskIdRef.current || taskSnapshot?.task_id || taskSnapshot?.id || "Đang tạo";
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
                <Sparkles className="h-3.5 w-3.5" />
                {t.pipelineName}
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {t.pipelineTitle}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {t.pipelineDesc}
              </p>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
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
            <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 h-full flex flex-col">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-950 dark:text-white">{t.cropGate}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {t.cropGateDesc}
                  </p>
                </div>
                <StatusBadge status={agentsStatus.crop} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 flex-1">
                {/* Ảnh gốc */}
                <div className="flex flex-col rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.originalImage}</p>
                  <div className="flex flex-1 min-h-[160px] items-center justify-center overflow-hidden rounded-2xl bg-slate-950">
                    {previewUrl ? (
                      <img src={previewUrl} alt={t.originalImage} className="h-full w-full object-contain" />
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
                  <div className="flex flex-1 min-h-[160px] items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-slate-950">
                    {cropImage ? (
                      <div className="relative h-full w-full flex items-center justify-center">
                        <img src={cropImage} alt={t.cropUnderAnalysis} className="max-h-full max-w-full object-contain" />
                        <div className="absolute bottom-2 inset-x-0 text-center">
                          <span className="bg-slate-900/80 text-white text-[10px] px-2 py-1.5 rounded-full backdrop-blur-md shadow-lg font-semibold border border-white/10">{t.cropUnderAnalysis}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-3 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-xs font-semibold">{t.waitingCrop}</span>
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
                icon={Brain}
                title="AG1 GPT Vision"
                status={agentsStatus.gpt}
                desc={t.agent1Desc}
              />
              <StepCard
                icon={Sparkles}
                title="AG2 Gemini Vision"
                status={agentsStatus.gemini}
                desc={t.agent2Desc}
              />
              <StepCard
                icon={Globe}
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
