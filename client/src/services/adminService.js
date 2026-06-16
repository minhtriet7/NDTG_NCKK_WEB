import api, { normalizeList } from "./api";

/* =========================================================
   DASHBOARD
========================================================= */

export const getDashboardSummary = async () => {
  return await api.get("/admin/dashboard/summary");
};

export const getSystemHealth = async () => {
  return await api.get("/admin/system/health");
};

export const getAgentPerformance = async () => {
  return await api.get("/admin/agents/performance");
};

export const getRecentScans = async (limit = 10) => {
  return await api.get("/admin/recognition/recent", {
    params: { limit },
  });
};

export const getPendingFeedback = async (limit = 5) => {
  try {
    const data = await api.get("/admin/feedbacks/pending", {
      params: { limit },
    });

    return normalizeList(data);
  } catch {
    return [];
  }
};

export const getAdminPaymentOverview = async () => {
  const summary = await getDashboardSummary();
  return summary?.payments || summary?.payment_overview || {};
};

export const getAdminUserBreakdown = async () => {
  const summary = await getDashboardSummary();
  return summary?.users_breakdown || {};
};

export const getAdminBanknoteOverview = async () => {
  const summary = await getDashboardSummary();
  return summary?.banknotes_breakdown || {};
};

/* =========================================================
   USERS
========================================================= */

export const getUsers = async (page = 1, limit = 50, params = {}) => {
  return await api.get("/admin/users", {
    params: { page, limit, ...params },
  });
};

export const getAdminUsers = async (params = {}) => {
  return await api.get("/admin/users", { params });
};

export const getAdminUserDetail = async (userId) => {
  return await api.get(`/admin/users/${userId}`);
};

export const updateAdminUser = async (userId, payload) => {
  return await api.put(`/admin/users/${userId}`, payload);
};

export const updateUserStatus = async (userId, statusOrIsActive) => {
  const payload =
    typeof statusOrIsActive === "boolean"
      ? { is_active: statusOrIsActive }
      : { status: statusOrIsActive };

  return await api.put(`/admin/users/${userId}/status`, payload);
};

export const updateUserRole = async (userId, role) => {
  return await api.put(`/admin/users/${userId}/role`, { role });
};

export const updateUserTokens = async (userId, tokenBalance) => {
  return await api.put(`/admin/users/${userId}`, {
    token_balance: tokenBalance,
  });
};

export const deleteUser = async (userId) => {
  return await api.delete(`/admin/users/${userId}`);
};

/* =========================================================
   TRANSACTIONS
========================================================= */

export const getAdminTransactions = async (params = {}) => {
  return await api.get("/admin/transactions", { params });
};

export const getAdminTransactionDetail = async (id) => {
  return await api.get(`/admin/transactions/${id}`);
};

export const updateTransactionStatus = async (id, status) => {
  return await api.put(`/admin/transactions/${id}/status`, { status });
};

export const markTransactionPaid = async (id) => {
  return await api.put(`/admin/transactions/${id}/mark-paid`);
};

export const cancelTransaction = async (id) => {
  return await api.put(`/admin/transactions/${id}/cancel`);
};

export const deleteTransaction = async (id) => {
  return await api.delete(`/admin/transactions/${id}`);
};

/* =========================================================
   FEEDBACKS
========================================================= */

export const getAdminFeedbacks = async (params = {}) => {
  return await api.get("/admin/feedbacks", { params });
};

export const getAdminFeedbackDetail = async (id) => {
  return await api.get(`/admin/feedbacks/${id}`);
};

export const updateFeedbackStatus = async (id, status) => {
  return await api.put(`/admin/feedbacks/${id}/status`, { status });
};

export const updateFeedbackPriority = async (id, priority) => {
  return await api.put(`/admin/feedbacks/${id}/priority`, { priority });
};

export const replyFeedback = async (id, payload) => {
  return await api.post(`/admin/feedbacks/${id}/reply`, payload);
};

export const deleteFeedback = async (id) => {
  return await api.delete(`/admin/feedbacks/${id}`);
};

/* =========================================================
   SYSTEM LOGS
========================================================= */

export const getSystemLogs = async (params = {}) => {
  return await api.get("/admin/logs", { params });
};

export const getSystemLogDetail = async (logId) => {
  return await api.get(`/admin/logs/${logId}`);
};

export const clearSystemLogs = async () => {
  return await api.delete("/admin/logs/clear");
};

export const exportSystemLogs = async (params = {}) => {
  return await api.get("/admin/logs/export", { params });
};

/* =========================================================
   TOKEN PACKAGES
========================================================= */

export const getAdminTokenPackages = async (params = {}) => {
  return await api.get("/admin/token-packages", { params });
};

export const getTokenPackagesAdmin = async (params = {}) => {
  return await getAdminTokenPackages(params);
};

export const createTokenPackage = async (payload) => {
  return await api.post("/admin/token-packages", payload);
};

export const updateTokenPackage = async (packageId, payload) => {
  return await api.put(`/admin/token-packages/${packageId}`, payload);
};

export const toggleTokenPackage = async (packageId) => {
  return await api.patch(`/admin/token-packages/${packageId}/toggle`);
};

export const deleteTokenPackage = async (packageId) => {
  return await api.delete(`/admin/token-packages/${packageId}`);
};

/* =========================================================
   RESULTS MANAGER
========================================================= */

export const getAdminResults = async (params = {}) => {
  const data = await api.get("/admin/results", { params });
  return normalizeList(data);
};

export const getAdminResultDetail = async (id) => {
  return await api.get(`/admin/results/${id}`);
};

export const updateAdminResultStatus = async (id, status) => {
  return await api.put(`/admin/results/${id}/status`, { status });
};

