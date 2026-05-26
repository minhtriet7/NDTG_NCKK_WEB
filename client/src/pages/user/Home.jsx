import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ScanLine,
  Cpu,
  BotMessageSquare,
  SearchCheck,
  GitMerge,
  ChevronRight,
  Layers3,
  FileJson,
  History,
  Coins,
  ArrowLeftRight,
  BookOpen,
  MessageSquareDiff,
  Zap,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const SCAN_ROUTE = "/workspace";

// ─── BILINGUAL CONTENT ───────────────────────────────────────────────────────
const CONTENT = {
  EN: {
    // Hero
    heroBadge: "Multi-Agent Banknote Analysis",
    heroTitle: "Identify Southeast Asian Banknotes with Multi-Agent Analysis",
    heroSubtitle:
      "Upload a banknote image and compare results from visual recognition, language reasoning, and visual search before generating a structured result.",
    heroCta: "Start Scan",
    heroCtaSub: "View Supported Banknotes",
    heroTokenLabel: "Token Balance",
    heroTokenUnit: "tokens",
    heroPill1: "3-Agent Verification",
    heroPill2: "JSON Output",
    heroPill3: "Majority Voting",
    mockTitle: "BanknoteAI Workspace",
    mockSub: "Multi-Agent Engine",
    mockUpload: "Upload Banknote Image",
    mockUploadSub: "JPG, PNG, WEBP supported",
    mockAgent1: "ML/DL Agent",
    mockAgent2: "LLM Agent",
    mockAgent3: "Visual Search",
    mockAgg: "Aggregator Decision",
    mockAggSub: "Majority vote in progress...",
    mockJson: "Structured output",
    mockPending: "Pending",
    mockConsensus: "Consensus",
    // Stats
    statsTitle: "System Capabilities",
    stats: [
      { value: "SEA Focus", label: "Supported Region" },
      { value: "3 Agents", label: "Analysis Pipeline" },
      { value: "JSON", label: "Output Format" },
      { value: "1 Token", label: "Cost per Scan" },
    ],
    // How it works
    howTitle: "How It Works",
    howSub:
      "Four clear steps from image upload to a structured, consensus-based result.",
    steps: [
      {
        num: "01",
        title: "Upload banknote image",
        desc: "Drag and drop or select a photo of any Southeast Asian banknote.",
      },
      {
        num: "02",
        title: "Agents analyze independently",
        desc: "ML/DL model, LLM API, and Visual Search each produce their own result in parallel.",
      },
      {
        num: "03",
        title: "Aggregator compares results",
        desc: "Majority voting determines the final answer; conflicts are flagged for review.",
      },
      {
        num: "04",
        title: "Review result and export JSON",
        desc: "View denomination, country, material, consensus status, and download structured data.",
      },
    ],
    // Agents
    agentsTitle: "The Agent System",
    agentsSub:
      "Each agent operates independently. The aggregator decides the final result.",
    agents: [
      {
        label: "Agent 1",
        name: "ML / DL Model",
        desc: "Detects visual patterns, denomination clues, and cropped banknote regions.",
        accent: "teal",
      },
      {
        label: "Agent 2",
        name: "LLM API",
        desc: "Reads visible text and reasons over country, currency, material, and description.",
        accent: "violet",
      },
      {
        label: "Agent 3",
        name: "Visual Search",
        desc: "Compares the uploaded image with external visual references when available.",
        accent: "blue",
      },
      {
        label: "Aggregator",
        name: "Majority Voting",
        desc: "Applies majority voting and marks conflicts when results do not agree.",
        accent: "amber",
      },
    ],
    // Result Preview
    resultTitle: "Sample Output",
    resultSub:
      "The final result includes denomination, origin, material, consensus status, and a structured JSON export.",
    resultNote: "Example preview only",
    resultDenom: "Denomination",
    resultCountry: "Country",
    resultMaterial: "Material",
    resultConsensus: "Consensus",
    resultStatus: "Status",
    resultCompleted: "Completed",
    // Features
    featTitle: "Everything You Need",
    featSub: "Tools built around the recognition workflow.",
    features: [
      {
        icon: History,
        label: "Scan History",
        desc: "Review all your past scans and re-export results.",
        link: "/history",
        linkLabel: "View History",
      },
      {
        icon: FileJson,
        label: "JSON Export",
        desc: "Download structured results for integration or record-keeping.",
        link: SCAN_ROUTE,
        linkLabel: "Try a Scan",
      },
      {
        icon: Coins,
        label: "Token-Based Usage",
        desc: "Each scan costs 1 token. Buy only what you need.",
        link: "/pricing",
        linkLabel: "See Pricing",
      },
      {
        icon: ArrowLeftRight,
        label: "Currency Exchange",
        desc: "Convert detected denomination values using live rates.",
        link: "/exchange",
        linkLabel: "Open Exchange",
      },
      {
        icon: BookOpen,
        label: "Banknote Directory",
        desc: "Browse the catalogue of supported Southeast Asian banknotes.",
        link: "/directory",
        linkLabel: "Browse Directory",
      },
      {
        icon: MessageSquareDiff,
        label: "Feedback & Reports",
        desc: "Flag incorrect results or suggest improvements.",
        link: "/feedback",
        linkLabel: "Send Feedback",
      },
    ],
    // SEA Section
    seaTitle: "Southeast Asia Focus",
    seaSub:
      "Optimised for the currencies most commonly encountered across the region.",
    currencies: [
      "Vietnam · VND",
      "Thailand · THB",
      "Malaysia · MYR",
      "Singapore · SGD",
      "Indonesia · IDR",
      "Philippines · PHP",
      "Cambodia · KHR",
      "Laos · LAK",
      "Myanmar · MMK",
      "Brunei · BND",
    ],
    // Final CTA
    ctaTitle: "Ready to analyze a banknote?",
    ctaSub:
      "Upload an image and get a structured result in seconds — no setup required.",
    ctaMain: "Start Scan",
    ctaSecond: "Buy Tokens",
  },

  VI: {
    heroBadge: "Phân tích tiền giấy đa tác tử",
    heroTitle: "Nhận diện tiền giấy Đông Nam Á bằng phân tích đa tác tử",
    heroSubtitle:
      "Tải ảnh tiền giấy lên để hệ thống đối chiếu kết quả từ nhận diện hình ảnh, phân tích ngôn ngữ và tìm kiếm trực quan trước khi tạo kết quả có cấu trúc.",
    heroCta: "Bắt đầu quét",
    heroCtaSub: "Xem danh mục tiền",
    heroTokenLabel: "Số dư token",
    heroTokenUnit: "token",
    heroPill1: "Xác minh 3 tác tử",
    heroPill2: "Kết quả JSON",
    heroPill3: "Biểu quyết đa số",
    mockTitle: "BanknoteAI Workspace",
    mockSub: "Lõi đa tác tử",
    mockUpload: "Tải ảnh tiền giấy",
    mockUploadSub: "Hỗ trợ JPG, PNG, WEBP",
    mockAgent1: "Tác tử ML/DL",
    mockAgent2: "Tác tử LLM",
    mockAgent3: "Tìm kiếm trực quan",
    mockAgg: "Quyết định tổng hợp",
    mockAggSub: "Đang biểu quyết đa số...",
    mockJson: "Đầu ra có cấu trúc",
    mockPending: "Chờ xử lý",
    mockConsensus: "Đồng thuận",
    statsTitle: "Năng lực hệ thống",
    stats: [
      { value: "Khu vực ĐNÁ", label: "Phạm vi hỗ trợ" },
      { value: "3 tác tử", label: "Quy trình phân tích" },
      { value: "JSON", label: "Định dạng đầu ra" },
      { value: "1 token", label: "Chi phí mỗi lần quét" },
    ],
    howTitle: "Cách hoạt động",
    howSub:
      "Bốn bước rõ ràng từ tải ảnh đến kết quả có cấu trúc dựa trên đồng thuận.",
    steps: [
      {
        num: "01",
        title: "Tải ảnh tiền giấy",
        desc: "Kéo thả hoặc chọn ảnh bất kỳ tờ tiền Đông Nam Á nào.",
      },
      {
        num: "02",
        title: "Các tác tử phân tích độc lập",
        desc: "Mô hình ML/DL, LLM API và Tìm kiếm trực quan hoạt động song song, mỗi tác tử cho ra kết quả riêng.",
      },
      {
        num: "03",
        title: "Bộ tổng hợp so sánh kết quả",
        desc: "Biểu quyết đa số xác định kết quả cuối; xung đột được gắn cờ để xem xét.",
      },
      {
        num: "04",
        title: "Xem kết quả và xuất JSON",
        desc: "Xem mệnh giá, quốc gia, chất liệu, trạng thái đồng thuận và tải dữ liệu có cấu trúc.",
      },
    ],
    agentsTitle: "Hệ thống tác tử",
    agentsSub:
      "Mỗi tác tử hoạt động độc lập. Bộ tổng hợp đưa ra kết quả cuối cùng.",
    agents: [
      {
        label: "Tác tử 1",
        name: "Mô hình ML/DL",
        desc: "Phân tích đặc trưng hình ảnh, dấu hiệu mệnh giá và vùng tiền được cắt.",
        accent: "teal",
      },
      {
        label: "Tác tử 2",
        name: "LLM API",
        desc: "Đọc thông tin hiển thị và suy luận về quốc gia, tiền tệ, chất liệu, mô tả.",
        accent: "violet",
      },
      {
        label: "Tác tử 3",
        name: "Tìm kiếm trực quan",
        desc: "Đối chiếu ảnh tải lên với nguồn tham chiếu trực quan khi có dữ liệu.",
        accent: "blue",
      },
      {
        label: "Bộ tổng hợp",
        name: "Biểu quyết đa số",
        desc: "Áp dụng biểu quyết đa số và đánh dấu cần xem lại khi kết quả không thống nhất.",
        accent: "amber",
      },
    ],
    resultTitle: "Kết quả mẫu",
    resultSub:
      "Kết quả cuối bao gồm mệnh giá, xuất xứ, chất liệu, trạng thái đồng thuận và xuất JSON có cấu trúc.",
    resultNote: "Ví dụ minh họa",
    resultDenom: "Mệnh giá",
    resultCountry: "Quốc gia",
    resultMaterial: "Chất liệu",
    resultConsensus: "Đồng thuận",
    resultStatus: "Trạng thái",
    resultCompleted: "Hoàn thành",
    featTitle: "Mọi thứ bạn cần",
    featSub: "Các công cụ được xây dựng xung quanh quy trình nhận diện.",
    features: [
      {
        icon: History,
        label: "Lịch sử quét",
        desc: "Xem lại tất cả lần quét trước và xuất lại kết quả.",
        link: "/history",
        linkLabel: "Xem lịch sử",
      },
      {
        icon: FileJson,
        label: "Xuất JSON",
        desc: "Tải kết quả có cấu trúc để tích hợp hoặc lưu trữ.",
        link: SCAN_ROUTE,
        linkLabel: "Thử quét",
      },
      {
        icon: Coins,
        label: "Dùng theo token",
        desc: "Mỗi lần quét tốn 1 token. Mua đúng nhu cầu của bạn.",
        link: "/pricing",
        linkLabel: "Xem giá",
      },
      {
        icon: ArrowLeftRight,
        label: "Quy đổi tiền tệ",
        desc: "Chuyển đổi mệnh giá nhận diện được theo tỷ giá thực tế.",
        link: "/exchange",
        linkLabel: "Mở quy đổi",
      },
      {
        icon: BookOpen,
        label: "Danh mục tiền",
        desc: "Duyệt danh mục tiền giấy Đông Nam Á được hỗ trợ.",
        link: "/directory",
        linkLabel: "Xem danh mục",
      },
      {
        icon: MessageSquareDiff,
        label: "Phản hồi & Báo lỗi",
        desc: "Gắn cờ kết quả sai hoặc gợi ý cải tiến.",
        link: "/feedback",
        linkLabel: "Gửi phản hồi",
      },
    ],
    seaTitle: "Trọng tâm Đông Nam Á",
    seaSub: "Tối ưu hoá cho các đồng tiền phổ biến nhất trong khu vực.",
    currencies: [
      "Việt Nam · VND",
      "Thái Lan · THB",
      "Malaysia · MYR",
      "Singapore · SGD",
      "Indonesia · IDR",
      "Philippines · PHP",
      "Campuchia · KHR",
      "Lào · LAK",
      "Myanmar · MMK",
      "Brunei · BND",
    ],
    ctaTitle: "Sẵn sàng nhận diện một tờ tiền?",
    ctaSub:
      "Tải ảnh lên và nhận kết quả có cấu trúc trong vài giây — không cần cài đặt.",
    ctaMain: "Bắt đầu quét",
    ctaSecond: "Mua token",
  },
};

