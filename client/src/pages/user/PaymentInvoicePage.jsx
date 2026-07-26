import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Copy,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  Info,
  Clock,
  AlertTriangle,
  Landmark,
  QrCode,
  Coins,
  Hash,
  CheckCheck,
  Receipt,
} from "lucide-react";
import toast from "react-hot-toast";

import { getPaymentStatus } from "../../services/paymentService";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";

const STORAGE_KEY = "banknoteai_pending_checkout";

function isPaidStatus(status) {
  return ["success", "completed", "paid", "credited"].includes(
    String(status || "").toLowerCase(),
  );
}

function isFailedStatus(status) {
  return ["failed", "cancelled", "canceled"].includes(
    String(status || "").toLowerCase(),
  );
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("vi-VN").format(Number(value || 0))} đ`;
}

export default function PaymentInvoicePage({ variant = "sepay" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pollRef = useRef(null);

  const { syncProfile } = useAuthStore();
  const { lang } = useAppStore();

  const isSepay = variant === "sepay";
  const isBankTransfer = variant === "bank_transfer";
  const isVI = lang === "VI";

  const savedInvoice = React.useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const initialInvoice =
    location.state?.invoice || location.state?.transaction || savedInvoice?.invoice || null;

  const transactionId =
    initialInvoice?.transaction_id ||
    initialInvoice?.id ||
    initialInvoice?._id ||
    initialInvoice?.transaction?.id ||
    location.state?.transaction_id ||
    savedInvoice?.transaction_id ||
    null;

  const [invoice, setInvoice] = useState(initialInvoice);
  const [paymentStatus, setPaymentStatus] = useState(initialInvoice?.status || "pending");
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [error, setError] = useState("");
  const [confirmedByUser, setConfirmedByUser] = useState(false);

  const completed = isPaidStatus(paymentStatus);
  const failed = isFailedStatus(paymentStatus);

  useEffect(() => {
    if (!invoice || !transactionId) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        invoice,
        transaction_id: transactionId,
        saved_at: new Date().toISOString(),
      }),
    );
  }, [invoice, transactionId]);

  useEffect(() => {
    if (!invoice && !transactionId) {
      navigate("/pricing");
    }
  }, [invoice, transactionId, navigate]);

  const handleCopy = async (text, label) => {
    if (!text) return;
    await navigator.clipboard.writeText(String(text));
    toast.success(
      isVI ? `Đã sao chép ${label || "thông tin"}!` : `Copied ${label || "info"}!`,
    );
  };

  const checkStatus = async (silent = false) => {
    if (!transactionId || completed || failed) return;

    if (!silent) setIsChecking(true);
    setError("");

    try {
      const data = await getPaymentStatus(transactionId);
      const nextStatus =
        data?.status || data?.transaction?.status || data?.data?.status || "pending";

      setPaymentStatus(nextStatus);
      setLastCheckedAt(new Date());

      if (data?.invoice || data?.transaction) {
        setInvoice((prev) => ({ ...prev, ...(data.invoice || data.transaction) }));
      }

      if (isPaidStatus(nextStatus)) {
        if (pollRef.current) clearInterval(pollRef.current);
        localStorage.removeItem(STORAGE_KEY);

        try {
          await syncProfile?.();
        } catch {
          // ignore
        }

        toast.success(
          isVI
            ? "Thanh toán thành công! Token đã được cộng vào tài khoản."
            : "Payment confirmed! Tokens have been added to your account.",
        );
      }
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        (isVI ? "Không thể kiểm tra trạng thái thanh toán." : "Unable to check payment status.");

      setError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setIsChecking(false);
    }
  };

  // Auto-poll for status (bank_transfer: slower interval since it needs admin review)
  useEffect(() => {
    if (!transactionId || completed || failed) return;

    checkStatus(true);
    // Bank transfer needs admin review — poll every 30s instead of 5s to reduce noise.
    // SePay can poll more aggressively (automated).
    const interval = isBankTransfer ? 30000 : 5000;
    pollRef.current = setInterval(() => checkStatus(true), interval);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, completed, failed]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const amountRaw = invoice?.amount || invoice?.total_due || 0;
  const amountText = formatMoney(amountRaw);
  const transferContent =
    invoice?.transfer_content || invoice?.content || "";
  const transactionCode =
    invoice?.transaction_code || invoice?.checkout_code || invoice?.code || transferContent || "";
  const bankName = invoice?.bank_name || invoice?.bank_id || "";
  const bankAccount =
    invoice?.bank_account || invoice?.bank_account_number || invoice?.account_number || "";
  const accountName = invoice?.account_name || "";
  const packageName = invoice?.package_name || invoice?.package?.name || "";
  const tokensIncluded =
    invoice?.tokens_included || invoice?.tokens || invoice?.package?.tokens_included || 0;
  const qrUrl = invoice?.qr_url || invoice?.qr_code_url || "";

  // ── Empty / loading state ────────────────────────────────────────────────
  if (!invoice) return null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4 sm:px-6 font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate("/pricing")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white font-semibold mb-6 transition-colors"
        >
          <ArrowLeft size={18} />
          {isVI ? "Quay lại bảng giá" : "Back to Pricing"}
        </button>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-3 rounded-xl ${isSepay ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"} transition-colors`}>
            {isSepay ? <QrCode size={24} /> : <Landmark size={24} />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {isSepay
                ? (isVI ? "Thanh toán bằng VietQR" : "Pay with VietQR")
                : (isVI ? "Thanh toán chuyển khoản" : "Bank Transfer Checkout")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isSepay
                ? (isVI ? "Quét mã QR bằng ứng dụng ngân hàng. Hệ thống tự động xác nhận." : "Scan the QR code with your banking app. Confirmed automatically.")
                : (isVI
                    ? "Chuyển khoản đúng số tiền và nội dung. Token được cộng sau khi admin xác nhận."
                    : "Transfer the exact amount and reference. Tokens are added after admin confirmation.")}
            </p>
          </div>
        </div>

        {/* ── Admin confirm alert (bank_transfer only) ── */}
        {isBankTransfer && !completed && (
          <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 p-4 flex items-start gap-3 shadow-sm">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <p className="font-bold mb-0.5">
                {isVI ? "Xác nhận thủ công bởi Admin" : "Manual Admin Confirmation Required"}
              </p>
              <p>
                {isVI
                  ? "Token sẽ được cộng sau khi admin xác nhận giao dịch của bạn. Thời gian xử lý thường trong vòng 1–24 giờ trong ngày làm việc."
                  : "Tokens will be credited after an admin reviews and confirms your transfer. Processing typically takes 1–24 hours on business days."}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-4 text-sm flex gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Completed */}
        {completed && (
          <div className="mb-6 rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 p-4 flex items-center gap-3 shadow-sm">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold text-base">
              {isVI
                ? "Thanh toán đã được xác nhận thành công. Token đã được cộng vào tài khoản."
                : "Payment confirmed. Tokens have been credited to your account."}
            </span>
          </div>
        )}

        {/* Failed */}
        {failed && (
          <div className="mb-6 rounded-2xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 p-4 flex items-center gap-3 shadow-sm">
            <AlertTriangle className="w-6 h-6 shrink-0 text-red-600 dark:text-red-400" />
            <span className="font-semibold text-base">
              {isVI ? "Hóa đơn đã thất bại hoặc bị hủy." : "This invoice has failed or been cancelled."}
            </span>
          </div>
        )}

        {/* ── Package summary strip ── */}
        {(packageName || tokensIncluded > 0) && (
          <div className="mb-6 rounded-2xl bg-indigo-600 dark:bg-indigo-700 text-white p-5 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <Coins size={20} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-70">
                  {isVI ? "Gói đã chọn" : "Selected Package"}
                </p>
                <p className="font-bold text-base">
                  {packageName || (isVI ? "Gói token" : "Token Package")}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold uppercase tracking-wider opacity-70">
                {isVI ? "Token nhận được" : "Tokens"}
              </p>
              <p className="text-2xl font-black">
                {Number(tokensIncluded).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* ── Main card: QR + Transfer details ── */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col md:flex-row transition-colors">

          {/* Left column: QR / status visual */}
          <div className="w-full md:w-5/12 bg-slate-50 dark:bg-slate-800/50 p-8 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative overflow-hidden transition-colors">
            <h2 className="text-lg font-bold mb-6 text-center text-slate-800 dark:text-slate-200">
              {isVI ? "Mã QR chuyển khoản" : "Transfer QR Code"}
            </h2>

            {/* QR display — shown for both sepay and bank_transfer if qr_url exists */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 inline-block mb-8 transition-colors">
              {qrUrl ? (
                <img
                  src={qrUrl}
                  alt="VietQR Code"
                  className="w-56 h-56 object-contain rounded-xl"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextSibling.style.display = "flex";
                  }}
                />
              ) : null}
              {/* Fallback — shown when no qr_url, or when img fails to load */}
              <div
                className="w-56 h-56 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 transition-colors"
                style={{ display: qrUrl ? "none" : "flex" }}
              >
                <Landmark size={40} className="mb-3 opacity-40" />
                <span className="text-sm font-semibold text-center leading-relaxed px-4">
                  {isVI
                    ? "Vui lòng chuyển khoản theo thông tin bên cạnh"
                    : "Transfer manually using the details on the right"}
                </span>
              </div>
            </div>

            {/* Status badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold shadow-sm ${
              completed
                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                : failed
                  ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
            } transition-colors`}>
              {completed ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : failed ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4 animate-pulse" />
              )}
              {completed
                ? (isVI ? "Đã xác nhận" : "Confirmed")
                : failed
                  ? (isVI ? "Thất bại" : "Failed")
                  : isBankTransfer
                    ? (isVI ? "Chờ xác nhận admin" : "Awaiting admin review")
                    : (isVI ? "Đang chờ thanh toán" : "Awaiting payment")}
            </div>

            {/* Polling indicator */}
            {!completed && !failed && (
              <p className="mt-5 text-xs text-slate-500 dark:text-slate-400 font-medium text-center flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
                {isBankTransfer
                  ? (isVI ? "Tự cập nhật sau khi admin xác nhận..." : "Auto-updates after admin confirms...")
                  : (isVI ? "Đang kiểm tra giao dịch mỗi 5 giây..." : "Checking every 5 seconds...")}
              </p>
            )}
          </div>

          {/* Right column: Transfer details */}
          <div className="w-full md:w-7/12 p-8 md:p-10 bg-white dark:bg-slate-900 transition-colors">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center justify-between">
              {isVI ? "Thông tin chuyển khoản" : "Transfer Details"}
              {isBankTransfer && (
                <span className="text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-md uppercase tracking-wider border border-emerald-100 dark:border-emerald-800/50 transition-colors">
                  {isVI ? "Chuyển khoản" : "Bank Transfer"}
                </span>
              )}
            </h3>

            <div className="space-y-4 mb-8">
              {/* Amount — prominent */}
              <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 flex justify-between items-center transition-colors">
                <div>
                  <p className="text-xs font-bold text-indigo-400 dark:text-indigo-400 uppercase tracking-wider mb-1">
                    {isVI ? "Số tiền" : "Amount"}
                  </p>
                  <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                    {amountText}
                  </p>
                </div>
                <button
                  onClick={() => handleCopy(String(amountRaw), isVI ? "số tiền" : "amount")}
                  title={isVI ? "Sao chép số tiền" : "Copy amount"}
                  className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm flex items-center justify-center hover:bg-indigo-600 dark:hover:bg-indigo-500 hover:text-white transition-colors border border-indigo-100 dark:border-indigo-800/50"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              {/* Bank + Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem
                  label={isVI ? "Ngân hàng" : "Bank"}
                  value={bankName || "N/A"}
                  onCopy={() => handleCopy(bankName, isVI ? "ngân hàng" : "bank name")}
                />
                <InfoItem
                  label={isVI ? "Số tài khoản" : "Account No."}
                  value={bankAccount || "N/A"}
                  onCopy={() => handleCopy(bankAccount, isVI ? "số tài khoản" : "account number")}
                  mono
                />
              </div>

              {/* Account holder */}
              <InfoItem
                label={isVI ? "Chủ tài khoản" : "Account Holder"}
                value={accountName || "N/A"}
                onCopy={() => handleCopy(accountName, isVI ? "tên chủ tài khoản" : "account holder")}
              />

              {/* Transaction code */}
              {transactionCode && (
                <InfoItem
                  label={isVI ? "Mã giao dịch" : "Transaction Code"}
                  value={transactionCode}
                  onCopy={() => handleCopy(transactionCode, isVI ? "mã giao dịch" : "transaction code")}
                  mono
                  icon={<Hash size={14} />}
                />
              )}

              {/* Transfer content — highlighted */}
              <div className="p-5 rounded-2xl bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 transition-colors">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  {isVI ? "Nội dung chuyển khoản (Bắt buộc)" : "Transfer Reference (Required)"}
                </p>
                <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-amber-100 dark:border-amber-800/40 shadow-sm transition-colors">
                  <p className="font-mono font-bold text-lg text-amber-700 dark:text-amber-300 break-all">
                    {transferContent || transactionCode || "N/A"}
                  </p>
                  <button
                    onClick={() => handleCopy(transferContent || transactionCode, isVI ? "nội dung chuyển khoản" : "transfer reference")}
                    title={isVI ? "Sao chép nội dung" : "Copy reference"}
                    className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center hover:bg-amber-600 dark:hover:bg-amber-500 hover:text-white transition-colors shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-3 font-medium flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {isBankTransfer
                    ? (isVI
                        ? "Vui lòng ghi chính xác nội dung này. Giao dịch sẽ được admin đối soát và xác nhận thủ công."
                        : "Enter this reference exactly. Your transaction will be reviewed and confirmed manually by an admin.")
                    : (isVI
                        ? "Giữ nguyên nội dung chuyển khoản này để hệ thống có thể tự động xác nhận giao dịch."
                        : "Keep this reference unchanged for automatic confirmation.")}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {/* "Tôi đã chuyển khoản" — bank_transfer only, does NOT credit tokens */}
              {isBankTransfer && !completed && !failed && (
                <>
                  {!confirmedByUser ? (
                    <button
                      onClick={() => setConfirmedByUser(true)}
                      className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 transition-colors shadow-sm active:scale-95"
                    >
                      <CheckCheck className="w-4 h-4" />
                      {isVI ? "Tôi đã chuyển khoản" : "I've Completed the Transfer"}
                    </button>
                  ) : (
                    <div className="w-full py-4 px-5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 text-sm transition-colors">
                      <p className="font-bold flex items-center gap-2 mb-1">
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                        {isVI ? "Cảm ơn bạn!" : "Thank you!"}
                      </p>
                      <p className="opacity-80">
                        {isVI
                          ? "Vui lòng chờ admin xác nhận giao dịch. Token sẽ được cộng sau khi xác nhận. Bạn có thể xem lịch sử giao dịch bên dưới."
                          : "Please wait for an admin to confirm your transfer. Tokens will be credited once confirmed. You can track status in Transaction History."}
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => checkStatus(false)}
                  disabled={isChecking || completed || failed}
                  className="flex-1 py-3.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
                  {isVI ? "Làm mới trạng thái" : "Refresh Status"}
                </button>

                <button
                  onClick={() => navigate("/transactions")}
                  className="flex-1 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {isVI ? "Xem lịch sử giao dịch" : "Transaction History"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── How-to guide ── */}
        <div className="mt-8 bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
          <h4 className="font-bold text-slate-900 dark:text-white mb-6 text-lg flex items-center gap-2">
            <Receipt size={20} className="text-slate-400 dark:text-slate-500" />
            {isVI ? "Hướng dẫn thanh toán" : "How to Pay"}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black flex items-center justify-center mb-3 transition-colors">
                1
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                {isVI ? "Mở app ngân hàng" : "Open your banking app"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isVI
                  ? "Mở ứng dụng Mobile Banking trên điện thoại của bạn."
                  : "Open your Mobile Banking app on your phone."}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black flex items-center justify-center mb-3 transition-colors">
                2
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                {isSepay
                  ? (isVI ? "Quét mã QR" : "Scan QR code")
                  : (isVI ? "Nhập thông tin chuyển khoản" : "Enter transfer details")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSepay
                  ? (isVI ? "Dùng tính năng quét QR để tự động điền thông tin." : "Use the QR scan feature to auto-fill details.")
                  : (isVI
                      ? "Nhập STK, Ngân hàng và sao chép chính xác Số tiền và Nội dung."
                      : "Enter account number, bank, exact amount and transfer reference.")}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black flex items-center justify-center mb-3 transition-colors">
                3
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                {isVI ? "Chờ xác nhận" : "Wait for confirmation"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isBankTransfer
                  ? (isVI
                      ? "Admin sẽ xem xét và xác nhận giao dịch. Token được cộng sau khi xác nhận."
                      : "An admin will review and confirm your transfer. Tokens are credited after confirmation.")
                  : (isVI
                      ? "Kiểm tra lại số tiền và nội dung trước khi bấm xác nhận chuyển."
                      : "Verify amount and reference before confirming the transfer.")}
              </p>
            </div>
          </div>
        </div>

        {/* Last checked timestamp */}
        {lastCheckedAt && (
          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-6 transition-colors">
            {isVI ? "Kiểm tra lần cuối:" : "Last checked:"}{" "}
            {new Intl.DateTimeFormat(isVI ? "vi-VN" : "en-US", {
              timeStyle: "medium",
            }).format(lastCheckedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value, onCopy, mono = false, icon }) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 shadow-sm flex items-center justify-between group hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
      <div className="overflow-hidden min-w-0">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
          {icon}
          {label}
        </p>
        <p className={`font-semibold text-slate-900 dark:text-slate-100 truncate transition-colors ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
      </div>
      <button
        onClick={onCopy}
        title={`Copy ${label}`}
        className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0 ml-2 border border-slate-100 dark:border-slate-700"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
