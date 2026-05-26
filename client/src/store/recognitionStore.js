import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const useRecognitionStore = create(
  persist(
    (set) => ({
      currentScanSession: null,
      activeTaskId: null,

      setActiveTaskId: (taskId) => set({ activeTaskId: taskId }),
      clearActiveTaskId: () => set({ activeTaskId: null }),

      setScanSession: (previewUrl, resultData, taskId = null) =>
        set({
          activeTaskId: taskId,
          currentScanSession: {
            previewUrl,
            result: resultData,
            taskId,
            timestamp: new Date().toISOString(),
          },
        }),

      updateScanResult: (resultData) =>
        set((state) => ({
          currentScanSession: state.currentScanSession
            ? {
                ...state.currentScanSession,
                result: resultData,
                timestamp: new Date().toISOString(),
              }
            : {
                previewUrl: null,
                result: resultData,
                taskId: state.activeTaskId,
                timestamp: new Date().toISOString(),
              },
        })),

      clearScanSession: () =>
        set({
          currentScanSession: null,
          activeTaskId: null,
        }),
    }),
    {
      name: "recognition-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);