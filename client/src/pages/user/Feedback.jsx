import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  Loader2,
  Ticket,
  History,
  ScanLine,
  AlertTriangle,
  Lightbulb,
  Clock,
  Star,
  ArrowLeft,
  FileJson,
  ClipboardCheck,
  Bug,
  CreditCard,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAppStore } from "../../store/appStore";
import {
  submitFeedback,
  getFeedbackHistory,
} from "../../services/feedbackService";

const content = {
  EN: {
    pageTitle: "Support & Feedback",
    pageSubtitle:
      "Report an incorrect recognition result, system issue, or suggest an improvement.",
    submitTicket: "Submit Ticket",
    myTickets: "My Tickets",
    relatedScan: "Related Scan Result",
    linkedToScan: "Linked to scan result",
    finalResult: "Final result",
    consensus: "Consensus",
    agentSummary: "Agent summary",
    viewJson: "View JSON",
    hideJson: "Hide JSON",
    backToResult: "Back to Result",
    formTitle: "Send feedback",
    formSubtitle:
      "Add enough detail so the team can review the issue accurately.",
    feedbackType: "Feedback type",
    priority: "Priority",
    rating: "Scan experience",
    subject: "Subject",
    message: "Message",
    expectedResult: "Expected result",
    actualResult: "Actual result",
    typeWrong: "Wrong recognition result",
    typeSystem: "System / app error",
    typeSuggestion: "Feature suggestion",
    typePayment: "Payment / token issue",
    typeOther: "Other",
    priorityLow: "Low",
    priorityMedium: "Medium",
    priorityHigh: "High",
    subjectPlaceholder: "Briefly describe the issue",
    messagePlaceholder:
      "Tell us what happened, what result you expected, or how we can improve...",
    expectedPlaceholder: "Example: 100,000 VND - Vietnam",
    actualPlaceholder: "Auto-filled from scan result if available",
    submit: "Submit Feedback",
    submitting: "Submitting...",
    submittedTitle: "Feedback submitted",
    submittedDesc: "Thank you. Your feedback has been saved for review.",
    guideTitle: "What to include",
    guide1: "The expected denomination and country.",
    guide2: "What looked wrong in the result.",
    guide3: "Whether the image was clear or cropped.",
    guide4: "Any visible text or landmark on the banknote.",
    supportTitle: "Support status",
    supportDesc:
      "Most feedback is reviewed within 1-3 business days. Payment issues may require transaction details.",
    recentTitle: "Recent feedback",
    noTicketsTitle: "No tickets found",
    noTicketsDesc: "You have not submitted any feedback yet.",
    loadingTickets: "Loading your tickets...",
    refresh: "Refresh",
    pending: "Pending",
    resolved: "Resolved",
    inReview: "In review",
    closed: "Closed",
    scanConflict:
      "This scan has conflicting agent outputs. Your feedback can help us review this case.",
    successToast: "Feedback submitted successfully.",
    errorLoad: "Unable to load feedback history.",
    errorShortSubject: "Please enter a subject with at least 5 characters.",
    errorShortMessage:
      "Please describe your issue with at least 10 characters.",
    errorExpected: "Please enter the expected result.",
    errorSubmit: "Unable to submit feedback. Please try again.",
    workspace: "Workspace",
    detail: "Detail",
    less: "Less",
    country: "Country",
    currency: "Currency",
    noImage: "No image",
    noData: "N/A",
  },

  VI: {
    pageTitle: "Hỗ trợ & Phản hồi",
    pageSubtitle:
      "Báo kết quả nhận diện sai, lỗi hệ thống hoặc góp ý cải thiện.",
    submitTicket: "Gửi phản hồi",
    myTickets: "Phản hồi của tôi",
    relatedScan: "Kết quả quét liên quan",
    linkedToScan: "Liên kết với kết quả quét",
    finalResult: "Kết quả cuối",
    consensus: "Đồng thuận",
    agentSummary: "Tóm tắt tác nhân",
    viewJson: "Xem JSON",
    hideJson: "Ẩn JSON",
    backToResult: "Quay lại kết quả",
    formTitle: "Gửi phản hồi",
    formSubtitle: "Hãy mô tả đủ chi tiết để đội ngũ có thể kiểm tra chính xác.",
    feedbackType: "Loại phản hồi",
    priority: "Mức độ ưu tiên",
    rating: "Trải nghiệm lần quét",
    subject: "Tiêu đề",
    message: "Nội dung",
    expectedResult: "Kết quả mong muốn",
    actualResult: "Kết quả hiện tại",
    typeWrong: "Kết quả nhận diện sai",
    typeSystem: "Lỗi hệ thống / ứng dụng",
    typeSuggestion: "Góp ý tính năng",
    typePayment: "Vấn đề thanh toán / token",
    typeOther: "Khác",
    priorityLow: "Thấp",
    priorityMedium: "Trung bình",
    priorityHigh: "Cao",
    subjectPlaceholder: "Mô tả ngắn vấn đề",
    messagePlaceholder:
      "Hãy cho chúng tôi biết điều gì đã xảy ra, kết quả bạn mong muốn hoặc góp ý cải thiện...",
    expectedPlaceholder: "Ví dụ: 100.000 VND - Việt Nam",
    actualPlaceholder: "Tự điền từ kết quả quét nếu có",
    submit: "Gửi phản hồi",
    submitting: "Đang gửi...",
    submittedTitle: "Đã gửi phản hồi",
    submittedDesc: "Cảm ơn bạn. Phản hồi đã được lưu để kiểm tra.",
    guideTitle: "Nên cung cấp gì",
    guide1: "Mệnh giá và quốc gia đúng mà bạn kỳ vọng.",
    guide2: "Phần nào trong kết quả đang sai.",
    guide3: "Ảnh có rõ nét hoặc bị cắt sai không.",
    guide4: "Chữ, số hoặc địa danh nhìn thấy trên tờ tiền.",
    supportTitle: "Trạng thái hỗ trợ",
    supportDesc:
      "Hầu hết phản hồi được xem xét trong 1-3 ngày làm việc. Vấn đề thanh toán có thể cần mã giao dịch.",
    recentTitle: "Phản hồi gần đây",
    noTicketsTitle: "Chưa có phản hồi",
    noTicketsDesc: "Bạn chưa gửi phản hồi nào.",
    loadingTickets: "Đang tải phản hồi...",
    refresh: "Làm mới",
    pending: "Đang chờ",
    resolved: "Đã xử lý",
    inReview: "Đang xem xét",
    closed: "Đã đóng",
    scanConflict:
      "Lần quét này có kết quả không đồng thuận giữa các tác nhân. Phản hồi của bạn sẽ giúp kiểm tra trường hợp này.",
    successToast: "Đã gửi phản hồi.",
    errorLoad: "Không thể tải lịch sử phản hồi.",
    errorShortSubject: "Vui lòng nhập tiêu đề tối thiểu 5 ký tự.",
    errorShortMessage: "Vui lòng mô tả vấn đề tối thiểu 10 ký tự.",
    errorExpected: "Vui lòng nhập kết quả mong muốn.",
    errorSubmit: "Không thể gửi phản hồi. Vui lòng thử lại.",
    workspace: "Không gian quét",
    detail: "Chi tiết",
    less: "Thu gọn",
    country: "Quốc gia",
    currency: "Tiền tệ",
    noImage: "Không có ảnh",
    noData: "N/A",
  },
};

