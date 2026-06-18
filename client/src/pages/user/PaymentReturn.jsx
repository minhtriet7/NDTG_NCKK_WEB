import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, Receipt, XCircle } from "lucide-react";

import { getPaymentStatus } from "../../services/paymentService";
import { useAuthStore } from "../../store/authStore";

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

export default function PaymentReturn({ status = "success" }) {
  const [searchParams] = useSearchParams();
  const syncProfile = useAuthStore((state) => state.syncProfile);
  const [checkedStatus, setCheckedStatus] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState("");

  const transactionId =
    searchParams.get("transaction_id") || searchParams.get("id") || "";
  const reference =
    transactionId || searchParams.get("vnp_TxnRef") || searchParams.get("ref") || "";

  useEffect(() => {
    let isMounted = true;

    const checkPaymentStatus = async () => {
      if (!transactionId) return;

      setIsChecking(true);
      setError("");

      try {
        const data = await getPaymentStatus(transactionId);
        const nextStatus = data?.status || data?.transaction?.status || "";

        if (!isMounted) return;

        setCheckedStatus(nextStatus);

        if (isPaidStatus(nextStatus)) {
          await syncProfile?.();
        }
      } catch (err) {
        if (!isMounted) return;

        setError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            err?.message ||
            "Unable to refresh payment status.",
        );
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    };

    checkPaymentStatus();

    return () => {
      isMounted = false;
    };
  }, [transactionId, syncProfile]);

  const view = useMemo(() => {
    const normalizedRouteStatus = String(status || "").toLowerCase();
    const normalizedCheckedStatus = String(checkedStatus || "").toLowerCase();
    const success =
      isPaidStatus(normalizedCheckedStatus) ||
      (!normalizedCheckedStatus && normalizedRouteStatus === "success");

    if (success) {
      return {
        icon: CheckCircle2,
        iconClass: "text-emerald-600",
        title: "Payment successful",
        description:
          "Your payment has been confirmed. Token balance will be updated shortly.",
      };
    }

    return {
      icon: XCircle,
      iconClass: "text-red-600",
      title: isFailedStatus(normalizedCheckedStatus)
        ? "Payment failed"
        : "Payment was not completed",
      description:
        "The payment gateway did not confirm this transaction. You can try again from the token packages page.",
    };
  }, [checkedStatus, status]);

  const Icon = view.icon;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans animate-[fadeIn_0.4s_ease-out]">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden text-center p-8 relative">
        {/* Decorative background blur */}
        <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-20 ${
          view.title.includes("successful") ? "bg-emerald-500" : "bg-red-500"
        }`} />

        <div className="relative z-10">
          <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 shadow-sm border-4 ${
            view.title.includes("successful") 
              ? "bg-emerald-50 border-emerald-100 text-emerald-600" 
              : "bg-red-50 border-red-100 text-red-600"
          }`}>
            <Icon size={40} />
          </div>

          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">
            {view.title}
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            {view.description}
          </p>

          {error && (
            <div className="mb-6 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl p-3 text-sm font-medium">
              {error}
            </div>
          )}

          {isChecking ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6 mb-8 bg-slate-50 rounded-2xl border border-slate-100">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <span className="text-sm font-medium text-slate-600">Đang đồng bộ giao dịch...</span>
            </div>
          ) : (
            reference && (
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between gap-3 mb-8 text-sm">
                <div className="flex items-center gap-2 text-slate-500 font-medium">
                  <Receipt size={16} />
                  <span>Mã GD:</span>
                </div>
                <span className="font-mono font-bold text-slate-900 break-all text-right">{reference}</span>
              </div>
            )
          )}

          <div className="flex flex-col gap-3">
            <Link
              to="/recognize"
              className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-sm"
            >
              Vào Không gian làm việc
              <ArrowRight size={18} />
            </Link>

            <div className="flex gap-3">
              <Link
                to="/transactions"
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
              >
                Lịch sử GD
              </Link>

              <Link
                to="/pricing"
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
              >
                Trở lại bảng giá
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
