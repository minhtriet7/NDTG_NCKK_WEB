import React, { useState, useEffect } from "react";
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

export default function Processing() {
  const navigate = useNavigate();
  const location = useLocation();

  const { updateTokenBalance, user, syncProfile } = useAuthStore();
  const { setScanSession, setActiveTaskId, clearActiveTaskId } =
    useRecognitionStore();

  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("queued");
  const [error, setError] = useState(null);

  const [agentsStatus, setAgentsStatus] = useState({
    yolo: "scanning",
    llm: "scanning",
    lens: "scanning",
    aggregator: "waiting",
  });

  const imageFile = location.state?.imageFile;
  const previewUrl = location.state?.previewUrl;

  useEffect(() => {
    if (!imageFile) {
      navigate("/recognize");
      return;
    }

    let isMounted = true;
    let pollTimer = null;

    const setVisualStage = (nextStage, nextProgress) => {
      if (!isMounted) return;

      setStage(nextStage || "processing");
      setProgress(Number(nextProgress || 0));

      const value = String(nextStage || "").toLowerCase();

      if (value.includes("queued") || value.includes("preprocess")) {
        setAgentsStatus({
          yolo: "scanning",
          llm: "waiting",
          lens: "waiting",
          aggregator: "waiting",
        });
      } else if (value.includes("agent") || value.includes("running")) {
        setAgentsStatus({
          yolo: "scanning",
          llm: "scanning",
          lens: "scanning",
          aggregator: "waiting",
        });
      } else if (value.includes("aggregat")) {
        setAgentsStatus({
          yolo: "done",
          llm: "done",
          lens: "done",
          aggregator: "scanning",
        });
      } else if (value.includes("done")) {
        setAgentsStatus({
          yolo: "done",
          llm: "done",
          lens: "done",
          aggregator: "done",
        });
      }
    };
    const AgentCard = ({ icon: Icon, name, status, desc }) => (
      <div
        className={`p-5 rounded-2xl border transition-all duration-500 ${
          status === "done"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : status === "scanning"
              ? "bg-white border-teal-200 text-slate-900 shadow-sm"
              : "bg-slate-50 border-slate-200 text-slate-400"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              status === "done"
                ? "bg-emerald-100"
                : status === "scanning"
                  ? "bg-teal-50"
                  : "bg-slate-100"
            }`}
          >
            {status === "done" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : status === "scanning" ? (
              <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
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
    const pollTask = async (taskId) => {
      try {
        const task = await getRecognitionTaskStatus(taskId);

        if (!isMounted) return;

        setVisualStage(task.stage, task.progress);

        if (task.status === "done") {
          if (pollTimer) clearInterval(pollTimer);

          setVisualStage("done", 100);
          clearActiveRecognitionTask();
          clearActiveTaskId();

          if (task.result) {
            setScanSession(previewUrl, task.result, taskId);
          }

          try {
            const latestProfile = await syncProfile?.();

            if (!latestProfile && user) {
              updateTokenBalance(
                Math.max(Number(user.token_balance || 0) - 1, 0),
              );
            }
          } catch {
            if (user) {
              updateTokenBalance(
                Math.max(Number(user.token_balance || 0) - 1, 0),
              );
            }
          }

          setTimeout(() => {
            navigate("/result", {
              state: {
                scanResult: task.result,
                taskId,
                previewUrl,
              },
            });
          }, 700);

          return;
        }

        if (task.status === "failed") {
          if (pollTimer) clearInterval(pollTimer);

          setError(task.error_message || "Quá trình phân tích thất bại.");
          clearActiveRecognitionTask();
          clearActiveTaskId();
        }
      } catch (err) {
        if (!isMounted) return;

        if (pollTimer) clearInterval(pollTimer);

        setError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            err?.message ||
            "Không thể kiểm tra trạng thái xử lý.",
        );
      }
    };

    const start = async () => {
      try {
        setVisualStage("uploading", 10);

        const task = await startRecognitionTask(imageFile);
        const taskId = task.task_id || task.id;

        if (!taskId) {
          throw new Error("Backend không trả về task_id.");
        }

        saveActiveRecognitionTask(taskId, {
          filename: imageFile.name,
          size: imageFile.size,
          type: imageFile.type,
        });

        setActiveTaskId(taskId);
        setVisualStage(task.stage || "queued", task.progress || 5);

        pollTimer = setInterval(() => {
          pollTask(taskId);
        }, 2000);

        await pollTask(taskId);
      } catch (err) {
        if (!isMounted) return;

        setError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            err?.message ||
            "Quá trình phân tích thất bại.",
        );
      }
    };

    start();

    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [
    imageFile,
    navigate,
    previewUrl,
    setScanSession,
    setActiveTaskId,
    clearActiveTaskId,
    updateTokenBalance,
    user,
    syncProfile,
  ]);

  

  if (error) {
    return (
      <div className="max-w-3xl mx-auto font-sans py-12">
        <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-700 mb-2">
            Analysis failed
          </h2>
          <p className="text-red-600 text-sm mb-6">{error}</p>
          <button
            onClick={() => navigate("/recognize")}
            className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  const AgentCard = ({ icon: Icon, name, status, desc }) => (
    <div
      className={`p-5 rounded-2xl border transition-all duration-500 ${
        status === "done"
          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
          : status === "scanning"
            ? "bg-white border-teal-200 text-slate-900 shadow-sm"
            : "bg-slate-50 border-slate-200 text-slate-400"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            status === "done"
              ? "bg-emerald-100"
              : status === "scanning"
                ? "bg-teal-50"
                : "bg-slate-100"
          }`}
        >
          {status === "done" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : status === "scanning" ? (
            <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
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
  return (
    <div className="max-w-4xl mx-auto font-sans py-10 space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Cpu className="w-8 h-8" />
        </div>

        <h2 className="text-3xl font-extrabold text-slate-900">
          Processing Banknote
        </h2>

        <p className="text-slate-500 mt-2">
          Multi-agent analysis is running. Please keep this page open.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex justify-between text-sm font-semibold text-slate-500 mb-2">
          <span>{stage}</span>
          <span>{Math.round(progress)}%</span>
        </div>

        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-teal-600 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
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
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
            Uploaded image
          </p>
          <img
            src={previewUrl}
            alt="Uploaded banknote"
            className="w-full max-h-[320px] object-contain rounded-2xl bg-slate-50"
          />
        </div>
      )}
    </div>
  );
}
