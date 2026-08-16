import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  getRecognitionResult,
  getRecognitionTaskLightStatus,
} from "../../services/recognitionService";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import { normalizeUserResultResponse } from "../../utils/userResultAdapter";

const POLL_INTERVAL_MS = 3000;
const MISSING_RESULT_RETRY_LIMIT = 3;
const MISSING_RESULT_RETRY_DELAY_MS = 1000;
const TERMINAL_DONE_STATUSES = new Set([
  "done",
  "completed",
  "complete",
  "success",
  "succeeded",
  "needs_review",
  "needs review",
  "completed_partial",
  "completed_with_limit",
  "no_banknote_detected",
  "needs_better_image",
]);
const TERMINAL_FAILED_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "cancelled",
  "canceled",
  "timeout",
  "agent_error",
  "technical_error",
]);

const normalizeStatus = (value) =>
  String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const getTaskResultId = (payload) =>
  payload?.result_id || payload?.recognition_id || payload?.resultId || null;

export default function GlobalTaskTracker() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { lang } = useAppStore();
  const {
    activeTask,
    clearActiveTask,
    peekFreshActiveTask,
    setScanSession,
    setIsScanning,
  } = useRecognitionStore();
  const { updateTokenBalance, syncProfile, user } = useAuthStore();

  const pollTimerRef = useRef(null);
  const pollInFlightRef = useRef(false);
  const pollAbortControllerRef = useRef(null);
  const finishedRef = useRef(false);
  const resultFetchStartedRef = useRef(false);
  const missingResultRetryCountRef = useRef(0);

  useEffect(() => {
    const stopPolling = () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (pollAbortControllerRef.current) {
        pollAbortControllerRef.current.abort();
        pollAbortControllerRef.current = null;
      }
      pollInFlightRef.current = false;
    };

    if (location.pathname.includes("/processing")) {
      stopPolling();
      return undefined;
    }

    const task = peekFreshActiveTask();
    if (!task?.taskId) {
      stopPolling();
      return undefined;
    }

    finishedRef.current = false;
    resultFetchStartedRef.current = false;
    missingResultRetryCountRef.current = 0;
    let cancelled = false;

    const scheduleNextPoll = (retryAfterMs = POLL_INTERVAL_MS) => {
      if (cancelled || finishedRef.current) return;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
      pollTimerRef.current = window.setTimeout(() => {
        pollTimerRef.current = null;
        void pollTask();
      }, Number(retryAfterMs) || POLL_INTERVAL_MS);
    };

    const finishWithResult = async (taskStatus) => {
      const resultId = getTaskResultId(taskStatus);
      if (!resultId || resultFetchStartedRef.current) return;

      resultFetchStartedRef.current = true;
      finishedRef.current = true;
      stopPolling();

      try {
        const response = await getRecognitionResult(resultId);
        if (cancelled) return;

        const result = normalizeUserResultResponse(response, {
          taskId: task.taskId,
          previewUrl: taskStatus?.input_image_url || task?.inputMeta?.previewUrl,
        });

        if (!result) return;

        clearActiveTask();
        setIsScanning(false);
        setScanSession(result.input_image_url, result, task.taskId);

        const shouldFallbackCharge =
          Number(result?.billing?.credits_charged ?? result?.credits_charged ?? 1) > 0 &&
          String(result?.status || "").toLowerCase() !== "no_banknote_detected";

        void Promise.resolve(syncProfile?.())
          .then((latestProfile) => {
            if (
              !latestProfile &&
              shouldFallbackCharge &&
              typeof user?.token_balance !== "undefined"
            ) {
              updateTokenBalance(Math.max(Number(user.token_balance || 0) - 1, 0));
            }
          })
          .catch(() => {
            if (shouldFallbackCharge && typeof user?.token_balance !== "undefined") {
              updateTokenBalance(Math.max(Number(user.token_balance || 0) - 1, 0));
            }
          });

        toast((toastItem) => {
          const openResult = () => {
            toast.dismiss(toastItem.id);
            navigate("/result", {
              state: {
                scanResult: result,
                result,
                taskId: task.taskId,
                resultId,
                previewUrl: result.input_image_url,
              },
            });
          };

          return (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-100">
                  {t('globalTracker.analysisComplete')}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {t('globalTracker.resultReady')}
                </p>
              </div>
              <button
                type="button"
                onClick={openResult}
                className="shrink-0 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              >
                {t('globalTracker.viewResult')}
              </button>
            </div>
          );
        }, {
          duration: 12000,
          style: {
            background: "#1e293b",
            color: "#fff",
            border: "1px solid #334155",
            padding: "12px 16px",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
          },
        });
      } catch {
        resultFetchStartedRef.current = false;
        finishedRef.current = false;
        if (!cancelled) scheduleNextPoll(POLL_INTERVAL_MS);
      }
    };

    const finishFailed = () => {
      finishedRef.current = true;
      stopPolling();
      clearActiveTask();
      setIsScanning(false);
      toast.error(
        t('globalTracker.backgroundFailed'),
        {
          style: {
            background: "#1e293b",
            color: "#fff",
            border: "1px solid #334155",
          },
        },
      );
    };

    const pollTask = async () => {
      if (cancelled || finishedRef.current || pollInFlightRef.current) return;

      const controller = new AbortController();
      pollInFlightRef.current = true;
      pollAbortControllerRef.current = controller;

      try {
        const response = await getRecognitionTaskLightStatus(task.taskId, {
          signal: controller.signal,
        });
        if (cancelled || finishedRef.current) return;

        const payload = response?.data ?? response ?? {};
        const status = normalizeStatus(payload?.status);
        const isDone =
          Boolean(payload?.terminal && getTaskResultId(payload)) ||
          TERMINAL_DONE_STATUSES.has(status);
        const isFailed = TERMINAL_FAILED_STATUSES.has(status);

        if (isDone && !isFailed) {
          if (!getTaskResultId(payload)) {
            missingResultRetryCountRef.current += 1;
            if (missingResultRetryCountRef.current <= MISSING_RESULT_RETRY_LIMIT) {
              scheduleNextPoll(MISSING_RESULT_RETRY_DELAY_MS);
              return;
            }
            finishFailed();
            return;
          }

          await finishWithResult(payload);
          return;
        }

        if (isFailed) {
          finishFailed();
          return;
        }

        scheduleNextPoll(payload?.retry_after_ms || POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled || error?.name === "AbortError" || error?.code === "ERR_CANCELED") {
          return;
        }
        if (error?.response?.status === 404) {
          finishedRef.current = true;
          clearActiveTask();
          setIsScanning(false);
          return;
        }
        scheduleNextPoll(POLL_INTERVAL_MS);
      } finally {
        if (pollAbortControllerRef.current === controller) {
          pollAbortControllerRef.current = null;
        }
        pollInFlightRef.current = false;
      }
    };

    void pollTask();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [
    location.pathname,
    activeTask,
    clearActiveTask,
    peekFreshActiveTask,
    setScanSession,
    setIsScanning,
    syncProfile,
    updateTokenBalance,
    user?.token_balance,
    lang,
    navigate,
    t,
  ]);

  return null;
}
