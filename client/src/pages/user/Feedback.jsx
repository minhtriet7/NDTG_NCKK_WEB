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
  Eye,
  RefreshCw,
  Search,
  X,
  ExternalLink,
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
    submitHint: "Usually reviewed within 1-3 business days.",
    recentTitle: "Recent feedback",
    noTicketsTitle: "No tickets found",
    noTicketsDesc: "You have not submitted any feedback yet.",
    noSubject: "No subject",
    noRelatedScan: "No related scan",
    noRating: "No rating",
    ratingLabel: "Rating",
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
    ticketDetails: "Ticket details",
    close: "Close",
    viewRelatedResult: "View related result",
    adminReply: "Admin reply",
    scanImage: "Scan image",
    filterAll: "All",
    filterPending: "New / Pending",
    filterReviewing: "Reviewing",
    filterResolved: "Resolved",
    filterHighPriority: "High priority",
    searchTickets: "Search tickets",
    clearFilter: "Clear filter",
    noFilteredTitle: "No matching tickets",
    noFilteredDesc: "Try a different search term or filter.",
    wrongReportSubject: "Wrong recognition result",
    wrongReportMessage:
      "The recognition result looks incorrect. Please review this scan.\n\nDetected result: {actual}\nCountry: {country}\nConfidence: {confidence}\n\nExpected result:",
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
    submitHint: "Thường được xem xét trong 1-3 ngày làm việc.",
    recentTitle: "Phản hồi gần đây",
    noTicketsTitle: "Chưa có phản hồi",
    noTicketsDesc: "Bạn chưa gửi phản hồi nào.",
    noSubject: "Chưa có tiêu đề",
    noRelatedScan: "Không có scan liên quan",
    noRating: "Chưa đánh giá",
    ratingLabel: "Đánh giá",
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
    ticketDetails: "Chi tiet ticket",
    close: "Dong",
    viewRelatedResult: "Xem ket qua lien quan",
    adminReply: "Phan hoi admin",
    scanImage: "Anh scan",
    filterAll: "Tat ca",
    filterPending: "Moi / Dang cho",
    filterReviewing: "Dang xem xet",
    filterResolved: "Da xu ly",
    filterHighPriority: "Uu tien cao",
    searchTickets: "Tim ticket",
    clearFilter: "Xoa loc",
    noFilteredTitle: "Khong co ticket phu hop",
    noFilteredDesc: "Thu tu khoa hoac bo loc khac.",
    wrongReportSubject: "Wrong recognition result",
    wrongReportMessage:
      "Ket qua nhan dien co ve chua dung. Vui long kiem tra scan nay.\n\nKet qua hien tai: {actual}\nQuoc gia: {country}\nDo tin cay: {confidence}\n\nKet qua mong muon:",
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

  if (raw.includes("reject")) {
    return {
      label: t.closed,
      className:
        "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
    };
  }

  return {
    label: t.pending,
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  };
}

function getPriorityBadgeInfo(priority, t) {
  const raw = String(priority || "").toLowerCase();

  if (raw === "high" || raw.includes("urgent")) {
    return {
      label: t.priorityHigh,
      className:
        "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
    };
  }

  if (raw === "medium") {
    return {
      label: t.priorityMedium,
      className:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    };
  }

  return {
    label: t.priorityLow,
    className:
      "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20",
  };
}

function safeText(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  if (!text || text === "N/A" || text === "undefined" || text === "null") {
    return fallback;
  }

  return text;
}

function parseBracketMeta(message = "") {
  const meta = {};
  const bodyLines = [];

  String(message || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);

      if (!match) {
        bodyLines.push(line);
        return;
      }

      const key = match[1]
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
      meta[key] = match[2]?.trim() || "";
    });

  return {
    meta,
    body: bodyLines.join("\n").trim(),
  };
}

