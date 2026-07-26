import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronDown,
  Clock3,
  Database,
  Globe2,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import { useCurrencyStore } from "../../store/currencyStore";

const RECENT_CHOICES_KEY = "banknoteai.currency.recentChoices";
const POPULAR_CURRENCIES = ["USD", "EUR", "JPY", "KRW", "SGD", "THB", "CNY"];

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function readRecentChoices() {
  try {
    const value = window.localStorage.getItem(RECENT_CHOICES_KEY);
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function writeRecentChoices(items) {
  try {
    window.localStorage.setItem(RECENT_CHOICES_KEY, JSON.stringify(items.slice(0, 6)));
  } catch {
    // Recent choices are a convenience only.
  }
}

function isStaleRates(data) {
  const source = String(data?.source || "").toLowerCase();
  const provider = String(data?.provider || "").toLowerCase();
  return Boolean(data?.is_stale) || source.includes("seed") || provider.includes("seed");
}

function formatDate(value, lang) {
  if (!value) return "N/A";
  try {
    return new Intl.DateTimeFormat(lang === "VI" ? "vi-VN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "N/A";
  }
}

function formatNumber(value, currency, lang) {
  const amount = Number(value || 0);
  const locale = lang === "VI" ? "vi-VN" : "en-US";

  if (!Number.isFinite(amount)) return "0";

  if (currency === "VND") {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(amount))} VND`;
  }

  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: amount > 0 && amount < 1 ? 4 : 2,
    maximumFractionDigits: amount > 0 && amount < 1 ? 8 : 4,
  }).format(amount)} ${currency}`;
}

function formatRate(value, lang) {
  const rate = Number(value || 0);
  const locale = lang === "VI" ? "vi-VN" : "en-US";

  if (!Number.isFinite(rate) || rate <= 0) return "N/A";

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: rate < 1 ? 8 : 4,
  }).format(rate);
}

function getOptionDisplayName(option, lang) {
  if (!option) return "";
  return lang === "VI"
    ? option.country_name_vi || option.country_name_en || option.primary_currency
    : option.country_name_en || option.country_name_vi || option.primary_currency;
}

function getOptionAltName(option, lang) {
  if (!option) return "";
  return lang === "VI"
    ? option.country_name_en || ""
    : option.country_name_vi || "";
}

function getCurrencyName(option, lang) {
  if (!option) return "";
  return lang === "VI"
    ? option.currency_name_vi || option.currency_name_en || option.primary_currency
    : option.currency_name_en || option.currency_name_vi || option.primary_currency;
}

