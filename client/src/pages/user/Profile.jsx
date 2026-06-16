import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  History,
  KeyRound,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Palette,
  Phone,
  RefreshCw,
  Save,
  ScanLine,
  ShieldCheck,
  User,
  Upload,
  Wallet,
  XCircle,
} from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";
import { getFeedbackHistory } from "../../services/feedbackService";
import { getMyTokenUsage } from "../../services/tokenUsageService";
import {
  changePassword,
  getMe,
  getMyHistory,
  getMyTransactions,
  getPreferences,
  getProfileConfig,
  getProfileStats,
  logoutSession,
  setPassword,
  updatePreferences,
  uploadAvatar,
  updateMe,
} from "../../services/userService";

const COUNTRIES = [
  "Vietnam",
  "Thailand",
  "Singapore",
  "Malaysia",
  "Indonesia",
  "Philippines",
  "Cambodia",
  "Laos",
  "Myanmar",
  "Brunei",
  "Other",
];

const CURRENCIES = [
  "VND",
  "USD",
  "EUR",
  "JPY",
  "THB",
  "SGD",
  "MYR",
  "IDR",
  "PHP",
  "CNY",
  "KRW",
];

const DEFAULT_PROFILE_CONFIG = {
  token_cost_per_scan: 1,
  currency: "VND",
  billing_note: "Default estimate from frontend fallback.",
  billing_mode: "fixed",
  dynamic_billing_enabled: false,
};

const buttonFocus =
  "focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 dark:focus:ring-slate-100 dark:focus:ring-offset-slate-950";

const inputClass =
  "h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400 dark:focus:ring-slate-800 dark:disabled:bg-slate-800";