// ─── ACCENT COLOUR MAP ───────────────────────────────────────────────────────
const ACCENT = {
  teal: {
    bg: "bg-teal-50 dark:bg-teal-900/20",
    border: "border-teal-200 dark:border-teal-800",
    text: "text-teal-600 dark:text-teal-400",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  violet: {
    bg: "bg-violet-50 dark:bg-violet-900/20",
    border: "border-violet-200 dark:border-violet-800",
    text: "text-violet-600 dark:text-violet-400",
    badge:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-600 dark:text-amber-400",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    dot: "bg-amber-500",
  },
};

// ─── MOCK WORKSPACE PREVIEW ──────────────────────────────────────────────────
function HeroMockup({ t }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => (v + 1) % 4), 1400);
    return () => clearInterval(id);
  }, []);

  const agentStates = [
    { label: t.mockAgent1, icon: Cpu, accent: "teal" },
    { label: t.mockAgent2, icon: BotMessageSquare, accent: "violet" },
    { label: t.mockAgent3, icon: SearchCheck, accent: "blue" },
  ];

  return (
    <div className="relative">
      {/* glow halo */}
      <div className="absolute -inset-8 bg-teal-400/10 blur-3xl rounded-full pointer-events-none" />

      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl shadow-slate-200/60 dark:shadow-slate-950/60 overflow-hidden">
        {/* window chrome */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 opacity-80" />
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 opacity-80" />
            </div>
            <span className="text-xs font-semibold text-slate-400 ml-1">
              {t.mockTitle}
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-teal-500 uppercase tracking-wider">
            <Zap className="w-3 h-3 animate-pulse" /> {t.mockSub}
          </span>
        </div>

        <div className="p-5 space-y-3">
          {/* upload zone */}
          <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-5 flex items-center gap-4 bg-slate-50 dark:bg-slate-800/40">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/30 border border-teal-100 dark:border-teal-800 flex items-center justify-center shrink-0">
              <ScanLine className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t.mockUpload}
              </p>
              <p className="text-xs text-slate-400">{t.mockUploadSub}</p>
            </div>
          </div>

          {/* agents row */}
          <div className="grid grid-cols-3 gap-2">
            {agentStates.map((a, i) => {
              const A = ACCENT[a.accent];
              const done = i < tick;
              return (
                <div
                  key={i}
                  className={`p-3 rounded-xl border text-center space-y-1.5 transition-all duration-500 ${A.bg} ${A.border}`}
                >
                  <a.icon className={`w-4 h-4 mx-auto ${A.text}`} />
                  <p
                    className={`text-[10px] font-bold leading-tight ${A.text}`}
                  >
                    {a.label}
                  </p>
                  <span
                    className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      done
                        ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                        : "bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                    }`}
                  >
                    {done ? t.mockConsensus : t.mockPending}
                  </span>
                </div>
              );
            })}
          </div>

          {/* aggregator */}
          <div className="bg-slate-900 dark:bg-slate-950 rounded-xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <GitMerge className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white">{t.mockAgg}</p>
              <p className="text-[10px] text-slate-400 truncate">
                {t.mockAggSub}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 h-4 rounded-full transition-all duration-300 ${
                    i <= tick % 4 ? "bg-teal-400" : "bg-slate-700"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* json preview */}
          <div className="bg-slate-950 rounded-xl px-4 py-3 font-mono border border-slate-800">
            <p className="text-[10px] text-slate-500 font-sans font-semibold mb-1.5 uppercase tracking-wider">
              {t.mockJson}
            </p>
            <p className="text-[11px] leading-relaxed text-teal-400">
              <span className="text-slate-500">{"{"}</span>
              <br />
              <span className="text-slate-400 ml-2">"denomination":</span>{" "}
              <span className="text-amber-400">"50000 VND"</span>
              {","}
              <br />
              <span className="text-slate-400 ml-2">"status":</span>{" "}
              <span className="text-teal-400">"Completed"</span>
              <br />
              <span className="text-slate-500">{"}"}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const { lang, theme } = useAppStore();
  const { isAuthenticated, user } = useAuthStore();
  const isDark = theme === "dark";

  const t = CONTENT[lang] || CONTENT["EN"];

  const tokenBalance =
    isAuthenticated && user?.token_balance != null ? user.token_balance : null;

  // ── Shared class helpers ────────────────────────────────────────────────
  const cardBase =
    "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800";
  const sectionBg = isDark ? "bg-slate-950" : "bg-slate-50";
  const altSectionBg = isDark ? "bg-slate-900" : "bg-white";
  const headingCls = "text-slate-900 dark:text-white";
  const subCls = "text-slate-500 dark:text-slate-400";

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}
    >
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 1. HERO                                                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-20 md:py-28 lg:py-32">
        {/* ambient blobs */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-teal-400/10 dark:bg-teal-600/8 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/4 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-400/10 dark:bg-blue-600/8 rounded-full blur-[100px] translate-x-1/4 translate-y-1/4 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-5 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-14 xl:gap-20">
            {/* LEFT */}
            <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
              {/* badge */}
              <span
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${isDark ? "bg-slate-800 border-slate-700 text-teal-400" : "bg-white border-slate-200 text-teal-700 shadow-sm"}`}
              >
                <Layers3 className="w-3.5 h-3.5 text-teal-500" />
                {t.heroBadge}
              </span>

              {/* heading */}
              <h1
                className={`text-4xl md:text-5xl lg:text-[3.25rem] font-black tracking-tight leading-[1.1] max-w-xl lg:max-w-none ${headingCls}`}
              >
                {lang === "EN" && t.heroTitle.includes("Multi-Agent") ? (
                  <>
                    {t.heroTitle.split("Multi-Agent")[0]}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 via-teal-400 to-blue-500">
                      Multi-Agent
                    </span>
                    {t.heroTitle.split("Multi-Agent")[1]}
                  </>
                ) : (
                  t.heroTitle
                )}
              </h1>

              {/* subtitle */}
              <p
                className={`text-base md:text-lg leading-relaxed max-w-xl ${subCls}`}
              >
                {t.heroSubtitle}
              </p>

              {/* token balance — only when logged in */}
              {isAuthenticated && tokenBalance !== null && (
                <div
                  className={`inline-flex items-center gap-3 px-5 py-3 rounded-2xl border shadow-sm ${cardBase}`}
                >
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span className={`text-sm font-medium ${subCls}`}>
                    {t.heroTokenLabel}:
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    {tokenBalance} {t.heroTokenUnit}
                  </span>
                </div>
              )}

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto pt-1">
                <button
                  onClick={() =>
                    navigate(isAuthenticated ? SCAN_ROUTE : "/auth/login")
                  }
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-white px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-teal-500/20 transition-all group"
                >
                  {t.heroCta}
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <Link
                  to="/directory"
                  className={`flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-bold border transition-all ${isDark ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"}`}
                >
                  {t.heroCtaSub}
                </Link>
              </div>

              {/* trust pills */}
              <div
                className={`flex flex-wrap justify-center lg:justify-start gap-4 pt-2 border-t w-full max-w-sm lg:max-w-none ${isDark ? "border-slate-800" : "border-slate-200"}`}
              >
                {[t.heroPill1, t.heroPill2, t.heroPill3].map((p) => (
                  <span
                    key={p}
                    className={`text-xs font-semibold flex items-center gap-1.5 ${subCls}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" /> {p}
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT — mock workspace */}
            <div className="flex-1 w-full lg:max-w-[520px]">
              <HeroMockup t={t} />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 2. QUICK STATS                                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section
        className={`py-14 border-y ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
      >
        <div className="max-w-7xl mx-auto px-5">
          <p
            className={`text-center text-xs font-bold uppercase tracking-widest mb-8 ${subCls}`}
          >
            {t.statsTitle}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {t.stats.map((s, i) => (
              <div
                key={i}
                className={`${cardBase} rounded-2xl p-6 text-center shadow-sm`}
              >
                <p className="text-2xl font-black text-teal-600 dark:text-teal-400 mb-1">
                  {s.value}
                </p>
                <p className={`text-xs font-semibold ${subCls}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 3. HOW IT WORKS                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 ${sectionBg}`}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2
              className={`text-3xl md:text-4xl font-black tracking-tight mb-3 ${headingCls}`}
            >
              {t.howTitle}
            </h2>
            <p className={`max-w-xl mx-auto text-base ${subCls}`}>{t.howSub}</p>
          </div>

          {/* horizontal flow */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 relative">
            {/* connector line desktop */}
            <div className="hidden lg:block absolute top-[2.6rem] left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-teal-300 dark:via-teal-700 to-transparent pointer-events-none" />

            {t.steps.map((step, i) => (
              <div
                key={i}
                className={`${cardBase} rounded-2xl p-6 shadow-sm relative`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl font-black text-teal-500/30 dark:text-teal-600/40 leading-none font-mono">
                    {step.num}
                  </span>
                  {i < t.steps.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-700 hidden lg:block absolute right-4 top-6" />
                  )}
                </div>
                <h3 className={`text-sm font-bold mb-2 ${headingCls}`}>
                  {step.title}
                </h3>
                <p className={`text-xs leading-relaxed ${subCls}`}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 4. AGENT SYSTEM                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 ${altSectionBg}`}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2
              className={`text-3xl md:text-4xl font-black tracking-tight mb-3 ${headingCls}`}
            >
              {t.agentsTitle}
            </h2>
            <p className={`max-w-xl mx-auto text-base ${subCls}`}>
              {t.agentsSub}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {t.agents.map((agent, i) => {
              const A = ACCENT[agent.accent];
              const icons = [Cpu, BotMessageSquare, SearchCheck, GitMerge];
              const Icon = icons[i];
              return (
                <div
                  key={i}
                  className={`${cardBase} rounded-2xl p-6 shadow-sm hover:-translate-y-0.5 transition-transform`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${A.bg} border ${A.border}`}
                    >
                      <Icon className={`w-5 h-5 ${A.text}`} />
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${A.badge}`}
                    >
                      {agent.label}
                    </span>
                  </div>
                  <h3 className={`text-sm font-bold mb-1.5 ${headingCls}`}>
                    {agent.name}
                  </h3>
                  <p className={`text-xs leading-relaxed ${subCls}`}>
                    {agent.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 5. RESULT PREVIEW                                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 ${sectionBg}`}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2
              className={`text-3xl md:text-4xl font-black tracking-tight mb-3 ${headingCls}`}
            >
              {t.resultTitle}
            </h2>
            <p className={`max-w-xl mx-auto text-base ${subCls}`}>
              {t.resultSub}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Result card */}
            <div className={`${cardBase} rounded-3xl p-8 shadow-sm`}>
              <div className="flex items-center justify-between mb-6 pb-5 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p
                    className={`text-xs font-bold uppercase tracking-widest mb-1 ${subCls}`}
                  >
                    {t.resultDenom}
                  </p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white">
                    50,000 <span className="text-xl text-teal-500">VND</span>
                  </p>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-100 dark:border-teal-800">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {t.resultCompleted}
                </span>
              </div>

              <div className="space-y-3">
                {[
                  { label: t.resultCountry, value: "Vietnam" },
                  { label: t.resultMaterial, value: "Polymer" },
                  { label: t.resultConsensus, value: "2 / 3 agents" },
                  { label: t.resultStatus, value: t.resultCompleted },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between"
                  >
                    <span className={`text-xs font-medium ${subCls}`}>
                      {row.label}
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <p
                className={`text-[10px] mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 ${subCls} flex items-center gap-1.5`}
              >
                <AlertCircle className="w-3 h-3" /> {t.resultNote}
              </p>
            </div>

            {/* JSON card */}
            <div className="bg-slate-950 rounded-3xl p-6 border border-slate-800 shadow-xl overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <FileJson className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  JSON Output
                </span>
              </div>
              <pre className="font-mono text-[11px] leading-[1.7] text-teal-400 overflow-x-auto">
                {`{
  "denomination": "50000 VND",
  "country": "Vietnam",
  "currency": "VND",
  "material": "Polymer",
  "description": "Ho Chi Minh portrait,
    polymer series",
  "consensus": {
    "method": "majority_vote",
    "matched_agents": 2,
    "status": "Completed"
  }
}`}
              </pre>
              <p
                className={`text-[10px] mt-4 pt-3 border-t border-slate-800 text-slate-500 flex items-center gap-1.5`}
              >
                <AlertCircle className="w-3 h-3" /> {t.resultNote}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 6. FEATURES                                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section
        className={`py-24 border-y ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"}`}
      >
        <div className="max-w-7xl mx-auto px-5">
          <div className="text-center mb-14">
            <h2
              className={`text-3xl md:text-4xl font-black tracking-tight mb-3 ${headingCls}`}
            >
              {t.featTitle}
            </h2>
            <p className={`max-w-xl mx-auto text-base ${subCls}`}>
              {t.featSub}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {t.features.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <div
                  key={i}
                  className={`${cardBase} rounded-2xl p-6 shadow-sm flex flex-col gap-4 hover:-translate-y-0.5 transition-transform`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <h3 className={`text-sm font-bold ${headingCls}`}>
                      {feat.label}
                    </h3>
                  </div>
                  <p className={`text-xs leading-relaxed flex-1 ${subCls}`}>
                    {feat.desc}
                  </p>
                  <Link
                    to={feat.link}
                    className="flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-500 transition-colors"
                  >
                    {feat.linkLabel}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 7. SOUTHEAST ASIA FOCUS                                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className={`py-24 ${sectionBg}`}>
        <div className="max-w-4xl mx-auto px-5 text-center">
          <h2
            className={`text-3xl md:text-4xl font-black tracking-tight mb-3 ${headingCls}`}
          >
            {t.seaTitle}
          </h2>
          <p className={`max-w-xl mx-auto text-base mb-10 ${subCls}`}>
            {t.seaSub}
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {t.currencies.map((c) => (
              <span
                key={c}
                className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${isDark ? "bg-slate-800 border-slate-700 text-slate-200 hover:border-teal-700 hover:text-teal-400" : "bg-white border-slate-200 text-slate-700 shadow-sm hover:border-teal-300 hover:text-teal-700"}`}
              >
                {c}
              </span>
            ))}
          </div>
          <p className={`text-xs mt-6 ${subCls}`}>
            {lang === "VI"
              ? "Phạm vi hỗ trợ tiếp tục được mở rộng."
              : "Coverage continues to expand."}
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* 8. FINAL CTA                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-24 overflow-hidden bg-slate-950">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-teal-600/15 blur-[100px] rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] bg-blue-600/10 blur-[80px] rounded-full" />
        </div>

        <div className="relative max-w-3xl mx-auto px-5 text-center space-y-6 z-10">
          <h2 className="text-3xl md:text-4xl font-black tracking-tight text-white">
            {t.ctaTitle}
          </h2>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            {t.ctaSub}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <button
              onClick={() =>
                navigate(isAuthenticated ? SCAN_ROUTE : "/auth/login")
              }
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-white px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-teal-500/25 transition-all group"
            >
              {t.ctaMain}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <Link
              to="/pricing"
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-8 py-3.5 rounded-xl text-sm font-bold transition-all"
            >
              {t.ctaSecond}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
