import api, { normalizeList } from "./api";

export const getTokenPackages = async () => {
  const data = await api.get("/payment/token-packages");
  return normalizeList(data);
};

export const createCheckoutSession = async (payload) => {
  return await api.post("/payment/buy", {
    package_id: payload.package_id,
    gateway: payload.gateway || "sepay",
  });
};

export const getPaymentStatus = async (transactionId) => {
  return await api.get(`/payment/status/${transactionId}`);
};

export const getMyPaymentTransactions = async (limit = 20) => {
  const data = await api.get("/payment/transactions", {
    params: { limit },
  });

  return normalizeList(data);
};