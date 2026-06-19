import React, { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import {
  getAdminUsers,
  updateUserRole,
  updateUserStatus,
  deleteUser,
} from "../../services/adminService";
import {
  Search,
  Filter,
  RotateCcw,
  Trash2,
  Edit,
  AlertTriangle,
  Mail,
  RefreshCw,
  Users,
  CheckCircle2,
  XCircle,
  Shield,
} from "lucide-react";
import toast from "react-hot-toast";

function getAvatarUrl(user = {}) {
  return (
    user.avatar_url ||
    user.avatar ||
    user.image_url ||
    user.photo_url ||
    user.profile_image ||
    user.picture ||
    user.photoURL ||
    user.profile?.avatar_url ||
    user.profile?.avatar ||
    user.profile?.image_url ||
    user.profile?.photo_url ||
    ""
  );
}

function normalizeUser(user = {}) {
  return {
    id: user.id || user._id,
    _id: user._id,
    full_name: user.full_name || user.name || user.username || user.email?.split("@")[0] || "",
    email: user.email || "",
    avatar_url: getAvatarUrl(user),
    role: user.role || (user.is_admin ? "admin" : "user"),
    is_active: user.is_active !== false && user.status !== "blocked" && user.status !== "banned",
    token_balance: user.token_balance ?? user.tokens ?? user.balance ?? 0,
    auth_provider: user.auth_provider || user.provider || "local",
    created_at: user.created_at || user.joined_at || user.createdAt,
    raw: user,
  };
}

function UserAvatar({ user }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = user?.avatar_url;

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
      {avatarUrl && !imageFailed ? (
        <img
          src={avatarUrl}
          alt={getUserName(user)}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Users size={16} className="text-slate-400" aria-hidden="true" />
      )}
    </div>
  );
}

function normalizeUsersResponse(data) {
  if (Array.isArray(data)) {
    return { items: data.map(normalizeUser), total: data.length };
  }
  return {
    items: (data?.items || data?.data || data?.results || []).map(normalizeUser),
    total: data?.total || data?.count || data?.items?.length || 0,
  };
}

function getUserId(user) {
  return user?.id || user?._id;
}

function getUserName(user, fallback = "") {
  return user?.full_name || user?.name || user?.username || fallback;
}

