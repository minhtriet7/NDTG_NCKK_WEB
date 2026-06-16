import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import {
  getAdminBanknotes,
  createBanknote,
  updateBanknote,
  deleteBanknote,
} from "../../services/adminService";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  X,
  Database,
  Save,
  Loader2,
  RefreshCw,
  FileX,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import toast from "react-hot-toast";

const EMPTY_FORM = {
  denomination: "",
  currency: "",
  country: "",
  material: "",
  front_image_url: "",
  back_image_url: "",
  description: "",
  features_text: "",
  year: "",
  is_active: true,
};

function normalizeList(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.results)
          ? data.results
          : [];

  return list.map((item) => ({
    id: item?.id || item?._id,
    _id: item?._id,
    denomination: item?.denomination ?? item?.menh_gia ?? "",
    currency: item?.currency ?? item?.currency_code ?? item?.loai_tien ?? "",
    country: item?.country ?? item?.quoc_gia ?? "",
    material: item?.material ?? item?.chat_lieu ?? "",
    front_image_url:
      item?.front_image_url ||
      item?.image_url ||
      item?.uploaded_image_url ||
      item?.thumbnail_url ||
      "",
    back_image_url: item?.back_image_url || "",
    description: item?.description || item?.mo_ta || "",
    features: Array.isArray(item?.features) ? item.features : [],
    year: item?.year || item?.issue_year || "",
    is_active: item?.is_active !== false,
    created_at: item?.created_at,
    updated_at: item?.updated_at,
    raw: item,
  }));
}

function getId(item) {
  return item?.id || item?._id;
}

function toPayload(formData) {
  const features = String(formData.features_text || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    denomination: Number.isNaN(Number(formData.denomination))
      ? formData.denomination
      : Number(formData.denomination),
    currency: String(formData.currency || "").trim().toUpperCase(),
    country: String(formData.country || "").trim(),
    material: String(formData.material || "").trim(),
    front_image_url: String(formData.front_image_url || "").trim(),
    back_image_url: String(formData.back_image_url || "").trim(),
    description: String(formData.description || "").trim(),
    features,
    year: formData.year ? Number(formData.year) : null,
    is_active: Boolean(formData.is_active),
  };
}

