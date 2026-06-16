import React, { useState, useEffect } from "react";
import { useAppStore } from "../../store/appStore";

import {
  getAdminTransactions,
  markTransactionPaid,
  cancelTransaction,
  deleteTransaction,
} from "../../services/adminService";

import {
  Search,
  Filter,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Ban,
  Trash2,
  ArrowRightLeft,
  DollarSign,
  Wallet,
  FileX,
  X,
  Copy,
} from "lucide-react";

import toast from "react-hot-toast";

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function getId(item) {
  return item?.id || item?._id || item?.transaction_id || item?.payment_id;
}

function safeText(value, fallback = "N/A") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function normalizeStatus(status) {
  const value = String(status || "pending").toLowerCase();

  if (["success", "completed", "paid"].includes(value)) return "success";
  if (["cancelled", "canceled", "cancel", "expired"].includes(value)) {
    return "cancelled";
  }
  if (["failed", "error"].includes(value)) return "failed";

  return "pending";
}

function normalizeGateway(gateway) {
  return String(gateway || "sepay").toLowerCase();
}

function normalizeTransaction(tx = {}) {
  const id = getId(tx);
  const pkg = tx.package || tx.token_package || {};
  const user = tx.user || tx.owner || {};

  return {
    ...tx,
    id,
    transaction_code:
      tx.transaction_code ||
      tx.transfer_content ||
      tx.checkout_code ||
      tx.payment_code ||
      tx.code ||
      id ||
      "N/A",
    package_name:
      tx.package_name ||
      pkg.name ||
      tx.package_id ||
      tx.package_key ||
      "Token Package",
    user_email:
      tx.user_email ||
      user.email ||
      tx.email ||
      tx.user_id ||
      tx.client_id ||
      "N/A",
    user_id: String(tx.user_id || user.id || user._id || ""),
    amount: Number(tx.amount || tx.amount_vnd || tx.total_amount || tx.price_vnd || 0),
    tokens_added: Number(
      tx.tokens_added ||
        tx.tokens ||
        tx.token_amount ||
        tx.tokens_included ||
        pkg.tokens_included ||
        pkg.tokens ||
        0,
    ),
    payment_gateway:
      tx.payment_gateway || tx.gateway || tx.provider || tx.source || "sepay",
    status: normalizeStatus(tx.status),
    original_status: tx.status,
    created_at:
      tx.created_at ||
      tx.createdAt ||
      tx.time ||
      tx.updated_at ||
      tx.paid_at ||
      new Date().toISOString(),
    paid_at: tx.paid_at || tx.completed_at || tx.updated_at || null,
    raw: tx,
  };
}

function normalizePagination(data) {
  const items = normalizeList(data).map(normalizeTransaction);

  return {
    items,
    total: Number(data?.total ?? data?.count ?? items.length),
  };
}