function getScanImage(scanResult) {
  return (
    scanResult?.image_url ||
    scanResult?.thumbnail_url ||
    scanResult?.uploaded_image_url ||
    scanResult?.data?.image_url ||
    ""
  );
}

function getScanDenomination(scanResult) {
  return (
    scanResult?.data?.denomination ||
    scanResult?.final_result?.menh_gia ||
    scanResult?.final_result?.denomination ||
    "N/A"
  );
}

function getScanCountry(scanResult) {
  return (
    scanResult?.data?.country ||
    scanResult?.final_result?.quoc_gia ||
    scanResult?.final_result?.country ||
    "N/A"
  );
}

function getScanCurrency(scanResult) {
  const dataCurrency = scanResult?.data?.currency;

  if (dataCurrency && dataCurrency !== "N/A") return dataCurrency;

  const denomination = String(getScanDenomination(scanResult));
  const parts = denomination.split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : "N/A";
}

function getScanStatus(scanResult) {
  return (
    scanResult?.consensus?.status ||
    scanResult?.status ||
    scanResult?.final_result?.status ||
    "N/A"
  );
}

function getScanConsensus(scanResult) {
  const matched =
    scanResult?.consensus?.matched_agents ||
    scanResult?.final_result?.so_luong_dong_thuan;

  if (!matched) return "N/A";
  return `${matched}/3`;
}

