import api, { normalizeList } from "./api";

export const getMyTokenUsage = async (limit = 50) => {
  const data = await api.get("/token-usage/my", {
    params: { limit },
  });

  return normalizeList(data);
};
