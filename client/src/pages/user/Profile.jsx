import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  User,
  Mail,
  Phone,
  Globe2,
  ShieldCheck,
  Coins,
  Clock,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  Loader2,
  RefreshCw,
  LogOut,
  CreditCard,
  History,
  ScanLine,
  AlertCircle,
  CheckCircle2,
  BadgeCheck,
  Lock,
  MessageSquare,
  LayoutDashboard,
} from "lucide-react";

import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import {
  getMe,
  updateMe,
  setPassword,
  changePassword,
  getMyTransactions,
  getMyScanStats,
  logoutSession,
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
  return getDisplayName(profile).charAt(0).toUpperCase();
}

function getProvider(profile) {
  return profile?.auth_provider || profile?.provider || "local";
}

function isGoogleUser(profile) {
  return String(getProvider(profile)).toLowerCase().includes("google");
}

function getHasPassword(profile) {
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

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeProfile(raw) {
  return {
    id: raw?.id || raw?._id || raw?.user_id || "N/A",
    full_name: raw?.full_name || raw?.name || raw?.username || "",
    email: raw?.email || "",
    phone: raw?.phone || raw?.phone_number || "",
    country: raw?.country || "Vietnam",
    avatar_url: raw?.avatar_url || raw?.avatar || "",
    role: raw?.role || "user",
    status: raw?.status || (raw?.is_active === false ? "Inactive" : "Active"),
    auth_provider: raw?.auth_provider || raw?.provider || "local",
    has_password:
      typeof raw?.has_password === "boolean"
        ? raw.has_password
        : typeof raw?.hasPassword === "boolean"
          ? raw.hasPassword
          : !String(raw?.auth_provider || raw?.provider || "local")
              .toLowerCase()
              .includes("google"),
    email_verified: Boolean(raw?.email_verified || raw?.is_email_verified),
    token_balance: raw?.token_balance ?? raw?.tokens ?? 0,
    created_at: raw?.created_at || raw?.createdAt || raw?.joined_at,
    last_login_at: raw?.last_login_at || raw?.lastLoginAt || raw?.last_login,
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
    // ignore
  }
}

export default function Profile() {
  const navigate = useNavigate();
  const authStore = useAuthStore();
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const authUser = authStore?.user;
  const [profile, setProfile] = useState(null);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    country: "Vietnam",
  });

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

  const [transactions, setTransactions] = useState([]);
  const [scanStats, setScanStats] = useState(null);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const t = {
    EN: {
      title: "Personal Profile",
      subtitle: "Manage your account information, security, and token balance.",
      refresh: "Refresh",
      feedback: "My Feedback",
      adminDashboard: "Admin Dashboard",
      errorApi: "Profile API Error",
      errorApiDesc:
        "Displaying cached data. Some actions may not work until the API is restored.",
      toastUpdateSuccess: "Profile updated successfully.",
      toastUpdateFail: "Unable to update profile.",
      toastSetPassSuccess:
        "Password set successfully. You can now log in using email.",
      toastChangePassSuccess: "Password changed successfully.",
      toastPassFail: "Unable to update password.",
      valName: "Please enter your full name.",
      valPhone: "Invalid phone number.",
      valCountry: "Please select a country.",
      valCurrentPass: "Please enter your current password.",
      valNewPass: "New password must be at least 6 characters.",
      valConfirmPass: "Password confirmation does not match.",
      loadingFailed: "Failed to load profile",
      btnRetry: "Try again",
      sessionMgmt: "Session Management",
      sessionDesc: "Sign out of this device and clear your local session.",
      logout: "Log out",
      loggingOut: "Logging out...",
    },
    VI: {
      title: "Hồ Sơ Cá Nhân",
      subtitle: "Quản lý thông tin tài khoản, bảo mật và số dư token của bạn.",
      refresh: "Làm mới",
      feedback: "Phản hồi của tôi",
      adminDashboard: "Trang quản trị",
      errorApi: "API hồ sơ đang gặp lỗi",
      errorApiDesc:
        "Đang hiển thị dữ liệu tạm. Một số thao tác có thể không hoạt động.",
      toastUpdateSuccess: "Đã cập nhật thông tin thành công.",
      toastUpdateFail: "Không thể cập nhật thông tin.",
      toastSetPassSuccess: "Đã đặt mật khẩu. Bạn có thể đăng nhập bằng email.",
      toastChangePassSuccess: "Đã đổi mật khẩu thành công.",
      toastPassFail: "Không thể cập nhật mật khẩu.",
      valName: "Vui lòng nhập họ và tên.",
      valPhone: "Số điện thoại không hợp lệ.",
      valCountry: "Vui lòng chọn quốc gia.",
      valCurrentPass: "Vui lòng nhập mật khẩu hiện tại.",
      valNewPass: "Mật khẩu mới phải có ít nhất 6 ký tự.",
      valConfirmPass: "Xác nhận mật khẩu không khớp.",
      loadingFailed: "Không thể tải hồ sơ",
      btnRetry: "Thử lại",
      sessionMgmt: "Quản lý phiên đăng nhập",
      sessionDesc: "Đăng xuất khỏi thiết bị này và xóa phiên cục bộ.",
      logout: "Đăng xuất",
      loggingOut: "Đang đăng xuất...",
    },
  };

  const text = t[lang || "EN"] || t.EN;
  const hasPassword = getHasPassword(profile);
  const shouldSetPassword = profile && !hasPassword;

  const isDirty = useMemo(() => {
    if (!profile) return false;
    return (
      form.full_name !== (profile.full_name || "") ||
      form.phone !== (profile.phone || "") ||
      form.country !== (profile.country || "Vietnam")
    );
  }, [form, profile]);

  const fetchProfile = async () => {
    setLoadingProfile(true);
    setProfileError("");

    try {
      const [meData, txData, statsData] = await Promise.all([
        getMe(),
        getMyTransactions(5),
        getMyScanStats(),
      ]);

      const normalized = normalizeProfile(meData);

      setProfile(normalized);
      setForm({
        full_name: normalized.full_name || "",
        email: normalized.email || "",
        phone: normalized.phone || "",
        country: normalized.country || "Vietnam",
      });

      setTransactions(normalizeList(txData));
      setScanStats(statsData);
      updateAuthStoreUser(normalized);
    } catch (error) {
      const message =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        text.loadingFailed;

      setProfileError(message);

      if (authUser) {
        const fallback = normalizeProfile(authUser);

        setProfile(fallback);
        setForm({
          full_name: fallback.full_name || "",
          email: fallback.email || "",
          phone: fallback.phone || "",
          country: fallback.country || "Vietnam",
        });
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field, value) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateProfileForm = () => {
    if (!form.full_name.trim()) {
      toast.error(text.valName);
      return false;
    }

    if (form.phone && form.phone.trim().length < 8) {
      toast.error(text.valPhone);
      return false;
    }

    if (!form.country) {
      toast.error(text.valCountry);
      return false;
    }

    return true;
  };

  const validatePasswordForm = () => {
    if (!shouldSetPassword && !passwordForm.current_password.trim()) {
      toast.error(text.valCurrentPass);
      return false;
    }

    if (!passwordForm.new_password || passwordForm.new_password.length < 6) {
      toast.error(text.valNewPass);
      return false;
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error(text.valConfirmPass);
      return false;
    }

    return true;
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!validateProfileForm()) return;

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
      updateAuthStoreUser(normalized);
      toast.success(text.toastUpdateSuccess);
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          text.toastUpdateFail,
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;

    setSavingPassword(true);

    try {
      if (shouldSetPassword) {
        await setPassword({
          new_password: passwordForm.new_password,
          confirm_password: passwordForm.confirm_password,
        });

        const updatedProfile = { ...profile, has_password: true };
        setProfile(updatedProfile);
        updateAuthStoreUser(updatedProfile);
        toast.success(text.toastSetPassSuccess);
      } else {
        await changePassword({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
          confirm_password: passwordForm.confirm_password,
        });

        toast.success(text.toastChangePassSuccess);
      }

      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          text.toastPassFail,
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await logoutSession();
    } finally {
      if (typeof authStore?.logout === "function") {
        authStore.logout();
      } else {
        useAuthStore.setState?.({
          user: null,
          token: null,
          accessToken: null,
          isAuthenticated: false,
        });
        localStorage.removeItem("token");
        localStorage.removeItem("access_token");
      }

      setLoggingOut(false);
      navigate("/login");
    }
  };

  if (loadingProfile) return <ProfileSkeleton />;

  if (profileError && !profile) {
    return (
      <div
        className={`min-h-screen p-6 md:p-10 transition-colors duration-300 ${
          isDark ? "bg-slate-950" : "bg-slate-50"
        }`}
      >
        <div className="max-w-5xl mx-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 shadow-sm text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
              <AlertCircle size={28} />
            </div>

            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50">
              {text.loadingFailed}
            </h1>

            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {profileError}
            </p>

            <button
              onClick={fetchProfile}
              className="mt-6 px-5 py-3 rounded-xl bg-slate-900 dark:bg-teal-600 text-white font-bold hover:bg-slate-800 dark:hover:bg-teal-500 transition-colors"
            >
              {text.btnRetry}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const initial = getInitial(profile);
  const isAdmin = String(profile?.role || "").toLowerCase() === "admin";

  return (
    <div
      className={`min-h-screen p-4 md:p-8 pb-20 transition-colors duration-300 ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">{text.title}</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              {text.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => navigate("/admin/dashboard")}
                className="w-fit inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 shadow-sm transition-colors"
              >
                <LayoutDashboard size={16} />
                {text.adminDashboard}
              </button>
            )}

            <button
              onClick={() => navigate("/feedback", { state: { tab: "history" } })}
              className="w-fit inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 hover:bg-teal-100 dark:hover:bg-teal-500/20 shadow-sm transition-colors"
            >
              <MessageSquare size={16} />
              {text.feedback}
            </button>

            <button
              onClick={fetchProfile}
              className="w-fit inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors"
            >
              <RefreshCw size={16} />
              {text.refresh}
            </button>
          </div>
        </div>

        {profileError && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-400 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">{text.errorApi}</p>
              <p className="text-sm mt-1">{text.errorApiDesc}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <ProfileSummaryCard profile={profile} initial={initial} lang={lang} />
            <TokenCard
              tokenBalance={profile?.token_balance}
              onBuy={() => navigate("/pricing")}
              lang={lang}
            />
            <AccountDetailsCard profile={profile} lang={lang} />
          </div>

          <div className="lg:col-span-8 space-y-6">
            <PersonalInfoCard
              form={form}
              saving={savingProfile}
              isDirty={isDirty}
              onChange={handleFormChange}
              onSubmit={handleSaveProfile}
              lang={lang}
            />

            <PasswordCard
              profile={profile}
              shouldSetPassword={shouldSetPassword}
              form={passwordForm}
              showPassword={showPassword}
              saving={savingPassword}
              onChange={handlePasswordChange}
              onToggle={(field) =>
                setShowPassword((prev) => ({ ...prev, [field]: !prev[field] }))
              }
              onSubmit={handleSavePassword}
              lang={lang}
            />

            <ScanSummaryCard
              stats={scanStats}
              onHistory={() => navigate("/history")}
              onWorkspace={() => navigate("/recognize")}
              lang={lang}
            />

            <TokenActivityCard transactions={transactions} lang={lang} />
            <SessionCard loggingOut={loggingOut} onLogout={handleLogout} t={text} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSummaryCard({ profile, initial, lang }) {
  const isVI = lang === "VI";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm transition-colors">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Avatar"
              className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-slate-900 shadow-md transition-colors"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400 flex items-center justify-center text-4xl font-black border-4 border-white dark:border-slate-900 shadow-md transition-colors">
              {initial}
            </div>
          )}

          <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full transition-colors" />
        </div>

        <h2 className="mt-4 text-xl font-black text-slate-900 dark:text-slate-50">
          {getDisplayName(profile)}
        </h2>

        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {profile?.email}
        </p>

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <Badge>{String(profile?.role || "User").toUpperCase()}</Badge>
          <Badge tone="success">{isVI ? "HOẠT ĐỘNG" : "ACTIVE"}</Badge>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4 transition-colors">
        <SmallDetail
          label={isVI ? "Ngày tham gia" : "Joined"}
          value={formatDate(profile?.created_at, lang)}
        />

        <SmallDetail
          label={isVI ? "Xác thực" : "Auth Type"}
          value={isGoogleUser(profile) ? "Google OAuth" : "Email"}
        />

        <SmallDetail
          label="Email"
          value={
            profile?.email_verified
              ? isVI
                ? "Đã xác thực"
                : "Verified"
              : isVI
                ? "Chưa xác thực"
                : "Unverified"
          }
        />

        <SmallDetail
          label={isVI ? "Lần đăng nhập" : "Last Login"}
          value={formatDate(profile?.last_login_at, lang)}
        />
      </div>
    </div>
  );
}

function TokenCard({ tokenBalance, onBuy, lang }) {
  const isVI = lang === "VI";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-black text-slate-900 dark:text-slate-50">
            {isVI ? "Số dư Token" : "Token Balance"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isVI ? "Chi phí: 1 token / ảnh" : "Cost: 1 token / scan"}
          </p>
        </div>

        <div className="w-11 h-11 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center transition-colors">
          <Coins size={22} />
        </div>
      </div>

      <div className="mt-5 flex items-end gap-2">
        <span className="text-4xl font-black text-slate-900 dark:text-slate-50">
          {formatNumber(tokenBalance, lang)}
        </span>
        <span className="text-sm font-bold text-slate-400 dark:text-slate-500 mb-1">
          Tokens
        </span>
      </div>

      <button
        onClick={onBuy}
        className="mt-6 w-full py-3 rounded-xl bg-slate-900 dark:bg-teal-600 text-white font-bold hover:bg-slate-800 dark:hover:bg-teal-500 transition"
      >
        {isVI ? "Mua thêm Tokens" : "Buy Tokens"}
      </button>
    </div>
  );
}

function AccountDetailsCard({ profile, lang }) {
  const isVI = lang === "VI";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm transition-colors">
      <h3 className="font-black text-slate-900 dark:text-slate-50 mb-5">
        {isVI ? "Thông tin tài khoản" : "Account Details"}
      </h3>

      <div className="space-y-3">
        <DetailRow icon={<User size={17} />} label="Account ID" value={profile?.id} />
        <DetailRow icon={<ShieldCheck size={17} />} label={isVI ? "Vai trò" : "Role"} value={profile?.role} />
        <DetailRow icon={<BadgeCheck size={17} />} label={isVI ? "Trạng thái" : "Status"} value={profile?.status || "Active"} />
        <DetailRow
          icon={<Lock size={17} />}
          label={isVI ? "Mật khẩu" : "Password"}
          value={
            getHasPassword(profile)
              ? isVI
                ? "Đã thiết lập"
                : "Set"
              : isVI
                ? "Chưa thiết lập"
                : "Not Set"
          }
        />
      </div>
    </div>
  );
}

function PersonalInfoCard({ form, saving, isDirty, onChange, onSubmit, lang }) {
  const isVI = lang === "VI";

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-7 shadow-sm transition-colors"
    >
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">
          {isVI ? "Thông tin cá nhân" : "Personal Information"}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {isVI
            ? "Cập nhật tên, số điện thoại và quốc gia của bạn."
            : "Update your name, phone number, and location."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField label={isVI ? "Họ và tên" : "Full Name"} icon={<User size={17} />}>
          <input
            value={form.full_name}
            onChange={(e) => onChange("full_name", e.target.value)}
            className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 outline-none focus:border-teal-500 transition-colors"
            placeholder={isVI ? "Nhập họ và tên" : "Enter your full name"}
          />
        </FormField>

        <FormField label={isVI ? "Email (không thể đổi)" : "Email (cannot be changed)"} icon={<Mail size={17} />}>
          <input
            value={form.email}
            disabled
            className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 text-slate-500 dark:text-slate-400 cursor-not-allowed transition-colors"
          />
        </FormField>

        <FormField label={isVI ? "Số điện thoại" : "Phone Number"} icon={<Phone size={17} />}>
          <input
            value={form.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 outline-none focus:border-teal-500 transition-colors"
            placeholder="+84 901234567"
          />
        </FormField>

        <FormField label={isVI ? "Quốc gia" : "Country"} icon={<Globe2 size={17} />}>
          <select
            value={form.country}
            onChange={(e) => onChange("country", e.target.value)}
            className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 outline-none focus:border-teal-500 transition-colors"
          >
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex justify-end transition-colors">
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving
            ? isVI
              ? "Đang lưu..."
              : "Saving..."
            : isVI
              ? "Lưu thông tin"
              : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function PasswordCard({
  shouldSetPassword,
  form,
  showPassword,
  saving,
  onChange,
  onToggle,
  onSubmit,
  lang,
}) {
  const isVI = lang === "VI";

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-7 shadow-sm transition-colors"
    >
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center transition-colors">
          <KeyRound size={20} />
        </div>

        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">
            {shouldSetPassword
              ? isVI
                ? "Đặt mật khẩu đăng nhập"
                : "Set Login Password"
              : isVI
                ? "Đổi mật khẩu"
                : "Change Password"}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {shouldSetPassword
              ? isVI
                ? "Tài khoản Google có thể đặt thêm mật khẩu để đăng nhập bằng email."
                : "Google accounts can set a password for direct email login."
              : isVI
                ? "Cập nhật mật khẩu đăng nhập email của bạn."
                : "Update your email login password."}
          </p>
        </div>
      </div>

      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 space-y-4 transition-colors">
        {!shouldSetPassword && (
          <PasswordInput
            label={isVI ? "Mật khẩu hiện tại" : "Current Password"}
            value={form.current_password}
            visible={showPassword.current}
            onToggle={() => onToggle("current")}
            onChange={(value) => onChange("current_password", value)}
            placeholder={isVI ? "Nhập mật khẩu hiện tại" : "Enter current password"}
          />
        )}

        <PasswordInput
          label={isVI ? "Mật khẩu mới" : "New Password"}
          value={form.new_password}
          visible={showPassword.next}
          onToggle={() => onToggle("next")}
          onChange={(value) => onChange("new_password", value)}
          placeholder={isVI ? "Tối thiểu 6 ký tự" : "At least 6 characters"}
        />

        <PasswordInput
          label={isVI ? "Xác nhận mật khẩu" : "Confirm Password"}
          value={form.confirm_password}
          visible={showPassword.confirm}
          onToggle={() => onToggle("confirm")}
          onChange={(value) => onChange("confirm_password", value)}
          placeholder={isVI ? "Nhập lại mật khẩu mới" : "Re-enter new password"}
        />

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
            {saving
              ? isVI
                ? "Đang xử lý..."
                : "Processing..."
              : shouldSetPassword
                ? isVI
                  ? "Đặt mật khẩu"
                  : "Set Password"
                : isVI
                  ? "Đổi mật khẩu"
                  : "Change Password"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ScanSummaryCard({ stats, onHistory, onWorkspace, lang }) {
  const isVI = lang === "VI";
  const hasStats = Boolean(stats);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-7 shadow-sm transition-colors">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">
            {isVI ? "Tổng quan quét" : "Scan Overview"}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isVI
              ? "Thống kê nhận diện tiền của tài khoản."
              : "Banknote recognition statistics for your account."}
          </p>
        </div>

        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl flex items-center justify-center transition-colors">
          <ScanLine size={20} />
        </div>
      </div>

      {hasStats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label={isVI ? "Tổng lượt quét" : "Total Scans"} value={stats.total_scans || 0} />
          <StatBox label={isVI ? "Hoàn tất" : "Completed"} value={stats.completed || 0} />
          <StatBox label={isVI ? "Cần xem lại" : "Needs Review"} value={stats.needs_review || 0} />
          <StatBox label={isVI ? "Lần cuối" : "Last Scan"} value={formatDate(stats.last_scan_at, lang)} />
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 text-center transition-colors">
          <p className="font-bold text-slate-900 dark:text-slate-100">
            {isVI ? "Chưa có thống kê quét" : "No Scan Data Yet"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isVI
              ? "Khi bạn quét tiền, thống kê sẽ hiển thị tại đây."
              : "Your scan statistics will appear here."}
          </p>
          <button
            onClick={onWorkspace}
            className="mt-4 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-teal-600 text-white font-bold hover:bg-slate-800 dark:hover:bg-teal-500 transition-colors"
          >
            {isVI ? "Vào trang nhận diện" : "Go to Scanner"}
          </button>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          onClick={onHistory}
          className="inline-flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
        >
          {isVI ? "Xem lịch sử" : "View History"}
          <History size={16} />
        </button>
      </div>
    </div>
  );
}

function TokenActivityCard({ transactions, lang }) {
  const isVI = lang === "VI";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-7 shadow-sm transition-colors">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl flex items-center justify-center transition-colors">
          <CreditCard size={20} />
        </div>

        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-50">
            {isVI ? "Giao dịch token gần đây" : "Recent Token Transactions"}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isVI
              ? "Lịch sử nạp và sử dụng token."
              : "History of token purchases and usage."}
          </p>
        </div>
      </div>

      {!transactions || transactions.length === 0 ? (
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl p-8 text-center transition-colors">
          <Clock className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={36} />
          <p className="font-bold text-slate-900 dark:text-slate-100">
            {isVI ? "Chưa có giao dịch token" : "No Token Transactions Yet"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isVI
              ? "Giao dịch nạp token sẽ hiển thị tại đây."
              : "Your transaction history will appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 pr-4">{isVI ? "Ngày" : "Date"}</th>
                <th className="py-3 pr-4">{isVI ? "Loại" : "Method"}</th>
                <th className="py-3 pr-4">Token</th>
                <th className="py-3 pr-4">{isVI ? "Trạng thái" : "Status"}</th>
              </tr>
            </thead>

            <tbody>
              {transactions.map((item, index) => (
                <tr
                  key={item.id || item._id || index}
                  className="border-b border-slate-50 dark:border-slate-800/50"
                >
                  <td className="py-4 pr-4">{formatDate(item.created_at, lang)}</td>
                  <td className="py-4 pr-4 font-semibold text-slate-900 dark:text-slate-100 uppercase">
                    {item.payment_gateway || item.gateway || "Recharge"}
                  </td>
                  <td className="py-4 pr-4 font-bold text-teal-700 dark:text-teal-400">
                    +{item.tokens_added || item.tokens || 0}
                  </td>
                  <td className="py-4 pr-4">
                    <Badge tone="success">{item.status || "Paid"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SessionCard({ loggingOut, onLogout, t }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-900/50 rounded-3xl p-6 md:p-7 shadow-sm transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h2 className="text-xl font-black text-rose-600 dark:text-rose-400">
            {t.sessionMgmt}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t.sessionDesc}
          </p>
        </div>

        <button
          onClick={onLogout}
          disabled={loggingOut}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 transition-colors"
        >
          {loggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
          {loggingOut ? t.loggingOut : t.logout}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, icon, children }) {
  return (
    <label className="block">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 transition-colors">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        {label}
      </div>
      {children}
    </label>
  );
}

function PasswordInput({ label, value, visible, onToggle, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-300 transition-colors">
        {label}
      </span>

      <div className="relative mt-2">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 pr-12 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-50 dark:focus:ring-teal-900/20 transition-colors"
          placeholder={placeholder}
        />

        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}

function Badge({ children, tone = "default" }) {
  const base =
    "px-2.5 py-1 rounded-lg border text-[11px] font-bold tracking-wider uppercase flex items-center gap-1 w-fit transition-colors";
  const tones = {
    default:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    success:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50",
  };

  return (
    <span className={`${base} ${tones[tone] || tones.default}`}>
      {tone === "success" && <CheckCircle2 size={13} />}
      {children}
    </span>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-2xl p-4 transition-colors">
      <p className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold">
        {label}
      </p>
      <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-2">
        {value}
      </p>
    </div>
  );
}

function SmallDetail({ label, value }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-2xl p-4 transition-colors">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
        {label}
      </p>
      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
        {value}
      </p>
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {icon}
        <span className="text-sm font-bold">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
        {value || "N/A"}
      </span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen p-4 md:p-8 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-24 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <div className="h-80 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            <div className="h-52 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          </div>
          <div className="lg:col-span-8 space-y-6">
            <div className="h-96 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
            <div className="h-80 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
