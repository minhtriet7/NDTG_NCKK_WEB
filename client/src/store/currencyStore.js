import { create } from "zustand";
import {
  getRates,
  getBanknotes,
  getCurrencyCountries,
} from "../services/currencyService";

export const CURRENCY_RATES_TTL_MS = 5 * 60 * 1000;

let ratesRequest = null;
let countryMappingsRequest = null;

const getErrorMessage = (err, fallback) =>
  err?.response?.data?.detail ||
  err?.response?.data?.message ||
  err?.message ||
  fallback;

const normalizeRatesPayload = (data, fetchedAt = Date.now()) => {
  const isStale = Boolean(data?.is_stale ?? data?.isStale);
  const staleAfterHours = data?.stale_after_hours ?? data?.staleAfterHours ?? null;
  const lastUpdated = data?.last_updated ?? data?.lastUpdated ?? null;

  return {
    ...(data || {}),
    rates: data?.rates || {},
    provider: data?.provider || "system",
    source: data?.source || "database",
    last_updated: lastUpdated,
    lastUpdated,
    is_stale: isStale,
    isStale,
    stale_after_hours: staleAfterHours,
    staleAfterHours,
    fetchedAt,
  };
};

const isRatesCacheFresh = (state) =>
  Boolean(
    state.ratesData &&
      state.fetchedAt &&
      Date.now() - state.fetchedAt < CURRENCY_RATES_TTL_MS,
  );

export const useCurrencyStore = create((set, get) => ({
  ratesData: null,
  rates: {},
  provider: null,
  source: null,
  lastUpdated: null,
  isStale: false,
  staleAfterHours: null,
  fetchedAt: null,
  banknotes: [],
  countryMappings: [],
  isLoadingRates: false,
  isLoadingBanknotes: false,
  isLoadingCountryMappings: false,
  error: null,
  ratesError: null,
  countryMappingsError: null,

  fetchRates: async (options = {}) => {
    const forceRefresh =
      typeof options === "boolean" ? options : Boolean(options?.forceRefresh);
    const state = get();

    if (!forceRefresh && isRatesCacheFresh(state)) {
      return state.ratesData;
    }

    if (!forceRefresh && ratesRequest) {
      return ratesRequest;
    }

    set({ isLoadingRates: true, error: null, ratesError: null });

    ratesRequest = (async () => {
      const data = await getRates();
      const normalized = normalizeRatesPayload(data);

      set({
        ratesData: normalized,
        rates: normalized.rates,
        provider: normalized.provider,
        source: normalized.source,
        lastUpdated: normalized.lastUpdated,
        isStale: normalized.isStale,
        staleAfterHours: normalized.staleAfterHours,
        fetchedAt: normalized.fetchedAt,
        isLoadingRates: false,
      });

      return normalized;
    })();

    try {
      return await ratesRequest;
    } catch (err) {
      const message = getErrorMessage(err, "Unable to load exchange rates");
      set({
        error: message,
        ratesError: message,
        isLoadingRates: false,
      });
      throw err;
    } finally {
      ratesRequest = null;
    }
  },

  refreshRates: async () => get().fetchRates({ forceRefresh: true }),

  invalidateRates: () => {
    set({ fetchedAt: null });
  },

  fetchCountryMappings: async (options = {}) => {
    const forceRefresh =
      typeof options === "boolean" ? options : Boolean(options?.forceRefresh);
    const state = get();

    if (!forceRefresh && state.countryMappings.length > 0) {
      return state.countryMappings;
    }

    if (!forceRefresh && countryMappingsRequest) {
      return countryMappingsRequest;
    }

    set({
      isLoadingCountryMappings: true,
      countryMappingsError: null,
      error: null,
    });

    countryMappingsRequest = (async () => {
      const data = await getCurrencyCountries();
      const normalized = Array.isArray(data) ? data : [];

      set({
        countryMappings: normalized,
        isLoadingCountryMappings: false,
      });

      return normalized;
    })();

    try {
      return await countryMappingsRequest;
    } catch (err) {
      const message = getErrorMessage(err, "Unable to load country mappings");
      set({
        error: message,
        countryMappingsError: message,
        isLoadingCountryMappings: false,
      });
      throw err;
    } finally {
      countryMappingsRequest = null;
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
      const message = getErrorMessage(err, "Unable to load banknotes");

      set({
        error: message,
        isLoadingBanknotes: false,
      });

      throw err;
    }
  },
}));
