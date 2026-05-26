import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import {
  getAdminCurrencyRates,
  syncCurrencyRates,
  updateCurrencyRate,
  getCurrencySyncLogs,
} from "../../services/adminService";
import {
  Search,
  RefreshCw,
  Edit,
  Activity,
  AlertTriangle,
  X,
  History,
  SlidersHorizontal,
  Database,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";

function normalizeList(response) {
  const data = response?.data !== undefined ? response.data : response;

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;

  if (Array.isArray(data?.data?.items)) return data.data.items;
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data?.results)) return data.data.results;

  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.results)) return response.results;

  return [];
}

function getId(item) {
  return item?.id || item?._id;
}

export default function CurrencyRatesManager() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [rates, setRates] = useState([]);
  const [logs, setLogs] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFreshness, setFilterFreshness] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    id: "",
    currency: "",
    currency_name: "",
    market_rate: 0,
    effective_rate: 0,
    manual_rate: "",
    override: false,
    is_active: true,
    is_base: false,
  });

  const t = {
    EN: {
      title: "Currency Rates",
      subtitle: "Manage exchange rates used by the converter and scan results.",
      refresh: "Refresh",
      sync: "Sync Market Rates",
      logs: "Sync Logs",
      activeCurrencies: "Active Currencies",
      manualOverrides: "Manual Overrides",
      staleRates: "Stale Rates",
      totalRates: "Total Rates",
      search: "Search currency code or name...",
      sourceAll: "Source: All",
      sourceMarket: "Market API",
      sourceSeed: "Initial Seed",
      sourceManual: "Manual",
      statusAll: "Status: All",
      active: "Active",
      hidden: "Hidden",
      freshnessAll: "Freshness: All",
      fresh: "Fresh",
      stale: "Stale",
      currency: "Currency",
      marketRate: "Market Rate",
      manualOverride: "Manual Override",
      effectiveRate: "Effective Rate",
      source: "Source",
      lastUpdated: "Last Updated",
      status: "Status",
      actions: "Actions",
      config: "Configure",
      save: "Save Configuration",
      saving: "Saving...",
      manualTitle: "Manual override",
      manualDesc: "Use an admin rate instead of market API rate.",
      activeTitle: "Visible to users",
      baseCurrency: "Base currency",
      baseNote: "VND is the base currency and should remain equal to 1.",
      customRate: "Custom rate",
      noData: "No currency rates found",
      noDataDesc: "Seed currency data or sync market rates to start.",
      loading: "Loading currency rates...",
      saved: "Configuration saved.",
      loadFailed: "Failed to load currency rates.",
      saveFailed: "Failed to save configuration.",
      syncSuccess: "Market rates synchronized.",
      syncFailed: "Sync failed.",
      logTitle: "Currency Sync Logs",
      noLogs: "No sync logs found.",
      provider: "Provider",
      fetched: "Fetched",
    },
    VI: {
      title: "Tỷ giá tiền tệ",
      subtitle: "Quản lý tỷ giá dùng cho trang quy đổi và kết quả nhận diện.",
      refresh: "Tải lại",
      sync: "Đồng bộ tỷ giá",
      logs: "Lịch sử đồng bộ",
      activeCurrencies: "Đang hiển thị",
      manualOverrides: "Ghi đè thủ công",
      staleRates: "Tỷ giá cũ",
      totalRates: "Tổng tỷ giá",
      search: "Tìm mã tiền hoặc tên tiền tệ...",
      sourceAll: "Nguồn: Tất cả",
      sourceMarket: "API thị trường",
      sourceSeed: "Dữ liệu khởi tạo",
      sourceManual: "Thủ công",
      statusAll: "Trạng thái: Tất cả",
      active: "Đang bật",
      hidden: "Đang ẩn",
      freshnessAll: "Độ mới: Tất cả",
      fresh: "Mới",
      stale: "Cũ",
      currency: "Tiền tệ",
      marketRate: "Tỷ giá thị trường",
      manualOverride: "Ghi đè thủ công",
      effectiveRate: "Tỷ giá áp dụng",
      source: "Nguồn",
      lastUpdated: "Cập nhật lúc",
      status: "Trạng thái",
      actions: "Thao tác",
      config: "Cấu hình",
      save: "Lưu cấu hình",
      saving: "Đang lưu...",
      manualTitle: "Ghi đè thủ công",
      manualDesc: "Dùng tỷ giá admin nhập thay cho tỷ giá thị trường.",
      activeTitle: "Hiển thị cho người dùng",
      baseCurrency: "Tiền tệ gốc",
      baseNote: "VND là tiền tệ gốc và nên giữ bằng 1.",
      customRate: "Tỷ giá tùy chỉnh",
      noData: "Chưa có tỷ giá",
      noDataDesc: "Hãy seed dữ liệu tiền tệ hoặc đồng bộ tỷ giá thị trường.",
      loading: "Đang tải tỷ giá...",
      saved: "Đã lưu cấu hình.",
      loadFailed: "Không thể tải tỷ giá.",
      saveFailed: "Không thể lưu cấu hình.",
      syncSuccess: "Đã đồng bộ tỷ giá thị trường.",
      syncFailed: "Đồng bộ thất bại.",
      logTitle: "Lịch sử đồng bộ tỷ giá",
      noLogs: "Chưa có lịch sử đồng bộ.",
      provider: "Nguồn",
      fetched: "Đã lấy",
    },
  }[lang || "EN"];

