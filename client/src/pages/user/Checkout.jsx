// src/pages/user/Checkout.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  RefreshCw,
  AlertTriangle,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";

import { getPaymentStatus } from "../../services/paymentService";
import { useAuthStore } from "../../store/authStore";

const STORAGE_KEY = "banknoteai_pending_checkout";

function getInvoiceFromState(location) {
  return location.state?.invoice || location.state?.transaction || null;
}

function getTransactionId(invoice, location) {
  return (
    invoice?.transaction_id ||
    invoice?.id ||
    invoice?._id ||
    invoice?.transaction?.id ||
    location.state?.transaction_id ||
    null
  );
}

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

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const pollRef = useRef(null);
  const { syncProfile } = useAuthStore();

  const savedInvoice = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const initialInvoice = getInvoiceFromState(location) || savedInvoice?.invoice || null;
  const [invoice, setInvoice] = useState(initialInvoice);
  const [status, setStatus] = useState(initialInvoice?.status || "pending");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  const transactionId = getTransactionId(invoice, location) || savedInvoice?.transaction_id;
  const completed = isPaidStatus(status);
  const failed = isFailedStatus(status);

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

  const handleCopy = async (text) => {
    if (!text) return;
    await navigator.clipboard.writeText(String(text));
    toast.success("Đã sao chép!");
  };

  const checkStatus = async (silent = false) => {
    if (!transactionId || completed || failed) return;

    if (!silent) setIsChecking(true);
    setError("");

    try {
      const data = await getPaymentStatus(transactionId);
      const nextStatus = data?.status || data?.transaction?.status || "pending";
      setStatus(nextStatus);
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
          // keep current UI if profile sync fails
        }
        toast.success("Thanh toán thành công. Token đã được cập nhật.");
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

  if (!invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <p className="text-slate-500 mb-4">Không tìm thấy thông tin hóa đơn.</p>
        <button
          onClick={() => navigate("/pricing")}
          className="px-4 py-2 bg-teal-600 text-white rounded-xl"
        >
          Quay lại Bảng giá
        </button>
      </div>
    );
  }

  const transferContent =
    invoice.transfer_content || invoice.transaction_code || invoice.content || "";

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 font-sans text-slate-900">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate("/pricing")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-semibold mb-6"
        >
          <ArrowLeft size={18} /> Trở lại
        </button>

        {error && (
          <div className="mb-5 bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 flex gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {completed && (
          <div className="mb-5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl p-4 flex gap-3 text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Thanh toán đã được xác nhận. Token đã được cộng vào tài khoản.</span>
          </div>
        )}

        {failed && (
          <div className="mb-5 bg-amber-50 border border-amber-100 text-amber-700 rounded-2xl p-4 flex gap-3 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>Hóa đơn đã thất bại hoặc bị hủy.</span>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row">
          <div className="md:w-1/2 p-8 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col items-center justify-center bg-slate-50/50">
            <h2 className="text-lg font-bold mb-6 text-center">Quét mã QR để thanh toán</h2>
            {invoice.qr_url ? (
              <img
                src={invoice.qr_url}
                alt="QR Code"
                className="w-64 h-64 object-contain rounded-xl bg-white p-2 border border-slate-200 shadow-sm"
              />
            ) : (
              <div className="w-64 h-64 bg-slate-200 animate-pulse rounded-xl" />
            )}
            <p className="mt-4 text-sm text-slate-500 text-center font-medium">
              Sử dụng ứng dụng ngân hàng hoặc ví điện tử để quét mã.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold">
              {completed ? <CheckCircle2 size={14} /> : <Clock size={14} />}
              {completed ? "Đã thanh toán" : "Đang chờ thanh toán"}
            </div>
          </div>

          <div className="md:w-1/2 p-8">
            <h3 className="text-xl font-bold mb-6">Thông tin chuyển khoản</h3>

            <div className="space-y-5">
              <InfoLine label="Ngân hàng" value={invoice.bank_name || invoice.bank_id || "N/A"} />

              <CopyLine
                label="Số tài khoản"
                value={
                  invoice.bank_account ||
                  invoice.bank_account_number ||
                  invoice.account_number ||
                  "N/A"
                }
                onCopy={handleCopy}
              />

              <InfoLine label="Tên tài khoản" value={invoice.account_name || "N/A"} />

              <InfoLine label="Số tiền" value={formatMoney(invoice.amount)} big />

              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mt-2">
                <p className="text-xs font-bold text-amber-700 uppercase mb-1">
                  Nội dung chuyển khoản (Bắt buộc)
                </p>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono font-bold text-xl text-amber-600 tracking-wider break-all">
                    {transferContent || "N/A"}
                  </p>
                  <button
                    onClick={() => handleCopy(transferContent)}
                    className="text-amber-500 hover:text-amber-700 shrink-0"
                  >
                    <Copy size={18} />
                  </button>
                </div>
                <p className="text-[11px] text-amber-600 mt-2">
                  Ghi chính xác nội dung này để hệ thống tự động cộng Token.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-teal-500 shrink-0" />
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Sau khi thanh toán thành công, Token sẽ được cộng tự động vào tài khoản của bạn trong 1-3 phút.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => checkStatus(false)}
                disabled={isChecking || completed || failed}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-xl font-bold text-white transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
                Kiểm tra
              </button>

              <button
                onClick={() => navigate("/transactions")}
                className="w-full py-3 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl font-bold text-slate-700 transition-colors"
              >
                Xem giao dịch
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              Tự kiểm tra mỗi 5 giây. Lần gần nhất: {lastCheckedAt ? lastCheckedAt.toLocaleTimeString("vi-VN") : "chưa có"}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoLine({ label, value, big = false }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase mb-1">{label}</p>
      <p className={big ? "font-black text-xl" : "font-semibold"}>{value}</p>
    </div>
  );
}

function CopyLine({ label, value, onCopy }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase mb-1">{label}</p>
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 gap-3">
        <p className="font-mono font-bold text-lg text-teal-700 break-all">{value}</p>
        <button onClick={() => onCopy(value)} className="text-slate-400 hover:text-teal-600 shrink-0">
          <Copy size={16} />
        </button>
      </div>
    </div>
  );
}
