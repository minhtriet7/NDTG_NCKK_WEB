import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getRecognitionTaskStatus } from "../../services/recognitionService";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";

const POLL_INTERVAL_MS = 3000;
const TERMINAL_DONE_STATUSES = new Set([
  "done", "completed", "complete", "success", "succeeded", "needs_review", "needs review"
]);
const TERMINAL_FAILED_STATUSES = new Set([
  "failed", "failure", "error", "cancelled", "canceled"
]);

export default function GlobalTaskTracker() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useAppStore();
  const { 
    activeTask, 
    clearActiveTask, 
    getFreshActiveTask, 
    setScanSession,
    setIsScanning
  } = useRecognitionStore();
  const { updateTokenBalance, syncProfile, user } = useAuthStore();

  const pollTimerRef = useRef(null);

  useEffect(() => {
    // Không poll khi đang ở trang processing (để Processing.jsx tự xử lý)
    if (location.pathname.includes("/processing")) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const task = getFreshActiveTask();
    if (!task?.taskId) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const checkTask = async () => {
      try {
        const response = await getRecognitionTaskStatus(task.taskId);
        const data = response?.data ?? response;
        const status = String(data?.status || "").toLowerCase();

        const isDone = ['Completed', 'Failed', 'Needs Review'].includes(data?.status) || TERMINAL_DONE_STATUSES.has(status);
        const isFailed = TERMINAL_FAILED_STATUSES.has(status) || data?.status === 'Failed';

        if (isDone && !isFailed) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          
          clearActiveTask();
          setIsScanning(false);
          
          const rawResult = data?.result || data?.data?.result || data?.recognition || data;
          const result = {
            ...rawResult,
            input_image_url: rawResult?.input_image_url || data?.input_image_url || data?.image_url || data?.uploaded_image_url || null,
            task_id: task.taskId,
          };
          
          setScanSession(result.input_image_url, result, task.taskId);

          try {
            const latestProfile = await syncProfile?.();
            if (!latestProfile && typeof user?.token_balance !== "undefined") {
              updateTokenBalance(Math.max(Number(user.token_balance || 0) - 1, 0));
            }
          } catch {
            // ignore
          }

          toast((t) => (
            <div 
              onClick={() => {
                toast.dismiss(t.id);
                navigate("/result", { replace: true, state: { scanResult: result, result: result, taskId: task.taskId, previewUrl: result.input_image_url } });
              }}
              className="flex items-center gap-3 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-100">
                  {lang === "VI" ? "Phân tích hoàn tất!" : "Analysis Complete!"}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {lang === "VI" ? "Nhấn vào đây để xem kết quả." : "Click here to view results."}
                </p>
              </div>
            </div>
          ), {
            duration: 8000,
            style: {
              background: '#1e293b',
              color: '#fff',
              border: '1px solid #334155',
              padding: '12px 16px',
              borderRadius: '12px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            },
          });
          
        } else if (isFailed) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          clearActiveTask();
          setIsScanning(false);
          toast.error(
            lang === "VI" 
              ? "Tiến trình chạy nền thất bại."
              : "Background analysis failed.",
            {
              style: {
                background: '#1e293b',
                color: '#fff',
                border: '1px solid #334155',
              }
            }
          );
        }

      } catch (error) {
        if (error?.response?.status === 404) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
          clearActiveTask();
          setIsScanning(false);
        }
      }
    };

    if (!pollTimerRef.current) {
      pollTimerRef.current = setInterval(checkTask, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [location.pathname, activeTask, clearActiveTask, getFreshActiveTask, setScanSession, setIsScanning, syncProfile, updateTokenBalance, user?.token_balance, lang, navigate]);

  return null;
}