function normalizeFeedbackItem(item, t) {
  const parsed = parseBracketMeta(item?.message);
  const priority = item?.priority || parsed.meta.priority || "medium";
  const rawRating = item?.rating ?? parsed.meta.rating;
  const ratingText = String(rawRating ?? "").replace(/\/5$/i, "").trim();
  const relatedScan =
    item?.related_result_id ||
    item?.scan_result_id ||
    parsed.meta.related_scan_id ||
    parsed.meta.related_result_id ||
    "";

  return {
    id: item?.id || item?._id,
    type: item?.feedback_type || item?.type || "other",
    subject: safeText(item?.subject || parsed.meta.subject, t.noSubject),
    priority,
    rating: safeText(ratingText, t.noRating),
    relatedScan: safeText(relatedScan, t.noRelatedScan),
    createdAt: item?.created_at || item?.createdAt || item?.updated_at,
    message: safeText(parsed.body || item?.message, "-"),
    actualResult: safeText(item?.actual_result || parsed.meta.actual_result, "-"),
    expectedResult: safeText(
      item?.expected_result || parsed.meta.expected_result,
      "-",
    ),
    scanImage: safeText(
      item?.attached_image_url ||
        item?.scan_image_url ||
        item?.image_url ||
        parsed.meta.scan_image,
      "",
    ),
    adminReply: safeText(
      item?.admin_reply ||
        item?.admin_response ||
        item?.reply ||
        parsed.meta.admin_reply,
      "-",
    ),
    rawStatus: item?.status || item?.ticket_status || "",
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

function formatConfidence(value, t) {
  if (value === null || value === undefined || value === "") return t.noData;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return safeText(value, t.noData);

  return numberValue <= 1
    ? `${Math.round(numberValue * 100)}%`
    : `${Math.round(numberValue)}%`;
}

function isLowConfidence(value) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return false;

  return numberValue <= 1 ? numberValue < 0.75 : numberValue < 75;
}

function buildWrongRecognitionMessage(template, draft, t) {
  const actual = safeText(draft.actual_result || draft.actualResult, t.noData);
  const country = safeText(draft.country, t.noData);
  const confidence = formatConfidence(draft.confidence, t);

  return template
    .replace("{actual}", actual)
    .replace("{country}", country)
    .replace("{confidence}", confidence);
}

function hasRelatedScan(data, t) {
  return Boolean(data.relatedScan && data.relatedScan !== t.noRelatedScan);
}

function filterFeedbackItems(items, t, filter, search) {
  const query = search.trim().toLowerCase();

  return (items || []).filter((item) => {
    const data = normalizeFeedbackItem(item, t);
    const rawStatus = String(data.rawStatus || "").toLowerCase();
    const rawPriority = String(data.priority || "").toLowerCase();

    const matchesFilter =
      filter === "all" ||
      (filter === "pending" &&
        !item?.is_resolved &&
        (!rawStatus ||
          rawStatus.includes("new") ||
          rawStatus.includes("pending") ||
          rawStatus.includes("open"))) ||
      (filter === "reviewing" &&
        (rawStatus.includes("review") || rawStatus.includes("progress"))) ||
      (filter === "resolved" &&
        (item?.is_resolved ||
          rawStatus.includes("resolved") ||
          rawStatus.includes("closed"))) ||
      (filter === "high" &&
        (rawPriority === "high" || rawPriority.includes("urgent")));

    if (!matchesFilter) return false;
    if (!query) return true;

    const typeMeta = getTypeMeta(data.type, t);
    const searchable = [
      data.subject,
      data.message,
      data.type,
      typeMeta.label,
      data.priority,
      data.relatedScan,
      data.adminReply,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(query);
  });
}

export default function Feedback() {
  const location = useLocation();
  const navigate = useNavigate();

  const { lang, theme, resolvedTheme } = useAppStore();
  const isDark = (resolvedTheme || theme) === "dark";
  const t = content[lang] || content["EN"];

  const feedbackDraft =
    location.state?.feedbackDraft || location.state?.reportDraft || {};
  const scanResult = feedbackDraft.scanResult || location.state?.scanResult || null;
  const draftImageUrl =
    feedbackDraft.image_url || feedbackDraft.imageUrl || getScanImage(scanResult);
  const relatedResultId =
    feedbackDraft.related_result_id ||
    feedbackDraft.relatedResultId ||
    feedbackDraft.resultId ||
    location.state?.resultId ||
    location.state?.scan_result_id ||
    scanResult?.id ||
    "";

  const cameFromResult = Boolean(
    scanResult || relatedResultId || Object.keys(feedbackDraft).length,
  );

  const initialActualResult =
    feedbackDraft.actual_result ||
    feedbackDraft.actualResult ||
    (scanResult
      ? `${getScanDenomination(scanResult)} - ${getScanCountry(scanResult)}`
      : "");

  const initialType =
    feedbackDraft.feedback_type ||
    feedbackDraft.feedbackType ||
    (cameFromResult ? "wrong_result" : "suggestion");
  const initialMessage =
    feedbackDraft.message ||
    (cameFromResult
      ? buildWrongRecognitionMessage(
          t.wrongReportMessage,
          {
            actual_result: initialActualResult,
            country: feedbackDraft.country || getScanCountry(scanResult),
            confidence: feedbackDraft.confidence,
          },
          t,
        )
      : "");

  const [activeTab, setActiveTab] = useState(
    location.state?.tab === "history" ? "history" : "new",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketFilter, setTicketFilter] = useState("all");
  const [ticketSearch, setTicketSearch] = useState("");

  const [formData, setFormData] = useState({
    feedback_type: initialType,
    priority:
      feedbackDraft.priority ||
      (cameFromResult || isLowConfidence(feedbackDraft.confidence)
        ? "high"
        : "medium"),
    rating: 0,
    subject: feedbackDraft.subject || (cameFromResult ? t.wrongReportSubject : ""),
    message: initialMessage,
    expected_result:
      feedbackDraft.expected_result || feedbackDraft.expectedResult || "",
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

  const isFormValid = useMemo(() => {
    const hasBaseFields =
      Boolean(formData.feedback_type) &&
      Boolean(formData.priority) &&
      formData.subject.trim().length >= 5 &&
      formData.message.trim().length >= 10;

    if (!hasBaseFields) return false;

    if (formData.feedback_type === "wrong_result") {
      return Boolean(formData.expected_result.trim());
    }

    return true;
  }, [formData]);

  const filteredHistory = useMemo(
    () => filterFeedbackItems(history, t, ticketFilter, ticketSearch),
    [history, t, ticketFilter, ticketSearch],
  );

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
        attached_image_url: draftImageUrl || null,
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

  const handleViewRelatedResult = (resultId) => {
    navigate("/history", {
      state: {
        highlightedResultId: resultId,
      },
    });
  };

  return (
    <div
      className={`min-h-screen px-4 py-6 font-sans transition-colors duration-300 sm:px-6 lg:px-8 ${
        isDark ? "bg-slate-950" : "bg-slate-50"
      }`}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <section
          className={`overflow-hidden rounded-2xl border shadow-sm ${
            isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          }`}
        >
          <div className="h-1 bg-gradient-to-r from-slate-900 via-cyan-700 to-violet-600 dark:from-slate-200 dark:via-cyan-400 dark:to-violet-400" />
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border shadow-sm ${
                  isDark
                    ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
                    : "bg-indigo-50 border-indigo-100 text-indigo-600"
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
                  className={`mt-2 max-w-3xl text-sm leading-6 ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  {t.pageSubtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
              {cameFromResult && (
                <button
                  type="button"
                  onClick={handleBackToResult}
                  className={`inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-bold transition ${
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
                type="button"
                onClick={() => navigate("/workspace")}
                className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold text-white transition ${
                  isDark
                    ? "bg-indigo-600 hover:bg-indigo-500"
                    : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                <ScanLine size={16} />
                {t.workspace}
              </button>
            </div>
          </div>
        </section>

        <div
          className={`grid grid-cols-2 gap-2 rounded-xl border p-1 ${
            isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab("new")}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
              activeTab === "new"
                ? isDark
                  ? "bg-indigo-500/15 text-indigo-200 shadow-sm"
                  : "bg-slate-900 text-white shadow-sm"
                : isDark
                  ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Ticket className="w-4 h-4" />
            {t.submitTicket}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
              activeTab === "history"
                ? isDark
                  ? "bg-indigo-500/15 text-indigo-200 shadow-sm"
                  : "bg-slate-900 text-white shadow-sm"
                : isDark
                  ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <History className="w-4 h-4" />
            {t.myTickets}
          </button>
        </div>

        {activeTab === "new" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:col-span-8">
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
                className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
                  isDark
                    ? "bg-slate-900 border-slate-800"
                    : "bg-white border-slate-200"
                }`}
              >
                {submitted ? (
                  <div className="py-16 text-center">
                    <CheckCircle2 className="w-16 h-16 text-indigo-500 mx-auto mb-5" />
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
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
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
                      <div
                        className={`hidden rounded-lg p-2 sm:block ${
                          isDark ? "bg-slate-950 text-indigo-300" : "bg-indigo-50 text-indigo-600"
                        }`}
                      >
                        <Send className="h-5 w-5" />
                      </div>
                    </div>

                    {formData.related_result_id && (
                      <div
                        className={`flex items-start gap-3 rounded-xl border p-4 ${
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

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                      <div className="flex flex-wrap items-center gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            aria-label={`${t.ratingLabel} ${value}`}
                            onClick={() => updateForm("rating", value)}
                            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition hover:-translate-y-0.5 ${
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
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        rows="5"
                        value={formData.message}
                        onChange={(e) => updateForm("message", e.target.value)}
                        className={`${inputClass(isDark)} resize-none`}
                        placeholder={t.messagePlaceholder}
                      />
                    </Field>

                    <div
                      className={`flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between ${
                        isDark ? "border-slate-800" : "border-slate-100"
                      }`}
                    >
                      <p className="text-xs font-medium leading-5 text-slate-400">
                        {t.submitHint}
                      </p>

                      <button
                        type="submit"
                        disabled={isLoading || !isFormValid}
                        className={`inline-flex min-w-[180px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-6 py-3 text-sm font-bold text-white shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isDark
                            ? "bg-indigo-600 hover:bg-indigo-500"
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

            <aside className="space-y-6 xl:col-span-4">
              <GuideCard t={t} isDark={isDark} />
              <SupportCard t={t} isDark={isDark} />
              <RecentFeedbackPreview
                t={t}
                isDark={isDark}
                history={history}
                fetchHistory={fetchHistory}
                isFetchingHistory={isFetchingHistory}
                setActiveTab={setActiveTab}
                onOpenTicket={setSelectedTicket}
              />
            </aside>
          </div>
        )}

        {activeTab === "history" && (
          <FeedbackHistory
            t={t}
            isDark={isDark}
            history={filteredHistory}
            allHistory={history}
            isFetchingHistory={isFetchingHistory}
            fetchHistory={fetchHistory}
            filter={ticketFilter}
            search={ticketSearch}
            onFilterChange={setTicketFilter}
            onSearchChange={setTicketSearch}
            onClearFilter={() => {
              setTicketFilter("all");
              setTicketSearch("");
            }}
            onOpenTicket={setSelectedTicket}
          />
        )}

        {selectedTicket && (
          <TicketDetailDrawer
            item={selectedTicket}
            t={t}
            isDark={isDark}
            onClose={() => setSelectedTicket(null)}
            onViewRelatedResult={handleViewRelatedResult}
          />
        )}
      </div>
    </div>
  );
}

function inputClass(isDark) {
  return `w-full px-4 py-3.5 rounded-xl border outline-none transition-all font-semibold ${
    isDark
      ? "bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
      : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
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
          <pre className="text-xs text-indigo-300 whitespace-pre-wrap">
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
      className={`rounded-2xl border p-5 shadow-sm ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
            isDark ? "bg-indigo-500/10 text-indigo-300" : "bg-indigo-50 text-indigo-600"
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
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
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
      className={`rounded-2xl border p-5 shadow-sm ${
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
  onOpenTicket,
}) {
  useEffect(() => {
    if (!history || history.length === 0) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewItems = (history || []).slice(0, 5);

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
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
          className="text-sm font-bold text-indigo-600 hover:underline"
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
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {previewItems.map((item, index) => (
            <FeedbackMiniItem
              key={item.id || index}
              item={item}
              t={t}
              isDark={isDark}
              onOpen={onOpenTicket}
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
  allHistory,
  isFetchingHistory,
  fetchHistory,
  filter,
  search,
  onFilterChange,
  onSearchChange,
  onClearFilter,
  onOpenTicket,
}) {
  const hasAnyTickets = Boolean(allHistory && allHistory.length > 0);
  const hasActiveFilter = filter !== "all" || Boolean(search.trim());
  const filters = [
    { value: "all", label: t.filterAll },
    { value: "pending", label: t.filterPending },
    { value: "reviewing", label: t.filterReviewing },
    { value: "resolved", label: t.filterResolved },
    { value: "high", label: t.filterHighPriority },
  ];

  return (
    <div className="space-y-4">
      <div
        className={`rounded-2xl border p-4 shadow-sm ${
          isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onFilterChange(item.value)}
                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  filter === item.value
                    ? isDark
                      ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-200"
                      : "border-slate-900 bg-slate-900 text-white"
                    : isDark
                      ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={t.searchTickets}
                className={`h-11 w-full rounded-xl border pl-9 pr-3 text-sm font-semibold outline-none transition sm:w-72 ${
                  isDark
                    ? "bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 focus:border-indigo-400"
                    : "bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-400 focus:border-indigo-500"
                }`}
              />
            </label>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={onClearFilter}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold ${
                  isDark
                    ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <X size={15} />
                {t.clearFilter}
              </button>
            )}
          </div>
        </div>
      </div>

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
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
          <p
            className={`font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            {t.loadingTickets}
          </p>
        </div>
      ) : !hasAnyTickets ? (
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
      ) : !history || history.length === 0 ? (
        <div
          className={`rounded-3xl border shadow-sm p-16 text-center ${
            isDark
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-200"
          }`}
        >
          <Search
            className={`w-14 h-14 mx-auto mb-4 ${isDark ? "text-slate-700" : "text-slate-200"}`}
          />
          <h3
            className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}
          >
            {t.noFilteredTitle}
          </h3>
          <p
            className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}
          >
            {t.noFilteredDesc}
          </p>
        </div>
      ) : (
        history.map((item, index) => (
          <FeedbackHistoryItem
            key={item.id || index}
            item={item}
            t={t}
            isDark={isDark}
            onOpen={onOpenTicket}
          />
        ))
      )}
    </div>
  );
}

function FeedbackMiniItem({ item, t, isDark, onOpen }) {
  const data = normalizeFeedbackItem(item, t);
  const meta = getTypeMeta(data.type, t);
  const statusBadge = getStatusBadgeInfo(item, t);
  const priorityBadge = getPriorityBadgeInfo(data.priority, t);

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className={`w-full rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
        isDark
          ? "bg-slate-950 border-slate-800"
          : "bg-slate-50 border-slate-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {meta.icon}
          <span
            className={`truncate text-xs font-bold uppercase tracking-wide ${isDark ? "text-slate-300" : "text-slate-500"}`}
          >
            {meta.label}
          </span>
        </div>
        <FeedbackBadge label={statusBadge.label} className={statusBadge.className} />
      </div>
      <p
        className={`mt-3 line-clamp-2 text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}
      >
        {data.subject}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FeedbackBadge label={priorityBadge.label} className={priorityBadge.className} />
        <span className="text-xs font-medium text-slate-400">
          {data.rating === t.noRating ? data.rating : `${data.rating}`}
        </span>
      </div>
    </button>
  );
}

function FeedbackHistoryItem({ item, t, isDark, onOpen }) {
  const data = normalizeFeedbackItem(item, t);
  const meta = getTypeMeta(data.type, t);
  const statusBadge = getStatusBadgeInfo(item, t);
  const priorityBadge = getPriorityBadgeInfo(data.priority, t);
  const openTicket = () => onOpen?.(item);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openTicket}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openTicket();
        }
      }}
      className={`cursor-pointer rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex flex-col gap-5 md:flex-row">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {meta.icon}
            <span
              className={`text-xs font-bold uppercase tracking-wide ${isDark ? "text-slate-300" : "text-slate-500"}`}
            >
              {meta.label}
            </span>
            <FeedbackBadge label={priorityBadge.label} className={priorityBadge.className} />
            <FeedbackBadge label={statusBadge.label} className={statusBadge.className} />
          </div>

          <h3
            className={`mb-2 text-base font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}
          >
            {data.subject}
          </h3>

          <p
            className={`line-clamp-3 text-sm leading-relaxed ${
              isDark ? "text-slate-300" : "text-slate-600"
            }`}
          >
            {data.message}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400 mt-4">
            <span>{formatDate(data.createdAt)}</span>
            <span
              className={`w-1 h-1 rounded-full ${isDark ? "bg-slate-700" : "bg-slate-300"}`}
            />
            <span className="flex items-center gap-1">
              <Star size={12} />
              {data.rating}
            </span>

            {data.relatedScan !== t.noRelatedScan && (
              <>
                <span
                  className={`w-1 h-1 rounded-full ${isDark ? "bg-slate-700" : "bg-slate-300"}`}
                />
                <span className="flex items-center gap-1">
                  <ScanLine size={12} />
                  Scan ID: {String(data.relatedScan).slice(-8)}
                </span>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openTicket();
          }}
          className={`h-fit inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${
            isDark
              ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <Eye size={15} />
          {t.detail}
        </button>
      </div>
    </div>
  );
}

function TicketDetailDrawer({
  item,
  t,
  isDark,
  onClose,
  onViewRelatedResult,
}) {
  const data = normalizeFeedbackItem(item, t);
  const meta = getTypeMeta(data.type, t);
  const statusBadge = getStatusBadgeInfo(item, t);
  const priorityBadge = getPriorityBadgeInfo(data.priority, t);
  const canViewRelated = hasRelatedScan(data, t);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-detail-title"
        className={`relative flex h-full w-full max-w-2xl flex-col shadow-2xl ${
          isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900"
        }`}
      >
        <div
          className={`flex items-start justify-between gap-4 border-b p-5 ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}
        >
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {meta.icon}
              <FeedbackBadge
                label={statusBadge.label}
                className={statusBadge.className}
              />
              <FeedbackBadge
                label={priorityBadge.label}
                className={priorityBadge.className}
              />
            </div>
            <h2 id="ticket-detail-title" className="text-xl font-black">
              {data.subject}
            </h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {meta.label} - {formatDate(data.createdAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl border p-2 transition focus:outline-none focus:ring-4 focus:ring-indigo-500/10 ${
              isDark
                ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailField label={t.feedbackType} value={meta.label} isDark={isDark} />
            <DetailField label={t.priority} value={priorityBadge.label} isDark={isDark} />
            <DetailField label={t.rating} value={data.rating} isDark={isDark} />
            <DetailField label={t.relatedScan} value={data.relatedScan} isDark={isDark} />
            <DetailField label={t.actualResult} value={data.actualResult} isDark={isDark} />
            <DetailField label={t.expectedResult} value={data.expectedResult} isDark={isDark} />
          </div>

          <div
            className={`rounded-2xl border p-4 ${
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              {t.message}
            </p>
            <p
              className={`whitespace-pre-wrap text-sm leading-relaxed ${
                isDark ? "text-slate-200" : "text-slate-700"
              }`}
            >
              {data.message}
            </p>
          </div>

          {data.adminReply !== "-" && (
            <div
              className={`rounded-2xl border p-4 ${
                isDark
                  ? "border-emerald-500/20 bg-emerald-500/10"
                  : "border-emerald-200 bg-emerald-50"
              }`}
            >
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                {t.adminReply}
              </p>
              <p
                className={`whitespace-pre-wrap text-sm leading-relaxed ${
                  isDark ? "text-emerald-100" : "text-emerald-800"
                }`}
              >
                {data.adminReply}
              </p>
            </div>
          )}

          <div
            className={`rounded-2xl border p-4 ${
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              {t.scanImage}
            </p>
            {data.scanImage ? (
              <img
                src={data.scanImage}
                alt={t.scanImage}
                className={`max-h-72 w-full rounded-xl border object-contain ${
                  isDark
                    ? "border-slate-800 bg-slate-950"
                    : "border-slate-200 bg-white"
                }`}
              />
            ) : (
              <div
                className={`flex h-32 items-center justify-center rounded-xl border border-dashed text-sm font-semibold ${
                  isDark
                    ? "border-slate-700 text-slate-500"
                    : "border-slate-300 text-slate-400"
                }`}
              >
                {t.noImage}
              </div>
            )}
          </div>
        </div>

        <div
          className={`flex flex-col gap-3 border-t p-5 sm:flex-row sm:justify-end ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}
        >
          {canViewRelated && (
            <button
              type="button"
              onClick={() => onViewRelatedResult(data.relatedScan)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500"
            >
              <ExternalLink size={16} />
              {t.viewRelatedResult}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
              isDark
                ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.close}
          </button>
        </div>
      </section>
    </div>
  );
}

function DetailField({ label, value, isDark }) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`break-words text-sm font-bold ${
          isDark ? "text-slate-100" : "text-slate-800"
        }`}
      >
        {value || "-"}
      </p>
    </div>
  );
}

function FeedbackBadge({ label, className }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      {label}
    </span>
  );
}