function getAgentValue(scanResult, key) {
  const agent = scanResult?.agents?.[key];

  return {
    denomination:
      agent?.menh_gia || agent?.denomination || agent?.result || "N/A",
    country: agent?.quoc_gia || agent?.country || "N/A",
    status: agent?.status || "N/A",
  };
}

function getStatusBadgeInfo(item, t) {
  const raw = String(item?.status || item?.ticket_status || "").toLowerCase();

  if (item?.is_resolved || raw === "resolved") {
    return {
      label: t.resolved,
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
    };
  }

  if (raw.includes("review")) {
    return {
      label: t.inReview,
      className:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20",
    };
  }

  if (raw.includes("closed")) {
    return {
      label: t.closed,
      className:
        "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    };
  }

  return {
    label: t.pending,
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  };
}

function getTypeMeta(type, t) {
  const value = String(type || "").toLowerCase();

  if (value === "wrong_result" || value === "recognition_wrong") {
    return {
      label: t.typeWrong,
      icon: <ScanLine className="w-5 h-5 text-rose-500" />,
    };
  }

  if (value === "system_error") {
    return {
      label: t.typeSystem,
      icon: <Bug className="w-5 h-5 text-amber-500" />,
    };
  }

  if (value === "payment_issue") {
    return {
      label: t.typePayment,
      icon: <CreditCard className="w-5 h-5 text-violet-500" />,
    };
  }

  if (value === "suggestion" || value === "ui_suggestion") {
    return {
      label: t.typeSuggestion,
      icon: <Lightbulb className="w-5 h-5 text-blue-500" />,
    };
  }

  return {
    label: t.typeOther,
    icon: <HelpCircle className="w-5 h-5 text-slate-500" />,
  };
}

function formatDate(value) {
  if (!value) return "N/A";

  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "N/A";
  }
}

