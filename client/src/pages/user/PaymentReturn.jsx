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
    <section className="min-h-[60vh] bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <Icon className={`mt-1 h-10 w-10 shrink-0 ${view.iconClass}`} />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold text-slate-900">{view.title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {view.description}
            </p>

            {reference && (
              <div className="mt-5 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Receipt className="h-4 w-4 shrink-0" />
                <span className="truncate">Reference: {reference}</span>
              </div>
            )}

            {isChecking && (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing payment status...
              </div>
            )}

            {error && (
              <p className="mt-4 text-sm text-amber-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/transactions"
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                View transactions
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                to="/pricing"
                className="inline-flex items-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to packages
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
