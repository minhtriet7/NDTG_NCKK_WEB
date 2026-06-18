import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  TrendingUp,
  Info,
  Activity,
  AlertTriangle,
  RefreshCw,
  Database,
  Globe
} from "lucide-react";
import { getRates } from "../../services/currencyService";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";

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

export default function CurrencyConverter() {
  const navigate = useNavigate();
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [ratesData, setRatesData] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(100);
  const [fromCurr, setFromCurr] = useState("USD");
  const [toCurr, setToCurr] = useState("VND");

  const t = {
    EN: {
      title: "Market Exchange Converter",
      subtitle:
        "Convert supported currencies using the latest rates cached by BanknoteAI.",
      source: "Source",
      provider: "Provider",
      active: "Active currencies",
      lastUpdated: "Last updated",
      amtFrom: "Amount & From",
      convertedTo: "Converted To",
      scanBtn: "Scan a Banknote",
      btnRefresh: "Refresh",
      info: "Rates are for informational purposes only.",
      staleWarn:
        "Rates may be outdated. Please verify before using them for real transactions.",
      noRates: "No market rates configured.",
      fresh: "Fresh",
      stale: "Stale",
      loadError: "Unable to load exchange rates.",
    },
    VI: {
      title: "Quy đổi Tỷ giá Thị trường",
      subtitle:
        "Quy đổi các đồng tiền bằng tỷ giá mới nhất được lưu trong BanknoteAI.",
      source: "Nguồn",
      provider: "Nhà cung cấp",
      active: "Tiền tệ đang bật",
      lastUpdated: "Cập nhật lần cuối",
      amtFrom: "Số lượng & Từ",
      convertedTo: "Thành tiền",
      scanBtn: "Quét Tiền Giấy",
      btnRefresh: "Làm mới",
      info: "Tỷ giá chỉ mang tính chất tham khảo.",
      staleWarn:
        "Tỷ giá có thể đã cũ. Vui lòng kiểm tra trước khi dùng cho giao dịch thực tế.",
      noRates: "Chưa có tỷ giá thị trường được cấu hình.",
      fresh: "Mới",
      stale: "Cũ",
      loadError: "Không thể tải tỷ giá.",
    },
  }[lang || "EN"];

  const currencyCodes = useMemo(() => {
    return Object.keys(ratesData?.rates || {});
  }, [ratesData]);

  const stale = isStaleRates(ratesData);

  const fetchRates = async () => {
    setIsFetching(true);
    setError("");

    try {
      const data = await getRates();
      setRatesData(data);

      const keys = Object.keys(data?.rates || {});
      const nonVndKeys = keys.filter((k) => k !== "VND");

      if (keys.length > 0) {
        if (!data.rates[fromCurr]) {
          setFromCurr(nonVndKeys[0] || keys[0]);
        }

        if (!data.rates[toCurr]) {
          setToCurr(keys.includes("VND") ? "VND" : keys[0]);
        }
      }
    } catch (err) {
      setRatesData(null);
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          t.loadError,
      );
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calculateResult = () => {
    if (!ratesData?.rates || !ratesData.rates[fromCurr] || !ratesData.rates[toCurr]) {
      return "0.00";
    }

    const rateFrom = Number(ratesData.rates[fromCurr] || 0);
    const rateTo = Number(ratesData.rates[toCurr] || 0);

    if (!rateFrom || !rateTo) return "0.00";

    const amountInVND = Number(amount || 0) * rateFrom;
    const finalAmount = amountInVND / rateTo;

    if (toCurr === "VND") {
      return `${new Intl.NumberFormat("vi-VN").format(Math.round(finalAmount))} đ`;
    }

    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(finalAmount);
  };

  const getExplanation = () => {
    if (!ratesData?.rates || !ratesData.rates[fromCurr]) return "";
    const rate = Number(ratesData.rates[fromCurr] || 0);
    return `1 ${fromCurr} = ${new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: rate < 100 ? 4 : 0,
    }).format(rate)} VND`;
  };

  const quickPairs = useMemo(() => {
    if (!ratesData?.rates) return [];
    const keys = Object.keys(ratesData.rates)
      .filter((k) => k !== "VND")
      .slice(0, 6);
    return keys.map((k) => `100 ${k} to VND`);
  }, [ratesData]);

  if ((!ratesData || Object.keys(ratesData.rates || {}).length <= 1) && !isFetching) {
    return (
      <div className="page-inner p-10 text-center font-sans">
        <p className="font-bold text-xl">{error || t.noRates}</p>
        <button
          onClick={fetchRates}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg"
        >
          <RefreshCw className="inline w-4 h-4 mr-2" /> {t.btnRefresh}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 pb-20 relative overflow-hidden flex flex-col items-center pt-24">
      {/* ── Gradient orbs ── */}
      <div
        className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-600/10 dark:bg-indigo-600/10 blur-[120px] pointer-events-none animate-float"
        style={{ animationDuration: "8s" }}
      />
      <div
        className="absolute bottom-[-5%] right-[-5%] w-[400px] h-[400px] rounded-full bg-purple-600/10 dark:bg-purple-600/10 blur-[100px] pointer-events-none animate-float"
        style={{ animationDelay: "2s", animationDuration: "10s" }}
      />

      {/* ── Grid background ── */}
      <div
        className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1E293B40_1px,transparent_1px),linear-gradient(to_bottom,#1E293B40_1px,transparent_1px)] bg-[size:2.5rem_2.5rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_40%,transparent_100%)]"
      />

      {/* ── Top glow bar ── */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[150px] opacity-[0.1] dark:opacity-[0.15] bg-indigo-500 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 space-y-10 relative z-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2 shadow-sm">
            Finance & AI
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-[3.4rem] font-black tracking-tight leading-tight gradient-text-brand">
            {t.title}
          </h1>
          <p className="text-base sm:text-lg font-medium text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            {t.subtitle}
          </p>
          <div className="flex justify-center items-center gap-3 flex-wrap mt-4">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border backdrop-blur-md ${
                isDark
                  ? "bg-blue-900/20 text-blue-400 border-blue-800/50"
                  : "bg-blue-50/80 text-blue-700 border-blue-200"
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> {t.provider}: {ratesData?.provider || "N/A"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border backdrop-blur-md ${
                stale
                  ? "bg-rose-900/20 text-rose-400 border-rose-800/50"
                  : "bg-emerald-900/20 text-emerald-500 border-emerald-800/50"
              }`}
            >
              {stale ? t.stale : t.fresh}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetaCard icon={<Database className="w-4 h-4 text-indigo-500" />} label={t.source} value={ratesData?.source || "database"} isDark={isDark} />
          <MetaCard icon={<Activity className="w-4 h-4 text-indigo-500" />} label={t.provider} value={ratesData?.provider || "system"} isDark={isDark} />
          <MetaCard icon={<Globe className="w-4 h-4 text-indigo-500" />} label={t.active} value={currencyCodes.length} isDark={isDark} />
          <MetaCard icon={<RefreshCw className="w-4 h-4 text-indigo-500" />} label={t.lastUpdated} value={formatDate(ratesData?.last_updated, lang)} isDark={isDark} />
        </div>

        {stale && (
          <div
            className={`p-4 rounded-2xl flex items-start gap-3 border backdrop-blur-md shadow-sm ${
              isDark
                ? "bg-rose-950/30 border-rose-900/50 text-rose-300"
                : "bg-rose-50/80 border-rose-200 text-rose-700"
            }`}
          >
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold">{t.staleWarn}</p>
          </div>
        )}

        {/* Main Converter Card */}
        <div className="bg-white/80 dark:bg-[#0F172A]/80 backdrop-blur-xl shadow-[0_0_40px_rgba(99,102,241,0.08)] dark:shadow-[0_0_40px_rgba(99,102,241,0.05)] border border-slate-200/60 dark:border-slate-800/60 rounded-[2rem] p-6 md:p-10 relative overflow-hidden group hover:border-indigo-500/30 dark:hover:border-indigo-400/30 transition-colors duration-500">
          <div className="absolute top-0 left-0 w-64 h-64 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-full pointer-events-none" />
          
          <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
            <div className="w-full md:w-[42%] space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t.amtFrom}
              </label>
              <div
                className={`flex border rounded-2xl overflow-hidden focus-within:ring-4 focus-within:ring-indigo-500/20 transition-all duration-300 ${
                  isDark ? "bg-slate-900/50 border-slate-700/80" : "bg-slate-50 border-slate-200"
                }`}
              >
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full p-4 bg-transparent outline-none font-sans text-2xl md:text-3xl font-black text-slate-800 dark:text-white"
                />
                <select
                  value={fromCurr}
                  onChange={(e) => setFromCurr(e.target.value)}
                  className={`bg-transparent border-l p-4 font-bold outline-none cursor-pointer text-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                    isDark ? "border-slate-700/80 text-white" : "border-slate-200 text-slate-800"
                  }`}
                >
                  {currencyCodes.map((c) => (
                    <option key={c} value={c} className="text-slate-800 dark:bg-slate-900 dark:text-white">{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                setFromCurr(toCurr);
                setToCurr(fromCurr);
              }}
              className={`p-4 rounded-full shadow-md hover:shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 z-10 border group ${
                isDark ? "bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500" : "bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500"
              }`}
            >
              <ArrowRightLeft className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" />
            </button>

            <div className="w-full md:w-[42%] space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {t.convertedTo}
              </label>
              <div
                className={`flex border rounded-2xl overflow-hidden focus-within:ring-4 focus-within:ring-indigo-500/20 transition-all duration-300 ${
                  isDark ? "bg-slate-900/80 border-slate-700/80" : "bg-indigo-50/50 border-indigo-100"
                }`}
              >
                <div
                  className={`w-full p-4 font-sans text-2xl md:text-3xl font-black flex items-center overflow-x-auto ${
                    isDark ? "text-indigo-400" : "text-indigo-600"
                  }`}
                >
                  {calculateResult()}
                </div>
                <select
                  value={toCurr}
                  onChange={(e) => setToCurr(e.target.value)}
                  className={`bg-transparent border-l p-4 font-bold outline-none cursor-pointer text-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                    isDark ? "border-slate-700/80 text-white" : "border-indigo-100 text-indigo-900"
                  }`}
                >
                  {currencyCodes.map((c) => (
                    <option key={c} value={c} className="text-slate-800 dark:bg-slate-900 dark:text-white">{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <span className="inline-flex items-center justify-center text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
              {getExplanation()}
            </span>
          </div>

          <div
            className={`mt-10 pt-6 border-t flex flex-col md:flex-row justify-between items-center gap-4 ${
              isDark ? "border-slate-800/80" : "border-slate-200"
            }`}
          >
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
              <Info className="w-4 h-4 text-indigo-500" /> {t.info}
            </p>
            <div className="flex gap-3">
              <button
                onClick={fetchRates}
                disabled={isFetching}
                className={`flex items-center justify-center w-11 h-11 rounded-xl border transition-colors ${
                  isDark ? "border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
                }`}
              >
                <RefreshCw size={18} className={isFetching ? "animate-spin text-indigo-500" : ""} />
              </button>
              <button
                onClick={() => navigate("/recognize")}
                className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
              >
                {t.scanBtn}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-2">Quick Conversions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {quickPairs.map((pair, idx) => (
              <div
                key={idx}
                onClick={() => {
                  const parts = pair.split(" ");
                  setAmount(Number(parts[0]));
                  setFromCurr(parts[1]);
                  setToCurr(parts[3]);
                }}
                className={`p-4 rounded-2xl shadow-sm border backdrop-blur-sm flex items-center justify-between cursor-pointer group hover:-translate-y-0.5 transition-all duration-300 ${
                  isDark ? "bg-slate-900/50 border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-800/50" : "bg-white/80 border-slate-200 hover:border-indigo-400 hover:shadow-md"
                }`}
              >
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{pair}</span>
                <TrendingUp className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaCard({ icon, label, value, isDark }) {
  return (
    <div
      className={`rounded-2xl border p-5 text-left flex flex-col gap-2 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        isDark ? "bg-slate-900/50 border-slate-800/80 hover:border-indigo-500/30" : "bg-white/80 border-slate-200 hover:border-indigo-200"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">{label}</p>
      </div>
      <p className="text-xl font-black truncate text-slate-800 dark:text-white tracking-tight">{value}</p>
    </div>
  );
}
