import React, { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Copy,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";
import { getMyPaymentTransactions } from "../../services/paymentService";
import { useAppStore } from "../../store/appStore";

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function formatMoney(value, currency = "VND") {
  const amount = Number(value || 0);

  if (currency === "VND") {
    return `${new Intl.NumberFormat("vi-VN").format(amount)} VND`;
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
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

function getStatusConfig(status) {
  const value = String(status || "pending").toLowerCase();

  if (["success", "completed", "paid"].includes(value)) {
    return {
      label: "Completed",
      icon: CheckCircle,
      className: "bg-emerald-50 text-emerald-700 border-emerald-100",
    };
  }

  if (["failed", "cancelled", "canceled"].includes(value)) {
    return {
      label: value === "failed" ? "Failed" : "Cancelled",
      icon: XCircle,
      className: "bg-red-50 text-red-700 border-red-100",
    };
  }

  return {
    label: "Pending",
    icon: Clock,
    className: "bg-amber-50 text-amber-700 border-amber-100",
  };
}

export default function Transactions() {
  const { lang } = useAppStore();
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const t = {
    EN: {
      title: "Transaction History",
      subtitle: "Track all your token package purchases and billing receipts.",
      reference: "Reference ID",
      packageName: "Package Name",
      amount: "Amount",
      tokens: "Tokens",
      status: "Status",
      date: "Date",
      gateway: "Gateway",
      emptyTitle: "No transactions yet",
      emptyDesc: "Your token purchase history will appear here.",
      reload: "Reload",
      copy: "Copy",
      copied: "Copied",
      error: "Unable to load transaction history.",
    },
    VI: {
      title: "Lịch sử giao dịch",
      subtitle: "Theo dõi các lần mua gói token và hóa đơn thanh toán của bạn.",
      reference: "Mã tham chiếu",
      packageName: "Tên gói",
      amount: "Số tiền",
      tokens: "Token",
      status: "Trạng thái",
      date: "Ngày",
      gateway: "Cổng",
      emptyTitle: "Chưa có giao dịch",
      emptyDesc: "Lịch sử mua token của bạn sẽ hiển thị tại đây.",
      reload: "Tải lại",
      copy: "Sao chép",
      copied: "Đã sao chép",
      error: "Không thể tải lịch sử giao dịch.",
    },
  }[lang || "EN"];

  const summary = useMemo(() => {
    const completed = transactions.filter((tx) =>
      ["success", "completed", "paid"].includes(
        String(tx.status || "").toLowerCase(),
      ),
    );

    return {
      total: transactions.length,
      completed: completed.length,
      tokens: completed.reduce(
        (sum, tx) => sum + Number(tx.tokens_added || tx.tokens || 0),
        0,
      ),
      amount: completed.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
    };
  }, [transactions]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await getMyPaymentTransactions(100);
      setTransactions(normalizeList(data));
    } catch (err) {
      console.error(err);
      setError(t.error);
      toast.error(t.error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async (value) => {
    if (!value) return;

    await navigator.clipboard.writeText(String(value));
    toast.success(t.copied);
  };

  return (
    <div className="max-w-5xl mx-auto font-sans space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {t.title}
          </h2>
          <p className="text-slate-500 text-sm">{t.subtitle}</p>
        </div>

        <button
          onClick={fetchTransactions}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          {t.reload}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-base p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Total
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {summary.total}
          </p>
        </div>

        <div className="card-base p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Completed
          </p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            {summary.completed}
          </p>
        </div>

        <div className="card-base p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Tokens
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {summary.tokens}
          </p>
        </div>

        <div className="card-base p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Amount
          </p>
          <p className="text-lg font-black text-slate-900 mt-1">
            {formatMoney(summary.amount)}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 flex items-start gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="card-base shadow-sm overflow-hidden">
        <div className="hidden md:grid p-6 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-wider grid-cols-6 gap-4">
          <span>{t.reference}</span>
          <span>{t.packageName}</span>
          <span>{t.amount}</span>
          <span>{t.tokens}</span>
          <span>{t.date}</span>
          <span className="text-right">{t.status}</span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400 mb-3" />
            <p className="text-sm text-slate-500">Loading...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-900">{t.emptyTitle}</h3>
            <p className="text-sm text-slate-500 mt-1">{t.emptyDesc}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {transactions.map((tx) => {
              const statusConfig = getStatusConfig(tx.status);
              const StatusIcon = statusConfig.icon;

              const reference =
                tx.transaction_code || tx.transfer_content || tx.id || tx._id;
              const packageName =
                tx.package_name ||
                tx.package?.name ||
                tx.package_id ||
                "Token Package";

              return (
                <div
                  key={tx.id || tx._id || reference}
                  className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-6 gap-3 md:gap-4 items-center text-sm hover:bg-slate-50/70 transition"
                >
                  <div>
                    <p className="md:hidden text-xs font-bold text-slate-400 uppercase mb-1">
                      {t.reference}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-900 font-semibold truncate">
                        {reference || "N/A"}
                      </span>
                      {reference && (
                        <button
                          onClick={() => handleCopy(reference)}
                          className="text-slate-400 hover:text-slate-700"
                          title={t.copy}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="md:hidden text-xs font-bold text-slate-400 uppercase mb-1">
                      {t.packageName}
                    </p>
                    <span className="text-slate-700 font-medium">
                      {packageName}
                    </span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {tx.payment_gateway || tx.gateway || "sepay"}
                    </p>
                  </div>

                  <div>
                    <p className="md:hidden text-xs font-bold text-slate-400 uppercase mb-1">
                      {t.amount}
                    </p>
                    <span className="font-bold text-slate-900">
                      {formatMoney(tx.amount, tx.currency || "VND")}
                    </span>
                  </div>

                  <div>
                    <p className="md:hidden text-xs font-bold text-slate-400 uppercase mb-1">
                      {t.tokens}
                    </p>
                    <span className="inline-flex items-center gap-1 font-bold text-slate-900">
                      <CreditCard className="w-4 h-4 text-indigo-600" />
                      +{tx.tokens_added || tx.tokens || 0}
                    </span>
                  </div>

                  <div>
                    <p className="md:hidden text-xs font-bold text-slate-400 uppercase mb-1">
                      {t.date}
                    </p>
                    <span className="text-slate-500">
                      {formatDate(tx.created_at || tx.paid_at, lang)}
                    </span>
                  </div>

                  <div className="md:text-right">
                    <p className="md:hidden text-xs font-bold text-slate-400 uppercase mb-1">
                      {t.status}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 border px-2.5 py-1 rounded-lg text-xs font-semibold ${statusConfig.className}`}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusConfig.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}