export default function Feedback() {
  const location = useLocation();
  const navigate = useNavigate();

  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";
  const t = content[lang] || content["EN"];

  const scanResult = location.state?.scanResult || null;
  const relatedResultId =
    location.state?.resultId ||
    location.state?.scan_result_id ||
    scanResult?.id ||
    "";

  const cameFromResult = Boolean(scanResult || relatedResultId);

  const initialActualResult = scanResult
    ? `${getScanDenomination(scanResult)} - ${getScanCountry(scanResult)}`
    : "";

  const initialType = cameFromResult ? "wrong_result" : "suggestion";

  const [activeTab, setActiveTab] = useState("new");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const [formData, setFormData] = useState({
    feedback_type: initialType,
    priority: cameFromResult ? "high" : "medium",
    rating: 0,
    subject: cameFromResult ? "Incorrect recognition result" : "",
    message: "",
    expected_result: "",
    actual_result: initialActualResult,
    related_result_id: relatedResultId,
  });

  const isConflict = useMemo(() => {
    const status = String(getScanStatus(scanResult)).toLowerCase();
    return (
      status.includes("conflict") ||
      getScanDenomination(scanResult) === "Needs review"
    );
  }, [scanResult]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchHistory = async () => {
    setIsFetchingHistory(true);

    try {
      const data = await getFeedbackHistory();
      setHistory(Array.isArray(data) ? data : data?.items || data?.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || t.errorLoad);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const updateForm = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const buildBackendMessage = () => {
    const parts = [
      `[Subject] ${formData.subject}`,
      `[Priority] ${formData.priority}`,
      `[Rating] ${formData.rating || "N/A"}/5`,
    ];

    if (formData.related_result_id) {
      parts.push(`[Related Scan ID] ${formData.related_result_id}`);
    }

    if (formData.feedback_type === "wrong_result") {
      parts.push(`[Actual Result] ${formData.actual_result || "N/A"}`);
      parts.push(`[Expected Result] ${formData.expected_result || "N/A"}`);
    }

    parts.push("");
    parts.push(formData.message);

    return parts.join("\n");
  };

  const validateForm = () => {
    if (!formData.subject.trim() || formData.subject.trim().length < 5) {
      toast.error(t.errorShortSubject);
      return false;
    }

    if (!formData.message.trim() || formData.message.trim().length < 10) {
      toast.error(t.errorShortMessage);
      return false;
    }

    if (
      formData.feedback_type === "wrong_result" &&
      !formData.expected_result.trim()
    ) {
      toast.error(t.errorExpected);
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const payload = {
        feedback_type: formData.feedback_type,
        priority: formData.priority || "medium",
        rating: formData.rating ? Number(formData.rating) : null,
        subject: formData.subject,
        message: buildBackendMessage(),
        related_result_id: formData.related_result_id || null,
        related_transaction_id: null,
        attached_image_url: scanResult ? getScanImage(scanResult) || null : null,
      };

      await submitFeedback(payload);

      setSubmitted(true);
      toast.success(t.successToast);

      setTimeout(() => {
        setSubmitted(false);
        setFormData((prev) => ({
          ...prev,
          message: "",
          expected_result: "",
          rating: 0,
        }));
        setActiveTab("history");
      }, 1200);
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || t.errorSubmit);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToResult = () => {
    if (scanResult) {
      navigate("/result", {
        state: {
          scanSession: {
            result: scanResult,
            previewUrl: getScanImage(scanResult),
          },
        },
      });
      return;
    }

    navigate("/history");
  };

  return (
    <div
      className={`min-h-screen pb-24 font-sans transition-colors duration-300 ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <div
        className={`border-b pt-10 pb-10 mb-8 ${
          isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-200"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${
                  isDark
                    ? "bg-teal-500/10 border-teal-500/20 text-teal-300"
                    : "bg-teal-50 border-teal-100 text-teal-600"
                }`}
              >
                <MessageSquare size={28} />
              </div>

              <div>
                <h1
                  className={`text-3xl font-extrabold tracking-tight ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {t.pageTitle}
                </h1>
                <p
                  className={`mt-2 max-w-2xl ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {t.pageSubtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {cameFromResult && (
                <button
                  onClick={handleBackToResult}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-xl font-bold text-sm ${
                    isDark
                      ? "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <ArrowLeft size={16} />
                  {t.backToResult}
                </button>
              )}

              <button
                onClick={() => navigate("/workspace")}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white ${
                  isDark
                    ? "bg-teal-600 hover:bg-teal-500"
                    : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                <ScanLine size={16} />
                {t.workspace}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div
          className={`flex gap-2 mb-6 border-b pb-px ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}
        >
          <button
            onClick={() => setActiveTab("new")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm transition-all border-b-2 rounded-t-xl ${
              activeTab === "new"
                ? isDark
                  ? "border-teal-400 text-teal-300 bg-teal-500/10"
                  : "border-teal-600 text-teal-700 bg-teal-50/70"
                : isDark
                  ? "border-transparent text-slate-400 hover:text-white hover:bg-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Ticket className="w-4 h-4" />
            {t.submitTicket}
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm transition-all border-b-2 rounded-t-xl ${
              activeTab === "history"
                ? isDark
                  ? "border-teal-400 text-teal-300 bg-teal-500/10"
                  : "border-teal-600 text-teal-700 bg-teal-50/70"
                : isDark
                  ? "border-transparent text-slate-400 hover:text-white hover:bg-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <History className="w-4 h-4" />
            {t.myTickets}
          </button>
        </div>

        {activeTab === "new" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              {scanResult && (
                <RelatedScanCard
                  t={t}
                  isDark={isDark}
                  scanResult={scanResult}
                  isConflict={isConflict}
                  showJson={showJson}
                  onToggleJson={() => setShowJson((prev) => !prev)}
                />
              )}

              <div
                className={`p-6 md:p-8 rounded-3xl border shadow-sm ${
                  isDark
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-slate-200"
                }`}
              >
                {submitted ? (
                  <div className="py-20 text-center">
                    <CheckCircle2 className="w-20 h-20 text-teal-500 mx-auto mb-6" />
                    <h2
                      className={`text-2xl font-bold mb-2 ${
                        isDark ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {t.submittedTitle}
                    </h2>
                    <p className={isDark ? "text-slate-400" : "text-slate-500"}>
                      {t.submittedDesc}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <h2
                        className={`text-xl font-extrabold ${
                          isDark ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {t.formTitle}
                      </h2>
                      <p
                        className={`text-sm mt-1 ${
                          isDark ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        {t.formSubtitle}
                      </p>
                    </div>

                    {formData.related_result_id && (
                      <div
                        className={`border rounded-2xl p-4 flex items-start gap-3 ${
                          isDark
                            ? "bg-blue-500/10 border-blue-500/20"
                            : "bg-blue-50 border-blue-200"
                        }`}
                      >
                        <ScanLine
                          className={`mt-0.5 shrink-0 ${
                            isDark ? "text-blue-300" : "text-blue-600"
                          }`}
                          size={20}
                        />
                        <div>
                          <p
                            className={`text-sm font-bold ${
                              isDark ? "text-blue-200" : "text-blue-900"
                            }`}
                          >
                            {t.linkedToScan}
                          </p>
                          <p
                            className={`text-xs mt-1 font-mono break-all ${
                              isDark ? "text-blue-300" : "text-blue-700"
                            }`}
                          >
                            {formData.related_result_id}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Field label={t.feedbackType}>
                        <select
                          value={formData.feedback_type}
                          onChange={(e) =>
                            updateForm("feedback_type", e.target.value)
                          }
                          className={inputClass(isDark)}
                        >
                          <option value="wrong_result">{t.typeWrong}</option>
                          <option value="system_error">{t.typeSystem}</option>
                          <option value="suggestion">{t.typeSuggestion}</option>
                          <option value="payment_issue">{t.typePayment}</option>
                          <option value="other">{t.typeOther}</option>
                        </select>
                      </Field>

                      <Field label={t.priority}>
                        <select
                          value={formData.priority}
                          onChange={(e) =>
                            updateForm("priority", e.target.value)
                          }
                          className={inputClass(isDark)}
                        >
                          <option value="low">{t.priorityLow}</option>
                          <option value="medium">{t.priorityMedium}</option>
                          <option value="high">{t.priorityHigh}</option>
                        </select>
                      </Field>
                    </div>

                    <Field label={t.rating}>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateForm("rating", value)}
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition ${
                              formData.rating >= value
                                ? isDark
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                  : "bg-amber-50 border-amber-200 text-amber-500"
                                : isDark
                                  ? "bg-slate-950 border-slate-700 text-slate-600 hover:text-amber-300"
                                  : "bg-slate-50 border-slate-200 text-slate-300 hover:text-amber-400"
                            }`}
                          >
                            <Star
                              size={18}
                              fill={
                                formData.rating >= value
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label={t.subject}>
                      <input
                        value={formData.subject}
                        onChange={(e) => updateForm("subject", e.target.value)}
                        className={inputClass(isDark)}
                        placeholder={t.subjectPlaceholder}
                      />
                    </Field>

                    {formData.feedback_type === "wrong_result" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Field label={t.actualResult}>
                          <input
                            value={formData.actual_result}
                            onChange={(e) =>
                              updateForm("actual_result", e.target.value)
                            }
                            className={inputClass(isDark)}
                            placeholder={t.actualPlaceholder}
                          />
                        </Field>

                        <Field label={t.expectedResult}>
                          <input
                            value={formData.expected_result}
                            onChange={(e) =>
                              updateForm("expected_result", e.target.value)
                            }
                            className={inputClass(isDark)}
                            placeholder={t.expectedPlaceholder}
                          />
                        </Field>
                      </div>
                    )}

                    <Field label={t.message}>
                      <textarea
                        rows="6"
                        value={formData.message}
                        onChange={(e) => updateForm("message", e.target.value)}
                        className={`${inputClass(isDark)} resize-none`}
                        placeholder={t.messagePlaceholder}
                      />
                    </Field>

                    <div
                      className={`pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t ${
                        isDark ? "border-slate-800" : "border-slate-100"
                      }`}
                    >
                      <p className="text-xs text-slate-400 font-medium">
                        {t.supportDesc}
                      </p>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className={`inline-flex justify-center items-center gap-2 px-8 py-3.5 text-white rounded-xl font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm active:scale-95 ${
                          isDark
                            ? "bg-teal-600 hover:bg-teal-500"
                            : "bg-slate-900 hover:bg-slate-800"
                        }`}
                      >
                        {isLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        {isLoading ? t.submitting : t.submit}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <GuideCard t={t} isDark={isDark} />
              <SupportCard t={t} isDark={isDark} />
              <RecentFeedbackPreview
                t={t}
                isDark={isDark}
                history={history}
                fetchHistory={fetchHistory}
                isFetchingHistory={isFetchingHistory}
                setActiveTab={setActiveTab}
              />
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <FeedbackHistory
            t={t}
            isDark={isDark}
            history={history}
            isFetchingHistory={isFetchingHistory}
            fetchHistory={fetchHistory}
          />
        )}
      </div>
    </div>
  );
}

function inputClass(isDark) {
  return `w-full px-4 py-3.5 rounded-xl border outline-none transition-all font-semibold ${
    isDark
      ? "bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-400 focus:ring-4 focus:ring-teal-500/10"
      : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
  }`;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}

function RelatedScanCard({
  t,
  isDark,
  scanResult,
  isConflict,
  showJson,
  onToggleJson,
}) {
  const image = getScanImage(scanResult);
  const agent1 = getAgentValue(scanResult, "ml_dl");
  const agent2 = getAgentValue(scanResult, "llm_api");
  const agent3 = getAgentValue(scanResult, "visual_search");

  return (
    <div
      className={`rounded-3xl border shadow-sm overflow-hidden ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div
        className={`p-6 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isDark ? "border-slate-800" : "border-slate-100"
        }`}
      >
        <div>
          <h2
            className={`text-xl font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}
          >
            {t.relatedScan}
          </h2>
          <p
            className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            {t.linkedToScan}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleJson}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm ${
            isDark
              ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <FileJson size={16} />
          {showJson ? t.hideJson : t.viewJson}
        </button>
      </div>

      {isConflict && (
        <div
          className={`mx-6 mt-6 p-4 border rounded-2xl flex items-start gap-3 ${
            isDark
              ? "bg-amber-500/10 border-amber-500/20 text-amber-200"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{t.scanConflict}</p>
        </div>
      )}

      <div className="p-6 grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-2">
          {image ? (
            <img
              src={image}
              alt="Banknote"
              className={`w-full h-52 object-contain rounded-2xl border ${
                isDark
                  ? "bg-slate-950 border-slate-800"
                  : "bg-slate-100 border-slate-200"
              }`}
            />
          ) : (
            <div
              className={`w-full h-52 rounded-2xl border border-dashed flex items-center justify-center ${
                isDark
                  ? "bg-slate-950 border-slate-700 text-slate-500"
                  : "bg-slate-100 border-slate-300 text-slate-400"
              }`}
            >
              {t.noImage}
            </div>
          )}
        </div>

        <div className="md:col-span-3 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <InfoBox
              isDark={isDark}
              label={t.finalResult}
              value={getScanDenomination(scanResult)}
            />
            <InfoBox
              isDark={isDark}
              label={t.country}
              value={getScanCountry(scanResult)}
            />
            <InfoBox
              isDark={isDark}
              label={t.currency}
              value={getScanCurrency(scanResult)}
            />
            <InfoBox
              isDark={isDark}
              label={t.consensus}
              value={getScanConsensus(scanResult)}
            />
          </div>

          <div>
            <h3
              className={`text-sm font-bold mb-3 ${isDark ? "text-slate-400" : "text-slate-500"}`}
            >
              {t.agentSummary}
            </h3>

            <div className="space-y-2">
              <AgentLine isDark={isDark} label="Agent 1" agent={agent1} />
              <AgentLine isDark={isDark} label="Agent 2" agent={agent2} />
              <AgentLine isDark={isDark} label="Agent 3" agent={agent3} />
            </div>
          </div>
        </div>
      </div>

      {showJson && (
        <div className="mx-6 mb-6 bg-slate-900 rounded-2xl p-5 border border-slate-800 overflow-auto max-h-80">
          <pre className="text-xs text-teal-300 whitespace-pre-wrap">
            {JSON.stringify(scanResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function InfoBox({ isDark, label, value }) {
  return (
    <div
      className={`border rounded-2xl p-4 ${
        isDark
          ? "bg-slate-950 border-slate-800"
          : "bg-slate-50 border-slate-100"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
        {label}
      </p>
      <p
        className={`text-sm font-black mt-1 ${isDark ? "text-white" : "text-slate-900"}`}
      >
        {value || "N/A"}
      </p>
    </div>
  );
}

function AgentLine({ isDark, label, agent }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 p-3 rounded-xl border ${
        isDark
          ? "bg-slate-950 border-slate-800"
          : "bg-slate-50 border-slate-100"
      }`}
    >
      <span
        className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}
      >
        {label}
      </span>
      <span
        className={`text-sm text-right ${isDark ? "text-slate-400" : "text-slate-500"}`}
      >
        {agent.denomination} · {agent.country}
      </span>
    </div>
  );
}

function GuideCard({ t, isDark }) {
  const items = [t.guide1, t.guide2, t.guide3, t.guide4];

  return (
    <div
      className={`rounded-3xl border shadow-sm p-6 ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
            isDark ? "bg-teal-500/10 text-teal-300" : "bg-teal-50 text-teal-600"
          }`}
        >
          <ClipboardCheck size={20} />
        </div>
        <h3
          className={`font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}
        >
          {t.guideTitle}
        </h3>
      </div>

      <ul
        className={`space-y-3 text-sm ${isDark ? "text-slate-300" : "text-slate-600"}`}
      >
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SupportCard({ t, isDark }) {
  return (
    <div
      className={`rounded-3xl border shadow-sm p-6 ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
            isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-600"
          }`}
        >
          <Clock size={20} />
        </div>
        <h3
          className={`font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}
        >
          {t.supportTitle}
        </h3>
      </div>

      <p
        className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}
      >
        {t.supportDesc}
      </p>
    </div>
  );
}

function RecentFeedbackPreview({
  t,
  isDark,
  history,
  fetchHistory,
  isFetchingHistory,
  setActiveTab,
}) {
  useEffect(() => {
    if (!history || history.length === 0) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewItems = (history || []).slice(0, 3);

  return (
    <div
      className={`rounded-3xl border shadow-sm p-6 ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <h3
          className={`font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}
        >
          {t.recentTitle}
        </h3>

        <button
          onClick={() => setActiveTab("history")}
          className="text-sm font-bold text-teal-600 hover:underline"
        >
          {t.myTickets}
        </button>
      </div>

      {isFetchingHistory ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className={`h-16 rounded-2xl animate-pulse ${
                isDark ? "bg-slate-800" : "bg-slate-100"
              }`}
            />
          ))}
        </div>
      ) : previewItems.length === 0 ? (
        <p
          className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}
        >
          {t.noTicketsDesc}
        </p>
      ) : (
        <div className="space-y-3">
          {previewItems.map((item, index) => (
            <FeedbackMiniItem
              key={item.id || index}
              item={item}
              t={t}
              isDark={isDark}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackHistory({
  t,
  isDark,
  history,
  isFetchingHistory,
  fetchHistory,
}) {
  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={fetchHistory}
          className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-xl font-bold text-sm ${
            isDark
              ? "bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <RefreshCw size={16} />
          {t.refresh}
        </button>
      </div>

      {isFetchingHistory ? (
        <div className="py-20 text-center flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600 mb-4" />
          <p
            className={`font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            {t.loadingTickets}
          </p>
        </div>
      ) : !history || history.length === 0 ? (
        <div
          className={`rounded-3xl border shadow-sm p-16 text-center ${
            isDark
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-200"
          }`}
        >
          <Clock
            className={`w-16 h-16 mx-auto mb-4 ${isDark ? "text-slate-700" : "text-slate-200"}`}
          />
          <h3
            className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}
          >
            {t.noTicketsTitle}
          </h3>
          <p
            className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            {t.noTicketsDesc}
          </p>
        </div>
      ) : (
        history.map((item, index) => (
          <FeedbackHistoryItem
            key={item.id || index}
            item={item}
            t={t}
            isDark={isDark}
          />
        ))
      )}
    </div>
  );
}

function FeedbackMiniItem({ item, t, isDark }) {
  const meta = getTypeMeta(item.feedback_type, t);
  const badge = getStatusBadgeInfo(item, t);

  return (
    <div
      className={`p-4 rounded-2xl border ${
        isDark
          ? "bg-slate-950 border-slate-800"
          : "bg-slate-50 border-slate-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {meta.icon}
          <span
            className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}
          >
            {meta.label}
          </span>
        </div>
        <span
          className={`px-2 py-1 text-[10px] rounded-lg border font-bold uppercase tracking-wider ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      <p
        className={`text-xs mt-2 line-clamp-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}
      >
        {item.message}
      </p>
    </div>
  );
}

function FeedbackHistoryItem({ item, t, isDark }) {
  const [open, setOpen] = useState(false);
  const meta = getTypeMeta(item.feedback_type, t);
  const badge = getStatusBadgeInfo(item, t);

  return (
    <div
      className={`p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex flex-col md:flex-row gap-5">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {meta.icon}
            <span
              className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}
            >
              {meta.label}
            </span>
            <span
              className={`px-2.5 py-1 text-[10px] rounded-lg border font-bold uppercase tracking-wider ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>

          <p
            className={`text-sm leading-relaxed ${!open ? "line-clamp-3" : ""} ${
              isDark ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {item.message}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400 mt-4">
            <span>{formatDate(item.created_at)}</span>

            {item.related_result_id && (
              <>
                <span
                  className={`w-1 h-1 rounded-full ${isDark ? "bg-slate-700" : "bg-slate-300"}`}
                />
                <span className="flex items-center gap-1">
                  <ScanLine size={12} />
                  Scan ID: {String(item.related_result_id).slice(-8)}
                </span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => setOpen((prev) => !prev)}
          className={`h-fit inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${
            isDark
              ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <Eye size={15} />
          {open ? t.less : t.detail}
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>
    </div>
  );
}