export default function BanknotesManager() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = {
    EN: {
      title: "Banknotes Inventory",
      subtitle:
        "Manage the core dataset used for AI visual matching and verification.",
      searchPlaceholder: "Search country, denomination, currency...",
      btnAdd: "New Banknote",
      refresh: "Refresh",
      statusAll: "Status: All",
      active: "Active",
      hidden: "Hidden",
      total: "Total Banknotes",
      activeCount: "Active",
      hiddenCount: "Hidden",
      countries: "Countries",
      thImg: "Image",
      thDenom: "Denomination",
      thCountry: "Country",
      thMaterial: "Material",
      thStatus: "Status",
      thAction: "Actions",
      drwCreate: "Create Banknote",
      drwEdit: "Edit Banknote",
      btnSave: "Save",
      btnCancel: "Cancel",
      noData: "No banknotes found.",
      loadFailed: "Failed to load banknotes.",
      saveFailed: "Operation failed.",
      deleteFailed: "Delete failed.",
      created: "Banknote created.",
      updated: "Banknote updated.",
      deleted: "Deleted successfully.",
      deleteConfirm: "Delete this banknote?",
    },
    VI: {
      title: "Kho Dữ liệu Tiền Giấy",
      subtitle:
        "Quản lý tập dữ liệu cốt lõi dùng cho AI đối chiếu và xác thực.",
      searchPlaceholder: "Tìm quốc gia, mệnh giá, mã tiền...",
      btnAdd: "Thêm Tiền Giấy",
      refresh: "Tải lại",
      statusAll: "Trạng thái: Tất cả",
      active: "Đang bật",
      hidden: "Đang ẩn",
      total: "Tổng tiền giấy",
      activeCount: "Đang bật",
      hiddenCount: "Đang ẩn",
      countries: "Quốc gia",
      thImg: "Ảnh",
      thDenom: "Mệnh giá",
      thCountry: "Quốc gia",
      thMaterial: "Chất liệu",
      thStatus: "Trạng thái",
      thAction: "Thao tác",
      drwCreate: "Thêm Mới Tiền Giấy",
      drwEdit: "Chỉnh Sửa Tiền Giấy",
      btnSave: "Lưu",
      btnCancel: "Hủy",
      noData: "Không tìm thấy dữ liệu tiền giấy.",
      loadFailed: "Không thể tải dữ liệu tiền giấy.",
      saveFailed: "Thao tác thất bại.",
      deleteFailed: "Xóa thất bại.",
      created: "Đã tạo tiền giấy.",
      updated: "Đã cập nhật tiền giấy.",
      deleted: "Đã xóa thành công.",
      deleteConfirm: "Xóa tiền giấy này?",
    },
  }[lang || "EN"];

  const cardBg = isDark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";
  const textMain = isDark ? "text-slate-100" : "text-slate-900";
  const inputCls = `w-full h-11 px-4 rounded-xl border outline-none text-sm transition-colors ${
    isDark
      ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-teal-500"
      : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:bg-white"
  }`;

  const loadData = async () => {
    setIsLoading(true);

    try {
      const data = await getAdminBanknotes();
      setNotes(normalizeList(data));
    } catch (error) {
      console.error("Load banknotes failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t.loadFailed,
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    return {
      total: notes.length,
      active: notes.filter((item) => item.is_active).length,
      hidden: notes.filter((item) => !item.is_active).length,
      countries: new Set(notes.map((item) => item.country).filter(Boolean)).size,
    };
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return notes.filter((note) => {
      const matchSearch =
        !term ||
        String(note.country || "").toLowerCase().includes(term) ||
        String(note.currency || "").toLowerCase().includes(term) ||
        String(note.denomination || "").toLowerCase().includes(term) ||
        String(note.material || "").toLowerCase().includes(term);

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && note.is_active) ||
        (statusFilter === "hidden" && !note.is_active);

      return matchSearch && matchStatus;
    });
  }, [notes, searchTerm, statusFilter]);

  const handleOpenCreate = () => {
    setFormMode("create");
    setFormData(EMPTY_FORM);
    setSelectedId(null);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (note) => {
    setFormMode("edit");
    setFormData({
      denomination: note.denomination ?? "",
      currency: note.currency || "",
      country: note.country || "",
      material: note.material || "",
      front_image_url: note.front_image_url || "",
      back_image_url: note.back_image_url || "",
      description: note.description || "",
      features_text: Array.isArray(note.features) ? note.features.join("\n") : "",
      year: note.year || "",
      is_active: note.is_active !== false,
    });
    setSelectedId(getId(note));
    setDrawerOpen(true);
  };

  const handleDelete = async (id) => {
    if (!id) return;
    if (!window.confirm(t.deleteConfirm)) return;

    setIsSubmitting(true);

    try {
      await deleteBanknote(id);
      toast.success(t.deleted);
      await loadData();
    } catch (error) {
      console.error("Delete banknote failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t.deleteFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateForm = () => {
    if (!String(formData.country || "").trim()) {
      toast.error(lang === "VI" ? "Vui lòng nhập quốc gia." : "Please enter country.");
      return false;
    }

    if (!String(formData.currency || "").trim()) {
      toast.error(lang === "VI" ? "Vui lòng nhập mã tiền." : "Please enter currency code.");
      return false;
    }

    if (!String(formData.denomination || "").trim()) {
      toast.error(lang === "VI" ? "Vui lòng nhập mệnh giá." : "Please enter denomination.");
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
        await createBanknote(payload);
        toast.success(t.created);
      } else {
        await updateBanknote(selectedId, payload);
        toast.success(t.updated);
      }

      setDrawerOpen(false);
      await loadData();
    } catch (error) {
      console.error("Save banknote failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t.saveFailed,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-[fadeInUp_0.3s_ease-out]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={loadData}
            disabled={isLoading}
            className={`px-4 py-2.5 rounded-xl border font-bold text-sm flex items-center gap-2 ${
              isDark
                ? "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            } disabled:opacity-60`}
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            {t.refresh}
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-sm"
          >
            <Plus size={18} /> {t.btnAdd}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t.total} value={stats.total} isDark={isDark} icon={<Database size={18} />} />
        <StatCard label={t.activeCount} value={stats.active} isDark={isDark} icon={<CheckCircle2 size={18} />} />
        <StatCard label={t.hiddenCount} value={stats.hidden} isDark={isDark} icon={<AlertTriangle size={18} />} />
        <StatCard label={t.countries} value={stats.countries} isDark={isDark} icon={<Database size={18} />} />
      </div>

      <div className={`p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-3 ${cardBg}`}>
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className={`${inputCls} pl-10`}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className={`${inputCls} md:w-52`}
        >
          <option value="all">{t.statusAll}</option>
          <option value="active">{t.active}</option>
          <option value="hidden">{t.hidden}</option>
        </select>
      </div>

      <div className={`rounded-xl border shadow-sm overflow-hidden ${cardBg}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead
              className={`uppercase text-[11px] font-bold tracking-wider text-slate-500 border-b ${
                isDark ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}
            >
              <tr>
                <th className="px-6 py-4">{t.thImg}</th>
                <th className="px-6 py-4">{t.thDenom}</th>
                <th className="px-6 py-4">{t.thCountry}</th>
                <th className="px-6 py-4">{t.thMaterial}</th>
                <th className="px-6 py-4">{t.thStatus}</th>
                <th className="px-6 py-4 text-right">{t.thAction}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">
                    <Loader2 className="animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center">
                    <FileX className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm font-bold text-slate-500">{t.noData}</p>
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note) => (
                  <tr
                    key={getId(note)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="w-16 h-10 rounded overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        {note.front_image_url ? (
                          <img
                            src={note.front_image_url}
                            alt="note"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='2' ry='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg>";
                            }}
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">No Img</span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <p className={`font-bold ${textMain}`}>{note.denomination}</p>
                      <p className="text-xs text-slate-500 uppercase">{note.currency}</p>
                    </td>

                    <td className={`px-6 py-4 font-medium ${textMain}`}>
                      {note.country || "N/A"}
                    </td>

                    <td className="px-6 py-4 text-slate-500">
                      {note.material || "N/A"}
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          note.is_active
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {note.is_active ? t.active : t.hidden}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleOpenEdit(note)}
                        className="p-2 text-slate-400 hover:text-teal-600"
                      >
                        <Edit size={16} />
                      </button>

                      <button
                        onClick={() => handleDelete(getId(note))}
                        disabled={isSubmitting}
                        className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-sm">
          <div
            className={`w-full max-w-md h-full flex flex-col shadow-2xl animate-[slideInRight_0.3s_ease-out] ${cardBg}`}
          >
            <div
              className={`p-6 border-b flex justify-between items-center ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <h3 className={`font-bold text-lg ${textMain}`}>
                {formMode === "create" ? t.drwCreate : t.drwEdit}
              </h3>

              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <form id="bnForm" onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Country">
                  <input
                    required
                    value={formData.country}
                    onChange={(event) =>
                      setFormData({ ...formData, country: event.target.value })
                    }
                    className={inputCls}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Currency">
                    <input
                      required
                      value={formData.currency}
                      onChange={(event) =>
                        setFormData({ ...formData, currency: event.target.value })
                      }
                      className={inputCls}
                    />
                  </FormField>

                  <FormField label="Denomination">
                    <input
                      required
                      value={formData.denomination}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          denomination: event.target.value,
                        })
                      }
                      className={inputCls}
                    />
                  </FormField>
                </div>

                <FormField label="Material">
                  <input
                    value={formData.material}
                    onChange={(event) =>
                      setFormData({ ...formData, material: event.target.value })
                    }
                    className={inputCls}
                  />
                </FormField>

                <FormField label="Front Image URL">
                  <input
                    type="url"
                    value={formData.front_image_url}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        front_image_url: event.target.value,
                      })
                    }
                    className={inputCls}
                  />
                </FormField>

                <FormField label="Back Image URL">
                  <input
                    type="url"
                    value={formData.back_image_url}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        back_image_url: event.target.value,
                      })
                    }
                    className={inputCls}
                  />
                </FormField>

                <FormField label="Year">
                  <input
                    type="number"
                    value={formData.year}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        year: event.target.value,
                      })
                    }
                    className={inputCls}
                  />
                </FormField>

                <FormField label="Description">
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        description: event.target.value,
                      })
                    }
                    className={`${inputCls} h-auto py-3`}
                  />
                </FormField>

                <FormField label="Features">
                  <textarea
                    rows={4}
                    value={formData.features_text}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        features_text: event.target.value,
                      })
                    }
                    className={`${inputCls} h-auto py-3`}
                    placeholder="One feature per line"
                  />
                </FormField>

                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        is_active: event.target.checked,
                      })
                    }
                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                  />

                  <span className={`text-sm font-bold ${textMain}`}>
                    {t.active}
                  </span>
                </label>
              </form>
            </div>

            <div
              className={`p-6 border-t flex gap-3 ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                {t.btnCancel}
              </button>

              <button
                form="bnForm"
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {t.btnSave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, isDark }) {
  return (
    <div
      className={`p-5 rounded-xl border shadow-sm ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">
          {label}
        </p>
        <div className="text-teal-500">{icon}</div>
      </div>
      <p className={`text-2xl font-black mt-2 ${isDark ? "text-white" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