function formatDate(value, lang, fallback = "") {
  if (!value) return fallback;
  try {
    return new Intl.DateTimeFormat(lang === "VI" ? "vi-VN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return fallback;
  }
}

export default function UsersManager() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [editModal, setEditModal] = useState({ open: false, user: null, originalRole: null, originalStatus: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, user: null });
  const [isProcessing, setIsProcessing] = useState(false);

  const t = {
    EN: {
      title: "User Management",
      subtitle: "Directory of all registered accounts and access controls.",
      searchPlaceholder: "Search by name or email...",
      filterRole: "Role",
      filterStatus: "State",
      filterAll: "All",
      refresh: "Sync",
      totalUsers: "Total Accounts",
      activeUsers: "Active Accounts",
      adminUsers: "Administrators",
      bannedUsers: "Suspended",
      thUser: "Account Details",
      thProvider: "Auth",
      thToken: "Balance",
      thRole: "Role",
      thStatus: "Status",
      thJoined: "Registered Date",
      thAction: "Actions",
      stActive: "Active",
      stBanned: "Suspended",
      btnEdit: "Modify",
      btnDelete: "Revoke",
      btnCancel: "Cancel",
      btnSave: "Save Configuration",
      btnConfirmDel: "Confirm Deletion",
      modalEditTitle: "Account Configuration",
      modalDelTitle: "Revoke Account",
      modalDelMsg: "This action will permanently delete the selected account. This cannot be undone.",
      errLoad: "Failed to fetch directory.",
      noData: "No matching records.",
      msgSuccess: "Account updated.",
      msgDelSuccess: "Account revoked.",
      lblRole: "System Role",
      lblStatus: "Account Status",
      lblAccountRef: "Account Reference",
      roleUser: "Standard User",
      roleAdmin: "Administrator",
      loading: "Loading...",
      noDataYet: "No data yet",
    },
    VI: {
      title: "Quản lý Người dùng",
      subtitle: "Danh bạ toàn bộ tài khoản và quyền truy cập hệ thống.",
      searchPlaceholder: "Tìm kiếm tên, email...",
      filterRole: "Vai trò",
      filterStatus: "Trạng thái",
      filterAll: "Tất cả",
      refresh: "Đồng bộ",
      totalUsers: "Tổng tài khoản",
      activeUsers: "Đang hoạt động",
      adminUsers: "Quản trị viên",
      bannedUsers: "Bị đình chỉ",
      thUser: "Thông tin tài khoản",
      thProvider: "Xác thực",
      thToken: "Số dư",
      thRole: "Vai trò",
      thStatus: "Trạng thái",
      thJoined: "Ngày đăng ký",
      thAction: "Tác vụ",
      stActive: "Hoạt động",
      stBanned: "Đình chỉ",
      btnEdit: "Chỉnh sửa",
      btnDelete: "Xóa",
      btnCancel: "Hủy",
      btnSave: "Lưu cấu hình",
      btnConfirmDel: "Xác nhận xóa",
      modalEditTitle: "Cấu hình Tài khoản",
      modalDelTitle: "Xóa Tài khoản",
      modalDelMsg: "Hành động này sẽ xóa vĩnh viễn tài khoản đã chọn và không thể hoàn tác.",
      errLoad: "Lỗi tải danh bạ.",
      noData: "Không có bản ghi phù hợp.",
      msgSuccess: "Cập nhật thành công.",
      msgDelSuccess: "Xóa thành công.",
      lblRole: "Vai trò Hệ thống",
      lblStatus: "Trạng thái Tài khoản",
      lblAccountRef: "Tham chiếu Tài khoản",
      roleUser: "Người dùng Tiêu chuẩn",
      roleAdmin: "Quản trị viên",
      loading: "Đang tải...",
      noDataYet: "Chưa có dữ liệu",
    },
  }[lang || "EN"];

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getAdminUsers({ page: 1, limit: 500, search: searchTerm || undefined, role: roleFilter !== 'all' ? roleFilter : undefined, status: statusFilter !== 'all' ? statusFilter : undefined });
      const normalized = normalizeUsersResponse(data);
      setUsers(normalized.items);
      setTotalUsers(normalized.total);
    } catch (error) {
      toast.error(error?.response?.data?.detail || t.errLoad);
      setUsers([]);
      setTotalUsers(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchSearch = getUserName(user).toLowerCase().includes(searchTerm.toLowerCase()) || String(user.email || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = roleFilter === "all" || user.role === roleFilter;
      const matchStatus = statusFilter === "all" || (statusFilter === "active" && user.is_active) || (statusFilter === "blocked" && !user.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: totalUsers || users.length,
    active: users.filter(u => u.is_active).length,
    admin: users.filter(u => u.role === "admin").length,
    blocked: users.filter(u => !u.is_active).length,
  }), [users, totalUsers]);

  const resetFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editModal.user) return;
    setIsProcessing(true);
    try {
      const userId = getUserId(editModal.user);
      if (editModal.user.role !== editModal.originalRole) await updateUserRole(userId, editModal.user.role);
      if (editModal.user.is_active !== editModal.originalStatus) await updateUserStatus(userId, editModal.user.is_active);
      toast.success(t.msgSuccess);
      setEditModal({ open: false, user: null, originalRole: null, originalStatus: null });
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Update failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModal.user) return;
    setIsProcessing(true);
    try {
      await deleteUser(getUserId(deleteModal.user));
      toast.success(t.msgDelSuccess);
      setDeleteModal({ open: false, user: null });
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Delete failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">{t.subtitle}</p>
        </div>
        <button onClick={loadData} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-lg text-sm font-bold shadow-sm flex items-center gap-2 transition w-fit">
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> {t.refresh}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard isDark={isDark} title={t.totalUsers} val={stats.total} icon={<Users size={16} className="text-slate-400" />} />
        <StatCard isDark={isDark} title={t.activeUsers} val={stats.active} icon={<CheckCircle2 size={16} className="text-slate-400" />} />
        <StatCard isDark={isDark} title={t.adminUsers} val={stats.admin} icon={<Shield size={16} className="text-slate-400" />} />
        <StatCard isDark={isDark} title={t.bannedUsers} val={stats.blocked} icon={<XCircle size={16} className="text-slate-400" />} />
      </div>

      <div className={`p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full h-10 pl-9 pr-4 rounded-lg border outline-none text-sm font-medium transition-colors ${
              isDark ? "bg-slate-950 border-slate-800 text-white focus:border-slate-600" : "bg-slate-50 border-slate-200 focus:bg-white focus:border-slate-300"
            }`}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider">
            <Filter size={14} /> Filter
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={`h-10 px-3 rounded-lg border text-sm font-medium outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200"}`}>
            <option value="all">{t.filterRole}: {t.filterAll}</option>
            <option value="admin">{t.roleAdmin}</option>
            <option value="user">{t.roleUser}</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`h-10 px-3 rounded-lg border text-sm font-medium outline-none ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200"}`}>
            <option value="all">{t.filterStatus}: {t.filterAll}</option>
            <option value="active">{t.stActive}</option>
            <option value="blocked">{t.stBanned}</option>
          </select>
          <button onClick={resetFilters} className={`w-10 h-10 flex items-center justify-center rounded-lg border transition-colors ${isDark ? "border-slate-800 bg-slate-950 text-slate-400 hover:text-white" : "border-slate-200 bg-slate-50 hover:bg-white"}`}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div className={`rounded-xl border shadow-sm overflow-hidden ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className={`text-xs font-semibold uppercase tracking-wider border-b ${isDark ? "bg-slate-900/80 text-slate-500 border-slate-800" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
              <tr>
                <th className="px-5 py-3">{t.thUser}</th>
                <th className="px-5 py-3">{t.thProvider}</th>
                <th className="px-5 py-3">{t.thRole}</th>
                <th className="px-5 py-3">{t.thStatus}</th>
                <th className="px-5 py-3">{t.thJoined}</th>
                <th className="px-5 py-3 text-right">{t.thAction}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {isLoading ? (
                <tr><td colSpan="6" className="text-center py-8 text-slate-400 text-sm">{t.loading}</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-8 text-slate-400 text-sm">{t.noData}</td></tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={getUserId(user)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={user} />
                        <div>
                          <p className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-900"}`}>{getUserName(user, t.noDataYet)}</p>
                          <p className="text-[11px] font-mono text-slate-500 mt-0.5">{user.email || t.noDataYet}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {user.auth_provider || "Local"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {user.role === "admin" ? (
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{t.roleAdmin}</span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500">User</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {user.is_active ? (
                         <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/20 w-fit">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>{t.stActive}
                         </span>
                      ) : (
                         <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/20 w-fit">
                           <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>{t.stBanned}
                         </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-500">
                      {formatDate(user.created_at, lang, t.noDataYet)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditModal({ open: true, user: {...user}, originalRole: user.role, originalStatus: user.is_active })} className={`p-1.5 rounded border transition ${isDark ? "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                          <Edit size={14} />
                        </button>
                        <button onClick={() => setDeleteModal({ open: true, user })} className={`p-1.5 rounded border transition ${isDark ? "border-slate-700 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/50" : "border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"}`}>
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

      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <form onSubmit={handleUpdateUser} className={`w-full max-w-md rounded-xl shadow-xl p-6 border ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <h3 className={`text-lg font-bold mb-6 ${isDark ? "text-white" : "text-slate-900"}`}>{t.modalEditTitle}</h3>
            
            <div className={`p-4 rounded-lg border mb-6 flex items-center gap-3 ${isDark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
              <Mail className="text-slate-400" size={18} />
              <div className="overflow-hidden">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t.lblAccountRef}</p>
                <p className={`font-mono text-sm truncate ${isDark ? "text-slate-300" : "text-slate-700"}`}>{editModal.user?.email}</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block mb-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">{t.lblRole}</span>
                <select value={editModal.user?.role || "user"} onChange={(e) => setEditModal(m => ({...m, user: {...m.user, role: e.target.value}}))} className={`w-full h-11 px-3 rounded-lg border text-sm outline-none transition-colors ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200"}`}>
                  <option value="user">{t.roleUser}</option>
                  <option value="admin">{t.roleAdmin}</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">{t.lblStatus}</span>
                <select value={String(editModal.user?.is_active)} onChange={(e) => setEditModal(m => ({...m, user: {...m.user, is_active: e.target.value === "true"}}))} className={`w-full h-11 px-3 rounded-lg border text-sm outline-none transition-colors ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200"}`}>
                  <option value="true">{t.stActive}</option>
                  <option value="false">{t.stBanned}</option>
                </select>
              </label>
            </div>

            <div className="flex gap-3 mt-8">
              <button type="button" onClick={() => setEditModal({ open: false, user: null, originalRole: null, originalStatus: null })} disabled={isProcessing} className={`flex-1 h-10 rounded-lg font-bold text-sm border transition ${isDark ? "border-slate-700 hover:bg-slate-800 text-slate-300" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>
                {t.btnCancel}
              </button>
              <button type="submit" disabled={isProcessing} className="flex-1 h-10 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-bold text-sm transition disabled:opacity-50">
                {isProcessing ? "..." : t.btnSave}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-xl shadow-xl p-6 border text-center ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
              <AlertTriangle size={24} />
            </div>
            <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>{t.modalDelTitle}</h3>
            <p className="text-sm text-slate-500 mb-6">{t.modalDelMsg}</p>
            <p className="text-xs font-mono bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 rounded mb-6 truncate text-slate-600 dark:text-slate-400">
              {deleteModal.user?.email}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal({ open: false, user: null })} disabled={isProcessing} className={`flex-1 h-10 rounded-lg font-bold text-sm border transition ${isDark ? "border-slate-700 hover:bg-slate-800 text-slate-300" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>
                {t.btnCancel}
              </button>
              <button onClick={handleDeleteUser} disabled={isProcessing} className="flex-1 h-10 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-sm transition disabled:opacity-50">
                {isProcessing ? "..." : t.btnConfirmDel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ isDark, title, val, icon }) {
  return (
    <div className={`p-5 rounded-xl border shadow-sm flex flex-col h-[100px] ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
      <div className="flex justify-between items-center mb-auto">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</span>
        {icon}
      </div>
      <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{val ?? "0"}</span>
    </div>
  );
}
