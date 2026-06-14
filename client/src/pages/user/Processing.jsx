import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Brain,
  ScanLine,
  Globe,
  Cpu,
  Loader2,
  CheckCircle2,
  AlertCircle,
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

function AgentCard({ icon: Icon, name, status, desc }) {
  return (
    <div
      className={`p-5 rounded-2xl border transition-all duration-500 ${
        status === "done"
          ? "bg-green-500/10 border-green-500/20 text-green-500"
          : status === "scanning"
            ? "bg-surface border-primary/30 text-foreground shadow-sm shadow-primary/5"
            : "bg-background border-border text-secondary"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            status === "done"
              ? "bg-green-500/20"
              : status === "scanning"
                ? "bg-primary/10"
                : "bg-surface"
          }`}
        >
          {status === "done" ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : status === "scanning" ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <Icon className="w-5 h-5" />
          )}
        </div>

        <div>
          <h3 className="font-bold">{name}</h3>
          <p className="text-xs opacity-70">{desc}</p>
        </div>
      </div>
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

  const [agentsStatus, setAgentsStatus] = useState({
    yolo: "scanning",
    llm: "waiting",
    lens: "waiting",
    aggregator: "waiting",
  });

  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(false);
  const pollTimerRef = useRef(null);
  const navigateTimerRef = useRef(null);
  const finishedRef = useRef(false);
  const currentTaskIdRef = useRef(null);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const setVisualStage = (nextStage, nextProgress) => {
    if (!isMountedRef.current) return;

    const safeStage = nextStage || "processing";
    const safeProgress = Number(nextProgress ?? 0);

    setStage(safeStage);
    setProgress(Number.isFinite(safeProgress) ? safeProgress : 0);

    const value = String(safeStage).toLowerCase();

    if (
      value.includes("done") ||
      value.includes("complete") ||
      value.includes("success")
    ) {
      setAgentsStatus({
        yolo: "done",
        llm: "done",
        lens: "done",
        aggregator: "done",
      });
      return;
    }

    if (value.includes("aggregat") || safeProgress >= 80) {
      setAgentsStatus({
        yolo: "done",
        llm: "done",
        lens: "done",
        aggregator: "scanning",
      });
      return;
    }

    if (
      value.includes("agent") ||
      value.includes("running") ||
      safeProgress >= 25
    ) {
      setAgentsStatus({
        yolo: "scanning",
        llm: "scanning",
        lens: "scanning",
        aggregator: "waiting",
      });
      return;
    }

    setAgentsStatus({
      yolo: "scanning",
      llm: "waiting",
      lens: "waiting",
      aggregator: "waiting",
    });
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

    try {
      const response = await getRecognitionTaskStatus(taskId);
      const task = unwrapApiResponse(response);

      if (!isMountedRef.current || finishedRef.current) return;

      const status = normalizeStatus(task?.status);
      
      // Cập nhật lại ảnh preview nếu frontend bị mất URL do reload tab
      if (!previewUrl && task?.input_image_url) {
        setPreviewUrl(task.input_image_url);
      }

      setVisualStage(
        task?.stage || task?.status || "processing",
        task?.progress,
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

    if (hasStartedRef.current) {
      return () => {
        isMountedRef.current = false;
        stopPolling();

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
      <div className="max-w-3xl mx-auto font-sans py-12">
        <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />

          <h2 className="text-2xl font-bold text-red-500 mb-2">
            Analysis failed
          </h2>

          <p className="text-red-400 text-sm mb-6">{error}</p>

          <button
            onClick={() => navigate("/workspace", { replace: true })}
            className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Graceful Fallback if Store is totally empty and no task is running
  if (!currentImageFile && !getFreshActiveTask()) {
    navigate("/workspace", { replace: true });
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto font-sans py-10 space-y-8 text-foreground bg-background">
      <div className="text-center">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/20">
          <Cpu className="w-8 h-8" />
        </div>

        <h2 className="text-3xl font-extrabold text-foreground">
          Processing Banknote
        </h2>

        <p className="text-secondary mt-2">
          Multi-agent analysis is running. You can leave and return to this page
          while the current task is still active.
        </p>
      </div>

      <div className="bg-surface rounded-3xl border border-border shadow-sm p-6">
        <div className="flex justify-between text-sm font-semibold text-secondary mb-2">
          <span className="capitalize">{stage}</span>
          <span>{Math.round(progress)}%</span>
        </div>

        <div className="w-full bg-background rounded-full h-3 overflow-hidden border border-border">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>

        {currentTaskIdRef.current && (
          <p className="mt-3 text-xs text-slate-400">
            Task: {currentTaskIdRef.current}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgentCard
          icon={ScanLine}
          name="YOLO / ML Agent"
          status={agentsStatus.yolo}
          desc="Visual detection and denomination clues"
        />

        <AgentCard
          icon={Brain}
          name="LLM Agent"
          status={agentsStatus.llm}
          desc="Text reading and contextual reasoning"
        />

        <AgentCard
          icon={Globe}
          name="Visual Search"
          status={agentsStatus.lens}
          desc="External visual reference checking"
        />

        <AgentCard
          icon={Cpu}
          name="Aggregator"
          status={agentsStatus.aggregator}
          desc="Consensus and final decision"
        />
      </div>

      {previewUrl && (
        <div className="bg-surface rounded-3xl border border-border shadow-sm p-5">
          <p className="text-sm font-bold text-secondary uppercase tracking-wider mb-3">
            Uploaded image
          </p>

          <img
            src={previewUrl}
            alt="Uploaded banknote"
            className="w-full max-h-[320px] object-contain rounded-2xl bg-background border border-border"
          />
        </div>
      )}
    </div>
  );
}
