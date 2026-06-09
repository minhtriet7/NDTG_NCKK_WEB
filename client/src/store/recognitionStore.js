import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const ACTIVE_TASK_TTL_MS = 30 * 60 * 1000;

const safePreviewUrl = (url) => {
  if (!url) return null;

  // Blob URL chỉ sống tạm trong tab, không persist.
  if (String(url).startsWith("blob:")) return null;

  return url;
};

const isFreshTask = (task) => {
  if (!task?.taskId || !task?.createdAt) return false;

  const createdAtMs = new Date(task.createdAt).getTime();

  if (!Number.isFinite(createdAtMs)) return false;

  return Date.now() - createdAtMs <= ACTIVE_TASK_TTL_MS;
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

      setActiveTask: (taskId, inputMeta = {}) =>
        set({
          activeTask: taskId
            ? {
                taskId,
                inputMeta,
                createdAt: new Date().toISOString(),
              }
            : null,
        }),

      setActiveTaskId: (taskId) =>
        set({
          activeTask: taskId
            ? {
                taskId,
                inputMeta: {},
                createdAt: new Date().toISOString(),
              }
            : null,
        }),

      clearActiveTask: () =>
        set({
          activeTask: null,
        }),

      clearActiveTaskId: () =>
        set({
          activeTask: null,
        }),

      getFreshActiveTask: () => {
        const task = get().activeTask;

        if (!isFreshTask(task)) {
          set({ activeTask: null });
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
      }),
    },
  ),
);