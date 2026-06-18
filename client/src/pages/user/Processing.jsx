import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "../../services/recognitionService";

import { useAuthStore } from "../../store/authStore";
import { useRecognitionStore } from "../../store/recognitionStore";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 4 * 60 * 1000; // 4 phút timeout cứng ở frontend

const TERMINAL_DONE_STATUSES = new Set([
  "done",
  "completed",
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

function mapPipelineByProgress(stage, progress) {
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
      currentStep: "Hoàn tất phân tích",
    };
  }

  if (isFinalizing || isReferee) {
    return {
      crop: "success",
      gpt: "completed",
      gemini: "completed",
      lens: "completed",
      referee: "running",
      currentStep: isFinalizing ? "Đang chuẩn bị chuyển sang Result" : "AG4 đang tổng hợp kết quả",
    };
  }

  if (isDebate) {
    return {
      crop: "success",
      gpt: "running",
      gemini: "running",
      lens: "running",
      referee: "waiting",
      currentStep: "GPT, Gemini và Google Lens đang phân tích độc lập",
    };
  }

  return {
    crop: safeProgress > 0 ? "running" : "waiting",
    gpt: "waiting",
    gemini: "waiting",
    lens: "waiting",
    referee: "waiting",
    currentStep: "YOLO + AG0 đang kiểm tra vùng ảnh",
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
  const getFreshActiveTask = useRecognitionStore(
    (state) => state.getFreshActiveTask,
  );

  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("queued");
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [taskSnapshot, setTaskSnapshot] = useState(null);

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
    const nextPipeline = mapPipelineByProgress(safeStage, safeProgress);

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

    try {
      const latestProfile = await syncProfile?.();

      if (!latestProfile && typeof tokenBalance !== "undefined") {
        updateTokenBalance(Math.max(Number(tokenBalance || 0) - 1, 0));
      }
    } catch {
      if (typeof tokenBalance !== "undefined") {
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

    setError(message || "Quá trình phân tích thất bại.");
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
          "Không thể kiểm tra trạng thái xử lý.",
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

        const restoredTask = getFreshActiveTask?.();
        let taskId = restoredTask?.taskId || null;

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
            "Quá trình phân tích thất bại.",
        );
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

  if (error) {
    return (
      <div className="page-inner relative py-10">
        <div className="mx-auto max-w-3xl px-4 font-sans">
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl shadow-rose-500/10 dark:border-rose-900/60 dark:bg-slate-950">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
              <AlertCircle className="h-7 w-7" />
            </div>

            <h2 className="mb-2 text-2xl font-black text-rose-600 dark:text-rose-300">
              Phân tích thất bại
            </h2>

            <p className="mb-6 text-sm leading-relaxed text-rose-500 dark:text-rose-300">{error}</p>

            <button
              onClick={() => navigate("/workspace", { replace: true })}
              className="rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 dark:focus:ring-offset-slate-950"
            >
              Thử lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Graceful Fallback if Store is totally empty and no task is running
  if (!currentImageFile && !getFreshActiveTask()) {
    navigate("/workspace", { replace: true });
    return null;
  }

  const safeProgress = normalizeProgress(progress);
  const pipeline = mapPipelineByProgress(stage, safeProgress);
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
    { title: "Upload ảnh", icon: UploadCloud },
    { title: "YOLO phát hiện vùng tiền", icon: ScanLine },
    { title: "AG0 kiểm tra crop", icon: ShieldCheck },
    { title: "GPT / Gemini / Lens phân tích", icon: Brain },
    { title: "AG4 tổng hợp", icon: Gavel },
    { title: "Chuyển sang Result", icon: CheckCircle2 },
  ];

  return (
    <div className="page-inner relative py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.18),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_55%)]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4 font-sans sm:px-6">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white/90 shadow-xl shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="p-6 sm:p-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                BanknoteAI Pipeline
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Đang phân tích tờ tiền
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                YOLO chọn vùng ảnh, sau đó GPT, Gemini và Google Lens phân tích độc lập trước khi trọng tài tổng hợp kết quả.
              </p>

              <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-slate-100">{pipeline.currentStep}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Bạn có thể rời trang, tác vụ vẫn tiếp tục chạy.</p>
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
                    <span className="font-semibold">Task ID:</span>
                    <span className="min-w-0 truncate font-mono text-xs">{taskId}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <Timer className="h-4 w-4 text-cyan-500" />
                    <span className="font-semibold">Elapsed:</span>
                    <span className="font-mono text-xs">{formatElapsed(elapsedMs)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-950 p-5 dark:border-slate-800 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-3 pb-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">Uploaded image</p>
                <StatusBadge status={agentsStatus.crop} />
              </div>
              <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded banknote"
                    className="max-h-[360px] w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <ImageIcon className="h-10 w-10" />
                    <p className="text-sm font-semibold">Đang chờ ảnh tải lên</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">Crop Gate — YOLO + AG0</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  YOLO tìm vùng nghi là tiền giấy, AG0 kiểm tra vùng crop có hợp lệ không.
                </p>
              </div>
              <StatusBadge status={agentsStatus.crop} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Ảnh gốc</p>
                <div className="flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-slate-950">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Uploaded banknote" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-slate-400" />
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Crop preview</p>
                <div className="flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-slate-950">
                  {cropImage ? (
                    <img src={cropImage} alt="Selected banknote crop" className="h-full w-full object-contain" />
                  ) : (
                    <div className="px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                      Crop preview sẽ hiện khi backend trả dữ liệu vùng cắt.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(cropDebug.selectedReason || cropDebug.rejectedBoxes?.length > 0 || cropDebug.boxTrace?.length > 0 || cropDebug.metrics) && (
              <details className="group mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100">
                  <ChevronRight className="h-4 w-4 transition group-open:rotate-90" />
                  Chi tiết Crop Gate
                </summary>
                <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  {cropDebug.selectedReason && (
                    <p><span className="font-bold text-slate-900 dark:text-slate-100">Lý do chọn crop:</span> {cropDebug.selectedReason}</p>
                  )}
                  {cropDebug.rejectedBoxes?.length > 0 && (
                    <p><span className="font-bold text-slate-900 dark:text-slate-100">Box bị loại:</span> {cropDebug.rejectedBoxes.length} vùng không đạt tiêu chí.</p>
                  )}
                  {cropDebug.boxTrace?.length > 0 && (
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">Box selection trace</p>
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
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <div className="mb-4">
                <h2 className="text-xl font-black text-slate-950 dark:text-white">AI Debate Board</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Ba AI phân tích độc lập. Trang này chỉ hiển thị tiến trình, không giả lập kết quả khi backend chưa trả.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <StepCard
                  icon={Brain}
                  title="AG1 GPT Vision"
                  status={agentsStatus.gpt}
                  desc="Đọc thông tin thị giác, chữ in và dấu hiệu mệnh giá từ ảnh."
                />
                <StepCard
                  icon={Sparkles}
                  title="AG2 Gemini Vision"
                  status={agentsStatus.gemini}
                  desc="Phân tích ảnh và ngữ cảnh để đối chiếu nhận định độc lập."
                />
                <StepCard
                  icon={Globe}
                  title="AG3 Google Lens"
                  status={lensStatus}
                  desc={lensHasTechnicalIssue ? "Lỗi kỹ thuật, không tính vào đồng thuận." : "Đối chiếu web bằng tìm kiếm ảnh bên ngoài."}
                />
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black text-slate-950 dark:text-white">
                    <Gavel className="h-5 w-5 text-indigo-500" />
                    AG4 Referee
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    Đang chờ kết quả từ các AI để so sánh và đưa ra quyết định cuối cùng.
                  </p>
                </div>
                <StatusBadge status={agentsStatus.referee} />
              </div>
              <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                <p className="font-black">Rule</p>
                <p className="mt-1">Ưu tiên đồng thuận 2/3 kết quả hợp lệ.</p>
                {lensHasTechnicalIssue && (
                  <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 font-semibold text-rose-700 dark:bg-slate-950/50 dark:text-rose-300">
                    Google Lens lỗi kỹ thuật, không tính vào đồng thuận.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-950 dark:text-white">Timeline</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Các bước đang chạy trong pipeline nhận diện.</p>
            </div>
            <StatusBadge status={safeProgress >= 100 ? "completed" : "running"} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}