const text = {
  EN: {
    title: "Personal Profile",
    subtitle: "Account, security, tokens, and recognition activity in one place.",
    refresh: "Refresh",
    refreshing: "Refreshing...",
    adminDashboard: "Admin Dashboard",
    myFeedback: "My Feedback",
    changeAvatar: "Change avatar",
    uploadAvatar: "Upload avatar",
    uploadingAvatar: "Uploading...",
    cancelAvatar: "Cancel",
    avatarSaved: "Avatar updated successfully.",
    avatarFailed: "Unable to upload avatar.",
    avatarHint: "JPG, PNG, or WEBP up to the backend upload limit.",
    avatarInvalidType: "Please choose a JPG, PNG, or WEBP image.",
    avatarTooLarge: "Avatar image must be 5MB or smaller.",
    startScan: "Start scan",
    buyTokens: "Buy Tokens",
    viewHistory: "View History",
    viewAll: "View all",
    retry: "Retry",
    save: "Save changes",
    saving: "Saving...",
    saved: "Profile updated successfully.",
    saveFailed: "Unable to update profile.",
    passwordSaved: "Password updated successfully.",
    passwordFailed: "Unable to update password.",
    logout: "Log out",
    loggingOut: "Logging out...",
    apiWarning: "Some profile data could not be refreshed.",
    apiWarningDesc: "Cached account data is shown where available.",
    profileSummary: "Profile Summary",
    personalInfo: "Personal Information",
    tokenBalance: "Token Balance",
    scanStats: "Scan Statistics",
    recentActivity: "Recent Activity",
    accountSecurity: "Account Security",
    tokenActivity: "Token / Payment Activity",
    feedbackOverview: "Feedback Overview",
    quickActions: "Quick Actions",
    preferences: "Preferences",
    fullName: "Full name",
    email: "Email",
    phone: "Phone",
    country: "Country",
    language: "Language",
    theme: "Theme",
    defaultCountry: "Default country",
    defaultCurrency: "Default currency",
    savePreferences: "Save preferences",
    preferencesSaved: "Preferences saved.",
    preferencesFailed: "Unable to save preferences.",
    readonly: "Read only",
    role: "Role",
    status: "Status",
    authType: "Auth type",
    createdAt: "Created",
    lastLogin: "Last login",
    emailStatus: "Email status",
    password: "Password",
    setPassword: "Set password",
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    googlePasswordNote: "This Google account does not have an email password yet.",
    emailPasswordNote: "Update the password used for email login.",
    atLeast6: "At least 6 characters",
    hasLetter: "Contains a letter",
    hasNumberOrSymbol: "Contains a number or symbol",
    passwordsMatch: "Passwords match",
    active: "Active",
    inactive: "Inactive",
    verified: "Verified",
    unverified: "Unverified",
    notProvided: "Not provided",
    localEmail: "Email",
    google: "Google",
    balance: "Balance",
    costPerScan: "Cost per scan",
    defaultCost: "Default estimate: 1 token / scan",
    defaultCostHint: "Backend settings may charge differently when dynamic billing is enabled.",
    totalScans: "Total scans",
    successfulScans: "Successful",
    failedScans: "Failed",
    lastScan: "Last scan",
    tokensUsed: "Tokens used",
    noScans: "No scans yet",
    noScansDesc: "Start a recognition scan and recent activity will appear here.",
    noTransactions: "No token transactions yet",
    noTransactionsDesc: "Purchases and payment confirmations will appear here.",
    noFeedback: "No feedback yet",
    noFeedbackDesc: "Feedback tickets you submit will appear here.",
    totalFeedback: "Total feedback",
    pendingFeedback: "Pending",
    resolvedFeedback: "Resolved",
    accountId: "Account ID",
    providerConnected: "Provider",
    session: "Session",
    sessionDesc: "Sign out on this device and clear the local session.",
    invalidName: "Please enter your full name.",
    invalidPhone: "Please enter a valid phone number.",
    invalidCountry: "Please select a country.",
    invalidPassword: "Please complete all password requirements.",
    currentRequired: "Current password is required.",
  },
  VI: {
    title: "Hồ Sơ Cá Nhân",
    subtitle: "Quản lý tài khoản, bảo mật, token và hoạt động nhận diện.",
    refresh: "Làm mới",
    refreshing: "Đang làm mới...",
    adminDashboard: "Admin Dashboard",
    myFeedback: "Phản hồi của tôi",
    changeAvatar: "Đổi ảnh đại diện",
    uploadAvatar: "Tải ảnh lên",
    uploadingAvatar: "Đang tải...",
    cancelAvatar: "Hủy",
    avatarSaved: "Đã cập nhật ảnh đại diện.",
    avatarFailed: "Không thể tải ảnh đại diện.",
    avatarHint: "JPG, PNG hoặc WEBP theo giới hạn upload của backend.",
    avatarInvalidType: "Vui lòng chọn ảnh JPG, PNG hoặc WEBP.",
    avatarTooLarge: "Ảnh đại diện tối đa 5MB.",
    startScan: "Bắt đầu quét",
    buyTokens: "Mua Tokens",
    viewHistory: "Xem lịch sử",
    viewAll: "Xem tất cả",
    retry: "Thử lại",
    save: "Lưu thay đổi",
    saving: "Đang lưu...",
    saved: "Đã cập nhật hồ sơ.",
    saveFailed: "Không thể cập nhật hồ sơ.",
    passwordSaved: "Đã cập nhật mật khẩu.",
    passwordFailed: "Không thể cập nhật mật khẩu.",
    logout: "Đăng xuất",
    loggingOut: "Đang đăng xuất...",
    apiWarning: "Một số dữ liệu hồ sơ chưa thể làm mới.",
    apiWarningDesc: "Hệ thống đang hiển thị dữ liệu đã lưu nếu có.",
    profileSummary: "Tóm Tắt Hồ Sơ",
    personalInfo: "Thông Tin Cá Nhân",
    tokenBalance: "Số Dư Token",
    scanStats: "Thống Kê Nhận Diện",
    recentActivity: "Hoạt Động Gần Đây",
    accountSecurity: "Bảo Mật Tài Khoản",
    tokenActivity: "Token / Thanh Toán",
    feedbackOverview: "Tổng Quan Phản Hồi",
    quickActions: "Thao Tác Nhanh",
    preferences: "Tùy Chọn",
    fullName: "Họ và tên",
    email: "Email",
    phone: "Số điện thoại",
    country: "Quốc gia",
    language: "Ngôn ngữ",
    theme: "Giao diện",
    defaultCountry: "Quốc gia mặc định",
    defaultCurrency: "Tiền tệ mặc định",
    savePreferences: "Lưu tùy chọn",
    preferencesSaved: "Đã lưu tùy chọn.",
    preferencesFailed: "Không thể lưu tùy chọn.",
    readonly: "Chỉ đọc",
    role: "Vai trò",
    status: "Trạng thái",
    authType: "Kiểu đăng nhập",
    createdAt: "Ngày tạo",
    lastLogin: "Đăng nhập gần nhất",
    emailStatus: "Trạng thái email",
    password: "Mật khẩu",
    setPassword: "Đặt mật khẩu",
    changePassword: "Đổi mật khẩu",
    currentPassword: "Mật khẩu hiện tại",
    newPassword: "Mật khẩu mới",
    confirmPassword: "Xác nhận mật khẩu",
    googlePasswordNote: "Tài khoản Google này chưa có mật khẩu đăng nhập email.",
    emailPasswordNote: "Cập nhật mật khẩu dùng cho đăng nhập email.",
    atLeast6: "Ít nhất 6 ký tự",
    hasLetter: "Có chữ cái",
    hasNumberOrSymbol: "Có số hoặc ký tự đặc biệt",
    passwordsMatch: "Xác nhận khớp",
    active: "Hoạt động",
    inactive: "Không hoạt động",
    verified: "Đã xác minh",
    unverified: "Chưa xác minh",
    notProvided: "Chưa có dữ liệu",
    localEmail: "Email",
    google: "Google",
    balance: "Số dư",
    costPerScan: "Chi phí mỗi lượt quét",
    defaultCost: "Ước tính mặc định: 1 token / lượt quét",
    defaultCostHint: "Thiết lập backend có thể tính khác khi bật dynamic billing.",
    totalScans: "Tổng lượt quét",
    successfulScans: "Thành công",
    failedScans: "Thất bại",
    lastScan: "Lần quét gần nhất",
    tokensUsed: "Token đã dùng",
    noScans: "Chưa có lịch sử quét",
    noScansDesc: "Bắt đầu nhận diện tiền giấy để xem hoạt động tại đây.",
    noTransactions: "Chưa có giao dịch token",
    noTransactionsDesc: "Giao dịch mua token và xác nhận thanh toán sẽ hiển thị tại đây.",
    noFeedback: "Chưa có phản hồi",
    noFeedbackDesc: "Các phản hồi bạn gửi sẽ hiển thị tại đây.",
    totalFeedback: "Tổng phản hồi",
    pendingFeedback: "Đang chờ",
    resolvedFeedback: "Đã xử lý",
    accountId: "ID tài khoản",
    providerConnected: "Nhà cung cấp",
    session: "Phiên đăng nhập",
    sessionDesc: "Đăng xuất khỏi thiết bị này và xóa phiên cục bộ.",
    invalidName: "Vui lòng nhập họ và tên.",
    invalidPhone: "Vui lòng nhập số điện thoại hợp lệ.",
    invalidCountry: "Vui lòng chọn quốc gia.",
    invalidPassword: "Vui lòng hoàn tất các yêu cầu mật khẩu.",
    currentRequired: "Vui lòng nhập mật khẩu hiện tại.",
  },
};

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeProfile(raw) {
  if (!raw) return null;

  const provider = raw?.auth_provider || raw?.provider || "local";

  return {
    id: raw?.id || raw?._id || raw?.user_id || "N/A",
    full_name: raw?.full_name || raw?.name || raw?.username || "",
    email: raw?.email || "",
    phone: raw?.phone || raw?.phone_number || "",
    country: raw?.country || "Vietnam",
    avatar_url: raw?.avatar_url || raw?.avatar || "",
    preferences: raw?.preferences || {},
    role: raw?.role || "user",
    is_active: raw?.is_active !== false,
    status: raw?.status || (raw?.is_active === false ? "Inactive" : "Active"),
    auth_provider: provider,
    has_password:
      typeof raw?.has_password === "boolean"
        ? raw.has_password
        : typeof raw?.hasPassword === "boolean"
          ? raw.hasPassword
          : !String(provider).toLowerCase().includes("google"),
    email_verified:
      typeof raw?.email_verified === "boolean"
        ? raw.email_verified
        : typeof raw?.is_email_verified === "boolean"
          ? raw.is_email_verified
          : null,
    token_balance: raw?.token_balance ?? raw?.tokens ?? 0,
    created_at: raw?.created_at || raw?.createdAt || raw?.joined_at,
    updated_at: raw?.updated_at || raw?.updatedAt,
    last_login_at: raw?.last_login_at || raw?.lastLoginAt || raw?.last_login,
  };
}

function buildProfileForm(profile) {
  return {
    full_name: profile?.full_name || "",
    email: profile?.email || "",
    phone: profile?.phone || "",
    country: profile?.country || "Vietnam",
  };
}

function normalizePreferenceForm(raw = {}, fallback = {}) {
  const language = String(
    raw?.language || fallback.language || fallback.lang || "EN",
  ).toUpperCase();
  const theme = String(raw?.theme || fallback.theme || "light").toLowerCase();
  const defaultCountry =
    raw?.default_country ||
    fallback.default_country ||
    fallback.country ||
    "Vietnam";
  const defaultCurrency = String(
    raw?.default_currency || fallback.default_currency || "VND",
  ).toUpperCase();

  return {
    language: ["EN", "VI"].includes(language) ? language : "EN",
    theme: ["light", "dark", "system"].includes(theme) ? theme : "light",
    default_country: defaultCountry,
    default_currency: defaultCurrency,
  };
}

