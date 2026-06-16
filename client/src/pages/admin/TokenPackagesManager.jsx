import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/appStore";
import {
  getAdminTokenPackages,
  createTokenPackage,
  updateTokenPackage,
  deleteTokenPackage,
  toggleTokenPackage,
} from "../../services/adminService";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  X,
  Save,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Package,
  Coins,
  BadgePercent,
  Eye,
  EyeOff,
} from "lucide-react";
import toast from "react-hot-toast";

const EMPTY_FORM = {
  package_key: "",
  name: "",
  description: "",
  tokens: 50,
  tokens_included: 50,
  price_vnd: 50000,
  price_usd: 2,
  features_text: "",
  badge: "",
  sort_order: 1,
  is_active: true,
};

function getId(item) {
  return item?.id || item?._id;
}

function normalizePackage(pkg = {}) {
  const tokens = Number(pkg.tokens_included ?? pkg.tokens ?? 0);

  return {
    id: getId(pkg),
    package_key: pkg.package_key || pkg.key || pkg.id || "",
    name: pkg.name || "",
    description: pkg.description || "",
    tokens,
    tokens_included: tokens,
    price_vnd: Number(pkg.price_vnd || 0),
    price_usd: Number(pkg.price_usd || 0),
    features: Array.isArray(pkg.features) ? pkg.features : [],
    badge: pkg.badge || "",
    sort_order: Number(pkg.sort_order || 0),
    is_active: pkg.is_active !== false,
    created_at: pkg.created_at,
    updated_at: pkg.updated_at,
  };
}

function normalizeList(data) {
  if (Array.isArray(data)) return data.map(normalizePackage);
  if (Array.isArray(data?.items)) return data.items.map(normalizePackage);
  if (Array.isArray(data?.data)) return data.data.map(normalizePackage);
  if (Array.isArray(data?.results)) return data.results.map(normalizePackage);
  return [];
}

function formatVND(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " đ";
}

