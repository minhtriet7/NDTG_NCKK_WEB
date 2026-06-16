import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Upload, X, Loader2, ImageIcon, ShieldCheck, ChevronRight } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import { useRecognitionStore } from "../../store/recognitionStore";
import GlassCard from "../ui/GlassCard";

export default function UploadZone() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const { user } = useAuthStore();
  const { lang } = useAppStore();
  const { 
    currentImageFile, 
    currentPreviewUrl, 
    isScanning,
    setCurrentImage, 
    clearCurrentImage,
    setIsScanning
  } = useRecognitionStore();

  const [isDragging, setIsDragging] = useState(false);

  const hasEnoughTokens = Number(user?.token_balance || 0) > 0;
  const estimatedTokenCost = 1;

  const t = {
    EN: {
      uploadTitle: "Upload Banknote Image",
      uploadDesc: "Click or drag a clear banknote image here",
      uploadHint: "Supports JPG, PNG, WEBP up to 5MB",
      errorType: "Only JPG, PNG, and WEBP images are supported.",
      errorSize: "File exceeds the 5MB limit.",
      errorSelect: "Please select an image first.",
      btnAnalyze: "Start Analysis",
      btnAnalyzing: "Analyzing...",
      btnBuyToken: "Buy tokens",
      errNoToken: "Not enough tokens",
      errNoTokenDesc: "You need at least 1 token to run a banknote scan.",
      cost: "Cost: 1 Token per scan",
      chargedAfterSuccess: "Tokens are charged only after analysis is completed successfully.",
      fileSelected: "Selected file",
      clear: "Clear",
      replace: "Replace image"
    },
    VI: {
      uploadTitle: "Tải Ảnh Tờ Tiền",
      uploadDesc: "Nhấp hoặc kéo thả ảnh tờ tiền rõ nét vào đây",
      uploadHint: "Hỗ trợ JPG, PNG, WEBP tối đa 5MB",
      errorType: "Chỉ hỗ trợ ảnh JPG, PNG và WEBP.",
      errorSize: "Dung lượng tệp vượt quá giới hạn 5MB.",
      errorSelect: "Vui lòng chọn hình ảnh trước.",
      btnAnalyze: "Bắt đầu phân tích",
      btnAnalyzing: "Đang xử lý...",
      btnBuyToken: "Mua Token",
      errNoToken: "Không đủ Token",
      errNoTokenDesc: "Bạn cần ít nhất 1 token để chạy quét tiền giấy.",
      cost: "Chi phí: 1 Token / lần quét",
      chargedAfterSuccess: "Token chỉ bị trừ sau khi phân tích hoàn tất thành công.",
      fileSelected: "Tệp đã chọn",
      clear: "Xóa",
      replace: "Đổi ảnh"
    }
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
      toast.error(t.errorType);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t.errorSize);
      return;
    }

    if (currentPreviewUrl && currentPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(currentPreviewUrl);
    }

    const newPreview = URL.createObjectURL(file);
    setCurrentImage(file, newPreview);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files && event.target.files[0];
    processFile(file);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      processFile(event.dataTransfer.files[0]);
      event.dataTransfer.clearData();
    }
  };

  const handleClear = () => {
    if (currentPreviewUrl && currentPreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(currentPreviewUrl);
    }
    clearCurrentImage();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!currentImageFile) {
      toast.error(t.errorSelect);
      return;
    }

    if (!hasEnoughTokens) {
      toast.error(t.errNoToken);
      return;
    }

    setIsScanning(true);
    // Move to processing page immediately where scanning happens
    navigate("/processing", {
      state: {
        imageFile: currentImageFile,
        previewUrl: currentPreviewUrl,
        fileMeta: { name: currentImageFile.name, size: currentImageFile.size, type: currentImageFile.type },
        estimatedTokenCost,
      },
    });
  };

  const canAnalyze = !isScanning && Boolean(currentImageFile) && hasEnoughTokens;

  return (
    <div className="card-base p-6 md:p-8 flex flex-col h-full shadow-xl dark:shadow-2xl !rounded-[2rem]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          {t.uploadTitle}
        </h2>
        <span className="w-fit text-[10px] font-mono font-bold uppercase tracking-widest px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          JPG, PNG, WEBP
        </span>
      </div>

      <div className="flex-grow flex flex-col justify-center">
        {!currentPreviewUrl ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative rounded-2xl p-8 md:p-12 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[400px] group ${
              isDragging
                ? "border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-500/5"
                : "border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            }`}
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(148,163,184,0.1) 1px, transparent 0)',
              backgroundSize: '24px 24px'
            }}
          >
            <div className="mb-6">
              <svg className={`w-8 h-8 transition-colors ${isDragging ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-lg font-bold mb-2 text-slate-800 dark:text-slate-200">{t.uploadDesc}</p>
            <p className="text-sm text-slate-500 font-mono">{t.uploadHint}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 min-h-[400px] flex justify-center items-center shadow-inner group">
              <img
                src={currentPreviewUrl}
                alt="Banknote preview"
                className={`object-contain max-h-[500px] w-full transition-opacity duration-500 ${isScanning ? "opacity-30 grayscale" : "opacity-100"}`}
              />

              {isScanning && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-indigo-500/5 mix-blend-overlay" />
                  <div className="absolute w-full h-1 bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,1)] animate-scan-line" />
                </div>
              )}

              {!isScanning && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleClear(); }}
                  className="absolute top-4 right-4 p-2.5 rounded-xl bg-slate-900/80 backdrop-blur-md text-slate-400 hover:text-rose-500 border border-white/10 transition-all duration-200 hover:scale-105 active:scale-95"
                  title={t.clear}
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <GlassCard hover={false} className="border border-white/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/20">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.fileSelected}</p>
                <p className="text-sm font-bold mt-1 text-foreground">{currentImageFile?.name}</p>
                <p className="text-xs mt-0.5 text-slate-400">{formatFileSize(currentImageFile?.size)}</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="px-4 py-2 border border-white/10 rounded-xl text-sm font-bold bg-white/5 hover:bg-white/10 text-foreground transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                {t.replace}
              </button>
            </GlassCard>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
      />

      {/* Footer Controls */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-[11px] font-mono text-slate-500 uppercase tracking-wide">
          <span>{t.cost}</span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
          <span>{t.chargedAfterSuccess}</span>
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
          {!hasEnoughTokens && (
            <button onClick={() => navigate("/pricing")} className="text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
              {t.btnBuyToken}
            </button>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 shadow-xl ${
              canAnalyze
                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
                : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none"
            }`}
          >
            {isScanning ? t.btnAnalyzing : !hasEnoughTokens ? t.errNoToken : t.btnAnalyze}
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
