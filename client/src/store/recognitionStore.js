import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const ACTIVE_TASK_TTL_MS = 10 * 60 * 1000;
export const STALE_TASK_THRESHOLD_MS = 10 * 60 * 1000;

const ACTIVE_TASK_STORAGE_KEYS = [
  "activeRecognitionTaskId",
  "active_recognition_task",
  "activeTaskId",
  "active_task_id",
  "processingTaskId",
  "processing_task_id",
  "runningTask",
  "running_task",
];

const TERMINAL_TASK_STATUSES = new Set([
  "done",
  "completed",
  "complete",
  "success",
  "succeeded",
  "needs_review",
  "needs review",
  "failed",
  "failure",
  "error",
  "cancelled",
  "canceled",
  "timeout",
]);

const clearActiveTaskStorage = () => {
  ACTIVE_TASK_STORAGE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
};

const normalizeTaskId = (task) => task?.taskId || task?.task_id || task?.id || null;

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getTaskTimestampMs = (task) => {
  const raw =
    task?.backendUpdatedAt ||
    task?.updated_at ||
    task?.updatedAt ||
    task?.lastSeenAt ||
    task?.created_at ||
    task?.createdAt ||
    task?.savedAt;

  const timestamp = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : NaN;
};

export const isProcessingTaskStale = (task, now = Date.now()) => {
  if (!task) return false;

  const status = normalizeStatus(task.status);
  if (status && TERMINAL_TASK_STATUSES.has(status)) return false;

  const timestamp = getTaskTimestampMs(task);
  if (!Number.isFinite(timestamp)) return false;

  return now - timestamp > STALE_TASK_THRESHOLD_MS;
};

const safePreviewUrl = (url) => {
  if (!url) return null;

  // Blob URL chỉ sống tạm trong tab, không persist.
  if (String(url).startsWith("blob:")) return null;

  return url;
};

const isFreshTask = (task) => {
  const taskId = normalizeTaskId(task);
  if (!taskId || task?.stale) return false;

  const timestamp = getTaskTimestampMs(task);

  if (!Number.isFinite(timestamp)) return false;

  return Date.now() - timestamp <= ACTIVE_TASK_TTL_MS;
};

const getBackendImageUrl = (data) => {
  return (
    data?.input_image_url ||
    data?.image_url ||
    data?.uploaded_image_url ||
    data?.thumbnail_url ||
    data?.result?.input_image_url ||
    data?.result?.image_url ||
    data?.result?.uploaded_image_url ||
    data?.result?.thumbnail_url ||
    data?.raw_backend?.input_image_url ||
    data?.raw_backend?.image_url ||
    data?.raw_backend?.uploaded_image_url ||
    null
  );
};

