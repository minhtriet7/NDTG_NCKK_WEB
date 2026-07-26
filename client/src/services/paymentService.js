import api, { normalizeList } from "./api";

export const getPaymentGatewaySettings = async () => {
  return await api.get("/payment/gateway-settings");
};

export const getTokenPackages = async () => {
  const data = await api.get("/payment/token-packages");
  return normalizeList(data);
};

export const createCheckoutSession = async (payload) => {
  const requestedGateway = String(payload?.gateway || "")
    .trim()
    .toLowerCase();

  // Normalize vietqr alias -> bank_transfer
  const gateway =
    requestedGateway === "vietqr" ? "bank_transfer" : requestedGateway;

  // Reject all non-bank_transfer gateways on the client side.
  // VNPay is disabled (VNPAY_ENABLED=false). SePay/mock/momo/paypal are not supported.
  const DISABLED_GATEWAYS = ["vnpay", "sepay", "mock", "momo", "paypal"];
  if (DISABLED_GATEWAYS.includes(gateway)) {
    throw new Error(
      "VNPay is not available yet. Please use VietQR / Bank Transfer."
    );
  }

  if (gateway !== "bank_transfer") {
    throw new Error("Unsupported payment method. Please use VietQR / Bank Transfer.");
  }

  return await api.post("/payment/buy", {
    package_id: payload.package_id,
    gateway,
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
