import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Upload, X, Loader2, Coins, AlertCircle, PlaySquare, ImageIcon, ShieldCheck, ChevronRight, FileImage } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import { useRecognitionStore } from "../../store/recognitionStore";

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
      uploadTitle: "Upload banknote image",
      uploadDesc: "Click or drag a clear banknote image here",
      uploadHint: "Supports JPG, PNG, WEBP up to 5MB",
      errorType: "Only JPG, PNG, and WEBP images are supported.",
      errorSize: "File exceeds the 5MB limit.",
      errorSelect: "Please select an image first.",
      btnAnalyze: "Start analysis",
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
      uploadTitle: "Tải ảnh tờ tiền",
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
    <div className="bg-surface rounded-3xl border border-border shadow-sm p-6 md:p-8 flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          {t.uploadTitle}
        </h2>
        <span className="w-fit text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-secondary flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" /> JPG, PNG, WEBP
        </span>
      </div>

      <div className="flex-grow flex flex-col justify-center">
        {!currentPreviewUrl ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-[1.5rem] p-8 md:p-12 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[400px] ${
              isDragging
                ? "border-primary bg-primary/10 scale-[1.02]"
                : "border-border bg-background hover:border-primary hover:bg-background/80"
            }`}
          >
            <div className="w-16 h-16 rounded-2xl shadow-sm flex items-center justify-center mb-5 bg-surface border border-border">
              <Upload className={`w-7 h-7 ${isDragging ? "text-primary" : "text-secondary"}`} />
            </div>
            <p className="text-lg font-bold mb-1 text-foreground">{t.uploadDesc}</p>
            <p className="text-sm text-secondary font-medium">{t.uploadHint}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-[1.5rem] overflow-hidden border border-border bg-background min-h-[400px] flex justify-center items-center shadow-inner">
              <img
                src={currentPreviewUrl}
                alt="Banknote preview"
                className={`object-contain max-h-[500px] w-full transition-opacity duration-500 ${isScanning ? "opacity-30 grayscale" : "opacity-100"}`}
              />

              {isScanning && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-primary/5 mix-blend-overlay" />
                  <div className="absolute w-full h-1 bg-primary shadow-[0_0_20px_rgba(49,87,246,1)] animate-[scan_2s_ease-in-out_infinite]" />
                </div>
              )}

              {!isScanning && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleClear(); }}
                  className="absolute top-4 right-4 p-2 rounded-xl bg-surface/90 backdrop-blur text-secondary hover:text-rose-500 border border-border transition-all active:scale-95"
                  title={t.clear}
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-background">
              <div>
                <p className="text-xs font-bold text-secondary uppercase tracking-wider">{t.fileSelected}</p>
                <p className="text-sm font-bold mt-1 text-foreground">{currentImageFile?.name}</p>
                <p className="text-xs mt-0.5 text-secondary">{formatFileSize(currentImageFile?.size)}</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="px-4 py-2 border border-border rounded-xl text-sm font-bold bg-surface hover:bg-background text-foreground transition-colors disabled:opacity-50"
              >
                {t.replace}
              </button>
            </div>
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
      <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm font-semibold text-secondary">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span>{t.cost}</span>
          </div>
          <span className="hidden sm:inline text-border">•</span>
          <span>{t.chargedAfterSuccess}</span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {!hasEnoughTokens && (
            <button onClick={() => navigate("/pricing")} className="text-sm font-bold text-amber-500 hover:text-amber-600 underline px-2 whitespace-nowrap">
              {t.btnBuyToken}
            </button>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${
              !canAnalyze
                ? "bg-surface text-secondary cursor-not-allowed border border-border"
                : "bg-primary hover:bg-primary-hover text-white active:scale-[0.98] shadow-primary/20"
            }`}
          >
            {isScanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t.btnAnalyzing}
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
  );
}
