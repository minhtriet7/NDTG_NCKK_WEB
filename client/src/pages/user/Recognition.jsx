import React, { useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { startRecognitionTask } from "../../services/recognitionService";
import toast from "react-hot-toast";

import { useAuthStore } from "../../store/authStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import { useAppStore } from "../../store/appStore"; // <-- LẤY CẢ LANG VÀ THEME TỪ ĐÂY

import {
  Upload,
  X,
  ChevronRight,
  Loader2,
  Coins,
  Image as ImageIcon,
  Cpu,
  BotMessageSquare,
  SearchCheck,
  GitMerge,
  FileJson,
  FileImage,
  Lightbulb,
  AlertCircle,
  ShieldCheck,
  Wallet,
} from "lucide-react";

export default function Recognition() {
  const { user, token } = useAuthStore();

  // 🌟 FIX LỖI: Lấy cả lang và theme từ chung 1 store
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const { currentScanSession, setScanSession, clearScanSession } =
    useRecognitionStore();

  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileMeta, setSelectedFileMeta] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(
    currentScanSession?.previewUrl || null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const hasEnoughTokens = Number(user?.token_balance || 0) > 0;
  const hasExistingSession = Boolean(
    currentScanSession?.result && !selectedFile,
  );

  const t = {
    EN: {
      title: "Banknote Recognition Workspace",
      subtitle:
        "Upload a Southeast Asian banknote image and compare results from multiple analysis agents.",
      tokenBal: "Token Balance",
      cost: "Cost: 1 Token per scan",
      uploadTitle: "Upload banknote image",
      uploadDesc: "Click or drag a clear banknote image here",
      uploadHint: "Supports JPG, PNG, WEBP up to 5MB",
      flowTitle: "Multi-Agent Flow",
      stepInput: "Input Image",
      stepInputDesc: "Preprocessing and cropping",
      parallelLabel: "Parallel Analysis",
      agent1Title: "ML/DL Analysis",
      agent1Desc: "Detects visual features and predicted denomination.",
      agent2Title: "LLM/API Analysis",
      agent2Desc: "Reads visible text and checks contextual information.",
      agent3Title: "Visual Search",
      agent3Desc: "Compares visual evidence with external references.",
      stepAgg: "Aggregator",
      stepAggDesc: "Majority voting and consensus",
      stepJson: "Structured Result",
      stepJsonDesc: "Final JSON output",
      btnAnalyze: "Start analysis",
      btnAnalyzing: "Analyzing...",
      btnViewOld: "View previous result",
      btnBuyToken: "Buy tokens",
      errNoToken: "Not enough tokens",
      errNoTokenDesc: "You need at least 1 token to run a banknote scan.",
      errorSize: "File exceeds the 5MB limit.",
      errorSelect: "Please select an image first.",
      errorAPI: "Analysis failed. Please try again later.",
      tipsTitle: "Image Tips",
      tip1: "Use a clear, well-lit image",
      tip2: "Avoid glare or heavy blur",
      tip3: "Keep the full banknote inside the frame",
      tip4: "For unclear notes, review the final result manually",
      workflowTitle: "Cross-checking workflow",
      workflowDesc:
        "The system compares multiple outputs before generating a final result.",
      supportedRegion: "Southeast Asia",
      outputType: "Agent results + JSON",
      fileSelected: "Selected file",
      clear: "Clear",
      replace: "Replace image",
    },
    VI: {
      title: "Không gian Nhận diện Tiền",
      subtitle:
        "Tải ảnh tờ tiền Đông Nam Á lên để hệ thống so sánh kết quả từ nhiều tác nhân phân tích.",
      tokenBal: "Số dư Token",
      cost: "Chi phí: 1 Token / lần quét",
      uploadTitle: "Tải ảnh tờ tiền",
      uploadDesc: "Nhấp hoặc kéo thả ảnh tờ tiền rõ nét vào đây",
      uploadHint: "Hỗ trợ JPG, PNG, WEBP tối đa 5MB",
      flowTitle: "Luồng phân tích đa tác nhân",
      stepInput: "Ảnh đầu vào",
      stepInputDesc: "Tiền xử lý và cắt ảnh",
      parallelLabel: "Phân tích song song",
      agent1Title: "Phân tích ML/DL",
      agent1Desc: "Trích xuất đặc trưng ảnh và dự đoán mệnh giá.",
      agent2Title: "Phân tích LLM/API",
      agent2Desc: "Đọc chữ hiển thị và kiểm tra thông tin ngữ cảnh.",
      agent3Title: "Tìm kiếm thị giác",
      agent3Desc: "Đối chiếu hình ảnh với nguồn tham chiếu bên ngoài.",
      stepAgg: "Bộ tổng hợp",
      stepAggDesc: "Biểu quyết đa số và chốt kết quả",
      stepJson: "Dữ liệu JSON",
      stepJsonDesc: "Xuất dữ liệu cấu trúc",
      btnAnalyze: "Bắt đầu phân tích",
      btnAnalyzing: "Đang xử lý...",
      btnViewOld: "Xem lại kết quả cũ",
      btnBuyToken: "Mua Token",
      errNoToken: "Không đủ Token",
      errNoTokenDesc: "Bạn cần ít nhất 1 token để chạy quét tiền giấy.",
      errorSize: "Dung lượng tệp vượt quá giới hạn 5MB.",
      errorSelect: "Vui lòng chọn hình ảnh trước.",
      errorAPI: "Phân tích thất bại. Vui lòng thử lại sau.",
      tipsTitle: "Mẹo chụp ảnh",
      tip1: "Sử dụng ảnh rõ nét, đủ sáng",
      tip2: "Tránh chói sáng hoặc bị mờ",
      tip3: "Giữ trọn vẹn tờ tiền trong khung hình",
      tip4: "Với ảnh khó nhận diện, hãy kiểm tra lại kết quả cuối",
      workflowTitle: "Quy trình đối chiếu chéo",
      workflowDesc:
        "Hệ thống so sánh nhiều kết quả trước khi đưa ra kết luận cuối cùng.",
      supportedRegion: "Đông Nam Á",
      outputType: "Kết quả tác nhân + JSON",
      fileSelected: "Tệp đã chọn",
      clear: "Xóa",
      replace: "Đổi ảnh",
    },
  }[lang || "EN"];

  const formatFileSize = (size) => {
    if (!size) return "0 KB";
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  const processFile = (file) => {
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPG, PNG, and WEBP images are supported.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t.errorSize);
      return;
    }

    const newPreview = URL.createObjectURL(file);
    setSelectedFile(file);
    setSelectedFileMeta({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    setPreviewUrl(newPreview);
    clearScanSession();
  };

  const handleFileSelect = (file) => {
  if (!file) return;

  if (previewUrl && previewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }

  const nextPreviewUrl = URL.createObjectURL(file);

  setSelectedFile(file);
  setPreviewUrl(nextPreviewUrl);
};

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setSelectedFileMeta(null);
    setPreviewUrl(null);
    clearScanSession();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

const handleAnalyze = async () => {
  if (!selectedFile) {
    toast.error(t.errorSelect);
    return;
  }

  if (!hasEnoughTokens) {
    toast.error(t.errNoToken);
    return;
  }

  if (selectedFile.size > 5 * 1024 * 1024) {
    toast.error(t.errorSize);
    return;
  }

  setIsAnalyzing(true);

  try {
    navigate("/processing", {
      state: {
        imageFile: selectedFile,
        previewUrl,
        fileMeta: selectedFileMeta,
      },
    });
  } finally {
    setIsAnalyzing(false);
  }
};

  const canAnalyze =
    !isAnalyzing && ((selectedFile && hasEnoughTokens) || hasExistingSession);

  return (
    <div
      className={`min-h-screen font-sans pb-20 p-4 md:p-8 transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-900"}`}
    >
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pt-2">
          <div className="max-w-2xl">
            <h1
              className={`text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}
            >
              {t.title}
            </h1>
            <p
              className={`mt-2 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              {t.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 gap-3">
            <div
              className={`flex items-center gap-3 px-5 py-3 border rounded-2xl shadow-sm transition-colors ${
                !hasEnoughTokens
                  ? isDark
                    ? "border-amber-500/50 bg-amber-900/20"
                    : "border-amber-200 bg-amber-50/60"
                  : isDark
                    ? "border-slate-800 bg-slate-900/50"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div
                className={`p-2 rounded-xl ${isDark ? "bg-teal-900/40" : "bg-teal-100/70"}`}
              >
                <Coins className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {t.tokenBal}
                </p>
                <p
                  className={`text-xl font-black leading-none ${
                    !hasEnoughTokens
                      ? isDark
                        ? "text-amber-500"
                        : "text-amber-600"
                      : isDark
                        ? "text-white"
                        : "text-slate-900"
                  }`}
                >
                  {user?.token_balance || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {!hasEnoughTokens && !hasExistingSession && (
          <div
            className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isDark ? "bg-amber-900/20 border-amber-500/30" : "bg-amber-50 border-amber-200"}`}
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className={`w-5 h-5 mt-0.5 ${isDark ? "text-amber-500" : "text-amber-600"}`}
              />
              <div>
                <p
                  className={`font-bold ${isDark ? "text-amber-400" : "text-amber-900"}`}
                >
                  {t.errNoToken}
                </p>
                <p
                  className={`text-sm ${isDark ? "text-amber-200/70" : "text-amber-700"}`}
                >
                  {t.errNoTokenDesc}
                </p>
              </div>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 transition"
            >
              <Wallet className="w-4 h-4" />
              {t.btnBuyToken}
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8">
          <div className="xl:col-span-7 space-y-6">
            <div
              className={`p-2 rounded-[2rem] shadow-sm border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
            >
              <div className="p-6 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                  <h2
                    className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                  >
                    {t.uploadTitle}
                  </h2>
                  <span
                    className={`w-fit text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-500"}`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    JPG, PNG, WEBP
                  </span>
                </div>

                {!previewUrl ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-[1.5rem] p-8 md:p-12 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[400px] ${
                      isDragging
                        ? isDark
                          ? "border-teal-500 bg-teal-900/20 scale-[1.01]"
                          : "border-teal-500 bg-teal-50 scale-[1.01]"
                        : isDark
                          ? "border-slate-700 bg-slate-800/50 hover:border-teal-500 hover:bg-slate-800"
                          : "border-slate-200 bg-slate-50 hover:border-teal-300 hover:bg-slate-50/60"
                    }`}
                  >
                    <div
                      className={`w-16 h-16 rounded-2xl shadow-sm flex items-center justify-center mb-5 border ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-100"}`}
                    >
                      <Upload
                        className={`w-7 h-7 ${
                          isDragging ? "text-teal-500" : "text-slate-400"
                        }`}
                      />
                    </div>
                    <p
                      className={`text-lg font-bold mb-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}
                    >
                      {t.uploadDesc}
                    </p>
                    <p className="text-sm text-slate-400 font-medium">
                      {t.uploadHint}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div
                      className={`relative rounded-[1.5rem] overflow-hidden border min-h-[400px] flex justify-center items-center shadow-inner ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-100"}`}
                    >
                      <img
                        src={previewUrl}
                        alt="Banknote preview"
                        className={`object-contain max-h-[500px] w-full transition-opacity duration-500 ${
                          isAnalyzing
                            ? "opacity-30 grayscale-[50%]"
                            : "opacity-100"
                        }`}
                      />

                      {isAnalyzing && (
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          <div className="absolute inset-0 bg-teal-900/5 mix-blend-overlay" />
                          <div className="absolute w-full h-1 bg-teal-500 shadow-[0_0_20px_rgba(20,184,166,1)] animate-[scan_2s_ease-in-out_infinite]" />
                        </div>
                      )}

                      {!isAnalyzing && (
                        <button
                          onClick={handleClear}
                          className={`absolute top-4 right-4 p-2 rounded-xl shadow-sm border transition-all active:scale-95 ${isDark ? "bg-slate-900/80 backdrop-blur text-slate-300 hover:text-rose-400 border-slate-700" : "bg-white/90 backdrop-blur text-slate-600 hover:text-rose-600 border-slate-100"}`}
                          title={t.clear}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>

                    {selectedFileMeta && (
                      <div
                        className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-100"}`}
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {t.fileSelected}
                          </p>
                          <p
                            className={`text-sm font-bold mt-1 ${isDark ? "text-white" : "text-slate-800"}`}
                          >
                            {selectedFileMeta.name}
                          </p>
                          <p
                            className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-500"}`}
                          >
                            {formatFileSize(selectedFileMeta.size)}
                          </p>
                        </div>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isAnalyzing}
                          className={`px-4 py-2 border rounded-xl text-sm font-bold disabled:opacity-50 ${isDark ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                        >
                          {t.replace}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                <div
                  className={`mt-8 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4 ${isDark ? "border-slate-800" : "border-slate-100"}`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    {t.cost}
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {!hasEnoughTokens && !hasExistingSession && (
                      <Link
                        to="/pricing"
                        className="text-sm font-bold text-amber-600 hover:text-amber-700 underline px-2 whitespace-nowrap"
                      >
                        {t.btnBuyToken}
                      </Link>
                    )}

                    <button
                      onClick={handleAnalyze}
                      disabled={!canAnalyze}
                      className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${
                        !canAnalyze
                          ? isDark
                            ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                            : "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : isDark
                            ? "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-900/20 active:scale-[0.98]"
                            : "bg-slate-900 hover:bg-slate-800 text-white active:scale-[0.98]"
                      }`}
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {t.btnAnalyzing}
                        </>
                      ) : hasExistingSession ? (
                        <>
                          {t.btnViewOld}
                          <ChevronRight className="w-5 h-5" />
                        </>
                      ) : !hasEnoughTokens ? (
                        <>{t.errNoToken}</>
                      ) : (
                        <>
                          {t.btnAnalyze}
                          <ChevronRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-5 space-y-6">
            <div
              className={`p-6 rounded-[2rem] shadow-sm border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
            >
              <h3
                className={`text-lg font-black mb-6 ${isDark ? "text-white" : "text-slate-900"}`}
              >
                {t.flowTitle}
              </h3>

              <div className="flex flex-col items-center">
                <div
                  className={`w-full max-w-[230px] p-3 rounded-xl border flex items-center gap-3 transition-colors z-10 ${
                    isAnalyzing
                      ? isDark
                        ? "border-teal-500/50 bg-slate-800 shadow-[0_0_15px_rgba(20,184,166,0.15)]"
                        : "border-teal-500 bg-white shadow-[0_0_10px_rgba(20,184,166,0.2)]"
                      : isDark
                        ? "border-slate-700 bg-slate-800/50 shadow-sm"
                        : "border-slate-200 bg-white shadow-sm"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      isAnalyzing
                        ? isDark
                          ? "bg-teal-900/40 text-teal-400"
                          : "bg-teal-50 text-teal-600"
                        : isDark
                          ? "bg-slate-900 text-slate-400"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <FileImage size={16} />
                  </div>
                  <div>
                    <p
                      className={`text-xs font-bold leading-tight ${isDark ? "text-slate-200" : "text-slate-900"}`}
                    >
                      {t.stepInput}
                    </p>
                    <p
                      className={`text-[10px] mt-0.5 ${isDark ? "text-slate-500" : "text-slate-500"}`}
                    >
                      {t.stepInputDesc}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-px h-6 ${
                    isAnalyzing
                      ? "bg-teal-500/50"
                      : isDark
                        ? "bg-slate-700"
                        : "bg-slate-200"
                  }`}
                />

                <div
                  className={`w-full border-2 border-dashed rounded-2xl p-4 relative transition-colors ${
                    isAnalyzing
                      ? isDark
                        ? "border-teal-500/30 bg-teal-900/10"
                        : "border-teal-300 bg-teal-50/30"
                      : isDark
                        ? "border-slate-700 bg-slate-900/50"
                        : "border-slate-200 bg-slate-50/50"
                  }`}
                >
                  <span
                    className={`absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 text-[10px] font-bold uppercase tracking-wider rounded-full border whitespace-nowrap ${
                      isAnalyzing
                        ? isDark
                          ? "bg-slate-900 text-teal-400 border-teal-500/50"
                          : "bg-white text-teal-600 border-teal-200"
                        : isDark
                          ? "bg-slate-900 text-slate-400 border-slate-700"
                          : "bg-white text-slate-400 border-slate-200"
                    }`}
                  >
                    {t.parallelLabel}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                    <AgentFlowNode
                      isDark={isDark}
                      active={isAnalyzing}
                      color="blue"
                      icon={<Cpu size={18} />}
                      title={t.agent1Title}
                      desc={t.agent1Desc}
                    />
                    <AgentFlowNode
                      isDark={isDark}
                      active={isAnalyzing}
                      color="violet"
                      icon={<BotMessageSquare size={18} />}
                      title={t.agent2Title}
                      desc={t.agent2Desc}
                    />
                    <AgentFlowNode
                      isDark={isDark}
                      active={isAnalyzing}
                      color="amber"
                      icon={<SearchCheck size={18} />}
                      title={t.agent3Title}
                      desc={t.agent3Desc}
                    />
                  </div>
                </div>

                <div
                  className={`w-px h-6 ${
                    isAnalyzing
                      ? "bg-teal-500/50"
                      : isDark
                        ? "bg-slate-700"
                        : "bg-slate-200"
                  }`}
                />

                <div
                  className={`w-full max-w-[240px] p-3 rounded-xl border flex items-center gap-3 transition-colors z-10 ${
                    isAnalyzing
                      ? isDark
                        ? "border-teal-500/50 bg-slate-800 shadow-sm"
                        : "border-teal-500 bg-white shadow-sm"
                      : isDark
                        ? "border-slate-700 bg-slate-800/50 shadow-sm"
                        : "border-slate-200 bg-white shadow-sm"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg ${
                      isAnalyzing
                        ? isDark
                          ? "bg-teal-900/40 text-teal-400"
                          : "bg-teal-50 text-teal-600"
                        : isDark
                          ? "bg-slate-900 text-slate-400"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <GitMerge size={16} />
                  </div>
                  <div>
                    <p
                      className={`text-xs font-bold leading-tight ${isDark ? "text-slate-200" : "text-slate-900"}`}
                    >
                      {t.stepAgg}
                    </p>
                    <p
                      className={`text-[10px] mt-0.5 ${isDark ? "text-slate-500" : "text-slate-500"}`}
                    >
                      {t.stepAggDesc}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-px h-6 ${
                    isAnalyzing
                      ? "bg-teal-500/50"
                      : isDark
                        ? "bg-slate-700"
                        : "bg-slate-200"
                  }`}
                />

                <div
                  className={`w-full max-w-[230px] p-3 rounded-xl border shadow-sm flex items-center gap-3 ${isDark ? "bg-slate-950 border-slate-700" : "bg-slate-900 border-slate-800"}`}
                >
                  <div
                    className={`p-2 rounded-lg ${isDark ? "bg-slate-800 text-teal-400" : "bg-slate-800 text-teal-400"}`}
                  >
                    <FileJson size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">
                      {t.stepJson}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {t.stepJsonDesc}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`p-6 rounded-[1.5rem] border text-sm ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-100 border-slate-200"}`}
            >
              <div
                className={`flex items-center gap-2 font-bold mb-2 ${isDark ? "text-slate-300" : "text-slate-800"}`}
              >
                <AlertCircle
                  size={16}
                  className={isDark ? "text-slate-500" : "text-slate-500"}
                />
                {t.workflowTitle}
              </div>
              <p
                className={`leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                {t.workflowDesc}
              </p>

              <div className="grid grid-cols-2 gap-3 mt-5">
                <MiniInfo
                  isDark={isDark}
                  label="Region"
                  value={t.supportedRegion}
                />
                <MiniInfo isDark={isDark} label="Output" value={t.outputType} />
              </div>
            </div>

            <div
              className={`p-6 rounded-[1.5rem] shadow-sm border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
            >
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h4
                  className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}
                >
                  {t.tipsTitle}
                </h4>
              </div>
              <ul
                className={`space-y-3 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}
              >
                {[t.tip1, t.tip2, t.tip3, t.tip4].map((tip, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes scan {
              0% { top: 0%; opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { top: 100%; opacity: 0; }
            }
          `,
        }}
      />
    </div>
  );
}

// ==========================================
// THÊM SUB-COMPONENTS BỊ THIẾU
// ==========================================

function AgentFlowNode({ isDark, active, color, icon, title, desc }) {
  // Tạo base style cho tuỳ chỉnh màu sắc động thay vì fixed color class
  // Để tránh lỗi thiếu class trong Tailwind compilation
  const baseBg = isDark ? "bg-slate-800" : "bg-slate-50";
  const baseBorder = isDark ? "border-slate-700" : "border-slate-200";
  const activeBorder = "border-teal-400/50";
  const activeBg = isDark ? "bg-teal-900/10" : "bg-teal-50";

  return (
    <div
      className={`p-3 rounded-xl border flex flex-col items-center text-center transition-colors ${
        active ? `${activeBorder} ${activeBg}` : `${baseBorder} ${baseBg}`
      }`}
    >
      <div
        className={`mb-2 p-1.5 rounded-lg ${
          active
            ? isDark
              ? "bg-teal-900/30 text-teal-400"
              : "bg-teal-100 text-teal-600"
            : isDark
              ? "bg-slate-700 text-slate-400"
              : "bg-slate-200 text-slate-500"
        }`}
      >
        {icon}
      </div>
      <p
        className={`text-xs font-bold mb-1 ${isDark ? "text-slate-300" : "text-slate-800"}`}
      >
        {title}
      </p>
      <p
        className={`text-[9px] leading-relaxed ${isDark ? "text-slate-500" : "text-slate-500"}`}
      >
        {desc}
      </p>
    </div>
  );
}

function MiniInfo({ isDark, label, value }) {
  return (
    <div
      className={`p-3 rounded-xl border ${
        isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
      }`}
    >
      <p className="text-xs text-slate-500 font-medium mb-0.5">{label}</p>
      <p
        className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}
      >
        {value}
      </p>
    </div>
  );
}