function formatUSD(value) {
  return "$" + new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function toPayload(formData) {
  const tokens = Number(formData.tokens_included || formData.tokens || 0);

  const features = String(formData.features_text || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    package_key: formData.package_key.trim() || formData.name.trim().toLowerCase().replace(/\s+/g, "_"),
    name: formData.name.trim(),
    description: formData.description.trim(),
    tokens,
    tokens_included: tokens,
    price_vnd: Number(formData.price_vnd || 0),
    price_usd: Number(formData.price_usd || 0),
    features,
    badge: formData.badge.trim(),
    sort_order: Number(formData.sort_order || 0),
    is_active: Boolean(formData.is_active),
  };
}

export default function TokenPackagesManager() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [packages, setPackages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const [deleteModal, setDeleteModal] = useState({
    open: false,
    pkg: null,
  });

  const t = {
    EN: {
      title: "Token Packages",
      subtitle: "Create and manage token packages displayed on the user pricing page.",
      refresh: "Refresh",
      newPackage: "New Package",
      search: "Search package name...",
      status: "Status",
      all: "All",
      active: "Active",
      hidden: "Hidden",
      totalPackages: "Total Packages",
      activePackages: "Active Packages",
      totalTokens: "Total Tokens",
      bestValue: "Best Value",
      thPackage: "Package",
      thTokens: "Tokens",
      thPrice: "Price",
      thStatus: "Status",
      thSort: "Sort",
      thAction: "Actions",
      noData: "No packages found.",
      createTitle: "Create Package",
      editTitle: "Edit Package",
      name: "Package name",
      key: "Package key",
      keyHint: "Example: pkg_1, starter, pro",
      desc: "Description",
      tokens: "Tokens included",
      priceVND: "Price VND",
      priceUSD: "Price USD",
      badge: "Badge",
      sortOrder: "Sort order",
      features: "Features",
      featuresHint: "One feature per line",
      visible: "Show on user pricing page",
      save: "Save Package",
      cancel: "Cancel",
      createSuccess: "Package created.",
      updateSuccess: "Package updated.",
      deleteSuccess: "Package deleted.",
      toggleSuccess: "Package status updated.",
      loadError: "Failed to load token packages.",
      saveError: "Unable to save package.",
      deleteError: "Unable to delete package.",
      confirmDelete: "Delete package",
      confirmDeleteDesc: "This package will no longer be available. Continue?",
      delete: "Delete",
    },
    VI: {
      title: "Gói Token",
      subtitle: "Tạo và quản lý các gói token hiển thị ở trang mua token của người dùng.",
      refresh: "Làm mới",
      newPackage: "Tạo gói mới",
      search: "Tìm tên gói...",
      status: "Trạng thái",
      all: "Tất cả",
      active: "Đang bán",
      hidden: "Đang ẩn",
      totalPackages: "Tổng số gói",
      activePackages: "Gói đang bán",
      totalTokens: "Tổng token",
      bestValue: "Gợi ý",
      thPackage: "Gói",
      thTokens: "Token",
      thPrice: "Giá",
      thStatus: "Trạng thái",
      thSort: "Thứ tự",
      thAction: "Thao tác",
      noData: "Chưa có gói token nào.",
      createTitle: "Tạo gói token",
      editTitle: "Cập nhật gói token",
      name: "Tên gói",
      key: "Mã gói",
      keyHint: "Ví dụ: pkg_1, starter, pro",
      desc: "Mô tả",
      tokens: "Số token nhận được",
      priceVND: "Giá VND",
      priceUSD: "Giá USD",
      badge: "Nhãn hiển thị",
      sortOrder: "Thứ tự hiển thị",
      features: "Quyền lợi",
      featuresHint: "Mỗi dòng là một quyền lợi",
      visible: "Hiển thị ở trang mua token",
      save: "Lưu gói",
      cancel: "Hủy",
      createSuccess: "Đã tạo gói token.",
      updateSuccess: "Đã cập nhật gói token.",
      deleteSuccess: "Đã xóa gói token.",
      toggleSuccess: "Đã cập nhật trạng thái gói.",
      loadError: "Không thể tải danh sách gói token.",
      saveError: "Không thể lưu gói token.",
      deleteError: "Không thể xóa gói token.",
      confirmDelete: "Xóa gói token",
      confirmDeleteDesc: "Gói này sẽ không còn khả dụng. Bạn muốn tiếp tục?",
      delete: "Xóa",
    },
  }[lang || "EN"];

  const cardClass = isDark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";

  const inputClass = isDark
    ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-teal-500"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white";

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getAdminTokenPackages();
      const list = normalizeList(data).sort((a, b) => {
        return Number(a.sort_order || 0) - Number(b.sort_order || 0);
      });
      setPackages(list);
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || t.loadError);
      setPackages([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const keyword = searchTerm.toLowerCase();
      const matchSearch =
        pkg.name.toLowerCase().includes(keyword) ||
        pkg.package_key.toLowerCase().includes(keyword);

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && pkg.is_active) ||
        (statusFilter === "hidden" && !pkg.is_active);

      return matchSearch && matchStatus;
    });
  }, [packages, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: packages.length,
      active: packages.filter((pkg) => pkg.is_active).length,
      tokens: packages.reduce((sum, pkg) => sum + Number(pkg.tokens || 0), 0),
      best: packages.find((pkg) => String(pkg.badge || "").trim())?.name || "N/A",
    };
  }, [packages]);

  const openCreate = () => {
    setFormMode("create");
    setSelectedPackage(null);
    setFormData({
      ...EMPTY_FORM,
      sort_order: packages.length + 1,
    });
    setDrawerOpen(true);
  };

  const openEdit = (pkg) => {
    setFormMode("edit");
    setSelectedPackage(pkg);
    setFormData({
      package_key: pkg.package_key || "",
      name: pkg.name || "",
      description: pkg.description || "",
      tokens: pkg.tokens || 0,
      tokens_included: pkg.tokens_included || pkg.tokens || 0,
      price_vnd: pkg.price_vnd || 0,
      price_usd: pkg.price_usd || 0,
      features_text: Array.isArray(pkg.features) ? pkg.features.join("\n") : "",
      badge: pkg.badge || "",
      sort_order: pkg.sort_order || 0,
      is_active: pkg.is_active !== false,
    });
    setDrawerOpen(true);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "tokens" || field === "tokens_included") {
        next.tokens = value;
        next.tokens_included = value;
      }

      return next;
    });
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      toast.error(lang === "VI" ? "Vui lòng nhập tên gói." : "Please enter package name.");
      return false;
    }

    if (Number(formData.tokens_included || formData.tokens) <= 0) {
      toast.error(lang === "VI" ? "Token phải lớn hơn 0." : "Tokens must be greater than 0.");
      return false;
    }

    if (Number(formData.price_vnd) < 0 || Number(formData.price_usd) < 0) {
      toast.error(lang === "VI" ? "Giá không hợp lệ." : "Invalid price.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const payload = toPayload(formData);

      if (formMode === "create") {
        await createTokenPackage(payload);
        toast.success(t.createSuccess);
      } else {
        await updateTokenPackage(getId(selectedPackage), payload);
        toast.success(t.updateSuccess);
      }

      setDrawerOpen(false);
      await loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || t.saveError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.pkg) return;

    setIsSubmitting(true);

    try {
      await deleteTokenPackage(getId(deleteModal.pkg));
      toast.success(t.deleteSuccess);
      setDeleteModal({ open: false, pkg: null });
      await loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || t.deleteError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (pkg) => {
    try {
      if (typeof toggleTokenPackage === "function") {
        await toggleTokenPackage(getId(pkg));
      } else {
        await updateTokenPackage(getId(pkg), {
          ...toPayload({
            ...pkg,
            features_text: Array.isArray(pkg.features) ? pkg.features.join("\n") : "",
          }),
          is_active: !pkg.is_active,
        });
      }

      toast.success(t.toggleSuccess);
      await loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || t.saveError);
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {t.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={loadData}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition ${
              isDark
                ? "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <RefreshCw size={16} />
            {t.refresh}
          </button>

          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-bold shadow-md transition"
          >
            <Plus size={16} />
            {t.newPackage}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          isDark={isDark}
          label={t.totalPackages}
          value={stats.total}
          icon={<Package size={18} />}
        />
        <StatCard
          isDark={isDark}
          label={t.activePackages}
          value={stats.active}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          isDark={isDark}
          label={t.totalTokens}
          value={stats.tokens}
          icon={<Coins size={18} />}
        />
        <StatCard
          isDark={isDark}
          label={t.bestValue}
          value={stats.best}
          icon={<BadgePercent size={18} />}
        />
      </div>

      <div className={`p-4 rounded-xl border shadow-sm ${cardClass}`}>
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder={t.search}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm outline-none transition-all ${inputClass}`}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={`px-4 py-2.5 border rounded-xl text-sm font-semibold outline-none transition-all ${inputClass}`}
          >
            <option value="all">
              {t.status}: {t.all}
            </option>
            <option value="active">{t.active}</option>
            <option value="hidden">{t.hidden}</option>
          </select>
        </div>
      </div>

      <div className={`rounded-xl border shadow-sm overflow-hidden ${cardClass}`}>
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
                <th className="px-5 py-4">{t.thPackage}</th>
                <th className="px-5 py-4">{t.thTokens}</th>
                <th className="px-5 py-4">{t.thPrice}</th>
                <th className="px-5 py-4">{t.thStatus}</th>
                <th className="px-5 py-4">{t.thSort}</th>
                <th className="px-5 py-4 text-right">{t.thAction}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {isLoading ? (
                Array(5)
                  .fill(0)
                  .map((_, index) => <SkeletonRow key={index} />)
              ) : filteredPackages.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-20">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${
                          isDark ? "bg-slate-800 text-slate-500" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <Package size={24} />
                      </div>
                      <p className="font-bold text-slate-500">{t.noData}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredPackages.map((pkg) => (
                  <tr
                    key={pkg.id || pkg.package_key}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                            isDark ? "bg-slate-800 text-teal-400" : "bg-teal-50 text-teal-600"
                          }`}
                        >
                          <Package size={18} />
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black text-slate-900 dark:text-white">
                              {pkg.name}
                            </p>
                            {pkg.badge && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {pkg.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 max-w-[320px] truncate">
                            {pkg.description || pkg.package_key || "N/A"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-lg font-black text-teal-600 dark:text-teal-400">
                        {pkg.tokens_included || pkg.tokens}
                      </p>
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Tokens
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900 dark:text-white">
                        {formatVND(pkg.price_vnd)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatUSD(pkg.price_usd)}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggle(pkg)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border transition ${
                          pkg.is_active
                            ? "bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800/50"
                            : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                        }`}
                      >
                        {pkg.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                        {pkg.is_active ? t.active : t.hidden}
                      </button>
                    </td>

                    <td className="px-5 py-4 text-slate-500 font-bold">
                      #{pkg.sort_order || 0}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(pkg)}
                          className={`p-2 rounded-lg border transition ${
                            isDark
                              ? "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-teal-400"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-teal-600"
                          }`}
                        >
                          <Edit size={14} />
                        </button>

                        <button
                          onClick={() => setDeleteModal({ open: true, pkg })}
                          className={`p-2 rounded-lg border transition ${
                            isDark
                              ? "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-rose-400"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-rose-600"
                          }`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          <div
            className={`relative w-full max-w-xl h-full flex flex-col shadow-2xl ${
              isDark ? "bg-slate-950 border-l border-slate-800" : "bg-white"
            }`}
          >
            <div
              className={`px-6 py-5 border-b flex justify-between items-start ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <div>
                <h3 className="font-black text-xl text-slate-900 dark:text-white">
                  {formMode === "create" ? t.createTitle : t.editTitle}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {lang === "VI"
                    ? "Các thay đổi sẽ ảnh hưởng đến trang mua token của người dùng."
                    : "Changes will affect the user pricing page."}
                </p>
              </div>

              <button
                onClick={() => setDrawerOpen(false)}
                className={`p-2 rounded-xl transition ${
                  isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"
                }`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <form id="packageForm" onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={t.name}>
                    <input
                      required
                      value={formData.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition ${inputClass}`}
                      placeholder="Starter Pack"
                    />
                  </Field>

                  <Field label={t.key}>
                    <input
                      value={formData.package_key}
                      onChange={(e) => handleChange("package_key", e.target.value)}
                      className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition ${inputClass}`}
                      placeholder={t.keyHint}
                    />
                  </Field>
                </div>

                <Field label={t.desc}>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition resize-none ${inputClass}`}
                    placeholder={
                      lang === "VI"
                        ? "Mô tả ngắn về gói token..."
                        : "Short package description..."
                    }
                  />
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label={t.tokens}>
                    <input
                      required
                      min={1}
                      type="number"
                      value={formData.tokens_included}
                      onChange={(e) => handleChange("tokens_included", e.target.value)}
                      className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition font-bold ${inputClass}`}
                    />
                  </Field>

                  <Field label={t.priceVND}>
                    <input
                      required
                      min={0}
                      type="number"
                      value={formData.price_vnd}
                      onChange={(e) => handleChange("price_vnd", e.target.value)}
                      className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition ${inputClass}`}
                    />
                  </Field>

                  <Field label={t.priceUSD}>
                    <input
                      min={0}
                      step="0.01"
                      type="number"
                      value={formData.price_usd}
                      onChange={(e) => handleChange("price_usd", e.target.value)}
                      className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition ${inputClass}`}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={t.badge}>
                    <input
                      value={formData.badge}
                      onChange={(e) => handleChange("badge", e.target.value)}
                      className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition ${inputClass}`}
                      placeholder={lang === "VI" ? "Gợi ý" : "Best Value"}
                    />
                  </Field>

                  <Field label={t.sortOrder}>
                    <input
                      min={0}
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => handleChange("sort_order", e.target.value)}
                      className={`w-full h-11 px-4 rounded-xl border text-sm outline-none transition ${inputClass}`}
                    />
                  </Field>
                </div>

                <Field label={t.features}>
                  <textarea
                    rows={5}
                    value={formData.features_text}
                    onChange={(e) => handleChange("features_text", e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition resize-none ${inputClass}`}
                    placeholder={t.featuresHint}
                  />
                </Field>

                <label
                  className={`flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer transition ${
                    isDark
                      ? "bg-slate-900 border-slate-800 hover:border-teal-700"
                      : "bg-slate-50 border-slate-200 hover:border-teal-300"
                  }`}
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {t.visible}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {lang === "VI"
                        ? "Tắt tùy chọn này nếu bạn muốn ẩn gói khỏi trang Pricing."
                        : "Turn this off to hide the package from Pricing."}
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => handleChange("is_active", e.target.checked)}
                    className="w-5 h-5 accent-teal-600"
                  />
                </label>
              </form>
            </div>

            <div
              className={`p-6 border-t flex gap-3 ${
                isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"
              }`}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                disabled={isSubmitting}
                className={`flex-1 py-3 rounded-xl font-bold text-sm border transition ${
                  isDark
                    ? "border-slate-800 hover:bg-slate-800 text-slate-300"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {t.cancel}
              </button>

              <button
                form="packageForm"
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmitting ? "..." : <><Save size={16} /> {t.save}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div
            className={`w-full max-w-sm rounded-xl shadow-2xl p-6 border ${
              isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            }`}
          >
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              {t.confirmDelete}
            </h3>

            <p className="text-sm text-slate-500 mt-2">
              {t.confirmDeleteDesc}
            </p>

            <div
              className={`mt-5 p-4 rounded-xl border ${
                isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-100"
              }`}
            >
              <p className="font-bold text-slate-900 dark:text-white">
                {deleteModal.pkg?.name}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {deleteModal.pkg?.tokens_included || deleteModal.pkg?.tokens} tokens ·{" "}
                {formatVND(deleteModal.pkg?.price_vnd)}
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setDeleteModal({ open: false, pkg: null })}
                disabled={isSubmitting}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm border transition ${
                  isDark
                    ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {t.cancel}
              </button>

              <button
                onClick={handleDelete}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-sm transition disabled:opacity-50"
              >
                {isSubmitting ? "..." : t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function StatCard({ isDark, label, value, icon }) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <span className="text-teal-500">{icon}</span>
      </div>
      <p className="mt-3 text-xl font-black text-slate-900 dark:text-white truncate">
        {value}
      </p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-5 py-4">
        <div className="flex gap-3 items-center">
          <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="space-y-2">
            <div className="w-32 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="w-44 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="w-12 h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-24 h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-20 h-5 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-10 h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-20 h-8 ml-auto bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
    </tr>
  );
}