function buildCurrencyOptions(countryMappings, ratesData) {
  const rates = ratesData?.rates || {};
  const rateItems = Array.isArray(ratesData?.items) ? ratesData.items : [];
  const rateItemMap = new Map(
    rateItems.map((item) => [
      String(item.target_currency || item.currency || "").toUpperCase(),
      item,
    ]),
  );
  const seenKeys = new Set();
  const options = [];

  (countryMappings || []).forEach((item) => {
    const primaryCurrency = String(item.primary_currency || "").toUpperCase();
    const countryCode = String(item.country_code || primaryCurrency).toUpperCase();
    const currencies = [
      ...new Set(
        [
          primaryCurrency,
          ...(Array.isArray(item.supported_currencies) ? item.supported_currencies : []),
        ]
          .map((code) => String(code || "").toUpperCase().trim())
          .filter(Boolean),
      ),
    ];

    currencies.forEach((currency) => {
      const key = `${countryCode}:${currency}`;
      if (!countryCode || seenKeys.has(key)) return;

      const rateItem = rateItemMap.get(currency);
      const hasRate = Number(rates[currency] || 0) > 0;
      seenKeys.add(key);
      options.push({
        ...item,
        id: item.id || key,
        option_id: key,
        country_code: countryCode,
        primary_currency: currency,
        supported_currencies: item.supported_currencies || [currency],
        active: item.active !== false,
        currency_name_en: rateItem?.currency_name || item.currency_name_en || item.currency_name || currency,
        currency_name_vi:
          item.currency_name_vi ||
          item.currency_name_en ||
          rateItem?.currency_name ||
          item.currency_name ||
          currency,
        rate_to_vnd: hasRate ? rates[currency] : 0,
        has_rate: hasRate,
        is_supported_for_conversion: hasRate,
        is_stale: rateItem?.is_stale ?? item.is_stale,
        manual_override: rateItem?.manual_override ?? item.manual_override,
        source: rateItem?.source ?? item.source,
        provider: rateItem?.provider ?? item.provider,
        last_updated: rateItem?.last_updated ?? item.last_updated,
      });
    });
  });

  rateItems.forEach((item) => {
    const currency = String(item.target_currency || item.currency || "").toUpperCase();
    if (!currency || !rates[currency]) return;

    const alreadyRepresented = options.some((option) => option.primary_currency === currency);
    if (alreadyRepresented) return;

    const key = `${currency}:${currency}`;
    if (seenKeys.has(key)) return;

    options.push({
      id: key,
      option_id: key,
      country_code: currency,
      country_name_en: item.currency_name || currency,
      country_name_vi: item.currency_name || currency,
      aliases: [currency, item.currency_name].filter(Boolean),
      primary_currency: currency,
      supported_currencies: [currency],
      active: item.is_active !== false,
      currency_name_en: item.currency_name || currency,
      currency_name_vi: item.currency_name || currency,
      rate_to_vnd: rates[currency],
      has_rate: true,
      is_supported_for_conversion: true,
      is_stale: item.is_stale,
      manual_override: item.manual_override,
      source: item.source,
      provider: item.provider,
      last_updated: item.last_updated,
    });
  });

  return options.sort((a, b) => {
    const aPopular = POPULAR_CURRENCIES.includes(a.primary_currency) ? 0 : 1;
    const bPopular = POPULAR_CURRENCIES.includes(b.primary_currency) ? 0 : 1;
    if (aPopular !== bPopular) return aPopular - bPopular;
    return String(a.country_name_en || "").localeCompare(String(b.country_name_en || ""));
  });
}

function getOptionSearchText(option) {
  return normalizeSearchText(
    [
      option.country_code,
      option.country_name_en,
      option.country_name_vi,
      option.primary_currency,
      option.currency_name_en,
      option.currency_name_vi,
      ...(option.aliases || []),
      ...(option.supported_currencies || []),
    ].join(" "),
  );
}

function findOptionForCurrency(options, currency) {
  const code = String(currency || "").toUpperCase();
  return (
    options.find((option) => option.primary_currency === code && option.country_code === "VN") ||
    options.find((option) => option.primary_currency === code && option.country_code === "US") ||
    options.find((option) => option.primary_currency === code) ||
    null
  );
}

function getOptionId(option) {
  if (!option) return "";
  return option.option_id || `${option.country_code}:${option.primary_currency}`;
}

function findOptionById(options, optionId) {
  if (!optionId) return null;
  return options.find((option) => getOptionId(option) === optionId) || null;
}

function getSelectionSummary(option, lang) {
  if (!option) return "N/A";
  return `${getOptionDisplayName(option, lang)} - ${option.primary_currency}`;
}

function getRateItem(ratesData, currency) {
  const code = String(currency || "").toUpperCase();
  const items = Array.isArray(ratesData?.items) ? ratesData.items : [];
  return items.find((item) => String(item.target_currency || item.currency || "").toUpperCase() === code) || null;
}

