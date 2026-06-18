import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MailCheck,
  RefreshCw,
} from "lucide-react";

import { authService } from "../../services/authService";
import { normalizeError } from "../../services/api";
import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";

const copy = {
  EN: {
    loadingTitle: "Verifying your email",
    loadingDesc: "Please wait while BanknoteAI confirms your verification link.",
    successTitle: "Email verified successfully",
    successDesc:
      "Your account email status has been updated. You can continue using BanknoteAI.",
    invalidTitle: "Verification link is invalid",
    invalidDesc:
      "This link may be missing, expired, or already used. You can request a new verification email from your profile.",
    retry: "Try again",
    goProfile: "Go to Profile",
    goLogin: "Back to Login",
  },
  VI: {
    loadingTitle: "Dang xac minh email",
    loadingDesc: "Vui long doi trong khi BanknoteAI kiem tra lien ket xac minh.",
    successTitle: "Email da duoc xac minh",
    successDesc:
      "Trang thai email cua tai khoan da duoc cap nhat. Ban co the tiep tuc su dung BanknoteAI.",
    invalidTitle: "Lien ket xac minh khong hop le",
    invalidDesc:
      "Lien ket co the bi thieu, het han hoac da duoc su dung. Ban co the gui lai email xac minh tu trang Profile.",
    retry: "Thu lai",
    goProfile: "Ve Profile",
    goLogin: "Ve Login",
  },
};

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const { lang, resolvedTheme, theme } = useAppStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const labels = copy[lang || "EN"] || copy.EN;
  const isDark = (resolvedTheme || theme) === "dark";
  const token = useMemo(
    () => String(searchParams.get("token") || "").trim(),
    [searchParams],
  );

  const [status, setStatus] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : labels.invalidDesc);

  const verifyEmail = async () => {
    if (!token) {
      setStatus("error");
      setMessage(labels.invalidDesc);
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const result = await authService.verifyEmail(token);
      setStatus("success");
      setMessage(result?.message || labels.successDesc);

      if (isAuthenticated && typeof syncProfile === "function") {
        await syncProfile();
      }
    } catch (error) {
      setStatus("error");
      setMessage(normalizeError(error, labels.invalidDesc));
    }
  };

  useEffect(() => {
    verifyEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const destination = isAuthenticated ? "/profile" : "/auth/login";
  const destinationLabel = isAuthenticated ? labels.goProfile : labels.goLogin;
  const Icon = isLoading ? Loader2 : isSuccess ? CheckCircle2 : AlertCircle;

  const iconClass = isLoading
    ? "text-[#009688]"
    : isSuccess
      ? "text-emerald-500"
      : "text-amber-500";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 text-center">
      <div
        className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border shadow-sm ${
          isDark
            ? "border-slate-700 bg-slate-800"
            : "border-slate-200 bg-slate-50"
        }`}
      >
        {isLoading ? (
          <Icon className={`h-8 w-8 animate-spin ${iconClass}`} />
        ) : (
          <Icon className={`h-8 w-8 ${iconClass}`} />
        )}
      </div>

      <div className="mb-6">
        <div className="mb-3 flex justify-center">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              isDark
                ? "bg-slate-800 text-slate-300"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            <MailCheck className="h-3.5 w-3.5" />
            BanknoteAI
          </span>
        </div>
        <h2
          className={`text-3xl font-bold tracking-tight ${
            isDark ? "text-white" : "text-slate-900"
          }`}
        >
          {isLoading
            ? labels.loadingTitle
            : isSuccess
              ? labels.successTitle
              : labels.invalidTitle}
        </h2>
        <p
          className={`mt-3 text-sm leading-6 ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          {message ||
            (isLoading
              ? labels.loadingDesc
              : isSuccess
                ? labels.successDesc
                : labels.invalidDesc)}
        </p>
      </div>

      <div className="space-y-3">
        {!isLoading && (
          <Link
            to={destination}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#009688] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-[#009688] focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            {destinationLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        {status === "error" && token && (
          <button
            type="button"
            onClick={verifyEmail}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3.5 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              isDark
                ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            {labels.retry}
          </button>
        )}
      </div>
    </div>
  );
}
