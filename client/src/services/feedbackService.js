import api, { normalizeList } from "./api";

export const submitFeedback = async (payload) => {
  return await api.post("/feedback/", payload);
};

export const getFeedbackHistory = async () => {
  const data = await api.get("/feedback/");
  return normalizeList(data);
};