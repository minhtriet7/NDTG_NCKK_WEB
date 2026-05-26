import api from "./api";

const ACTIVE_TASK_KEY = "active_recognition_task";

export const recognitionService = {
  scan: async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    return await api.post("/recognition/scan", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  startTask: async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    return await api.post("/recognition/tasks", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  getTaskStatus: async (taskId) => {
    return await api.get(`/recognition/tasks/${taskId}`);
  },

  getResultDetail: async (resultId) => {
    return await api.get(`/recognition/${resultId}`);
  },
};

export const startRecognitionTask = async (file) => {
  return await recognitionService.startTask(file);
};

export const getRecognitionTaskStatus = async (taskId) => {
  return await recognitionService.getTaskStatus(taskId);
};

export const getRecognitionResult = async (resultId) => {
  return await recognitionService.getResultDetail(resultId);
};

export const scanBanknote = async (file) => {
  return await recognitionService.scan(file);
};

export const saveActiveRecognitionTask = (taskId, inputMeta = {}) => {
  const payload = {
    taskId,
    inputMeta,
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(ACTIVE_TASK_KEY, JSON.stringify(payload));
  return payload;
};

export const getActiveRecognitionTask = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_TASK_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearActiveRecognitionTask = () => {
  localStorage.removeItem(ACTIVE_TASK_KEY);
};