export const useRecognitionStore = create(
  persist(
    (set, get) => ({
      currentScanSession: null,
      activeTask: null,
      hiddenTaskIds: [],
      
      // Temporary UI states for workspace
      currentImageFile: null,
      currentPreviewUrl: null,
      isScanning: false,
      fileInputKey: 0,

      setCurrentImage: (file, url) => set({
        currentImageFile: file,
        currentPreviewUrl: url
      }),

      clearCurrentImage: () => set({
        currentImageFile: null,
        currentPreviewUrl: null
      }),

      setIsScanning: (status) => set({
        isScanning: status
      }),

      setActiveTask: (taskId, inputMeta = {}) =>
        set((state) => {
          if (!taskId || state.hiddenTaskIds.includes(String(taskId))) {
            clearActiveTaskStorage();
            return { activeTask: null, isScanning: false };
          }

          return {
            activeTask: {
              taskId,
              inputMeta,
              createdAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
              stale: false,
            },
          };
        }),

      setActiveTaskId: (taskId) =>
        set((state) => {
          if (!taskId || state.hiddenTaskIds.includes(String(taskId))) {
            clearActiveTaskStorage();
            return { activeTask: null, isScanning: false };
          }

          return {
            activeTask: {
              taskId,
              inputMeta: {},
              createdAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
              stale: false,
            },
          };
        }),

      clearActiveTask: () =>
        set(() => {
          clearActiveTaskStorage();
          return {
            activeTask: null,
            isScanning: false,
          };
        }),

      clearActiveTaskId: () =>
        set(() => {
          clearActiveTaskStorage();
          return {
            activeTask: null,
            isScanning: false,
          };
        }),

      hideTaskLocally: (taskId) =>
        set((state) => {
          const id = String(taskId || normalizeTaskId(state.activeTask) || "");
          const hiddenTaskIds = id
            ? Array.from(new Set([...(state.hiddenTaskIds || []), id])).slice(-50)
            : state.hiddenTaskIds || [];

          clearActiveTaskStorage();

          return {
            hiddenTaskIds,
            activeTask: null,
            isScanning: false,
          };
        }),

      isTaskHidden: (taskId) => {
        const id = String(taskId || "");
        return Boolean(id && get().hiddenTaskIds.includes(id));
      },

      updateActiveTaskFromBackend: (taskId, backendTask = {}) =>
        set((state) => {
          const id = String(taskId || normalizeTaskId(backendTask) || "");

          if (!id || state.hiddenTaskIds.includes(id)) {
            clearActiveTaskStorage();
            return { activeTask: null, isScanning: false };
          }

          const current = normalizeTaskId(state.activeTask) === id ? state.activeTask : {};
          const backendUpdatedAt = backendTask?.updated_at || backendTask?.updatedAt || current.backendUpdatedAt;

          return {
            activeTask: {
              ...current,
              taskId: id,
              inputMeta: current.inputMeta || {},
              createdAt:
                current.createdAt ||
                backendTask?.created_at ||
                backendTask?.createdAt ||
                new Date().toISOString(),
              backendUpdatedAt,
              lastSeenAt: new Date().toISOString(),
              status: backendTask?.status || current.status,
              stage: backendTask?.stage || current.stage,
              progress: backendTask?.progress ?? current.progress,
              stale: false,
            },
          };
        }),

      markActiveTaskStale: (taskId, backendTask = {}) =>
        set((state) => {
          const id = String(taskId || normalizeTaskId(backendTask) || normalizeTaskId(state.activeTask) || "");
          if (!id || state.hiddenTaskIds.includes(id)) {
            clearActiveTaskStorage();
            return { activeTask: null, isScanning: false };
          }

          const current = normalizeTaskId(state.activeTask) === id ? state.activeTask : {};
          clearActiveTaskStorage();

          return {
            activeTask: {
              ...current,
              taskId: id,
              inputMeta: current.inputMeta || {},
              createdAt:
                current.createdAt ||
                backendTask?.created_at ||
                backendTask?.createdAt ||
                new Date().toISOString(),
              backendUpdatedAt: backendTask?.updated_at || backendTask?.updatedAt || current.backendUpdatedAt,
              lastSeenAt: new Date().toISOString(),
              status: backendTask?.status || current.status || "processing",
              stage: backendTask?.stage || current.stage || "stale",
              progress: backendTask?.progress ?? current.progress ?? 0,
              stale: true,
            },
            isScanning: false,
          };
        }),

      getFreshActiveTask: () => {
        const task = get().activeTask;
        const taskId = normalizeTaskId(task);

        if (!taskId || get().hiddenTaskIds.includes(String(taskId)) || !isFreshTask(task)) {
          set({ activeTask: null });
          clearActiveTaskStorage();
          return null;
        }

        return task;
      },

      // Read-only variant for render paths. It must never update Zustand state.
      peekFreshActiveTask: () => {
        const task = get().activeTask;
        const taskId = normalizeTaskId(task);

        if (
          !taskId ||
          get().hiddenTaskIds.includes(String(taskId)) ||
          !isFreshTask(task)
        ) {
          return null;
        }

        return task;
      },

      setScanSession: (previewUrl, resultData, taskId = null) => {
        const backendImageUrl = getBackendImageUrl(resultData);

        set({
          activeTask: null,
          currentScanSession: {
            previewUrl: backendImageUrl || safePreviewUrl(previewUrl),
            result: resultData || null,
            taskId: taskId || resultData?.task_id || resultData?.id || null,
            timestamp: new Date().toISOString(),
          },
        });
      },

      updateScanResult: (resultData) =>
        set((state) => {
          const backendImageUrl = getBackendImageUrl(resultData);

          return {
            currentScanSession: state.currentScanSession
              ? {
                  ...state.currentScanSession,
                  previewUrl:
                    backendImageUrl ||
                    safePreviewUrl(state.currentScanSession.previewUrl),
                  result: resultData || null,
                  timestamp: new Date().toISOString(),
                }
              : {
                  previewUrl: backendImageUrl,
                  result: resultData || null,
                  taskId: resultData?.task_id || resultData?.id || null,
                  timestamp: new Date().toISOString(),
                },
          };
        }),

      // Dùng khi bấm Scan Another hoặc muốn xoá kết quả cũ.
      // KHÔNG xoá activeTask để tránh đang nhận diện bị mất task.
      clearCurrentScanSession: () =>
        set({
          currentScanSession: null,
        }),

      // Reset TOÀN BỘ scan state khi người dùng bấm "Scan Another" hoặc task completed.
      resetScanSession: () => {
        set((state) => ({
          currentImageFile: null,
          currentPreviewUrl: null,
          isScanning: false,
          activeTask: null,
          currentScanSession: null,
          fileInputKey: (state.fileInputKey || 0) + 1,
        }));
        localStorage.removeItem("activeRecognitionTaskId");
        sessionStorage.removeItem("activeRecognitionTaskId");
        localStorage.removeItem("active_recognition_task");
      },

      // Dùng khi muốn reset sạch toàn bộ recognition.
      clearScanSession: () =>
        set({
          currentScanSession: null,
          activeTask: null,
        }),
    }),
    {
      name: "recognition-storage",
      storage: createJSONStorage(() => localStorage),

      partialize: (state) => ({
        currentScanSession: state.currentScanSession
          ? {
              ...state.currentScanSession,
              previewUrl: safePreviewUrl(state.currentScanSession.previewUrl),
            }
          : null,

        activeTask: isFreshTask(state.activeTask) ? state.activeTask : null,
        // Exclude currentImageFile, currentPreviewUrl and isScanning from persistence
      }),
    },
  ),
);
