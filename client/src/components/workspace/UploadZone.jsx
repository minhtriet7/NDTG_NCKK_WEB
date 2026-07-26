import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Upload,
  Camera,
  RefreshCcw,
  Check,
  AlertCircle,
  ImageIcon,
  Loader2,
  FileImage,
  X,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import {
  getRecognitionFileFingerprint,
  useRecognitionStore,
} from "../../store/recognitionStore";
import {
  startRecognitionTask,
  saveActiveRecognitionTask,
} from "../../services/recognitionService";

export default function UploadZone() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const { user } = useAuthStore();
  const { lang } = useAppStore();
  const {
    currentImageFile,
    currentPreviewUrl,
    currentFileFingerprint,
    scanNonce,
    isScanning,
    fileInputKey,
    setCurrentImage,
    clearCurrentImage,
    setIsScanning,
  } = useRecognitionStore();

  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");

  // Camera states
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedBlobUrl, setCapturedBlobUrl] = useState(null);
  const [capturedFile, setCapturedFile] = useState(null);
  const [isCameraStarting, setIsCameraStarting] = useState(false);

  // Image preflight state
  const [imageResolution, setImageResolution] = useState(null);
  const [fileError, setFileError] = useState(null);

  const hasEnoughTokens = Number(user?.token_balance || 0) > 0;

  const t = {
    EN: {
      frameTitle: "Place the full banknote inside the frame",
      errorEmpty: "The selected file is empty.",
      startCamera: "Start camera",
      stopCamera: "Stop camera",
      backToUpload: "Back to Upload",
      preflightSelected: "Image selected",
      yes: "Yes",
      no: "No",
      unavailable: "Not available",
      uploadDesc: "Click or drag a banknote image here",
      uploadHint: "Supports JPG, PNG, WEBP — max 5 MB",
      errorType: "Only JPG, PNG, and WEBP images are supported.",
      errorSize: "File exceeds the 5 MB limit.",
      errorSelect: "Please select an image first.",
      btnAnalyze: "Start Analysis",
      btnPreparing: "Submitting...",
      btnBuyToken: "Buy tokens",
      errNoToken: "Not enough tokens",
      costInfo: "Token is charged only when analysis reaches a chargeable completed result.",
      replace: "Replace",
      remove: "Remove",
      takePhoto: "Take Photo",
      uploadTab: "Upload",
      camDeny: "Camera permission denied. Please allow camera access.",
      camError: "Could not access camera.",
      capture: "Capture",
      retake: "Retake",
      usePhoto: "Use Photo",
      preflightTitle: "Image Readiness",
      preflightType: "File type",
      preflightSize: "File size",
      preflightRes: "Resolution",
      preflightStatus: "Status",
      preflightReady: "Ready to analyze",
      preflightToken: "Token available",
      warnSmall: "Image may be too small.",
      warnNoToken: "Purchase tokens to continue.",
    },
    VI: {
      frameTitle: "Đặt toàn bộ tờ tiền trong khung",
      errorEmpty: "Tệp đã chọn rỗng.",
      startCamera: "Mở camera",
      stopCamera: "Tắt camera",
      backToUpload: "Quay lại Tải lên",
      preflightSelected: "Đã chọn ảnh",
      yes: "Có",
      no: "Không",
      unavailable: "Chưa có",
      uploadDesc: "Nhấp hoặc kéo thả ảnh tờ tiền vào đây",
      uploadHint: "Hỗ trợ JPG, PNG, WEBP — tối đa 5 MB",
      errorType: "Chỉ hỗ trợ ảnh JPG, PNG và WEBP.",
      errorSize: "Dung lượng tệp vượt quá giới hạn 5 MB.",
      errorSelect: "Vui lòng chọn hình ảnh trước.",
      btnAnalyze: "Bắt đầu phân tích",
      btnPreparing: "Đang gửi...",
      btnBuyToken: "Mua Token",
      errNoToken: "Không đủ Token",
      costInfo: "Token chỉ bị trừ khi phân tích có kết quả tính phí.",
      replace: "Đổi ảnh",
      remove: "Xóa",
      takePhoto: "Chụp Ảnh",
      uploadTab: "Tải lên",
      camDeny: "Không có quyền truy cập camera. Vui lòng cấp quyền.",
      camError: "Không thể mở camera.",
      capture: "Chụp",
      retake: "Chụp lại",
      usePhoto: "Dùng ảnh này",
      preflightTitle: "Kiểm tra ảnh",
      preflightType: "Định dạng",
      preflightSize: "Dung lượng",
      preflightRes: "Độ phân giải",
      preflightStatus: "Trạng thái",
      preflightReady: "Sẵn sàng phân tích",
      preflightToken: "Token khả dụng",
      warnSmall: "Ảnh có thể quá nhỏ.",
      warnNoToken: "Mua token để tiếp tục.",
    },
  }[lang || "EN"];

  const formatFileSize = (size) => {
    if (!size) return "0 KB";
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  const getFileTypeLabel = (type) => {
    if (!type) return "Unknown";
    const map = {
      "image/jpeg": "JPG",
      "image/png": "PNG",
      "image/webp": "WEBP",
    };
    return map[type] || type.split("/")[1]?.toUpperCase() || "Image";
  };

  // Read image resolution on file change
  useEffect(() => {
    if (!currentImageFile || !currentPreviewUrl) {
      setImageResolution(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setImageResolution({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => setImageResolution(null);
    img.src = currentPreviewUrl;
  }, [currentImageFile, currentPreviewUrl]);

  const processFile = (file) => {
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setFileError(t.errorType);
      toast.error(t.errorType);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!file.size || file.size <= 0) {
      setFileError(t.errorEmpty);
      toast.error(t.errorEmpty);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError(t.errorSize);
      toast.error(t.errorSize);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFileError(null);
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
    setIsScanning(false);
    setImageResolution(null);
    setFileError(null);
  };

  const handleAnalyze = async () => {
    const fileToSend = currentImageFile;
    const fileFingerprint = getRecognitionFileFingerprint(fileToSend);

    if (
      !fileToSend ||
      (!(fileToSend instanceof File) && !(fileToSend instanceof Blob))
    ) {
      toast.error(t.errorSelect);
      return;
    }
    if (!fileToSend.size || fileToSend.size <= 0) {
      toast.error(t.errorSelect);
      return;
    }
    if (!fileFingerprint || fileFingerprint !== currentFileFingerprint) {
      toast.error(t.errorSelect);
      return;
    }
    if (!hasEnoughTokens) {
      toast.error(t.errNoToken);
      return;
    }

    setIsScanning(true);

    try {
      if (import.meta.env.DEV) {
        console.debug("[Recognition] start analysis", {
          name: fileToSend.name || null,
          size: fileToSend.size,
          type: fileToSend.type,
          fileFingerprint,
          scanNonce,
        });
      }
      const response = await startRecognitionTask(fileToSend);

      const taskData =
        response?.task_id || response?.taskId ? response : response?.data;
      const taskId =
        taskData?.task_id ||
        taskData?.taskId ||
        response?.task_id ||
        response?.taskId;

      if (!taskId) {
        throw new Error("Backend did not return a task_id. Please try again.");
      }

      if (import.meta.env.DEV) {
        console.debug("[Recognition] task created", {
          taskId,
          fileFingerprint,
          scanNonce,
        });
      }

      saveActiveRecognitionTask(taskId, {
        filename: fileToSend.name || "banknote.jpg",
        size: fileToSend.size,
        type: fileToSend.type,
        fileFingerprint,
        scanNonce,
      });

      const setActiveTask = useRecognitionStore.getState().setActiveTask;
      setActiveTask(taskId, {
        filename: fileToSend.name || "banknote.jpg",
        size: fileToSend.size,
        type: fileToSend.type,
        fileFingerprint,
        scanNonce,
      });

      const previewDataUrl = fileToSend.previewDataUrl || null;
      const previewUrl = currentPreviewUrl || null;

      navigate(`/processing/${taskId}`, {
        state: {
          taskId,
          previewDataUrl,
          previewUrl,
          fileName: fileToSend.name || "banknote.jpg",
          fileFingerprint,
          scanNonce,
        },
      });
    } catch (err) {
      setIsScanning(false);
      const errMsg = (() => {
        const data = err?.response?.data;
        if (typeof data === "string") return data;
        if (Array.isArray(data?.detail)) {
          return data.detail
            .map((item) => {
              if (typeof item === "string") return item;
              const loc = Array.isArray(item?.loc) ? item.loc.join(".") : "";
              const msg = item?.msg || item?.message || "Validation error";
              return loc ? `${loc}: ${msg}` : msg;
            })
            .join("; ");
        }
        if (typeof data?.detail === "string") return data.detail;
        if (typeof data?.message === "string") return data.message;
        return err?.message || "Cannot start analysis. Please try again.";
      })();
      toast.error(errMsg);
    }
  };

  // Camera functions
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setIsCameraStarting(false);
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
      if (capturedBlobUrl) URL.revokeObjectURL(capturedBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedBlobUrl]);

  useEffect(() => {
    if (activeTab !== "camera") {
      stopCameraStream();
      setCameraError(null);
    } else {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const startCamera = async () => {
    setCameraError(null);
    setIsCameraStarting(true);
    if (capturedBlobUrl) {
      URL.revokeObjectURL(capturedBlobUrl);
      setCapturedBlobUrl(null);
    }
    setCapturedFile(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(t.camError);
      setIsCameraStarting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsCameraReady(true);
          setIsCameraStarting(false);
        };
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(
        err.name === "NotAllowedError" ? t.camDeny : t.camError
      );
      setIsCameraStarting(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !isCameraReady) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], "camera_capture.jpg", {
          type: "image/jpeg",
        });
        file.previewDataUrl = dataUrl;
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlobUrl(previewUrl);
        setCapturedFile(file);
        stopCameraStream();
      },
      "image/jpeg",
      0.9
    );
  };

  const useCapturedPhoto = () => {
    if (capturedFile && capturedBlobUrl) {
      if (currentPreviewUrl && currentPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
      setCurrentImage(capturedFile, capturedFile.previewDataUrl || capturedBlobUrl);
      setFileError(null);
      setActiveTab("upload");
    }
  };

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const hasValidFile = Boolean(
    currentImageFile &&
      currentImageFile.size > 0 &&
      currentImageFile.size <= 5 * 1024 * 1024 &&
      allowedTypes.includes(currentImageFile.type)
  );
  const canAnalyze = !isScanning && hasValidFile && hasEnoughTokens;

  // Preflight checks
  const isSmallImage =
    imageResolution &&
    (imageResolution.w < 200 || imageResolution.h < 200);

  const preflightChecks = [
    {
      label: t.preflightSelected,
      value: hasValidFile ? t.yes : t.no,
      ok: hasValidFile,
    },
    {
      label: t.preflightToken,
      value: hasEnoughTokens ? t.yes : t.no,
      ok: hasEnoughTokens,
    },
    {
      label: t.preflightRes,
      value: imageResolution
        ? `${imageResolution.w} × ${imageResolution.h}px`
        : t.unavailable,
      neutral: !imageResolution,
    },
    {
      label: t.preflightSize,
      value: currentImageFile
        ? formatFileSize(currentImageFile.size)
        : t.unavailable,
      neutral: !currentImageFile,
    },
    {
      label: t.preflightReady,
      value: canAnalyze ? t.yes : t.no,
      ok: canAnalyze,
    },
  ];

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Tab Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        {[
          { key: "upload", label: t.uploadTab, icon: Upload },
          { key: "camera", label: t.takePhoto, icon: Camera },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === key
                ? "border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="p-5 flex flex-col gap-4">
        {activeTab === "upload" ? (
          <>
            {!currentPreviewUrl ? (
              /* Drop Zone */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex min-h-[330px] cursor-pointer flex-col items-center justify-center rounded-lg border p-6 text-center transition-colors sm:p-8 ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : fileError
                      ? "border-rose-300 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-950/10"
                      : "border-dashed border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="mb-5 flex aspect-[2/1] w-full max-w-md items-center justify-center rounded-md border border-slate-300 bg-white/80 px-5 dark:border-slate-600 dark:bg-slate-900/70">
                  <div className="flex h-[72%] w-full items-center justify-center rounded border border-dashed border-slate-300 dark:border-slate-600">
                    <Upload
                      className={`h-5 w-5 ${
                        isDragging
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-400"
                      }`}
                    />
                  </div>
                </div>
                <p className="mb-1 text-base font-semibold text-slate-800 dark:text-slate-200">
                  {t.frameTitle}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t.uploadHint}
                </p>
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  {t.uploadDesc}
                </p>
                {fileError && (
                  <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-400">
                    {fileError}
                  </p>
                )}
              </div>
            ) : (
              /* Preview + File Info */
              <div className="space-y-3">
                {/* Image Preview */}
                <div className="relative flex aspect-[16/9] max-h-[380px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-3 dark:border-slate-700 dark:bg-slate-950">
                  <img
                    src={currentPreviewUrl}
                    alt="Banknote preview"
                    onError={(e) => {
                      e.target.style.display = "none";
                      if (e.target.nextElementSibling) {
                        e.target.nextElementSibling.style.display = "flex";
                      }
                    }}
                    className={`h-full w-full rounded object-contain transition-opacity duration-300 ${
                      isScanning ? "opacity-40" : "opacity-100"
                    }`}
                  />
                  <div className="hidden absolute inset-0 flex-col items-center justify-center text-slate-400">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                    <span className="text-sm">Preview unavailable</span>
                  </div>
                  {isScanning && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>

                {/* File Info Row */}
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50 sm:flex-row sm:items-center">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <FileImage className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {currentImageFile?.name || "banknote.jpg"}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {getFileTypeLabel(currentImageFile?.type)} &middot;{" "}
                      {formatFileSize(currentImageFile?.size)}
                      {imageResolution
                        ? ` \u00b7 ${imageResolution.w}\u00d7${imageResolution.h}px`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isScanning}
                      className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-semibold bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-colors"
                    >
                      {t.replace}
                    </button>
                    <button
                      onClick={handleClear}
                      disabled={isScanning}
                      className="w-8 h-8 flex items-center justify-center border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 transition-colors"
                      title={t.remove}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {fileError && (
                  <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                    {fileError}
                  </p>
                )}

              </div>
            )}
          </>
        ) : (
          /* Camera Tab */
          <div className="relative flex min-h-[360px] flex-col items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-700">
            {cameraError ? (
              <div className="text-center p-8 max-w-xs">
                <div className="mx-auto mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-900/30">
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-slate-300 text-sm mb-5 leading-relaxed">
                  {cameraError}
                </p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {t.backToUpload}
                </button>
              </div>
            ) : capturedBlobUrl ? (
              <>
                <img
                  src={capturedBlobUrl}
                  alt="Captured"
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                  className="w-full h-full object-contain max-h-[420px]"
                />
                <div className="absolute bottom-5 left-0 right-0 flex justify-center gap-3 px-4">
                  <button
                    onClick={startCamera}
                    className="px-4 py-2.5 bg-slate-900/80 backdrop-blur border border-white/20 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    {t.retake}
                  </button>
                  <button
                    onClick={useCapturedPhoto}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-500 transition-colors flex items-center gap-2 shadow-lg"
                  >
                    <Check className="w-4 h-4" />
                    {t.usePhoto}
                  </button>
                </div>
              </>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover absolute inset-0"
                />
                {!isCameraReady && isCameraStarting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
                    <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
                  </div>
                )}
                {!isCameraReady && !isCameraStarting && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                      <Camera className="h-4 w-4" />
                      {t.startCamera}
                    </button>
                  </div>
                )}
                {isCameraReady && (
                  <>
                    <div className="pointer-events-none absolute inset-6 z-10 rounded border border-white/50" />
                    <button
                      type="button"
                      onClick={stopCameraStream}
                      className="absolute right-4 top-4 z-20 rounded-lg border border-white/20 bg-slate-950/75 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-900"
                    >
                      {t.stopCamera}
                    </button>
                    <div className="absolute bottom-5 left-0 right-0 z-20 flex justify-center">
                      <button
                        onClick={capturePhoto}
                        className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/60 bg-black/30 transition-colors hover:border-white"
                        aria-label={t.capture}
                        title={t.capture}
                      >
                        <div className="h-11 w-11 rounded-full bg-white" />
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Image readiness stays visible in neutral, warning, and ready states. */}
        <section className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
              {t.preflightTitle}
            </h3>
            {isSmallImage && (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {t.warnSmall}
              </span>
            )}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {preflightChecks.map((check) => (
              <div
                key={check.label}
                className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-b-0 dark:border-slate-800"
              >
                <dt className="text-slate-500 dark:text-slate-400">
                  {check.label}
                </dt>
                <dd
                  className={`truncate font-semibold ${
                    check.neutral
                      ? "text-slate-400 dark:text-slate-500"
                      : check.ok
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {check.value}
                </dd>
              </div>
            ))}
          </dl>
          {!hasEnoughTokens && (
            <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400">
              {t.warnNoToken}
            </p>
          )}
        </section>
      </div>

      <input
        key={fileInputKey}
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
      />

      {/* Footer */}
      <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {t.costInfo}
        </p>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          {!hasEnoughTokens && (
            <button
              onClick={() => navigate("/pricing")}
              className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline transition-colors"
            >
              {t.btnBuyToken}
            </button>
          )}

          <span
            className={`text-xs font-semibold ${
              canAnalyze
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {t.preflightReady}: {canAnalyze ? t.yes : t.no}
          </span>

          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze}
            id="btn-start-analysis"
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold transition-colors sm:w-auto ${
              canAnalyze
                ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
            }`}
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t.btnPreparing}
              </>
            ) : !hasEnoughTokens ? (
              t.errNoToken
            ) : (
              t.btnAnalyze
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