function updateAuthStoreUser(updatedProfile) {
  try {
    const state = useAuthStore.getState?.();
    if (!state?.user) return;

    useAuthStore.setState({
      user: {
        ...state.user,
        ...updatedProfile,
      },
    });
  } catch {
    // Keep the page usable if the persisted store is unavailable.
  }
}

function getDisplayName(profile) {
  return (
    profile?.full_name ||
    profile?.name ||
    profile?.username ||
    profile?.email?.split("@")[0] ||
    "User"
  );
}

function getInitial(profile) {
  return getDisplayName(profile).trim().charAt(0).toUpperCase() || "U";
}

function getProvider(profile) {
  return profile?.auth_provider || profile?.provider || "local";
}

function isGoogleUser(profile) {
  return String(getProvider(profile)).toLowerCase().includes("google");
}

function getHasPassword(profile) {
  if (!profile) return false;
  if (typeof profile?.has_password === "boolean") return profile.has_password;
  if (typeof profile?.hasPassword === "boolean") return profile.hasPassword;
  return !isGoogleUser(profile);
}

function formatDate(value, lang = "EN") {
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

function formatNumber(value, lang = "EN") {
  return new Intl.NumberFormat(lang === "VI" ? "vi-VN" : "en-US").format(
    Number(value || 0),
  );
}

function formatMoney(value, currency = "VND", lang = "EN") {
  const amount = Number(value || 0);
  const locale = lang === "VI" ? "vi-VN" : "en-US";

  if (currency === "VND") {
    return `${new Intl.NumberFormat("vi-VN").format(amount)} VND`;
  }

  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

function firstValue(...values) {
  return (
    values.find((value) => {
      if (value === null || value === undefined) return false;
      const textValue = String(value).trim();
      return textValue && textValue !== "N/A" && textValue !== "Unknown";
    }) || ""
  );
}

function getRecordPayload(record) {
  return record?.final_result || record?.data || record?.result || {};
}

function getRecordObjects(record) {
  const payload = getRecordPayload(record);
  const objects =
    payload?.detected_objects ||
    payload?.objects ||
    payload?.banknotes ||
    record?.detected_objects ||
    [];

  return Array.isArray(objects) ? objects : [];
}

function getRecordDenomination(record) {
  const payload = getRecordPayload(record);
  const objects = getRecordObjects(record);
  const firstObject = objects[0] || {};
  const firstFinal = firstObject?.final_result || firstObject?.summary || firstObject;

  return firstValue(
    payload?.denomination,
    payload?.menh_gia,
    payload?.value,
    firstFinal?.denomination,
    firstFinal?.menh_gia,
    firstFinal?.value,
  );
}

function getRecordCountry(record) {
  const payload = getRecordPayload(record);
  const objects = getRecordObjects(record);
  const firstObject = objects[0] || {};
  const firstFinal = firstObject?.final_result || firstObject?.summary || firstObject;

  return firstValue(
    payload?.country,
    payload?.quoc_gia,
    firstFinal?.country,
    firstFinal?.quoc_gia,
  );
}

function getRecordCurrency(record) {
  const payload = getRecordPayload(record);
  const objects = getRecordObjects(record);
  const firstObject = objects[0] || {};
  const firstFinal = firstObject?.final_result || firstObject?.summary || firstObject;

  return firstValue(
    payload?.currency,
    payload?.currency_code,
    payload?.ma_tien_te,
    firstFinal?.currency,
    firstFinal?.currency_code,
    firstFinal?.ma_tien_te,
  );
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isSuccessStatus(status) {
  const value = normalizeStatus(status);
  return (
    value === "success" ||
    value === "completed" ||
    value.includes("success") ||
    value.includes("complete") ||
    value.includes("high consensus")
  );
}

function isFailedStatus(status) {
  const value = normalizeStatus(status);
  return value === "failed" || value === "error" || value.includes("fail");
}

function isReviewStatus(status) {
  const value = normalizeStatus(status);
  return (
    !isSuccessStatus(value) &&
    !isFailedStatus(value) &&
    (value.includes("review") ||
      value.includes("conflict") ||
      value.includes("partial") ||
      value.includes("uncertain") ||
      value.includes("better"))
  );
}

function getStatusTone(status) {
  if (isSuccessStatus(status)) return "success";
  if (isFailedStatus(status)) return "danger";
  if (isReviewStatus(status)) return "warning";
  return "neutral";
}

function getStatusLabel(status, lang = "EN") {
  const value = normalizeStatus(status);

  if (isSuccessStatus(value)) return lang === "VI" ? "Thành công" : "Success";
  if (isFailedStatus(value)) return lang === "VI" ? "Thất bại" : "Failed";
  if (isReviewStatus(value)) return lang === "VI" ? "Cần xem lại" : "Needs Review";

  return status || "N/A";
}

function getTokenChargeFromRecord(record) {
  const values = [
    record?.system_tokens_charged,
    record?.token_usage?.system_tokens_charged,
    record?.token_usage?.tokens_charged,
    record?.tokens_used,
  ];

  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }

  return 0;
}

function buildScanStats(apiStats, history, tokenUsages) {
  if (apiStats) {
    return {
      total: Number(apiStats.total_scans || 0),
      success: Number(apiStats.successful_scans || 0),
      failed: Number(apiStats.failed_scans || 0),
      review: Number(apiStats.needs_review_scans || 0),
      lastScanAt: apiStats.last_scan_at || null,
      tokensUsed:
        apiStats.tokens_used === null || apiStats.tokens_used === undefined
          ? null
          : Number(apiStats.tokens_used || 0),
    };
  }

  const records = normalizeList(history);
  const usages = normalizeList(tokenUsages);
  const sortedRecords = [...records].sort(
    (a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0),
  );

  const usageTokens = usages.reduce((sum, item) => {
    const value = Number(item?.system_tokens_charged || 0);
    return value > 0 ? sum + value : sum;
  }, 0);

  const historyTokens = records.reduce(
    (sum, item) => sum + getTokenChargeFromRecord(item),
    0,
  );

  return {
    total: records.length,
    success: records.filter((item) => isSuccessStatus(item?.status)).length,
    failed: records.filter((item) => isFailedStatus(item?.status)).length,
    review: records.filter((item) => isReviewStatus(item?.status)).length,
    lastScanAt: sortedRecords[0]?.created_at || null,
    tokensUsed: usageTokens || historyTokens || null,
  };
}

function getPasswordChecks(form) {
  const password = form.new_password || "";
  const confirm = form.confirm_password || "";

  return [
    {
      key: "length",
      ok: password.length >= 6,
    },
    {
      key: "letter",
      ok: /[A-Za-zÀ-ỹ]/.test(password),
    },
    {
      key: "numberSymbol",
      ok: /[\d\W_]/.test(password),
    },
    {
      key: "match",
      ok: Boolean(confirm) && password === confirm,
    },
  ];
}

function validatePhone(value) {
  if (!value) return true;

  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 && /^[+\d\s().-]+$/.test(value);
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.detail ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const authStore = useAuthStore();
  const authUser = authStore?.user;
  const { lang, theme, setLang, setTheme } = useAppStore();
  const copy = text[lang || "EN"] || text.EN;
  const initialProfile = normalizeProfile(authUser);
  const initialPreferences = normalizePreferenceForm(initialProfile?.preferences, {
    language: lang,
    theme,
    country: initialProfile?.country,
  });

  const [profile, setProfile] = useState(initialProfile);
  const [form, setForm] = useState(() => buildProfileForm(initialProfile));
  const [preferences, setPreferences] = useState(initialPreferences);
  const [preferenceForm, setPreferenceForm] = useState(initialPreferences);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [showPassword, setShowPassword] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [profileStats, setProfileStats] = useState(null);
  const [profileConfig, setProfileConfig] = useState(DEFAULT_PROFILE_CONFIG);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [tokenUsages, setTokenUsages] = useState([]);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [loading, setLoading] = useState({
    profile: true,
    history: true,
    transactions: true,
    feedback: true,
    tokenUsage: true,
    config: true,
    preferences: true,
  });
  const [errors, setErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const hasPassword = getHasPassword(profile);
  const shouldSetPassword = Boolean(profile && !hasPassword);
  const isAdmin = String(profile?.role || "").toLowerCase() === "admin";
  const scanStats = useMemo(
    () => buildScanStats(profileStats, historyRecords, tokenUsages),
    [profileStats, historyRecords, tokenUsages],
  );
  const recentActivitySource = useMemo(() => {
    const aggregateRecent = normalizeList(profileStats?.recent_activity);
    return aggregateRecent.length > 0 ? aggregateRecent : historyRecords;
  }, [profileStats, historyRecords]);
  const recentActivity = useMemo(
    () =>
      [...recentActivitySource]
        .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0))
        .slice(0, 5),
    [recentActivitySource],
  );
  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);
  const feedbackSummary = useMemo(() => {
    const total = feedbacks.length;
    const resolved = feedbacks.filter(
      (item) =>
        item?.is_resolved ||
        ["resolved", "closed"].includes(String(item?.status || "").toLowerCase()),
    ).length;

    return {
      total,
      resolved,
      pending: Math.max(total - resolved, 0),
    };
  }, [feedbacks]);

  const isDirty = useMemo(() => {
    if (!profile) return false;

    return (
      form.full_name !== (profile.full_name || "") ||
      form.phone !== (profile.phone || "") ||
      form.country !== (profile.country || "Vietnam")
    );
  }, [form, profile]);

  const profileFormValid = useMemo(
    () =>
      Boolean(form.full_name.trim()) &&
      validatePhone(form.phone.trim()) &&
      Boolean(form.country),
    [form],
  );

  const preferencesDirty = useMemo(
    () =>
      preferenceForm.language !== preferences.language ||
      preferenceForm.theme !== preferences.theme ||
      preferenceForm.default_country !== preferences.default_country ||
      preferenceForm.default_currency !== preferences.default_currency,
    [preferenceForm, preferences],
  );

  const preferencesValid = useMemo(
    () =>
      Boolean(preferenceForm.language) &&
      Boolean(preferenceForm.theme) &&
      Boolean(preferenceForm.default_country) &&
      Boolean(preferenceForm.default_currency),
    [preferenceForm],
  );

  const passwordChecks = useMemo(
    () => getPasswordChecks(passwordForm),
    [passwordForm],
  );
  const passwordMeetsChecklist = passwordChecks.every((item) => item.ok);
  const passwordFormValid =
    passwordMeetsChecklist &&
    (shouldSetPassword || Boolean(passwordForm.current_password.trim()));

  const anyLoading = Object.values(loading).some(Boolean);
  const anyError = Object.values(errors).some(Boolean);

  const fetchProfileData = async () => {
    setLoading({
      profile: true,
      history: true,
      transactions: true,
      feedback: true,
      tokenUsage: true,
      config: true,
      preferences: true,
    });
    setErrors({});

    const [
      profileResult,
      statsResult,
      transactionResult,
      feedbackResult,
      usageResult,
      configResult,
      preferencesResult,
    ] =
      await Promise.allSettled([
        getMe(),
        getProfileStats(),
        getMyTransactions(5),
        getFeedbackHistory(),
        getMyTokenUsage(50),
        getProfileConfig(),
        getPreferences(),
      ]);

    const nextErrors = {};
    let profilePreferencePayload = {};
    let profileCountry = profile?.country || "Vietnam";

    if (profileResult.status === "fulfilled") {
      const normalized = normalizeProfile(profileResult.value);
      profilePreferencePayload = profileResult.value?.preferences || {};
      profileCountry = normalized?.country || profileCountry;

      setProfile(normalized);
      setForm(buildProfileForm(normalized));
      updateAuthStoreUser(normalized);
    } else {
      nextErrors.profile = getErrorMessage(profileResult.reason, copy.apiWarning);

      if (authUser) {
        const fallback = normalizeProfile(authUser);
        setProfile((current) => current || fallback);
        setForm((current) => ({
          ...current,
          ...buildProfileForm(fallback),
        }));
      }
    }

    if (statsResult.status === "fulfilled") {
      setProfileStats(statsResult.value);
      setHistoryRecords(normalizeList(statsResult.value?.recent_activity));
    } else {
      setProfileStats(null);

      try {
        const history = await getMyHistory();
        setHistoryRecords(normalizeList(history));
      } catch (error) {
        nextErrors.history = getErrorMessage(error, copy.apiWarning);
        setHistoryRecords([]);
      }
    }

    if (transactionResult.status === "fulfilled") {
      setTransactions(normalizeList(transactionResult.value));
    } else {
      nextErrors.transactions = getErrorMessage(
        transactionResult.reason,
        copy.apiWarning,
      );
      setTransactions([]);
    }

    if (feedbackResult.status === "fulfilled") {
      setFeedbacks(normalizeList(feedbackResult.value));
    } else {
      nextErrors.feedback = getErrorMessage(feedbackResult.reason, copy.apiWarning);
      setFeedbacks([]);
    }

    if (usageResult.status === "fulfilled") {
      setTokenUsages(normalizeList(usageResult.value));
    } else {
      setTokenUsages([]);
    }

    if (configResult.status === "fulfilled") {
      setProfileConfig({
        ...DEFAULT_PROFILE_CONFIG,
        ...(configResult.value || {}),
      });
    } else {
      setProfileConfig(DEFAULT_PROFILE_CONFIG);
    }

    const hasStoredPreferences =
      profilePreferencePayload &&
      Object.keys(profilePreferencePayload).length > 0;

    if (preferencesResult.status === "fulfilled") {
      const normalizedPreferences = normalizePreferenceForm(preferencesResult.value, {
        language: hasStoredPreferences ? preferencesResult.value?.language : lang,
        theme: hasStoredPreferences ? preferencesResult.value?.theme : theme,
        country: profileCountry,
      });

      setPreferences(normalizedPreferences);
      setPreferenceForm(normalizedPreferences);

      if (hasStoredPreferences) {
        setLang?.(normalizedPreferences.language);
        setTheme?.(normalizedPreferences.theme);
      }
    } else {
      const fallbackPreferences = normalizePreferenceForm(profilePreferencePayload, {
        language: lang,
        theme,
        country: profileCountry,
      });

      setPreferences(fallbackPreferences);
      setPreferenceForm(fallbackPreferences);
    }

    setErrors(nextErrors);
    setLoading({
      profile: false,
      history: false,
      transactions: false,
      feedback: false,
      tokenUsage: false,
      config: false,
      preferences: false,
    });
  };

  useEffect(() => {
    fetchProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const handleFormChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePasswordChange = (field, value) => {
    setPasswordForm((current) => ({ ...current, [field]: value }));
  };

  const handlePreferenceChange = (field, value) => {
    setPreferenceForm((current) => ({ ...current, [field]: value }));
  };

  const clearAvatarSelection = () => {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(null);
    setAvatarPreview("");
  };

  const handleAvatarSelect = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["jpg", "jpeg", "png", "webp"];

    if (!allowedExtensions.includes(extension || "")) {
      toast.error(copy.avatarInvalidType);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(copy.avatarTooLarge);
      return;
    }

    clearAvatarSelection();
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) return;

    setUploadingAvatar(true);

    try {
      const updated = await uploadAvatar(avatarFile);
      const normalized = normalizeProfile({
        ...(profile || {}),
        ...updated,
      });

      setProfile(normalized);
      setForm(buildProfileForm(normalized));
      updateAuthStoreUser(normalized);
      clearAvatarSelection();
      toast.success(copy.avatarSaved);
    } catch (error) {
      toast.error(getErrorMessage(error, copy.avatarFailed));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const validateProfileForm = () => {
    if (!form.full_name.trim()) {
      toast.error(copy.invalidName);
      return false;
    }

    if (!validatePhone(form.phone.trim())) {
      toast.error(copy.invalidPhone);
      return false;
    }

    if (!form.country) {
      toast.error(copy.invalidCountry);
      return false;
    }

    return true;
  };

  const validatePasswordForm = () => {
    if (!shouldSetPassword && !passwordForm.current_password.trim()) {
      toast.error(copy.currentRequired);
      return false;
    }

    if (!passwordMeetsChecklist) {
      toast.error(copy.invalidPassword);
      return false;
    }

    return true;
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (!validateProfileForm() || !profile) return;

    setSavingProfile(true);

    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        country: form.country,
      };
      const updated = await updateMe(payload);
      const normalized = normalizeProfile({
        ...profile,
        ...updated,
        ...payload,
      });

      setProfile(normalized);
      setForm(buildProfileForm(normalized));
      updateAuthStoreUser(normalized);
      toast.success(copy.saved);
    } catch (error) {
      toast.error(getErrorMessage(error, copy.saveFailed));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (event) => {
    event.preventDefault();
    if (!validatePasswordForm()) return;

    setSavingPassword(true);

    try {
      if (shouldSetPassword) {
        await setPassword({
          new_password: passwordForm.new_password,
        });
      } else {
        await changePassword({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        });
      }

      const updatedProfile = { ...profile, has_password: true };
      setProfile(updatedProfile);
      updateAuthStoreUser(updatedProfile);
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      toast.success(copy.passwordSaved);
    } catch (error) {
      toast.error(getErrorMessage(error, copy.passwordFailed));
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePreferences = async (event) => {
    event.preventDefault();

    if (!preferencesValid) {
      toast.error(copy.preferencesFailed);
      return;
    }

    setSavingPreferences(true);

    try {
      const updated = await updatePreferences(preferenceForm);
      const normalized = normalizePreferenceForm(updated, preferenceForm);

      setPreferences(normalized);
      setPreferenceForm(normalized);
      setProfile((current) =>
        current
          ? {
              ...current,
              preferences: normalized,
            }
          : current,
      );
      setLang?.(normalized.language);
      setTheme?.(normalized.theme);
      updateAuthStoreUser({
        ...(profile || {}),
        preferences: normalized,
      });
      toast.success(copy.preferencesSaved);
    } catch (error) {
      toast.error(getErrorMessage(error, copy.preferencesFailed));
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await logoutSession();
    } finally {
      authStore?.logout?.();
      setLoggingOut(false);
      navigate("/auth/login");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              BanknoteAI
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
              {copy.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {copy.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <ActionButton
                icon={LayoutDashboard}
                label={copy.adminDashboard}
                onClick={() => navigate("/admin/dashboard")}
                variant="dark"
              />
            )}
            <ActionButton
              icon={MessageSquare}
              label={copy.myFeedback}
              onClick={() => navigate("/feedback", { state: { tab: "history" } })}
            />
            <ActionButton
              icon={RefreshCw}
              label={anyLoading ? copy.refreshing : copy.refresh}
              loading={anyLoading}
              onClick={fetchProfileData}
            />
          </div>
        </header>

        {anyError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">{copy.apiWarning}</p>
                <p className="mt-1">{copy.apiWarningDesc}</p>
              </div>
            </div>
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="space-y-6 xl:col-span-4">
            <ProfileSummaryCard
              avatarFile={avatarFile}
              avatarPreview={avatarPreview}
              copy={copy}
              isAdmin={isAdmin}
              loading={loading.profile && !profile}
              lang={lang}
              onAdmin={() => navigate("/admin/dashboard")}
              onAvatarCancel={clearAvatarSelection}
              onAvatarSelect={handleAvatarSelect}
              onAvatarUpload={handleUploadAvatar}
              profile={profile}
              uploadingAvatar={uploadingAvatar}
            />
            <TokenBalanceCard
              copy={copy}
              lang={lang}
              loading={loading.profile && !profile}
              onBuy={() => navigate("/pricing")}
              profile={profile}
              profileConfig={profileConfig}
              transactions={recentTransactions}
            />
            <QuickActionsCard
              copy={copy}
              isAdmin={isAdmin}
              onAdmin={() => navigate("/admin/dashboard")}
              onBuy={() => navigate("/pricing")}
              onFeedback={() => navigate("/feedback", { state: { tab: "history" } })}
              onHistory={() => navigate("/history")}
              onScan={() => navigate("/recognize")}
            />
          </div>

          <div className="space-y-6 xl:col-span-8">
            <PersonalInformationCard
              copy={copy}
              form={form}
              isDirty={isDirty}
              isValid={profileFormValid}
              loading={loading.profile && !profile}
              onChange={handleFormChange}
              onSubmit={handleSaveProfile}
              saving={savingProfile}
            />

            <PreferencesCard
              copy={copy}
              form={preferenceForm}
              isDirty={preferencesDirty}
              isValid={preferencesValid}
              loading={loading.preferences}
              onChange={handlePreferenceChange}
              onSubmit={handleSavePreferences}
              saving={savingPreferences}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ScanStatisticsCard
                copy={copy}
                lang={lang}
                loading={loading.history || loading.tokenUsage}
                onHistory={() => navigate("/history")}
                stats={scanStats}
              />
              <FeedbackOverviewCard
                copy={copy}
                loading={loading.feedback}
                onFeedback={() => navigate("/feedback", { state: { tab: "history" } })}
                summary={feedbackSummary}
              />
            </div>

            <RecentActivityCard
              copy={copy}
              lang={lang}
              loading={loading.history}
              onHistory={() => navigate("/history")}
              records={recentActivity}
            />

            <AccountSecurityCard
              copy={copy}
              form={passwordForm}
              lang={lang}
              loading={loading.profile && !profile}
              loggingOut={loggingOut}
              onChange={handlePasswordChange}
              onLogout={handleLogout}
              onSubmit={handleSavePassword}
              onToggle={(field) =>
                setShowPassword((current) => ({
                  ...current,
                  [field]: !current[field],
                }))
              }
              passwordChecks={passwordChecks}
              passwordFormValid={passwordFormValid}
              profile={profile}
              saving={savingPassword}
              shouldSetPassword={shouldSetPassword}
              showPassword={showPassword}
            />

            <TokenPaymentActivityCard
              copy={copy}
              lang={lang}
              loading={loading.transactions}
              onBuy={() => navigate("/pricing")}
              onTransactions={() => navigate("/transactions")}
              transactions={recentTransactions}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProfileSummaryCard({
  avatarFile,
  avatarPreview,
  copy,
  isAdmin,
  lang,
  loading,
  onAdmin,
  onAvatarCancel,
  onAvatarSelect,
  onAvatarUpload,
  profile,
  uploadingAvatar,
}) {
  if (loading) {
    return <CardSkeleton rows={5} />;
  }

  const provider = isGoogleUser(profile) ? copy.google : copy.localEmail;
  const active = profile?.is_active !== false;
  const avatarUrl = avatarPreview || profile?.avatar_url;
  const emailStatus =
    profile?.email_verified === null
      ? copy.notProvided
      : profile?.email_verified
        ? copy.verified
        : copy.unverified;

  return (
    <SectionCard
      title={copy.profileSummary}
      icon={User}
      action={
        isAdmin ? (
          <button
            type="button"
            onClick={onAdmin}
            className={`inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 ${buttonFocus}`}
          >
            <LayoutDashboard className="h-4 w-4" />
            {copy.adminDashboard}
          </button>
        ) : null
      }
    >
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${getDisplayName(profile)} avatar`}
              className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-sm dark:border-slate-900"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-slate-900 via-cyan-800 to-emerald-700 text-4xl font-bold text-white shadow-sm dark:border-slate-900">
              {getInitial(profile)}
            </div>
          )}
          <span
            className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${
              active ? "bg-emerald-500" : "bg-slate-400"
            }`}
            aria-label={active ? copy.active : copy.inactive}
          />
        </div>

        <h2 className="mt-4 text-xl font-bold text-slate-950 dark:text-white">
          {getDisplayName(profile)}
        </h2>
        <p className="mt-1 max-w-full truncate text-sm text-slate-500 dark:text-slate-400">
          {profile?.email || "N/A"}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <input
            id="profile-avatar-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onAvatarSelect}
          />
          <label
            htmlFor="profile-avatar-file"
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 ${buttonFocus}`}
          >
            <Camera className="h-4 w-4" />
            {copy.changeAvatar}
          </label>

          {avatarFile && (
            <>
              <button
                type="button"
                onClick={onAvatarUpload}
                disabled={uploadingAvatar}
                className={`inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 ${buttonFocus}`}
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadingAvatar ? copy.uploadingAvatar : copy.uploadAvatar}
              </button>
              <button
                type="button"
                onClick={onAvatarCancel}
                disabled={uploadingAvatar}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-slate-800 dark:hover:text-white ${buttonFocus}`}
              >
                {copy.cancelAvatar}
              </button>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {copy.avatarHint}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <StatusBadge tone="neutral">{String(profile?.role || "user").toUpperCase()}</StatusBadge>
          <StatusBadge tone={active ? "success" : "neutral"}>
            {active ? copy.active : copy.inactive}
          </StatusBadge>
          <StatusBadge tone={isGoogleUser(profile) ? "info" : "neutral"}>
            {provider}
          </StatusBadge>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:grid-cols-2">
        <InfoTile icon={CalendarDays} label={copy.createdAt} value={formatDate(profile?.created_at, lang)} />
        <InfoTile icon={Clock} label={copy.lastLogin} value={formatDate(profile?.last_login_at, lang)} />
        <InfoTile icon={Mail} label={copy.emailStatus} value={emailStatus} />
        <InfoTile icon={BadgeCheck} label={copy.accountId} value={profile?.id || "N/A"} />
      </div>
    </SectionCard>
  );
}

function PersonalInformationCard({
  copy,
  form,
  isDirty,
  isValid,
  loading,
  onChange,
  onSubmit,
  saving,
}) {
  if (loading) {
    return <CardSkeleton rows={4} />;
  }

  return (
    <SectionCard title={copy.personalInfo} icon={FileText}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField icon={User} id="profile-full-name" label={copy.fullName}>
            <input
              id="profile-full-name"
              value={form.full_name}
              onChange={(event) => onChange("full_name", event.target.value)}
              className={inputClass}
              autoComplete="name"
            />
          </FormField>

          <FormField
            hint={copy.readonly}
            icon={Mail}
            id="profile-email"
            label={copy.email}
          >
            <input
              id="profile-email"
              value={form.email}
              disabled
              className={inputClass}
              autoComplete="email"
            />
          </FormField>

          <FormField icon={Phone} id="profile-phone" label={copy.phone}>
            <input
              id="profile-phone"
              value={form.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              className={inputClass}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+84 901 234 567"
            />
          </FormField>

          <FormField icon={Globe2} id="profile-country" label={copy.country}>
            <select
              id="profile-country"
              value={form.country}
              onChange={(event) => onChange("country", event.target.value)}
              className={inputClass}
            >
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isDirty ? copy.save : copy.saved}
          </p>
          <button
            type="submit"
            disabled={saving || !isDirty || !isValid}
            className={`inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 ${buttonFocus}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? copy.saving : copy.save}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function PreferencesCard({
  copy,
  form,
  isDirty,
  isValid,
  loading,
  onChange,
  onSubmit,
  saving,
}) {
  if (loading) {
    return <CardSkeleton rows={3} />;
  }

  return (
    <SectionCard title={copy.preferences} icon={Palette}>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField icon={Globe2} id="profile-language" label={copy.language}>
            <select
              id="profile-language"
              value={form.language}
              onChange={(event) => onChange("language", event.target.value)}
              className={inputClass}
            >
              <option value="EN">English</option>
              <option value="VI">Tiếng Việt</option>
            </select>
          </FormField>

          <FormField icon={Palette} id="profile-theme" label={copy.theme}>
            <select
              id="profile-theme"
              value={form.theme}
              onChange={(event) => onChange("theme", event.target.value)}
              className={inputClass}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </FormField>

          <FormField
            icon={Globe2}
            id="profile-default-country"
            label={copy.defaultCountry}
          >
            <select
              id="profile-default-country"
              value={form.default_country}
              onChange={(event) => onChange("default_country", event.target.value)}
              className={inputClass}
            >
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            icon={CreditCard}
            id="profile-default-currency"
            label={copy.defaultCurrency}
          >
            <select
              id="profile-default-currency"
              value={form.default_currency}
              onChange={(event) => onChange("default_currency", event.target.value)}
              className={inputClass}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-5 dark:border-slate-800">
          <button
            type="submit"
            disabled={saving || !isDirty || !isValid}
            className={`inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 ${buttonFocus}`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? copy.saving : copy.savePreferences}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function TokenBalanceCard({
  copy,
  lang,
  loading,
  onBuy,
  profile,
  profileConfig,
  transactions,
}) {
  if (loading) {
    return <CardSkeleton rows={3} />;
  }

  const scanCost = Number(profileConfig?.token_cost_per_scan ?? 1);
  const successfulTransactions = transactions.filter((item) =>
    ["success", "completed", "paid"].includes(String(item?.status || "").toLowerCase()),
  );

  return (
    <SectionCard title={copy.tokenBalance} icon={Coins}>
      <div className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white dark:border-slate-700">
        <p className="text-sm font-medium text-slate-300">{copy.balance}</p>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-4xl font-bold">
            {formatNumber(profile?.token_balance, lang)}
          </span>
          <span className="pb-1 text-sm font-semibold text-slate-300">tokens</span>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          {copy.costPerScan}: {scanCost} {scanCost === 1 ? "token" : "tokens"} / scan
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {profileConfig?.billing_note || copy.defaultCostHint}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <InfoTile
          icon={CreditCard}
          label={copy.tokenActivity}
          value={formatNumber(transactions.length, lang)}
        />
        <InfoTile
          icon={CheckCircle2}
          label="Confirmed"
          value={formatNumber(successfulTransactions.length, lang)}
        />
      </div>

      <button
        type="button"
        onClick={onBuy}
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 ${buttonFocus}`}
      >
        <Wallet className="h-4 w-4" />
        {copy.buyTokens}
      </button>
    </SectionCard>
  );
}

function ScanStatisticsCard({ copy, lang, loading, onHistory, stats }) {
  return (
    <SectionCard
      title={copy.scanStats}
      icon={ScanLine}
      action={
        <TextButton icon={History} label={copy.viewHistory} onClick={onHistory} />
      }
    >
      {loading ? (
        <MiniSkeleton />
      ) : stats.total === 0 ? (
        <EmptyState
          icon={ScanLine}
          title={copy.noScans}
          description={copy.noScansDesc}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label={copy.totalScans} value={formatNumber(stats.total, lang)} />
          <StatCard label={copy.successfulScans} value={formatNumber(stats.success, lang)} tone="success" />
          <StatCard label={copy.failedScans} value={formatNumber(stats.failed, lang)} tone="danger" />
          <StatCard
            label={copy.tokensUsed}
            value={stats.tokensUsed === null ? "N/A" : formatNumber(stats.tokensUsed, lang)}
          />
          <div className="col-span-2">
            <InfoTile
              icon={Clock}
              label={copy.lastScan}
              value={formatDate(stats.lastScanAt, lang)}
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function RecentActivityCard({ copy, lang, loading, onHistory, records }) {
  return (
    <SectionCard
      title={copy.recentActivity}
      icon={Activity}
      action={<TextButton icon={ArrowRight} label={copy.viewAll} onClick={onHistory} />}
    >
      {loading ? (
        <MiniSkeleton rows={5} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title={copy.noScans}
          description={copy.noScansDesc}
        />
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {records.map((record, index) => {
            const denomination = getRecordDenomination(record);
            const currency = getRecordCurrency(record);
            const country = getRecordCountry(record);
            const title = firstValue(
              [denomination, currency].filter(Boolean).join(" "),
              country,
              "Banknote scan",
            );

            return (
              <button
                key={record?.id || record?._id || index}
                type="button"
                onClick={onHistory}
                className={`flex w-full items-center justify-between gap-4 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/60 ${buttonFocus}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                    {title}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {[country, formatDate(record?.created_at, lang)]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                </div>
                <StatusBadge tone={getStatusTone(record?.status)}>
                  {getStatusLabel(record?.status, lang)}
                </StatusBadge>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function AccountSecurityCard({
  copy,
  form,
  lang,
  loading,
  loggingOut,
  onChange,
  onLogout,
  onSubmit,
  onToggle,
  passwordChecks,
  passwordFormValid,
  profile,
  saving,
  shouldSetPassword,
  showPassword,
}) {
  if (loading) {
    return <CardSkeleton rows={6} />;
  }

  const provider = isGoogleUser(profile) ? copy.google : copy.localEmail;
  const passwordTitle = shouldSetPassword ? copy.setPassword : copy.changePassword;
  const passwordNote = shouldSetPassword ? copy.googlePasswordNote : copy.emailPasswordNote;
  const passwordLabels = {
    length: copy.atLeast6,
    letter: copy.hasLetter,
    numberSymbol: copy.hasNumberOrSymbol,
    match: copy.passwordsMatch,
  };

  return (
    <SectionCard title={copy.accountSecurity} icon={ShieldCheck}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <InfoTile icon={ShieldCheck} label={copy.authType} value={provider} />
        <InfoTile
          icon={Lock}
          label={copy.password}
          value={getHasPassword(profile) ? copy.changePassword : copy.setPassword}
        />
        <InfoTile
          icon={CalendarDays}
          label={copy.lastLogin}
          value={formatDate(profile?.last_login_at, lang)}
        />
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-white p-2 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              {passwordTitle}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {passwordNote}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {!shouldSetPassword && (
            <PasswordInput
              id="current-password"
              label={copy.currentPassword}
              value={form.current_password}
              visible={showPassword.current}
              onToggle={() => onToggle("current")}
              onChange={(value) => onChange("current_password", value)}
            />
          )}
          <PasswordInput
            id="new-password"
            label={copy.newPassword}
            value={form.new_password}
            visible={showPassword.next}
            onToggle={() => onToggle("next")}
            onChange={(value) => onChange("new_password", value)}
          />
          <PasswordInput
            id="confirm-password"
            label={copy.confirmPassword}
            value={form.confirm_password}
            visible={showPassword.confirm}
            onToggle={() => onToggle("confirm")}
            onChange={(value) => onChange("confirm_password", value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {passwordChecks.map((item) => (
            <div
              key={item.key}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                item.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              }`}
            >
              {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              {passwordLabels[item.key]}
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className={`inline-flex items-center justify-center gap-2 rounded-md border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-950/30 ${buttonFocus}`}
          >
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {loggingOut ? copy.loggingOut : copy.logout}
          </button>

          <button
            type="submit"
            disabled={saving || !passwordFormValid}
            className={`inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 ${buttonFocus}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {saving ? copy.saving : passwordTitle}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}

function TokenPaymentActivityCard({
  copy,
  lang,
  loading,
  onBuy,
  onTransactions,
  transactions,
}) {
  return (
    <SectionCard
      title={copy.tokenActivity}
      icon={CreditCard}
      action={<TextButton icon={ArrowRight} label={copy.viewAll} onClick={onTransactions} />}
    >
      {loading ? (
        <MiniSkeleton rows={4} />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={copy.noTransactions}
          description={copy.noTransactionsDesc}
          actionLabel={copy.buyTokens}
          onAction={onBuy}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-4">Package</th>
                <th className="py-3 pr-4">Tokens</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((item, index) => (
                <tr
                  key={item?.id || item?._id || item?.transaction_id || index}
                  className="border-b border-slate-50 dark:border-slate-800/70"
                >
                  <td className="py-3 pr-4 font-medium text-slate-950 dark:text-white">
                    {item?.package_name || item?.payment_gateway || item?.gateway || "Token recharge"}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-emerald-700 dark:text-emerald-300">
                    +{formatNumber(item?.tokens_added || item?.tokens || 0, lang)}
                  </td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                    {formatMoney(item?.amount, item?.currency || "VND", lang)}
                  </td>
                  <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">
                    {formatDate(item?.paid_at || item?.created_at, lang)}
                  </td>
                  <td className="py-3 text-right">
                    <StatusBadge tone={getStatusTone(item?.status)}>
                      {getStatusLabel(item?.status, lang)}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function FeedbackOverviewCard({ copy, loading, onFeedback, summary }) {
  return (
    <SectionCard
      title={copy.feedbackOverview}
      icon={MessageSquare}
      action={<TextButton icon={ArrowRight} label={copy.myFeedback} onClick={onFeedback} />}
    >
      {loading ? (
        <MiniSkeleton />
      ) : summary.total === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={copy.noFeedback}
          description={copy.noFeedbackDesc}
          actionLabel={copy.myFeedback}
          onAction={onFeedback}
        />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={copy.totalFeedback} value={summary.total} />
          <StatCard label={copy.pendingFeedback} value={summary.pending} tone="warning" />
          <StatCard label={copy.resolvedFeedback} value={summary.resolved} tone="success" />
        </div>
      )}
    </SectionCard>
  );
}

function QuickActionsCard({ copy, isAdmin, onAdmin, onBuy, onFeedback, onHistory, onScan }) {
  const actions = [
    { icon: ScanLine, label: copy.startScan, onClick: onScan },
    { icon: History, label: copy.viewHistory, onClick: onHistory },
    { icon: Coins, label: copy.buyTokens, onClick: onBuy },
    { icon: MessageSquare, label: copy.myFeedback, onClick: onFeedback },
  ];

  if (isAdmin) {
    actions.push({
      icon: LayoutDashboard,
      label: copy.adminDashboard,
      onClick: onAdmin,
    });
  }

  return (
    <SectionCard title={copy.quickActions} icon={Activity}>
      <div className="grid grid-cols-1 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900 ${buttonFocus}`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                {action.label}
              </span>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

function SectionCard({ action, children, icon: Icon, title }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <h2 className="truncate text-base font-bold text-slate-950 dark:text-white">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ActionButton({ icon: Icon, label, loading = false, onClick, variant = "light" }) {
  const variantClass =
    variant === "dark"
      ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${buttonFocus}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

function TextButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white ${buttonFocus}`}
    >
      {label}
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function FormField({ children, hint, icon: Icon, id, label }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          {Icon && <Icon className="h-4 w-4 text-slate-400" />}
          {label}
        </label>
        {hint && (
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PasswordInput({ id, label, onChange, onToggle, value, visible }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-semibold text-slate-700 dark:text-slate-200"
      >
        {label}
      </label>
      <div className="relative mt-2">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} pr-10`}
          autoComplete={id === "current-password" ? "current-password" : "new-password"}
        />
        <button
          type="button"
          onClick={onToggle}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white ${buttonFocus}`}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-slate-950 dark:text-white">
        {value || "N/A"}
      </p>
    </div>
  );
}

function StatCard({ label, tone = "neutral", value }) {
  const toneClass = {
    neutral: "text-slate-950 dark:text-white",
    success: "text-emerald-700 dark:text-emerald-300",
    danger: "text-rose-700 dark:text-rose-300",
    warning: "text-amber-700 dark:text-amber-300",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ children, tone = "neutral" }) {
  const toneClass = {
    neutral:
      "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    danger:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
    warning:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    info:
      "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300",
  }[tone];

  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${toneClass}`}
    >
      {tone === "success" && <CheckCircle2 className="h-3.5 w-3.5" />}
      {tone === "danger" && <XCircle className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

function EmptyState({ actionLabel, description, icon: Icon, onAction, title }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-950">
      <Icon className="mx-auto h-8 w-8 text-slate-400" />
      <p className="mt-3 font-semibold text-slate-950 dark:text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`mt-4 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 ${buttonFocus}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function CardSkeleton({ rows = 4 }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
      <MiniSkeleton rows={rows} />
    </section>
  );
}

function MiniSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}
