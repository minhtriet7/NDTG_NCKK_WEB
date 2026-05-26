import api from "./api";

export const getAgentsOverview = async () => {
  return await api.get("/admin/agents/overview");
};

export const getAgentsStatus = async () => {
  return await api.get("/admin/agents/status");
};

export const testAgent = async (agentKey) => {
  return await api.post(`/admin/agents/test/${agentKey}`);
};

export const getAgentPerformance = async () => {
  return await api.get("/admin/agents/performance");
};

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

export const getGoogleLensConfig = getLensConfig;
export const updateGoogleLensConfig = updateLensConfig;