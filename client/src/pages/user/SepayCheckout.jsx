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
} from "lucide-react";
import toast from "react-hot-toast";

import { getPaymentStatus } from "../../services/paymentService";
import { useAuthStore } from "../../store/authStore";

export default function SepayCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const pollRef = useRef(null);

  const { syncProfile } = useAuthStore();

  const invoice = location.state?.invoice;
  const transactionId =
    invoice?.transaction_id ||
    invoice?.id ||
    invoice?.transaction?.id ||
    location.state?.transaction_id;

  const [paymentStatus, setPaymentStatus] = useState(
    invoice?.status || "pending",
  );
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoice || !transactionId) {
      navigate("/pricing");
    }
  }, [invoice, transactionId, navigate]);

  const isCompleted = ["success", "completed", "paid"].includes(
    String(paymentStatus || "").toLowerCase(),
  );

  const handleCopy = async (text, label) => {
    if (!text) return;

    await navigator.clipboard.writeText(String(text));
    toast.success(`Đã sao chép ${label}!`);
  };

  const checkStatus = async (silent = false) => {
    if (!transactionId || isCompleted) return;

    if (!silent) setIsChecking(true);
    setError("");

    try {
      const data = await getPaymentStatus(transactionId);
      const nextStatus =
        data?.status ||
        data?.transaction?.status ||
        data?.data?.status ||
        "pending";

      setPaymentStatus(nextStatus);
      setLastCheckedAt(new Date());

      const completed = ["success", "completed", "paid"].includes(
        String(nextStatus || "").toLowerCase(),
      );

      if (completed) {
        if (pollRef.current) clearInterval(pollRef.current);

        try {
          await syncProfile?.();
        } catch {
          // ignore
        }

        toast.success("Thanh toán thành công! Token đã được cập nhật.");
      }
    } catch (err) {
      console.error(err);

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
    if (!transactionId || isCompleted) return;

    checkStatus(true);

    pollRef.current = setInterval(() => {
      checkStatus(true);
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, isCompleted]);

  if (!invoice) return null;

  const amount = Number(invoice.amount || invoice.total_due || 0);
  const amountText = `${new Intl.NumberFormat("vi-VN").format(amount)} đ`;

  const transferContent =
    invoice.transfer_content ||
    invoice.transaction_code ||
    invoice.content ||
    "";

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 font-sans text-slate-900 animate-[formFadeIn_0.4s_ease-out]">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate("/pricing")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-medium mb-6 transition-colors"
        >
          <ArrowLeft size={18} /> Quay lại bảng giá
        </button>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-1/2 bg-slate-900 text-white p-8 md:p-12 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10 text-white">
              <ShieldCheck size={120} />
            </div>

            <div className="z-10 text-center w-full">
              <h2 className="text-2xl font-bold mb-2">Thanh Toán VietQR</h2>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                Mở ứng dụng ngân hàng bất kỳ và quét mã QR dưới đây để tự động
                điền nội dung chuyển khoản.
              </p>

              <div className="bg-white p-4 rounded-2xl shadow-xl inline-block mb-8 transition-transform hover:scale-[1.02]">
                {invoice.qr_url ? (
                  <img
                    src={invoice.qr_url}
                    alt="VietQR Automatic Code"
                    className="w-56 h-56 object-contain"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-sm">
                    Chưa có QR
                  </div>
                )}
              </div>

              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${
                  isCompleted
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                {isCompleted ? "Đã thanh toán" : "Đang chờ thanh toán"}
              </div>
            </div>
          </div>

          <div className="w-full md:w-1/2 p-8 md:p-12">
            <h3 className="text-2xl font-black text-slate-900 mb-2">
              Chi tiết chuyển khoản
            </h3>
            <p className="text-sm text-slate-500 mb-8">
              Vui lòng chuyển đúng số tiền và đúng nội dung để hệ thống tự động
              cộng token.
            </p>

            {error && (
              <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 text-red-700 p-4 text-sm flex gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {isCompleted && (
              <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700 p-4 text-sm flex gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Thanh toán đã được xác nhận. Token đã được cộng.</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">
                  Số tiền
                </p>
                <p className="text-2xl font-black text-teal-600">
                  {amountText}
                </p>
              </div>

              <InfoItem
                label="Ngân hàng"
                value={invoice.bank_name || invoice.bank_id || "N/A"}
                onCopy={() =>
                  handleCopy(invoice.bank_name || invoice.bank_id, "ngân hàng")
                }
              />

              <InfoItem
                label="Số tài khoản"
                value={
                  invoice.bank_account ||
                  invoice.bank_account_number ||
                  invoice.account_number ||
                  "N/A"
                }
                onCopy={() =>
                  handleCopy(
                    invoice.bank_account ||
                      invoice.bank_account_number ||
                      invoice.account_number,
                    "số tài khoản",
                  )
                }
              />

              <InfoItem
                label="Tên tài khoản"
                value={invoice.account_name || "N/A"}
                onCopy={() =>
                  handleCopy(invoice.account_name, "tên tài khoản")
                }
              />

              <InfoItem
                label="Nội dung chuyển khoản"
                value={transferContent || "N/A"}
                important
                onCopy={() =>
                  handleCopy(transferContent, "nội dung chuyển khoản")
                }
              />
            </div>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => checkStatus(false)}
                disabled={isChecking || isCompleted}
                className="flex-1 h-12 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-60 transition"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`}
                />
                Kiểm tra trạng thái
              </button>

              <button
                onClick={() => navigate("/transactions")}
                className="flex-1 h-12 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition"
              >
                Xem giao dịch
              </button>
            </div>

            <div className="mt-6 flex gap-2 text-xs text-slate-500">
              <Info className="w-4 h-4 shrink-0" />
              <span>
                Hệ thống tự kiểm tra mỗi 5 giây. Lần kiểm tra gần nhất:{" "}
                {lastCheckedAt
                  ? lastCheckedAt.toLocaleTimeString("vi-VN")
                  : "chưa có"}.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, onCopy, important = false }) {
  return (
    <div
      className={`p-4 rounded-2xl border ${
        important
          ? "bg-teal-50 border-teal-100"
          : "bg-white border-slate-200"
      }`}
    >
      <p className="text-xs font-bold text-slate-400 uppercase mb-1">
        {label}
      </p>

      <div className="flex items-center justify-between gap-3">
        <p
          className={`font-bold break-all ${
            important ? "text-teal-700" : "text-slate-900"
          }`}
        >
          {value}
        </p>

        <button
          onClick={onCopy}
          className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition shrink-0"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}