function formatCurrency(amount) {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount || 0))} đ`;
}

function formatDateTime(value) {
  if (!value) return "N/A";

  try {
    return new Date(value).toLocaleString("vi-VN");
  } catch {
    return "N/A";
  }
}

export default function TransactionsManager() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [data, setData] = useState({ items: [], total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [gateway, setGateway] = useState("all");

  const [detailModal, setDetailModal] = useState({ open: false, tx: null });
  const [isProcessing, setIsProcessing] = useState(false);

  const t = {
    EN: {
      title: "Transactions Manager",
      subtitle:
        "Monitor user payments, token recharge logs, and resolve pending invoices.",
      searchPlaceholder: "Search TX Code, User ID...",
      filterStatus: "Status",
      filterGateway: "Gateway",
      filterAll: "All",
      thDate: "Time",
      thCode: "TX Info",
      thUser: "Client",
      thAmount: "Amount & Tokens",
      thGateway: "Gateway",
      thStatus: "Status",
      thAction: "Actions",
      noDataTitle: "No transactions found",
      noDataDesc: "Payments created by users will appear here.",
      btnMarkPaid: "Mark as Paid",
      btnCancel: "Cancel TX",
      btnDelete: "Delete",
      btnClose: "Close",
      btnRefresh: "Refresh",
      statTotal: "Total Invoices",
      statPending: "Pending Payments",
      statSuccess: "Successful",
      statRevenue: "Total Revenue (Success)",
      detailTitle: "Invoice Details",
      totalAmount: "Total Amount",
      transactionCode: "Transaction Code",
      package: "Package",
      tokensAdded: "Tokens Added",
      clientEmail: "Client",
      gateway: "Gateway",
      createdAt: "Created At",
      paidAt: "Paid At",
      rawJson: "Raw JSON",
      copyJson: "Copy JSON",
      msgPaid: "Tokens credited to user.",
      msgCancel: "Transaction cancelled.",
      msgDel: "Transaction deleted.",
      msgCopied: "JSON copied.",
    },
    VI: {
      title: "Quản lý Giao dịch",
      subtitle: "Giám sát thanh toán, nạp token và xử lý các hóa đơn đang chờ.",
      searchPlaceholder: "Tìm Mã GD, User ID...",
      filterStatus: "Trạng thái",
      filterGateway: "Cổng TT",
      filterAll: "Tất cả",
      thDate: "Thời gian",
      thCode: "Mã Giao Dịch",
      thUser: "Khách hàng",
      thAmount: "Số tiền / Token",
      thGateway: "Cổng TT",
      thStatus: "Trạng thái",
      thAction: "Thao tác",
      noDataTitle: "Chưa có giao dịch",
      noDataDesc: "Các thanh toán của người dùng sẽ hiển thị tại đây.",
      btnMarkPaid: "Xác nhận Đã thu tiền",
      btnCancel: "Hủy hóa đơn",
      btnDelete: "Xóa",
      btnClose: "Đóng",
      btnRefresh: "Làm mới",
      statTotal: "Tổng hóa đơn",
      statPending: "Đang chờ TT",
      statSuccess: "Thành công",
      statRevenue: "Doanh thu (Thành công)",
      detailTitle: "Chi tiết hóa đơn",
      totalAmount: "Tổng tiền",
      transactionCode: "Mã giao dịch",
      package: "Gói nạp",
      tokensAdded: "Token cộng thêm",
      clientEmail: "Khách hàng",
      gateway: "Cổng thanh toán",
      createdAt: "Thời gian tạo",
      paidAt: "Thời gian thanh toán",
      rawJson: "JSON gốc",
      copyJson: "Sao chép JSON",
      msgPaid: "Đã cộng token cho người dùng.",
      msgCancel: "Đã hủy hóa đơn.",
      msgDel: "Đã xóa giao dịch.",
      msgCopied: "Đã sao chép JSON.",
    },
  }[lang || "EN"];

  const loadData = async () => {
    setIsLoading(true);

    try {
      const params = {
        page: 1,
        limit: 50,
        search: search.trim(),
        status,
        gateway,
      };

      const res = await getAdminTransactions(params);
      setData(normalizePagination(res));
    } catch (error) {
      console.error("Load transactions failed:", error);

      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          error?.message ||
          "Failed to load transactions.",
      );

      setData({ items: [], total: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, gateway]);

  const handleSearchSubmit = (event) => {
    if (event.key === "Enter") loadData();
  };

  const handleReset = () => {
    setSearch("");
    setStatus("all");
    setGateway("all");

    setTimeout(() => {
      loadData();
    }, 100);
  };

  const kpis = {
    total: data.total || data.items.length || 0,
    pending: data.items.filter((item) => normalizeStatus(item.status) === "pending")
      .length,
    success: data.items.filter((item) => normalizeStatus(item.status) === "success")
      .length,
    revenue: data.items
      .filter((item) => normalizeStatus(item.status) === "success")
      .reduce((acc, curr) => acc + Number(curr.amount || 0), 0),
  };

  const actionMarkPaid = async (id) => {
    if (!id) return;

    if (
      !window.confirm(
        lang === "VI"
          ? "Xác nhận đã nhận tiền và CỘNG TOKEN cho người dùng?"
          : "Confirm payment received and ADD TOKENS to user?",
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      await markTransactionPaid(id);

      toast.success(t.msgPaid);
      setDetailModal({ open: false, tx: null });
      await loadData();
    } catch (error) {
      console.error("Mark paid failed:", error);

      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Action failed",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const actionCancel = async (id) => {
    if (!id) return;

    if (
      !window.confirm(
        lang === "VI" ? "Hủy hóa đơn này?" : "Cancel this invoice?",
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      await cancelTransaction(id);

      toast.success(t.msgCancel);
      setDetailModal({ open: false, tx: null });
      await loadData();
    } catch (error) {
      console.error("Cancel transaction failed:", error);

      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Action failed",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const actionDelete = async (id) => {
    if (!id) return;

    if (
      !window.confirm(
        lang === "VI"
          ? "Xóa vĩnh viễn giao dịch này?"
          : "Permanently delete transaction?",
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      await deleteTransaction(id);

      toast.success(t.msgDel);
      setDetailModal({ open: false, tx: null });
      await loadData();
    } catch (error) {
      console.error("Delete transaction failed:", error);

      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Action failed",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const copyJson = async (payload) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success(t.msgCopied);
    } catch {
      toast.error("Copy failed");
    }
  };

  const renderStatus = (transactionStatus) => {
    const normalized = normalizeStatus(transactionStatus);

    if (normalized === "success") {
      return (
        <span
          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
            isDark
              ? "bg-emerald-900/30 text-emerald-400"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          <CheckCircle2 size={12} className="inline mr-1 mb-0.5" />
          Paid
        </span>
      );
    }

    if (normalized === "failed") {
      return (
        <span
          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
            isDark
              ? "bg-rose-900/30 text-rose-400"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          <XCircle size={12} className="inline mr-1 mb-0.5" />
          Failed
        </span>
      );
    }

    if (normalized === "cancelled") {
      return (
        <span
          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
            isDark
              ? "bg-slate-800 text-slate-400"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <Ban size={12} className="inline mr-1 mb-0.5" />
          Cancelled
        </span>
      );
    }

    return (
      <span
        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
          isDark
            ? "bg-amber-900/30 text-amber-400"
            : "bg-amber-50 text-amber-700"
        }`}
      >
        <Clock size={12} className="inline mr-1 mb-0.5" />
        Pending
      </span>
    );
  };

  const renderGateway = (gatewayValue) => {
    const normalized = normalizeGateway(gatewayValue);

    if (normalized === "mock" || normalized === "sandbox") {
      return (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            isDark
              ? "bg-indigo-900/40 text-indigo-300"
              : "bg-indigo-50 text-indigo-600"
          }`}
        >
          Sandbox (Mock)
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        {safeText(gatewayValue).toUpperCase()}
      </span>
    );
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {t.subtitle}
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
            isDark
              ? "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          } disabled:opacity-60`}
        >
          <RotateCcw size={16} className={isLoading ? "animate-spin" : ""} />
          {t.btnRefresh}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          isDark={isDark}
          label={t.statTotal}
          value={kpis.total}
          icon={<ArrowRightLeft className="text-blue-500 w-5 h-5" />}
        />

        <StatCard
          isDark={isDark}
          label={t.statPending}
          value={kpis.pending}
          icon={<Clock className="text-amber-500 w-5 h-5" />}
        />

        <StatCard
          isDark={isDark}
          label={t.statSuccess}
          value={kpis.success}
          icon={<CheckCircle2 className="text-emerald-500 w-5 h-5" />}
        />

        <StatCard
          isDark={isDark}
          label={t.statRevenue}
          value={formatCurrency(kpis.revenue)}
          icon={<Wallet className="text-teal-500 w-5 h-5" />}
          valueClassName="text-teal-600 dark:text-teal-400"
        />
      </div>

      <div
        className={`p-4 rounded-xl border shadow-sm flex flex-col sm:flex-row gap-4 ${
          isDark
            ? "bg-slate-900 border-slate-800"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />

          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleSearchSubmit}
            className={`w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all ${
              isDark
                ? "bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                : "bg-slate-50 border-slate-200 text-slate-900"
            }`}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Filter size={16} />
          </div>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={`border text-sm font-medium rounded-xl px-3 py-2 outline-none ${
              isDark
                ? "bg-slate-950 border-slate-800 text-slate-300"
                : "bg-slate-50 border-slate-200"
            }`}
          >
            <option value="all">
              {t.filterStatus}: {t.filterAll}
            </option>
            <option value="pending">Pending</option>
            <option value="success">Success / Paid</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={gateway}
            onChange={(event) => setGateway(event.target.value)}
            className={`border text-sm font-medium rounded-xl px-3 py-2 outline-none ${
              isDark
                ? "bg-slate-950 border-slate-800 text-slate-300"
                : "bg-slate-50 border-slate-200"
            }`}
          >
            <option value="all">
              {t.filterGateway}: {t.filterAll}
            </option>
            <option value="sepay">SePay / VietQR</option>
            <option value="mock">Sandbox (Mock)</option>
          </select>

          <button
            onClick={handleReset}
            className={`p-2 border rounded-xl transition-colors ${
              isDark
                ? "text-slate-400 bg-slate-950 border-slate-800 hover:text-rose-400"
                : "text-slate-400 bg-slate-50 border-slate-200 hover:text-rose-600"
            }`}
            title="Reset Filters"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div
        className={`rounded-xl border shadow-sm overflow-hidden ${
          isDark
            ? "bg-slate-900 border-slate-800"
            : "bg-white border-slate-200"
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead
              className={`uppercase text-[10px] font-bold tracking-wider border-b ${
                isDark
                  ? "bg-slate-950/50 text-slate-500 border-slate-800"
                  : "bg-slate-50 text-slate-500 border-slate-100"
              }`}
            >
              <tr>
                <th className="px-5 py-4">{t.thDate}</th>
                <th className="px-5 py-4">{t.thCode}</th>
                <th className="px-5 py-4">{t.thUser}</th>
                <th className="px-5 py-4">{t.thAmount}</th>
                <th className="px-5 py-4">{t.thGateway}</th>
                <th className="px-5 py-4">{t.thStatus}</th>
                <th className="px-5 py-4 text-right">{t.thAction}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {isLoading ? (
                Array(5)
                  .fill(0)
                  .map((_, index) => (
                    <tr key={index}>
                      <td className="px-5 py-4">
                        <Skeleton className="w-20 h-4" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="w-24 h-4" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="w-32 h-4" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="w-20 h-5" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="w-16 h-4" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="w-16 h-6 rounded-full" />
                      </td>
                      <td className="px-5 py-4">
                        <Skeleton className="w-8 h-8 ml-auto" />
                      </td>
                    </tr>
                  ))
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-20">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <FileX className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-base font-bold text-slate-500 dark:text-slate-400">
                        {t.noDataTitle}
                      </p>
                      <p className="text-xs mt-1">{t.noDataDesc}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.items.map((tx) => (
                  <tr
                    key={tx.id || tx.transaction_code}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {formatDateTime(tx.created_at)}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                        {safeText(tx.transaction_code)}
                      </p>

                      <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px]">
                        {safeText(tx.package_name)}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p
                        className={`font-semibold text-xs truncate max-w-[150px] ${
                          isDark ? "text-slate-200" : "text-slate-800"
                        }`}
                      >
                        {safeText(tx.user_email)}
                      </p>

                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        ID: ...{String(tx.user_id || "").slice(-6) || "N/A"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p
                        className={`font-black ${
                          isDark ? "text-white" : "text-slate-900"
                        }`}
                      >
                        {formatCurrency(tx.amount)}
                      </p>

                      <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1 mt-0.5">
                        <DollarSign size={10} /> +{tx.tokens_added} TK
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      {renderGateway(tx.payment_gateway)}
                    </td>

                    <td className="px-5 py-4">{renderStatus(tx.status)}</td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailModal({ open: true, tx })}
                        className={`p-2 rounded-lg border transition ${
                          isDark
                            ? "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-teal-400"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-teal-600"
                        }`}
                        title="View Details"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailModal.open && detailModal.tx && (
        <TransactionDetailModal
          tx={detailModal.tx}
          isDark={isDark}
          t={t}
          renderStatus={renderStatus}
          renderGateway={renderGateway}
          isProcessing={isProcessing}
          onClose={() => setDetailModal({ open: false, tx: null })}
          onMarkPaid={() => actionMarkPaid(getId(detailModal.tx))}
          onCancel={() => actionCancel(getId(detailModal.tx))}
          onDelete={() => actionDelete(getId(detailModal.tx))}
          onCopy={() => copyJson(detailModal.tx.raw || detailModal.tx)}
        />
      )}
    </div>
  );
}

function StatCard({ isDark, label, value, icon, valueClassName }) {
  return (
    <div
      className={`p-5 rounded-xl border shadow-sm ${
        isDark
          ? "bg-slate-900 border-slate-800"
          : "bg-white border-slate-200"
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        {icon}
      </div>

      <span
        className={`text-2xl font-black ${
          valueClassName || (isDark ? "text-white" : "text-slate-900")
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Skeleton({ className = "" }) {
  return (
    <div
      className={`bg-slate-200 dark:bg-slate-800 rounded animate-pulse ${className}`}
    />
  );
}

function TransactionDetailModal({
  tx,
  isDark,
  t,
  renderStatus,
  renderGateway,
  isProcessing,
  onClose,
  onMarkPaid,
  onCancel,
  onDelete,
  onCopy,
}) {
  const status = normalizeStatus(tx.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close transaction detail"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-md h-full flex flex-col shadow-2xl animate-[slideInRight_0.3s_ease-out] ${
          isDark ? "bg-slate-950 border-l border-slate-800" : "bg-white"
        }`}
      >
        <div
          className={`px-6 py-5 border-b flex justify-between items-center ${
            isDark ? "border-slate-800" : "border-slate-200"
          }`}
        >
          <h3
            className={`font-black text-xl flex items-center gap-2 ${
              isDark ? "text-white" : "text-slate-900"
            }`}
          >
            <ArrowRightLeft className="w-5 h-5 text-teal-500" />
            {t.detailTitle}
          </h3>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition ${
              isDark
                ? "hover:bg-slate-800 text-slate-400"
                : "hover:bg-slate-100 text-slate-500"
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="text-center">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              {t.totalAmount}
            </p>

            <h2 className="text-4xl font-black text-teal-600 dark:text-teal-400">
              {formatCurrency(tx.amount)}
            </h2>

            <div className="mt-3 flex justify-center">
              {renderStatus(tx.status)}
            </div>
          </div>

          <div
            className={`rounded-xl border overflow-hidden ${
              isDark ? "border-slate-800" : "border-slate-200"
            }`}
          >
            <InfoRow
              isDark={isDark}
              label={t.transactionCode}
              value={tx.transaction_code}
              mono
            />

            <InfoRow
              isDark={isDark}
              label={t.package}
              value={tx.package_name}
            />

            <InfoRow
              isDark={isDark}
              label={t.tokensAdded}
              value={`+${tx.tokens_added}`}
              valueClassName="font-bold text-amber-500"
            />

            <InfoRow
              isDark={isDark}
              label={t.clientEmail}
              value={tx.user_email}
            />

            <InfoRow
              isDark={isDark}
              label={t.gateway}
              valueNode={renderGateway(tx.payment_gateway)}
            />

            <InfoRow
              isDark={isDark}
              label={t.createdAt}
              value={formatDateTime(tx.created_at)}
            />

            {tx.paid_at && (
              <InfoRow
                isDark={isDark}
                label={t.paidAt}
                value={formatDateTime(tx.paid_at)}
                valueClassName="font-bold text-emerald-600 dark:text-emerald-400"
              />
            )}
          </div>

          <p className="text-center text-[10px] font-mono text-slate-400">
            DB_ID: {safeText(getId(tx))}
          </p>

          <div
            className={`rounded-xl border overflow-hidden ${
              isDark ? "border-slate-800" : "border-slate-200"
            }`}
          >
            <div
              className={`px-4 py-3 flex items-center justify-between border-b ${
                isDark ? "border-slate-800" : "border-slate-100"
              }`}
            >
              <span className="text-xs font-bold text-slate-500 uppercase">
                {t.rawJson}
              </span>

              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline"
              >
                <Copy size={13} />
                {t.copyJson}
              </button>
            </div>

            <pre className="bg-slate-950 text-teal-300 text-xs p-4 max-h-52 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(tx.raw || tx, null, 2)}
            </pre>
          </div>
        </div>

        <div
          className={`p-6 border-t space-y-3 ${
            isDark
              ? "border-slate-800 bg-slate-950"
              : "border-slate-200 bg-white"
          }`}
        >
          {status === "pending" && (
            <>
              <button
                type="button"
                onClick={onMarkPaid}
                disabled={isProcessing}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-sm shadow-md transition disabled:opacity-50 flex justify-center items-center gap-2"
              >
                <CheckCircle2 size={18} />
                {isProcessing ? "..." : t.btnMarkPaid}
              </button>

              <button
                type="button"
                onClick={onCancel}
                disabled={isProcessing}
                className={`w-full py-3 rounded-xl font-bold text-sm border transition ${
                  isDark
                    ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                } disabled:opacity-50`}
              >
                {t.btnCancel}
              </button>
            </>
          )}

          {status !== "pending" && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isProcessing}
              className="w-full py-3 bg-rose-500/10 text-rose-600 dark:text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl font-bold text-sm transition disabled:opacity-50 flex justify-center items-center gap-2"
            >
              <Trash2 size={16} />
              {t.btnDelete}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  isDark,
  label,
  value,
  valueNode,
  mono = false,
  valueClassName = "",
}) {
  return (
    <div
      className={`px-4 py-3 flex justify-between gap-4 border-b last:border-b-0 text-sm ${
        isDark ? "border-slate-800" : "border-slate-100"
      }`}
    >
      <span className="text-slate-500 shrink-0">{label}</span>

      {valueNode ? (
        <span>{valueNode}</span>
      ) : (
        <span
          className={`text-right break-all ${
            mono ? "font-mono font-bold" : "font-medium"
          } ${
            valueClassName ||
            (isDark ? "text-white" : "text-slate-900")
          }`}
        >
          {safeText(value)}
        </span>
      )}
    </div>
  );
}