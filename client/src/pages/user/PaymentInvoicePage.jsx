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
} from "lucide-react";
import toast from "react-hot-toast";

import { getPaymentStatus } from "../../services/paymentService";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";

const STORAGE_KEY = "banknoteai_pending_checkout";

function isPaidStatus(status) {
  return ["success", "completed", "paid"].includes(
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
    toast.success(`Đã sao chép ${label || "thông tin"}!`);
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

        toast.success("Thanh toán thành công! Token đã được cập nhật.");
      }
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Không thể kiểm tra trạng thái thanh toán.";

      setError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setIsChecking(false);
    }
  };

  useEffect(() => {
    if (!transactionId || completed || failed) return;

    checkStatus(true);
    pollRef.current = setInterval(() => checkStatus(true), 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, completed, failed]);

  if (!invoice) return null;

  const amountText = formatMoney(invoice.amount || invoice.total_due || 0);
  const transferContent = invoice.transfer_content || invoice.transaction_code || invoice.content || "";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate("/pricing")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-semibold mb-6 transition-colors"
        >
          <ArrowLeft size={18} /> Quay lại bảng giá
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className={`p-3 rounded-xl ${isSepay ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
            {isSepay ? <QrCode size={24} /> : <Landmark size={24} />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isSepay ? "Thanh toán bằng VietQR" : "Chuyển khoản ngân hàng"}
            </h1>
            <p className="text-sm text-slate-500">
              {isSepay 
                ? "Quét mã QR bằng ứng dụng ngân hàng. Hệ thống tự động xác nhận." 
                : "Vui lòng chuyển khoản đúng số tiền và nội dung. Giao dịch cần thời gian để xác nhận."}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 text-red-700 p-4 text-sm flex gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {completed && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-4 flex items-center gap-3 shadow-sm">
            <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-600" />
            <span className="font-semibold text-base">Thanh toán đã được xác nhận thành công. Token đã được cộng.</span>
          </div>
        )}

        {failed && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 p-4 flex items-center gap-3 shadow-sm">
            <AlertTriangle className="w-6 h-6 shrink-0 text-amber-600" />
            <span className="font-semibold text-base">Hóa đơn đã thất bại hoặc bị hủy.</span>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
          {/* Cột trái: Mã QR / Trạng thái */}
          <div className="w-full md:w-5/12 bg-slate-50 p-8 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col items-center justify-center relative overflow-hidden">
            <h2 className="text-lg font-bold mb-6 text-center text-slate-800">
              {isSepay ? "Quét mã QR tự động" : "Thông tin thanh toán"}
            </h2>

            {isSepay ? (
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 inline-block mb-8">
                {invoice.qr_url ? (
                  <img
                    src={invoice.qr_url}
                    alt="QR Code"
                    className="w-56 h-56 object-contain"
                  />
                ) : (
                  <div className="w-56 h-56 flex flex-col items-center justify-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                    <QrCode size={40} className="mb-3 opacity-50" />
                    <span className="text-sm font-medium">Không thể tạo mã QR</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-56 h-56 flex flex-col items-center justify-center bg-emerald-50 rounded-full border-8 border-white shadow-sm text-emerald-600 mb-8 mx-auto">
                <Landmark size={64} className="mb-4 opacity-80" />
                <span className="text-sm font-bold uppercase tracking-widest opacity-80">Chuyển Khoản</span>
              </div>
            )}

            <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold shadow-sm ${
                completed ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {completed ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : failed ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Clock className="w-4 h-4 animate-pulse" />
              )}
              {completed ? "Đã thanh toán" : failed ? "Thất bại" : (isSepay ? "Đang chờ thanh toán" : "Chờ xác nhận")}
            </div>
            
            {!completed && !failed && (
              <p className="mt-6 text-xs text-slate-500 font-medium text-center flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
                {isSepay ? "Đang kiểm tra giao dịch mỗi 5 giây..." : "Hệ thống sẽ tự động cập nhật trạng thái..."}
              </p>
            )}
          </div>

          {/* Cột phải: Chi tiết chuyển khoản */}
          <div className="w-full md:w-7/12 p-8 md:p-10">
            <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center justify-between">
              Chi tiết chuyển khoản
              {!isSepay && <span className="text-xs font-semibold bg-slate-100 text-slate-500 px-2 py-1 rounded-md uppercase tracking-wider">Thủ công</span>}
            </h3>

            <div className="space-y-4 mb-8">
              <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex justify-between items-center group">
                <div>
                  <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Số tiền</p>
                  <p className="text-2xl font-black text-indigo-700">{amountText}</p>
                </div>
                <button
                  onClick={() => handleCopy(invoice.amount, "số tiền")}
                  className="w-10 h-10 rounded-full bg-white text-indigo-600 shadow-sm flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem
                  label="Ngân hàng"
                  value={invoice.bank_name || invoice.bank_id || "N/A"}
                  onCopy={() => handleCopy(invoice.bank_name || invoice.bank_id, "ngân hàng")}
                />
                <InfoItem
                  label="Số tài khoản"
                  value={invoice.bank_account || invoice.bank_account_number || invoice.account_number || "N/A"}
                  onCopy={() => handleCopy(invoice.bank_account || invoice.bank_account_number || invoice.account_number, "số tài khoản")}
                />
              </div>

              <InfoItem
                label="Tên tài khoản"
                value={invoice.account_name || "N/A"}
                onCopy={() => handleCopy(invoice.account_name, "tên tài khoản")}
              />

              <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-200">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Nội dung chuyển khoản (Bắt buộc)</p>
                <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-amber-100 shadow-sm">
                  <p className="font-mono font-bold text-lg text-amber-700 break-all">{transferContent || "N/A"}</p>
                  <button
                    onClick={() => handleCopy(transferContent, "nội dung chuyển khoản")}
                    className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center hover:bg-amber-600 hover:text-white transition-colors shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-amber-600 mt-3 font-medium flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {isSepay 
                    ? "Giữ nguyên nội dung chuyển khoản này để hệ thống có thể tự động xác nhận giao dịch."
                    : "Vui lòng ghi chính xác nội dung này để giao dịch của bạn được đối soát tự động."}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => checkStatus(false)}
                disabled={isChecking || completed || failed}
                className="flex-1 py-3.5 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
                Làm mới trạng thái
              </button>

              <button
                onClick={() => navigate("/transactions")}
                className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
              >
                Xem lịch sử giao dịch
              </button>
            </div>
          </div>
        </div>

        {/* Hướng dẫn thanh toán */}
        <div className="mt-8 bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <h4 className="font-bold text-slate-900 mb-6 text-lg">Hướng dẫn thanh toán</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-black flex items-center justify-center mb-3">1</div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Mở app ngân hàng</p>
              <p className="text-xs text-slate-500">Mở ứng dụng Mobile Banking trên điện thoại của bạn.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-black flex items-center justify-center mb-3">2</div>
              <p className="text-sm font-semibold text-slate-800 mb-1">{isSepay ? "Quét mã QR" : "Nhập thông tin"}</p>
              <p className="text-xs text-slate-500">
                {isSepay ? "Dùng tính năng quét QR code để tự động điền thông tin." : "Nhập đúng STK, Ngân hàng và sao chép chính xác Số tiền."}
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 font-black flex items-center justify-center mb-3">3</div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Xác nhận chuyển khoản</p>
              <p className="text-xs text-slate-500">
                {isSepay ? "Kiểm tra lại số tiền và nội dung trước khi bấm xác nhận chuyển." : "Sao chép đúng nội dung chuyển khoản để hệ thống tự động duyệt."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, onCopy }) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex items-center justify-between group hover:border-slate-300 transition-colors">
      <div className="overflow-hidden">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className="font-semibold text-slate-900 truncate">{value}</p>
      </div>
      <button
        onClick={onCopy}
        className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-colors shrink-0 ml-2 border border-slate-100"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
