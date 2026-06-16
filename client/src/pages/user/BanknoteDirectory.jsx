import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  MapPin,
  Layers,
  FileText,
  ScanLine,
  Image as ImageIcon,
  Info,
  Sun,
  Moon,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { getBanknotes } from "../../services/currencyService";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeBanknote(note) {
  const denomination = note?.denomination ?? note?.value ?? "";
  const features = Array.isArray(note?.features)
    ? note.features
    : typeof note?.features === "string"
      ? [note.features]
      : [];

  return {
    id: note?.id || note?._id || `${note?.country || "banknote"}-${denomination}`,
    country: note?.country || note?.origin || "Unknown",
    denomination,
    currency_code: note?.currency_code || note?.currency || "N/A",
    origin: note?.origin || note?.country || "Unknown",
    description: note?.description || "",
    material: note?.material || "Unknown",
    series_year: note?.series_year || note?.year || "Unknown",
    features,
    front_image_url: note?.front_image_url || note?.image_url || note?.frontImageUrl || "",
    back_image_url: note?.back_image_url || note?.backImageUrl || "",
  };
}

function formatDenomination(value) {
  const number = Number(value);

  if (Number.isFinite(number) && String(value).trim() !== "") {
    return new Intl.NumberFormat("vi-VN").format(number);
  }

  return value || "N/A";
}

export default function BanknoteDirectory() {
  const navigate = useNavigate();
  const { lang, theme, toggleTheme } = useAppStore();
  const isDarkMode = theme === "dark";

  const [banknotes, setBanknotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState("");

  const t = {
    EN: {
      title: "Banknote Directory",
      subtitle:
        "Browse supported regional banknotes. Explore detailed metadata and AI compatibility.",
      searchPlaceholder: "Search by country, currency code (e.g., VND, THB)...",
      noResults: "No banknotes match your search criteria.",
      material: "Material",
      series: "Series",
      features: "Key Features",
      btnScan: "Scan Similar Note",
      noImage: "Image not available",
      reload: "Reload",
      error: "Unable to load banknote directory.",
    },
    VI: {
      title: "Từ Điển Tiền Giấy",
      subtitle:
        "Tra cứu các loại tiền tệ được hệ thống AI hỗ trợ. Xem chi tiết thông số và hình ảnh gốc.",
      searchPlaceholder: "Tìm theo quốc gia, mã tiền tệ (VD: VND, THB)...",
      noResults: "Không tìm thấy tờ tiền nào phù hợp với từ khóa.",
      material: "Chất liệu",
      series: "Năm phát hành",
      features: "Đặc điểm nhận dạng",
      btnScan: "Quét tờ tiền tương tự",
      noImage: "Chưa có hình ảnh gốc",
      reload: "Tải lại",
      error: "Không thể tải danh mục tiền giấy.",
    },
  };

  const text = t[lang || "EN"] || t.EN;

  const fetchBanknotes = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getBanknotes({ region: "southeast_asia" });
      setBanknotes(normalizeList(data).map(normalizeBanknote));
    } catch (err) {
      console.error("Lỗi khi tải danh mục tiền:", err);
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          text.error,
      );
      setBanknotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanknotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    if (!q) return banknotes;

    return banknotes.filter((b) => {
      const searchable = [
        b.country,
        b.currency_code,
        b.denomination,
        b.material,
        b.series_year,
        b.description,
        ...(b.features || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(q);
    });
  }, [banknotes, searchTerm]);

  return (
    <div className="page-inner pt-6 relative p-4 md:p-8 lg:p-10 font-sans animate-[fadeInUp_0.4s_ease-out] pb-24 transition-colors duration-300">
      <div className="page-orb-indigo top-0 right-[-10%]" />
      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3 transition-colors">
              <Layers className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              {text.title}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-3 text-lg leading-relaxed transition-colors">
              {text.subtitle}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={fetchBanknotes}
              disabled={loading}
              className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all disabled:opacity-60"
              aria-label="Reload banknotes"
            >
              <RefreshCw className={`w-6 h-6 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={toggleTheme}
              className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={text.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-transparent rounded-xl focus:outline-none focus:ring-0 text-slate-700 dark:text-slate-200 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="text-sm font-semibold">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[420px] card-base border border-slate-100 dark:border-slate-700 animate-pulse rounded-3xl shadow-sm transition-colors"
              >
                <div className="h-48 bg-slate-100 dark:bg-slate-700 rounded-t-3xl transition-colors"></div>
                <div className="p-6 space-y-4">
                  <div className="h-6 bg-slate-100 dark:bg-slate-700 rounded w-1/2 transition-colors"></div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-1/3 transition-colors"></div>
                  <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded w-full mt-8 transition-colors"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center transition-colors">
            <FileText className="w-16 h-16 text-slate-200 dark:text-slate-600 mb-4 transition-colors" />
            <p className="text-slate-500 dark:text-slate-400 font-semibold text-lg transition-colors">
              {text.noResults}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {filteredData.map((note) => (
              <div
                key={note.id}
                className="group card-base border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:border-indigo-200 dark:hover:border-indigo-500 transition-all duration-300 flex flex-col"
              >
                <div className="h-52 bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center p-4 relative overflow-hidden border-b border-slate-100 dark:border-slate-700 transition-colors">
                  <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur text-slate-700 dark:text-slate-200 font-black text-xs tracking-wider px-3 py-1.5 rounded-full shadow-sm border border-slate-200 dark:border-slate-600 transition-colors">
                    {note.currency_code}
                  </div>

                  {note.front_image_url ? (
                    <img
                      src={note.front_image_url}
                      alt={`${note.denomination} ${note.currency_code}`}
                      className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal drop-shadow-md group-hover:scale-110 transition-transform duration-500"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src =
                          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
                        e.currentTarget.className = "w-12 h-12 opacity-50";
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-400 dark:text-slate-500 gap-2 transition-colors">
                      <ImageIcon className="w-10 h-10 opacity-50" />
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        {text.noImage}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-6 flex-1 flex flex-col">
                  <div className="mb-5">
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">
                      {formatDenomination(note.denomination)}{" "}
                      <span className="text-lg text-slate-500 dark:text-slate-400 font-bold">
                        {note.currency_code}
                      </span>
                    </h3>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1.5 transition-colors">
                      <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />{" "}
                      {note.country}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 transition-colors">
                    <div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1 transition-colors">
                        {text.material}
                      </p>
                      <p className="font-bold text-slate-800 dark:text-slate-200 transition-colors">
                        {note.material || "Unknown"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-1 transition-colors">
                        {text.series}
                      </p>
                      <p className="font-bold text-slate-800 dark:text-slate-200 transition-colors">
                        {note.series_year || "Unknown"}
                      </p>
                    </div>
                  </div>

                  {note.features && note.features.length > 0 && (
                    <div className="mb-6">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1 transition-colors">
                        <Info size={12} /> {text.features}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 font-medium line-clamp-2 leading-relaxed transition-colors">
                        {note.features[0]}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto pt-2">
                    <button
                      onClick={() => navigate("/recognize")}
                      className="w-full py-3.5 bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
                    >
                      <ScanLine className="w-4 h-4 text-indigo-400 dark:text-indigo-200" />{" "}
                      {text.btnScan}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
