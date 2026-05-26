import { create } from "zustand";
import { getRates, getBanknotes } from "../services/currencyService";

export const useCurrencyStore = create((set) => ({
  ratesData: null,
  banknotes: [],
  isLoadingRates: false,
  isLoadingBanknotes: false,
  error: null,

  fetchRates: async () => {
    set({ isLoadingRates: true, error: null });

    try {
      const data = await getRates();
      set({
        ratesData: data,
        isLoadingRates: false,
      });

      return data;
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Lỗi khi lấy tỷ giá";

      set({
        error: message,
        isLoadingRates: false,
      });

      throw err;
    }
  },

  fetchBanknotes: async (params = {}) => {
    set({ isLoadingBanknotes: true, error: null });

    try {
      const data = await getBanknotes(params);

      set({
        banknotes: data,
        isLoadingBanknotes: false,
      });

      return data;
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Lỗi khi lấy danh sách tiền";

      set({
        error: message,
        isLoadingBanknotes: false,
      });

      throw err;
    }
  },
}));