function CurrencyCombobox({
  id,
  label,
  placeholder,
  value,
  options,
  onChange,
  onSearchStateChange,
  lang,
  t,
  isLoading,
  error,
  recentChoices,
  popularCurrencies,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listId = `${id}-listbox`;

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), 120);
    return () => window.clearTimeout(handle);
  }, [query]);

  const orderedOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(debouncedQuery);
    const buckets = [];
    const used = new Set();

    const pushOption = (option) => {
      if (!option) return;
      const key = `${option.country_code}:${option.primary_currency}`;
      if (used.has(key)) return;
      used.add(key);
      buckets.push(option);
    };

    if (!normalizedQuery) {
      recentChoices.forEach((code) => {
        pushOption(
          options.find(
            (option) =>
              option.primary_currency === code ||
              option.country_code === code,
          ),
        );
      });
      popularCurrencies.forEach((code) => {
        pushOption(options.find((option) => option.primary_currency === code));
      });
    }

    options.forEach((option) => {
      if (!normalizedQuery || getOptionSearchText(option).includes(normalizedQuery)) {
        pushOption(option);
      }
    });

    return buckets.slice(0, normalizedQuery ? 24 : 18);
  }, [debouncedQuery, options, popularCurrencies, recentChoices]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(orderedOptions.length - 1, 0));

  const selectedLabel = value
    ? getSelectionSummary(value, lang)
    : "";
  const pendingSearch =
    isOpen &&
    normalizeSearchText(query) &&
    normalizeSearchText(query) !== normalizeSearchText(selectedLabel);

  useEffect(() => {
    onSearchStateChange?.({
      pending: Boolean(pendingSearch),
      query,
      hasMatch: orderedOptions.length > 0,
    });
  }, [onSearchStateChange, orderedOptions.length, pendingSearch, query]);

  const selectOption = (option) => {
    onChange(option);
    onSearchStateChange?.({ pending: false, query: "", hasMatch: true });
    setQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(orderedOptions.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (isOpen && orderedOptions[safeActiveIndex]) {
        event.preventDefault();
        selectOption(orderedOptions[safeActiveIndex]);
      }
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && orderedOptions[safeActiveIndex] ? `${id}-option-${safeActiveIndex}` : undefined}
          value={isOpen ? query : selectedLabel}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery("");
          }}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-14 w-full rounded-2xl border border-slate-200 bg-white/80 pl-11 pr-12 text-sm font-bold text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:focus:border-indigo-400"
        />
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>

      {isOpen && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/12 outline-none dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/40"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm font-bold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.loadingCountries}
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 px-3 py-4 text-sm font-semibold text-rose-600 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : orderedOptions.length === 0 ? (
            <div className="px-3 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {t.noMatch}
            </div>
          ) : (
            orderedOptions.map((option, index) => {
              const isActive = index === safeActiveIndex;
              const isSupported = option.is_supported_for_conversion !== false;
              const isSelected =
                value?.country_code === option.country_code &&
                value?.primary_currency === option.primary_currency;

              return (
                <button
                  type="button"
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  key={`${option.country_code}:${option.primary_currency}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    isActive
                      ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                  }`}
                >
                  <span className="inline-flex h-9 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {option.country_code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">
                      {getOptionDisplayName(option, lang)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-bold text-slate-500 dark:text-slate-400">
                      {option.primary_currency} · {getCurrencyName(option, lang)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-400">
                      {getOptionAltName(option, lang)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase ${
                      isSupported
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                    }`}
                  >
                    {isSupported ? t.supported : t.rateUnavailable}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-indigo-500" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function MetaPill({ icon: Icon, label, value, tone = "slate" }) {
  const toneClass = {
    slate: "border-slate-200 bg-white/75 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200",
    emerald: "border-emerald-200 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "border-amber-200 bg-amber-50/80 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  }[tone];

  return (
    <div className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold ${toneClass}`}>
      <Icon className="h-4 w-4" />
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="max-w-[160px] truncate">{value}</span>
    </div>
  );
}

function RateDetail({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 break-words text-lg font-black text-slate-950 dark:text-white">{value}</p>
      {helper && <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{helper}</p>}
    </div>
  );
}

export default function CurrencyConverter() {
  const navigate = useNavigate();
  const { lang } = useAppStore();
  const {
    ratesData,
    countryMappings,
    isLoadingRates,
    isLoadingCountryMappings,
    ratesError,
    countryMappingsError,
    fetchRates,
    fetchCountryMappings,
  } = useCurrencyStore();

  const [mode, setMode] = useState("quick");
  const [amountInput, setAmountInput] = useState("100");
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("VND");
  const [fromOptionId, setFromOptionId] = useState("");
  const [toOptionId, setToOptionId] = useState("");
  const [fromSearchState, setFromSearchState] = useState({ pending: false, query: "", hasMatch: true });
  const [toSearchState, setToSearchState] = useState({ pending: false, query: "", hasMatch: true });
  const [recentChoices, setRecentChoices] = useState(() => readRecentChoices());

  const t = {
    EN: {
      title: "Currency Converter",
      intelligenceLabel: "BanknoteAI Currency Intelligence",
      subtitle: "BanknoteAI Currency Intelligence for cached market rates, country search, and VND equivalents.",
      to: "to",
      quickMode: "Convert to VND",
      advancedMode: "Advanced conversion",
      fromSearch: "From country or currency",
      targetSearch: "To country or currency",
      searchPlaceholder: "Search country, currency name, or code",
      amount: "Amount",
      convertedAmount: "Converted amount",
      vietnameseDong: "Vietnamese Dong",
      latestCachedRate: "Latest cached rate",
      source: "Source",
      provider: "Provider",
      lastUpdated: "Last updated",
      fresh: "Fresh",
      stale: "Stale",
      manualOverride: "Manual override",
      directRate: "Direct rate",
      inverseRate: "Inverse rate",
      quickConversions: "Quick conversions",
      noMatch: "No matching country or currency was found.",
      selectResult: "Select a result to update the conversion.",
      currentSelection: "Current selection",
      currencyUnsupported: "This currency is not currently supported for conversion.",
      rateUnavailable: "Rate unavailable",
      supported: "Supported",
      info: "Rates are for informational purposes and may differ from bank buy/sell rates.",
      noRates: "No market rates configured.",
      refresh: "Refresh",
      scanBtn: "Scan a Banknote",
      loadingRates: "Loading cached rates",
      loadingCountries: "Loading country mappings",
      rateSource: "Rate source",
      freshness: "Freshness",
      activeCurrencies: "Active currencies",
      targetLocked: "Target is fixed to Vietnamese Dong in quick mode.",
      swap: "Swap currencies",
      recent: "Recent choices",
      popular: "Popular currencies",
      unavailable: "Rate unavailable",
      version: "Version",
      countryBadge: "Country code",
      currencyBadge: "Currency code",
      openWorkspace: "Open workspace",
    },
    VI: {
      title: "Quy đổi tiền tệ",
      intelligenceLabel: "BanknoteAI Currency Intelligence",
      subtitle: "BanknoteAI Currency Intelligence cho tỷ giá cache, tìm kiếm quốc gia và giá trị quy đổi sang VND.",
      to: "sang",
      quickMode: "Quy đổi sang VND",
      advancedMode: "Quy đổi nâng cao",
      fromSearch: "Từ quốc gia hoặc đồng tiền",
      targetSearch: "Đến quốc gia hoặc đồng tiền",
      searchPlaceholder: "Tìm quốc gia, tên tiền tệ hoặc mã tiền",
      amount: "Số tiền",
      convertedAmount: "Số tiền quy đổi",
      vietnameseDong: "Việt Nam Đồng",
      latestCachedRate: "Tỷ giá gần nhất",
      source: "Nguồn",
      provider: "Nhà cung cấp",
      lastUpdated: "Cập nhật lần cuối",
      fresh: "Tỷ giá mới",
      stale: "Tỷ giá đã cũ",
      manualOverride: "Điều chỉnh thủ công",
      directRate: "Tỷ giá trực tiếp",
      inverseRate: "Tỷ giá đảo",
      quickConversions: "Quy đổi nhanh",
      noMatch: "Không tìm thấy quốc gia hoặc đồng tiền phù hợp.",
      selectResult: "Chọn một kết quả để cập nhật quy đổi.",
      currentSelection: "Lựa chọn hiện tại",
      currencyUnsupported: "Đồng tiền này hiện chưa được hỗ trợ quy đổi.",
      rateUnavailable: "Chưa có tỷ giá",
      supported: "Được hỗ trợ",
      info: "Tỷ giá chỉ mang tính tham khảo và có thể khác với tỷ giá mua/bán tại ngân hàng.",
      noRates: "Chưa có tỷ giá thị trường được cấu hình.",
      refresh: "Làm mới",
      scanBtn: "Quét tiền giấy",
      loadingRates: "Đang tải tỷ giá cache",
      loadingCountries: "Đang tải mapping quốc gia",
      rateSource: "Nguồn tỷ giá",
      freshness: "Độ mới",
      activeCurrencies: "Tiền tệ đang bật",
      targetLocked: "Đích quy đổi được cố định là Việt Nam Đồng ở chế độ nhanh.",
      swap: "Đổi chiều tiền tệ",
      recent: "Lựa chọn gần đây",
      popular: "Tiền tệ phổ biến",
      unavailable: "Chưa có tỷ giá",
      version: "Phiên bản",
      countryBadge: "Mã quốc gia",
      currencyBadge: "Mã tiền tệ",
      openWorkspace: "Mở workspace",
    },
  }[lang || "EN"];

  useEffect(() => {
    fetchRates().catch(() => {});
    fetchCountryMappings().catch(() => {});
  }, [fetchCountryMappings, fetchRates]);

  const options = useMemo(
    () => buildCurrencyOptions(countryMappings, ratesData),
    [countryMappings, ratesData],
  );

  const rates = ratesData?.rates || {};
  const currencyCodes = Object.keys(rates);
  const stale = isStaleRates(ratesData);
  const fallbackFromCurrency =
    (rates[fromCurrency] ? fromCurrency : currencyCodes.find((code) => code !== "VND") || currencyCodes[0]) || "USD";
  const fallbackToCurrency =
    (rates[toCurrency] ? toCurrency : (currencyCodes.includes("VND") ? "VND" : currencyCodes[0])) || "VND";
  const selectedFrom =
    findOptionById(options, fromOptionId) ||
    findOptionForCurrency(options, fromCurrency) ||
    findOptionForCurrency(options, fallbackFromCurrency);
  const selectedTo = mode === "quick"
    ? findOptionForCurrency(options, "VND")
    : (
      findOptionById(options, toOptionId) ||
      findOptionForCurrency(options, toCurrency) ||
      findOptionForCurrency(options, fallbackToCurrency)
    );
  const resolvedFromCurrency = String(selectedFrom?.primary_currency || fallbackFromCurrency).toUpperCase();
  const resolvedToCurrency = mode === "quick"
    ? "VND"
    : String(selectedTo?.primary_currency || fallbackToCurrency).toUpperCase();
  const amount = Number(amountInput || 0);
  const rateFrom = Number(rates[resolvedFromCurrency] || 0);
  const rateTo = Number(rates[resolvedToCurrency] || 0);
  const convertedAmount = rateFrom > 0 && rateTo > 0 ? (amount * rateFrom) / rateTo : 0;
  const directRate = rateFrom > 0 && rateTo > 0 ? rateFrom / rateTo : 0;
  const inverseRate = directRate > 0 ? 1 / directRate : 0;
  const fromRateItem = getRateItem(ratesData, resolvedFromCurrency);
  const toRateItem = getRateItem(ratesData, resolvedToCurrency);
  const manualOverride = Boolean(fromRateItem?.manual_override || toRateItem?.manual_override);
  const pendingSelection = fromSearchState.pending || (mode === "advanced" && toSearchState.pending);
  const selectedUnsupported =
    selectedFrom?.is_supported_for_conversion === false ||
    (mode === "advanced" && selectedTo?.is_supported_for_conversion === false);
  const rateUnavailable = selectedUnsupported || !rateFrom || !rateTo;
  const selectionSummary = mode === "advanced"
    ? `${getSelectionSummary(selectedFrom, lang)} ${t.to} ${getSelectionSummary(selectedTo, lang)}`
    : getSelectionSummary(selectedFrom, lang);

  const addRecentChoice = (option) => {
    const code = option?.primary_currency || option?.country_code;
    if (!code) return;
    setRecentChoices((current) => {
      const next = [code, ...current.filter((item) => item !== code)].slice(0, 6);
      writeRecentChoices(next);
      return next;
    });
  };

  const handleSelectFrom = (option) => {
    setFromCurrency(option.primary_currency);
    setFromOptionId(getOptionId(option));
    addRecentChoice(option);
  };

  const handleSelectTo = (option) => {
    setToCurrency(option.primary_currency);
    setToOptionId(getOptionId(option));
    addRecentChoice(option);
  };

  const handleQuick = (currency) => {
    const option = findOptionForCurrency(options, currency);
    setMode("quick");
    setFromCurrency(currency);
    setFromOptionId(option ? getOptionId(option) : "");
    setToCurrency("VND");
    setToOptionId("");
    setAmountInput("100");
    addRecentChoice(option || { primary_currency: currency });
  };

  const handleSwap = () => {
    setMode("advanced");
    setFromCurrency(resolvedToCurrency);
    setToCurrency(resolvedFromCurrency);
    setFromOptionId(selectedTo ? getOptionId(selectedTo) : "");
    setToOptionId(selectedFrom ? getOptionId(selectedFrom) : "");
  };

  const quickCurrencies = POPULAR_CURRENCIES.filter((code) => rates[code]);

  if ((!ratesData || Object.keys(rates).length <= 1) && !isLoadingRates) {
    return (
      <div className="page-inner flex min-h-screen items-center justify-center px-4 py-24 font-sans">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Landmark className="mx-auto h-10 w-10 text-indigo-500" />
          <p className="mt-4 text-xl font-black text-slate-950 dark:text-white">{ratesError || t.noRates}</p>
          <button
            type="button"
            onClick={() => fetchRates({ forceRefresh: true }).catch(() => {})}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
          >
            <RefreshCw className="h-4 w-4" />
            {t.refresh}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-inner min-h-screen overflow-x-hidden px-4 pb-20 pt-24 font-sans sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                <ShieldCheck className="h-4 w-4" />
                {t.intelligenceLabel}
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                {t.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400 sm:text-base">
                {t.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <MetaPill icon={Database} label={t.source} value={ratesData?.source || "database"} />
              <MetaPill icon={Activity} label={t.provider} value={ratesData?.provider || "system"} />
              <MetaPill icon={Clock3} label={t.lastUpdated} value={formatDate(ratesData?.last_updated, lang)} />
              <MetaPill icon={Globe2} label={t.freshness} value={stale ? t.stale : t.fresh} tone={stale ? "amber" : "emerald"} />
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70 sm:p-7">
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
              {[
                { key: "quick", label: t.quickMode },
                { key: "advanced", label: t.advancedMode },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setMode(item.key);
                    if (item.key === "quick") {
                      setToCurrency("VND");
                      setToOptionId("");
                      setToSearchState({ pending: false, query: "", hasMatch: true });
                    }
                  }}
                  className={`rounded-xl px-3 py-3 text-sm font-black transition focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
                    mode === item.key
                      ? "bg-white text-indigo-700 shadow-sm dark:bg-indigo-500/15 dark:text-indigo-200"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid gap-5">
              <div>
                <label htmlFor="currency-amount" className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t.amount}
                </label>
                <input
                  id="currency-amount"
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="h-16 w-full rounded-2xl border border-slate-200 bg-white px-4 text-2xl font-black text-slate-950 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              <CurrencyCombobox
                id="currency-from"
                label={t.fromSearch}
                placeholder={t.searchPlaceholder}
                value={selectedFrom}
                options={options}
                onChange={handleSelectFrom}
                onSearchStateChange={setFromSearchState}
                lang={lang}
                t={t}
                isLoading={isLoadingCountryMappings}
                error={countryMappingsError}
                recentChoices={recentChoices}
                popularCurrencies={POPULAR_CURRENCIES}
              />

              {mode === "advanced" ? (
                <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
                  <div className="hidden md:block" />
                  <button
                    type="button"
                    onClick={handleSwap}
                    aria-label={t.swap}
                    title={t.swap}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200"
                  >
                    <ArrowRightLeft className="h-5 w-5" />
                  </button>
                  <CurrencyCombobox
                    id="currency-to"
                    label={t.targetSearch}
                    placeholder={t.searchPlaceholder}
                    value={selectedTo}
                    options={options}
                    onChange={handleSelectTo}
                    onSearchStateChange={setToSearchState}
                    lang={lang}
                    t={t}
                    isLoading={isLoadingCountryMappings}
                    error={countryMappingsError}
                    recentChoices={recentChoices}
                    popularCurrencies={POPULAR_CURRENCIES}
                  />
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t.convertedAmount}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      VN
                    </span>
                    <div>
                      <p className="text-sm font-black text-slate-950 dark:text-white">{t.vietnameseDong}</p>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">VND</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {t.targetLocked}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-7 rounded-3xl border border-indigo-100 bg-indigo-50/70 p-5 dark:border-indigo-500/20 dark:bg-indigo-500/10 sm:p-6">
              <p className="text-xs font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                {t.convertedAmount}
              </p>
              {pendingSelection ? (
                <div className="mt-3 rounded-2xl border border-indigo-200 bg-white/75 p-4 dark:border-indigo-500/20 dark:bg-slate-950/60">
                  <p className="text-base font-black text-slate-950 dark:text-white">{t.selectResult}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-400">
                    {t.currentSelection}: {selectionSummary}
                  </p>
                </div>
              ) : (
                <p className="mt-2 break-words text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                  {rateUnavailable ? t.rateUnavailable : formatNumber(convertedAmount, resolvedToCurrency, lang)}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  {resolvedFromCurrency}
                </span>
                <span className="text-xs font-bold text-slate-400">{t.to}</span>
                <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  {resolvedToCurrency}
                </span>
                {manualOverride && (
                  <span className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {t.manualOverride}
                  </span>
                )}
                {selectedUnsupported && (
                  <span className="inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {t.currencyUnsupported}
                  </span>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t.latestCachedRate}
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{t.rateSource}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => fetchRates({ forceRefresh: true }).catch(() => {})}
                  disabled={isLoadingRates}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
                  aria-label={t.refresh}
                  title={t.refresh}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingRates ? "animate-spin" : ""}`} />
                </button>
              </div>

              {pendingSelection ? (
                <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-bold text-indigo-800 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                  {t.selectResult}
                </div>
              ) : rateUnavailable ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  {t.currencyUnsupported}
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  <RateDetail
                    label={t.directRate}
                    value={`1 ${resolvedFromCurrency} = ${formatRate(directRate, lang)} ${resolvedToCurrency}`}
                  />
                  <RateDetail
                    label={t.inverseRate}
                    value={`1 ${resolvedToCurrency} = ${formatRate(inverseRate, lang)} ${resolvedFromCurrency}`}
                  />
                  <RateDetail
                    label={t.version}
                    value={ratesData?.rates_version || ratesData?.last_updated || "N/A"}
                    helper={`${t.source}: ${ratesData?.source || "database"}`}
                  />
                </div>
              )}

              {stale && (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t.stale}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70">
              <h2 className="text-lg font-black text-slate-950 dark:text-white">{t.quickConversions}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {quickCurrencies.map((currency) => {
                  const quickRate = Number(rates[currency] || 0);
                  return (
                    <button
                      key={currency}
                      type="button"
                      onClick={() => handleQuick(currency)}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/10"
                    >
                      <span>
                        <span className="block text-sm font-black text-slate-950 dark:text-white">100 {currency} {t.to} VND</span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {quickRate ? formatNumber(100 * quickRate, "VND", lang) : t.unavailable}
                        </span>
                      </span>
                      <TrendingUp className="h-4 w-4 text-slate-400 transition group-hover:text-indigo-500" />
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
              <Info className="mt-1 h-4 w-4 shrink-0 text-indigo-500" />
              {t.info}
            </p>
            <button
              type="button"
              onClick={() => navigate("/recognize")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-500/20 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <Landmark className="h-4 w-4" />
              {t.openWorkspace || t.scanBtn}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
