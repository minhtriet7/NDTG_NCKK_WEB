import api, { getStoredToken } from "./api";

const ACTIVE_TASK_KEY = "active_recognition_task";

export const isValidRecognitionImage = (file) => {
  const isFile = typeof File !== "undefined" && file instanceof File;
  const isBlob = typeof Blob !== "undefined" && file instanceof Blob;

  return Boolean(
    (isFile || isBlob) &&
      Number(file?.size) > 0 &&
      String(file?.type || "").startsWith("image/"),
  );
};

export const getRecognitionFileDebug = (file) => ({
  hasFile: isValidRecognitionImage(file),
  name: typeof file?.name === "string" ? file.name : null,
  type: typeof file?.type === "string" ? file.type : null,
  size: Number.isFinite(Number(file?.size)) ? Number(file.size) : null,
});

export const recognitionService = {
  scan: async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    return await api.post("/recognition/scan", formData);
  },

  scanDebug: async (formData) => {
    // QUAN TRONG: phai unset Content-Type de axios tu generate
    // multipart/form-data; boundary=... cho FormData.
    // Neu de Content-Type: application/json thi FastAPI khong parse duoc file -> 422.
    // Token duoc tu dong gan boi api interceptor (Authorization: Bearer ...).
    return await api.post("/recognition/debug_scan", formData, {
      headers: { "Content-Type": undefined },
    });
  },

  startTask: async (file) => {
    const fileDebug = getRecognitionFileDebug(file);
    console.debug("[RecognitionTask] upload", fileDebug);

    if (!fileDebug.hasFile) {
      throw new Error("Missing image file. Please choose or capture an image again.");
    }

    const formData = new FormData();
    formData.append("file", file);

    // QUAN TRỌNG: xóa Content-Type default (application/json) của axios instance.
    // Nếu không, Axios không thể tự set multipart/form-data; boundary=...
    // và FastAPI sẽ không parse được file → 422 body.file: Field required.
    return await api.post("/recognition/tasks", formData, {
      headers: { "Content-Type": undefined },
    });
  },

  getTaskStatus: async (taskId, options = {}) => {
    return await api.get(`/recognition/tasks/${taskId}`, options);
  },

  getTaskLightStatus: async (taskId, options = {}) => {
    return await api.get(`/recognition/tasks/${taskId}/status`, options);
  },

  cancelTask: async (taskId, options = {}) => {
    return await api.post(`/recognition/tasks/${taskId}/cancel`, null, options);
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

export const getRecognitionTaskLightStatus = async (taskId, options = {}) => {
  return await recognitionService.getTaskLightStatus(taskId, options);
};

export const cancelRecognitionTask = async (taskId, options = {}) => {
  return await recognitionService.cancelTask(taskId, options);
};

export const getRecognitionResult = async (resultId) => {
  return await recognitionService.getResultDetail(resultId);
};

export const scanBanknote = async (file) => {
  return await recognitionService.scan(file);
};

export const scanBanknoteDebug = async (formData) => {
  return await recognitionService.scanDebug(formData);
};

// Kiem tra xem auth token co trong store khong (debug helper, khong call API)
export const getDebugAuthStatus = () => {
  try {
    const token = getStoredToken();
    return { hasToken: Boolean(token), tokenPreview: token ? `${token.slice(0, 20)}...` : null };
  } catch {
    // fallback neu require khong work (ES module)
    try {
      const authStorage = JSON.parse(localStorage.getItem("auth-storage") || "null");
      const token = authStorage?.state?.token || localStorage.getItem("access_token") || localStorage.getItem("token") || "";
      return { hasToken: Boolean(token), tokenPreview: token ? `${token.slice(0, 20)}...` : null };
    } catch {
      return { hasToken: false, tokenPreview: null };
    }
  }
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
