import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  TrendingUp,
  Info,
  Activity,
  AlertTriangle,
  RefreshCw,
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
    <div className="page-inner pt-6 relative pb-24 font-sans transition-colors duration-300">
      <div className="page-orb-indigo top-0 right-[-10%]" />
      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {t.subtitle}
          </p>
          <div className="flex justify-center items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${
                isDark
                  ? "bg-blue-900/30 text-blue-400 border-blue-800"
                  : "bg-blue-50 text-blue-600 border-blue-100"
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> {t.provider}: {ratesData?.provider || "N/A"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border ${
                stale
                  ? "bg-rose-900/30 text-rose-400 border-rose-800"
                  : "bg-emerald-900/30 text-emerald-400 border-emerald-800"
              }`}
            >
              {stale ? t.stale : t.fresh}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaCard label={t.source} value={ratesData?.source || "database"} isDark={isDark} />
          <MetaCard label={t.provider} value={ratesData?.provider || "system"} isDark={isDark} />
          <MetaCard label={t.active} value={currencyCodes.length} isDark={isDark} />
          <MetaCard label={t.lastUpdated} value={formatDate(ratesData?.last_updated, lang)} isDark={isDark} />
        </div>

        {stale && (
          <div
            className={`p-4 rounded-xl flex items-start gap-3 border ${
              isDark
                ? "bg-rose-950/30 border-rose-900/50 text-rose-300"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-semibold">{t.staleWarn}</p>
          </div>
        )}

        <div className="card-base p-6 md:p-10 rounded-3xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
            <div className="w-full md:w-2/5 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t.amtFrom}
              </label>
              <div
                className={`flex border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 ${
                  isDark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-200"
                }`}
              >
                <input
                  type="number"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full p-4 bg-transparent outline-none font-mono text-lg font-bold"
                />
                <select
                  value={fromCurr}
                  onChange={(e) => setFromCurr(e.target.value)}
                  className={`bg-transparent border-l p-4 font-bold outline-none cursor-pointer ${
                    isDark ? "border-slate-700" : "border-slate-200"
                  }`}
                >
                  {currencyCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                setFromCurr(toCurr);
                setToCurr(fromCurr);
              }}
              className={`p-4 rounded-full shadow-sm hover:border-indigo-500 transition-all z-10 border ${
                isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              }`}
            >
              <ArrowRightLeft className="w-5 h-5 text-slate-400 hover:text-indigo-500" />
            </button>

            <div className="w-full md:w-2/5 space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t.convertedTo}
              </label>
              <div
                className={`flex border rounded-xl overflow-hidden ${
                  isDark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-200"
                }`}
              >
                <div
                  className={`w-full p-4 font-mono text-lg font-bold flex items-center overflow-x-auto ${
                    isDark ? "text-indigo-400 bg-slate-900" : "text-indigo-700 bg-slate-100"
                  }`}
                >
                  {calculateResult()}
                </div>
                <select
                  value={toCurr}
                  onChange={(e) => setToCurr(e.target.value)}
                  className={`bg-transparent border-l p-4 font-bold outline-none cursor-pointer ${
                    isDark ? "border-slate-700" : "border-slate-200"
                  }`}
                >
                  {currencyCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 text-center">
            <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
              {getExplanation()}
            </span>
          </div>

          <div
            className={`mt-8 pt-6 border-t flex flex-col md:flex-row justify-between items-center gap-4 ${
              isDark ? "border-slate-800" : "border-slate-100"
            }`}
          >
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <Info className="w-4 h-4" /> {t.info}
            </p>
            <div className="flex gap-2">
              <button
                onClick={fetchRates}
                disabled={isFetching}
                className={`p-2.5 rounded-xl border ${
                  isDark ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-600"
                }`}
              >
                <RefreshCw size={16} className={isFetching ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => navigate("/recognize")}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95"
              >
                {t.scanBtn}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickPairs.map((pair, idx) => (
            <div
              key={idx}
              onClick={() => {
                const parts = pair.split(" ");
                setAmount(Number(parts[0]));
                setFromCurr(parts[1]);
                setToCurr(parts[3]);
              }}
              className={`p-4 border rounded-2xl shadow-sm flex items-center justify-between cursor-pointer hover:border-indigo-500 transition-colors ${
                isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
              }`}
            >
              <span className="text-sm font-semibold">{pair}</span>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaCard({ label, value, isDark }) {
  return (
    <div
      className={`rounded-2xl border p-4 text-left ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black truncate">{value}</p>
    </div>
  );
}