export const markResultReviewed = async (id) => {
  return await api.put(`/admin/results/${id}/review`);
};

export const rerunRecognition = async (id) => {
  return await api.post(`/admin/results/${id}/rerun`);
};

export const deleteResult = async (id) => {
  return await api.delete(`/admin/results/${id}`);
};

/* =========================================================
   BANKNOTES MANAGER
========================================================= */

export const getAdminBanknotes = async (params = {}) => {
  const data = await api.get("/admin/banknotes", { params });
  return normalizeList(data);
};

export const getAdminBanknoteDetail = async (id) => {
  return await api.get(`/admin/banknotes/${id}`);
};

export const createBanknote = async (payload) => {
  return await api.post("/admin/banknotes", payload);
};

export const updateBanknote = async (id, payload) => {
  return await api.put(`/admin/banknotes/${id}`, payload);
};

export const deleteBanknote = async (id) => {
  return await api.delete(`/admin/banknotes/${id}`);
};

/*
  Route upload ảnh banknote chưa có trong backend router hiện tại.
  Chỉ dùng hàm này nếu sau này bạn bổ sung endpoint:
  POST /api/v1/admin/banknotes/{id}/upload-image
*/
export const uploadBanknoteImage = async (banknoteId, file) => {
  const formData = new FormData();
  formData.append("file", file);

  return await api.post(`/admin/banknotes/${banknoteId}/upload-image`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

/* =========================================================
   CURRENCY RATES MANAGER
========================================================= */

export const getAdminCurrencyRates = async (params = {}) => {
  const cleanParams = {};

  if (params.search && String(params.search).trim()) {
    cleanParams.search = String(params.search).trim();
  }

  if (params.source && params.source !== "all") {
    cleanParams.source = params.source;
  }

  const res = await api.get("/admin/currency-rates", {
    params: cleanParams,
  });

  return res.data;
};

export const createCurrencyRate = async (payload) => {
  return await api.post("/admin/currency-rates", payload);
};

export const updateCurrencyRate = async (id, payload) => {
  return await api.put(`/admin/currency-rates/${id}`, payload);
};

export const deleteCurrencyRate = async (id) => {
  return await api.delete(`/admin/currency-rates/${id}`);
};

export const syncCurrencyRates = async () => {
  return await api.post("/admin/currency-rates/sync");
};

export const getCurrencySyncLogs = async () => {
  return await api.get("/admin/currency-rates/sync-logs");
};

/* =========================================================
   AGENTS MANAGER
========================================================= */

export const getAgentsOverview = async (params = {}) => {
  return await api.get("/admin/agents/overview", { params });
};

export const getAgentsStatus = async () => {
  return await api.get("/admin/agents/status");
};

export const testAgent = async (agentKey) => {
  return await api.post(`/admin/agents/test/${agentKey}`);
};

export const getAgentStatus = getAgentsStatus;

/* =========================================================
   CONFIGS
========================================================= */

export const getAgentsConfig = async () => {
  return await api.get("/admin/config/agents");
};

export const updateAgentsConfig = async (payload) => {
  return await api.put("/admin/config/agents", payload);
};

export const getAggregatorConfig = async () => {
  return await api.get("/admin/config/aggregator");
};

export const updateAggregatorConfig = async (payload) => {
  return await api.put("/admin/config/aggregator", payload);
};

export const getAiModelConfig = async () => {
  return await api.get("/admin/config/ai-model");
};

export const updateAiModelConfig = async (payload) => {
  return await api.put("/admin/config/ai-model", payload);
};

export const getLlmConfig = async () => {
  return await api.get("/admin/config/llm");
};

export const updateLlmConfig = async (payload) => {
  return await api.put("/admin/config/llm", payload);
};

export const getLensConfig = async () => {
  return await api.get("/admin/config/google-lens");
};

export const updateLensConfig = async (payload) => {
  return await api.put("/admin/config/google-lens", payload);
};

export const getSystemSettings = async () => {
  return await api.get("/admin/settings");
};

export const updateSystemSettings = async (payload) => {
  return await api.put("/admin/settings", payload);
};
export const getPaymentGatewaySettings = async () => {
  return await getSystemSettings();
};

export const updatePaymentGatewaySettings = async (payload) => {
  return await updateSystemSettings(payload);
};

export const getTokenBillingSettings = async () => {
  return await getSystemSettings();
};

export const updateTokenBillingSettings = async (payload) => {
  return await updateSystemSettings(payload);
};

export const getEmailNotificationSettings = async () => {
  return await getSystemSettings();
};

export const updateEmailNotificationSettings = async (payload) => {
  return await updateSystemSettings(payload);
};
/* =========================================================
   SAFE FALLBACKS
========================================================= */

export const safeGetDashboardSummary = async () => {
  try {
    return await getDashboardSummary();
  } catch {
    return null;
  }
};

export const safeGetSystemHealth = async () => {
  try {
    return await getSystemHealth();
  } catch {
    return null;
  }
};

export const safeGetAgentPerformance = async () => {
  try {
    return await getAgentPerformance();
  } catch {
    return null;
  }
};

export const safeGetRecentScans = async (limit = 10) => {
  try {
    const data = await getRecentScans(limit);
    return normalizeList(data);
  } catch {
    return [];
  }
};

export const safeGetPendingFeedback = async (limit = 5) => {
  try {
    const data = await getPendingFeedback(limit);
    return normalizeList(data);
  } catch {
    return [];
  }
};

/* =========================================================
   PAGES (CMS)
========================================================= */

export const getPages = async () => {
  const data = await api.get("/pages");
  return normalizeList(data);
};

export const getPage = async (slug) => {
  return await api.get(`/pages/${slug}`);
};

export const updatePageContent = async (slug, payload) => {
  return await api.put(`/pages/${slug}`, payload);
};