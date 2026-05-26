import api, { normalizeList } from "./api";

export const getRates = async () => {
  return await api.get("/currency/rates");
};

export const convertCurrency = async (payload) => {
  return await api.post("/currency/convert", {
    from_currency: payload.from_currency,
    to_currency: payload.to_currency || "VND",
    amount: Number(payload.amount || 0),
  });
};

export const getBanknotes = async (params = {}) => {
  const data = await api.get("/banknotes/", { params });
  return normalizeList(data);
};