import api from "./api";

/* =========================================================
   AGENTS CONFIG
========================================================= */

export const getAgentsConfig = async () => {
  return await api.get("/admin/config/agents");
};

export const updateAgentsConfig = async (payload) => {
  return await api.put("/admin/config/agents", payload);
};

/* =========================================================
   AGGREGATOR CONFIG
========================================================= */

export const getAggregatorConfig = async () => {
  return await api.get("/admin/config/aggregator");
};

export const updateAggregatorConfig = async (payload) => {
  return await api.put("/admin/config/aggregator", payload);
};

/* =========================================================
   AI MODEL CONFIG
========================================================= */

export const getAiModelConfig = async () => {
  return await api.get("/admin/config/ai-model");
};

export const updateAiModelConfig = async (payload) => {
  return await api.put("/admin/config/ai-model", payload);
};

/* =========================================================
   LLM CONFIG
========================================================= */

export const getLlmConfig = async () => {
  return await api.get("/admin/config/llm");
};

export const updateLlmConfig = async (payload) => {
  return await api.put("/admin/config/llm", payload);
};

/* =========================================================
   GOOGLE LENS CONFIG
========================================================= */

export const getLensConfig = async () => {
  return await api.get("/admin/config/google-lens");
};

export const updateLensConfig = async (payload) => {
  return await api.put("/admin/config/google-lens", payload);
};

/* =========================================================
   SYSTEM SETTINGS
========================================================= */

export const getSystemSettings = async () => {
  return await api.get("/admin/settings");
};

export const updateSystemSettings = async (payload) => {
  return await api.put("/admin/settings", payload);
};

export const getAdminSettings = getSystemSettings;
export const updateAdminSettings = updateSystemSettings;

/* =========================================================
   OPTIONAL TEST ROUTES
   Chỉ dùng khi backend đã thêm route tương ứng.
========================================================= */

export const testAgent = async (agentKey) => {
  return await api.post(`/admin/agents/test/${agentKey}`);
};

export const getAgentsStatus = async () => {
  return await api.get("/admin/agents/status");
};

export const getAgentsOverview = async () => {
  return await api.get("/admin/agents/overview");
};