const loadData = async () => {
  setIsLoading(true);

  try {
    const data = await getAdminCurrencyRates({
      search: searchTerm.trim(),
      source: "all",
    });

    const list = normalizeList(data).map((rate) => ({
      ...rate,
      id: rate.id || rate._id,
      target_currency: String(rate.target_currency || rate.currency || "").toUpperCase(),
      currency_name: rate.currency_name || rate.name || rate.target_currency || "N/A",
      rate_to_vnd: Number(rate.rate_to_vnd || 0),
      market_rate_to_vnd:
        rate.market_rate_to_vnd !== null && rate.market_rate_to_vnd !== undefined
          ? Number(rate.market_rate_to_vnd)
          : Number(rate.rate_to_vnd || 0),
      manual_rate_to_vnd:
        rate.manual_rate_to_vnd !== null && rate.manual_rate_to_vnd !== undefined
          ? Number(rate.manual_rate_to_vnd)
          : null,
      manual_override: Boolean(rate.manual_override),
      source: String(rate.source || "").toLowerCase(),
      provider: rate.provider || "",
      is_active: rate.is_active !== false,
      is_stale: Boolean(rate.is_stale),
    }));

    setRates(list);
  } catch (error) {
    console.error("Load currency rates failed:", error);
    toast.error(
      error?.response?.data?.detail ||
        error?.response?.data?.message ||
        t.loadFailed,
    );
    setRates([]);
  } finally {
    setIsLoading(false);
  }
};

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSource, filterStatus, filterFreshness]);

 const filteredRates = useMemo(() => {
  const keyword = searchTerm.trim().toLowerCase();

  return rates.filter((rate) => {
    const code = String(rate.target_currency || "").toLowerCase();
    const name = String(rate.currency_name || "").toLowerCase();
    const source = String(rate.source || "").toLowerCase();
    const provider = String(rate.provider || "").toLowerCase();

    const matchSearch =
      !keyword || code.includes(keyword) || name.includes(keyword);

    const matchSource =
      filterSource === "all" ||
      source === filterSource ||
      provider === filterSource ||
      (filterSource === "market_api" &&
        ["market", "market_api", "api"].includes(source)) ||
      (filterSource === "manual" &&
        ["manual", "admin"].includes(source)) ||
      (filterSource === "seed" &&
        ["seed", "initial_seed"].includes(source));

    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && rate.is_active !== false) ||
      (filterStatus === "hidden" && rate.is_active === false);

    const isVnd = String(rate.target_currency || "").toUpperCase() === "VND";

    const matchFreshness =
      filterFreshness === "all" ||
      (filterFreshness === "fresh" && (isVnd || !rate.is_stale)) ||
      (filterFreshness === "stale" && !isVnd && rate.is_stale);

    return matchSearch && matchSource && matchStatus && matchFreshness;
  });
}, [rates, searchTerm, filterSource, filterStatus, filterFreshness]);

  const kpis = useMemo(() => {
    return {
      total: rates.length,
      active: rates.filter((r) => r.is_active).length,
      overrides: rates.filter((r) => r.manual_override).length,
      stale: rates.filter(
        (r) =>
          String(r.target_currency || "").toUpperCase() !== "VND" && r.is_stale,
      ).length,
    };
  }, [rates]);

  const formatVND = (value) => {
    const num = Number(value);

    if (!Number.isFinite(num)) return "N/A";

    if (num === 0) return "0 đ";

    return (
      new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: num < 10 ? 4 : 0,
      }).format(num) + " đ"
    );
  };

  const formatDate = (value) => {
    if (!value) return "N/A";

    try {
      return new Intl.DateTimeFormat(lang === "VI" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return "N/A";
    }
  };

  const getSourceLabel = (rate) => {
    const source = String(rate.source || "").toLowerCase();
    const provider = rate.provider;

    if (source === "base") return "SYSTEM";
    if (source === "seed") return "INITIAL_SEED";
    if (source === "market" || source === "market_api") {
  return provider || "MARKET_API";
}
    if (source === "manual") return "MANUAL";

    return provider || source || "UNKNOWN";
  };

  const getEffectiveRate = (rate) => {
    if (rate.manual_override && rate.manual_rate_to_vnd) {
      return Number(rate.manual_rate_to_vnd);
    }

    return Number(rate.rate_to_vnd || rate.market_rate_to_vnd || 0);
  };

  const openEditModal = (rate) => {
    const isBase = String(rate.target_currency || "").toUpperCase() === "VND";

    setFormData({
      id: getId(rate),
      currency: rate.target_currency || "",
      currency_name: rate.currency_name || "",
      market_rate: Number(rate.market_rate_to_vnd || rate.rate_to_vnd || 0),
      effective_rate: getEffectiveRate(rate),
      manual_rate:
        rate.manual_rate_to_vnd ||
        rate.market_rate_to_vnd ||
        rate.rate_to_vnd ||
        "",
      override: isBase ? false : Boolean(rate.manual_override),
      is_active: Boolean(rate.is_active),
      is_base: isBase,
    });

    setModalOpen(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!formData.id) {
      toast.error(t.saveFailed);
      return;
    }

    if (formData.override && Number(formData.manual_rate) <= 0) {
      toast.error(
        lang === "VI"
          ? "Tỷ giá ghi đè phải lớn hơn 0."
          : "Manual rate must be greater than 0.",
      );
      return;
    }

    setIsSaving(true);

    try {
      await updateCurrencyRate(formData.id, {
        manual_rate_to_vnd: formData.override
          ? Number(formData.manual_rate)
          : null,
        manual_override: formData.is_base ? false : formData.override,
        is_active: formData.is_active,
      });

      toast.success(t.saved);
      setModalOpen(false);
      await loadData();
    } catch (error) {
      console.error("Save currency rate failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t.saveFailed,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);

    try {
      await syncCurrencyRates();
      toast.success(t.syncSuccess);
      await loadData();
    } catch (error) {
      console.error("Sync currency rates failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t.syncFailed,
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenLogs = async () => {
    try {
      const data = await getCurrencySyncLogs();
      setLogs(normalizeList(data));
      setLogModalOpen(true);
    } catch (error) {
      console.error("Load sync logs failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Failed to load logs.",
      );
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setFilterSource("all");
    setFilterStatus("all");
    setFilterFreshness("all");
  };

  const cardClass = isDark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";

  const inputClass = isDark
    ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-teal-500"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white";

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-5 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400 mb-2">
            Recognition Data
          </p>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>

          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-2 max-w-2xl">
            {t.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={loadData}
            disabled={isLoading}
            className={`h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 transition-colors ${cardClass} text-slate-700 dark:text-slate-300 hover:border-teal-400 disabled:opacity-60`}
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            {t.refresh}
          </button>

          <button
            onClick={handleOpenLogs}
            className={`h-11 px-4 rounded-xl border font-bold text-sm flex items-center gap-2 transition-colors ${cardClass} text-slate-700 dark:text-slate-300 hover:border-blue-400`}
          >
            <History size={16} />
            {t.logs}
          </button>

          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="h-11 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-sm flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
            {t.sync}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: t.totalRates,
            value: kpis.total,
            tone: "text-slate-900 dark:text-white",
            icon: Database,
          },
          {
            label: t.activeCurrencies,
            value: kpis.active,
            tone: "text-teal-600 dark:text-teal-400",
            icon: Activity,
          },
          {
            label: t.manualOverrides,
            value: kpis.overrides,
            tone: "text-amber-500",
            icon: SlidersHorizontal,
          },
          {
            label: t.staleRates,
            value: kpis.stale,
            tone: kpis.stale > 0 ? "text-rose-500" : "text-emerald-500",
            icon: AlertTriangle,
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className={`p-5 rounded-3xl border shadow-sm ${cardClass}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">
                    {item.label}
                  </div>
                  <div className={`text-3xl font-black ${item.tone}`}>
                    {item.value}
                  </div>
                </div>

                <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={`p-4 rounded-3xl border shadow-sm flex flex-col xl:flex-row gap-3 ${cardClass}`}
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />

          <input
            type="text"
            placeholder={t.search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadData();
            }}
            className={`w-full h-12 pl-11 pr-4 rounded-2xl border outline-none text-sm transition-colors ${inputClass}`}
          />
        </div>

        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className={`h-12 px-4 rounded-2xl border outline-none font-bold text-sm min-w-[170px] ${inputClass}`}
        >
          <option value="all">{t.sourceAll}</option>
         <option value="market">{t.sourceMarket}</option>
          <option value="seed">{t.sourceSeed}</option>
          <option value="manual">{t.sourceManual}</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={`h-12 px-4 rounded-2xl border outline-none font-bold text-sm min-w-[170px] ${inputClass}`}
        >
          <option value="all">{t.statusAll}</option>
          <option value="active">{t.active}</option>
          <option value="hidden">{t.hidden}</option>
        </select>

        <select
          value={filterFreshness}
          onChange={(e) => setFilterFreshness(e.target.value)}
          className={`h-12 px-4 rounded-2xl border outline-none font-bold text-sm min-w-[170px] ${inputClass}`}
        >
          <option value="all">{t.freshnessAll}</option>
          <option value="fresh">{t.fresh}</option>
          <option value="stale">{t.stale}</option>
        </select>

        <button
          onClick={resetFilters}
          className={`h-12 px-4 rounded-2xl border font-bold text-sm ${cardClass} text-slate-600 dark:text-slate-300 hover:border-rose-300 transition-colors`}
        >
          Reset
        </button>
      </div>

      <div
        className={`rounded-3xl border shadow-sm overflow-hidden ${cardClass}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="uppercase text-[10px] font-black tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <tr>
                <th className="px-6 py-4">{t.currency}</th>
                <th className="px-6 py-4">{t.marketRate}</th>
                <th className="px-6 py-4 text-amber-500">{t.manualOverride}</th>
                <th className="px-6 py-4 text-teal-500">{t.effectiveRate}</th>
                <th className="px-6 py-4">{t.source}</th>
                <th className="px-6 py-4">{t.lastUpdated}</th>
                <th className="px-6 py-4">{t.status}</th>
                <th className="px-6 py-4 text-right">{t.actions}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index}>
                    {Array.from({ length: 8 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="px-6 py-5">
                        <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredRates.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="w-14 h-14 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
                        <Database size={24} />
                      </div>

                      <h3 className="text-lg font-black text-slate-900 dark:text-white">
                        {t.noData}
                      </h3>

                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        {t.noDataDesc}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRates.map((rate, index) => {
                  const id = getId(rate);
                  const effectiveRate = getEffectiveRate(rate);

                  return (
                    <tr
                      key={id || `${rate.target_currency}-${index}`}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-black">
                            {String(rate.target_currency || "?").slice(0, 1)}
                          </div>

                          <div>
                            <div className="font-black text-lg text-slate-900 dark:text-white tracking-tight">
                              {rate.target_currency}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {rate.currency_name || "N/A"}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5 font-mono text-slate-600 dark:text-slate-300">
                        {formatVND(rate.market_rate_to_vnd || rate.rate_to_vnd)}
                      </td>

                      <td className="px-6 py-5">
                        {rate.manual_override ? (
                          <span className="inline-flex px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-mono font-black text-xs">
                            {formatVND(rate.manual_rate_to_vnd)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      <td className="px-6 py-5 font-mono font-black text-teal-600 dark:text-teal-400">
                        {formatVND(effectiveRate)}
                      </td>

                      <td className="px-6 py-5">
                        <div className="font-black text-xs text-slate-700 dark:text-slate-200 uppercase">
                          {getSourceLabel(rate)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">
                          {rate.manual_override
                            ? "manual override"
                            : rate.source || "unknown"}
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                          <Clock size={14} className="text-slate-400" />
                          <span>{formatDate(rate.last_updated)}</span>
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex flex-wrap gap-1.5">
                          {rate.is_active ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              {t.active}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {t.hidden}
                            </span>
                          )}

                          {rate.is_stale ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                              {t.stale}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                              {t.fresh}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-5 text-right">
                        <button
                          onClick={() => openEditModal(rate)}
                          className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                          title={t.config}
                        >
                          <Edit size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div
            className={`w-full max-w-lg rounded-[2rem] shadow-2xl border p-6 md:p-8 animate-[slideInUp_0.2s_ease-out] ${
              isDark
                ? "bg-slate-900 border-slate-800"
                : "bg-white border-slate-200"
            }`}
          >
            <div className="flex justify-between items-start gap-4 mb-6">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">
                  {t.config}
                </p>

                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {formData.currency}
                </h3>

                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {formData.currency_name || "Currency configuration"}
                </p>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950">
                <div className="text-[10px] font-black uppercase text-slate-400 mb-1">
                  {t.marketRate}
                </div>
                <div className="font-mono font-black text-slate-900 dark:text-white">
                  {formatVND(formData.market_rate)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950">
                <div className="text-[10px] font-black uppercase text-slate-400 mb-1">
                  {t.effectiveRate}
                </div>
                <div className="font-mono font-black text-teal-600 dark:text-teal-400">
                  {formatVND(formData.effective_rate)}
                </div>
              </div>
            </div>

            {formData.is_base && (
              <div className="mb-5 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 p-4">
                <div className="font-black text-sm text-blue-700 dark:text-blue-300">
                  {t.baseCurrency}
                </div>
                <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-1">
                  {t.baseNote}
                </p>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <label
                className={`flex items-center justify-between p-4 border rounded-2xl transition-colors ${
                  formData.is_base
                    ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800"
                    : "cursor-pointer hover:border-amber-500 border-slate-200 dark:border-slate-800"
                }`}
              >
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {t.manualTitle}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t.manualDesc}
                  </p>
                </div>

                <input
                  type="checkbox"
                  disabled={formData.is_base}
                  checked={formData.override}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      override: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-amber-500"
                />
              </label>

              {formData.override && !formData.is_base && (
                <div>
                  <label className="text-xs font-black text-amber-500 uppercase mb-2 block">
                    {t.customRate} · 1 {formData.currency} = ? VND
                  </label>

                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    required
                    value={formData.manual_rate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        manual_rate: e.target.value,
                      })
                    }
                    className={`w-full h-12 px-4 rounded-2xl border outline-none font-mono font-black text-sm ${inputClass}`}
                  />
                </div>
              )}

              <label className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-teal-500 transition-colors">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {t.activeTitle}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {formData.is_active ? t.active : t.hidden}
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      is_active: e.target.checked,
                    })
                  }
                  className="w-5 h-5 accent-teal-600"
                />
              </label>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full h-12 bg-teal-600 hover:bg-teal-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 transition-colors"
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    {t.saving}
                  </>
                ) : (
                  t.save
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setLogModalOpen(false)}
          />

          <div
            className={`relative w-full max-w-md h-full flex flex-col shadow-2xl border-l animate-[slideInRight_0.3s_ease-out] ${
              isDark
                ? "bg-slate-950 border-slate-800"
                : "bg-white border-slate-200"
            }`}
          >
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">
                  {t.logs}
                </p>
                <h3 className="font-black text-xl text-slate-900 dark:text-white">
                  {t.logTitle}
                </h3>
              </div>

              <button
                onClick={() => setLogModalOpen(false)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
                  <History size={34} className="mb-3 text-slate-300" />
                  <p className="font-bold">{t.noLogs}</p>
                </div>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={getId(log) || index}
                    className={`p-4 rounded-2xl border ${
                      isDark
                        ? "bg-slate-900 border-slate-800"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${
                          log.status === "success"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                        }`}
                      >
                        {log.status || "unknown"}
                      </span>

                      <span className="text-xs text-slate-500 text-right">
                        {formatDate(log.started_at || log.created_at)}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                      {log.message || "No message"}
                    </p>

                    <p className="text-xs text-slate-500 font-mono">
                      {t.provider}: {log.provider || "N/A"}
                    </p>

                    <p className="text-xs text-blue-500 font-mono mt-1">
                      {t.fetched}: {log.fetched_count || 0}
                    </p>

                    {log.error_detail && (
                      <p className="text-xs text-rose-500 bg-rose-500/10 p-2 rounded-xl mt-3 font-mono break-words">
                        {log.error_detail}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
