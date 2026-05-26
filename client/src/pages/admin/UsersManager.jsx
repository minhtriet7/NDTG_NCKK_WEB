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
  CheckCircle2,
  XCircle,
  Trash2,
  Edit,
  AlertTriangle,
  ShieldCheck,
  Mail,
  User,
  Users,
  RefreshCw,
  Ban,
} from "lucide-react";
import toast from "react-hot-toast";


function normalizeUser(user = {}) {
  return {
    id: user.id || user._id,
    _id: user._id,
    full_name: user.full_name || user.name || user.username || user.email?.split("@")[0] || "N/A",
    email: user.email || "",
    avatar_url: user.avatar_url || user.picture || user.avatar || "",
    role: user.role || (user.is_admin ? "admin" : "user"),
    is_active: user.is_active !== false && user.status !== "blocked" && user.status !== "banned",
    token_balance: user.token_balance ?? user.tokens ?? user.balance ?? 0,
    auth_provider: user.auth_provider || user.provider || "local",
    created_at: user.created_at || user.joined_at || user.createdAt,
    raw: user,
  };
}

function normalizeUsersResponse(data) {
  if (Array.isArray(data)) {
    return {
      items: data.map(normalizeUser),
      total: data.length,
    };
  }

  return {
    items: (data?.items || data?.data || data?.results || []).map(normalizeUser),
    total: data?.total || data?.count || data?.items?.length || 0,
  };
}

function getUserId(user) {
  return user?.id || user?._id;
}

function getUserName(user) {
  return user?.full_name || user?.name || user?.username || "N/A";
}

function getProvider(user) {
  return user?.auth_provider || user?.provider || "local";
}

function formatDate(value, lang) {
  if (!value) return "N/A";

  try {
    return new Intl.DateTimeFormat(lang === "VI" ? "vi-VN" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return "N/A";
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
  const [providerFilter, setProviderFilter] = useState("all");

  const [editModal, setEditModal] = useState({
    open: false,
    user: null,
    originalRole: null,
    originalStatus: null,
  });

  const [deleteModal, setDeleteModal] = useState({
    open: false,
    user: null,
  });

  const [isProcessing, setIsProcessing] = useState(false);

  const t = {
    EN: {
      title: "Users Management",
      subtitle: "Manage user accounts, access roles, and account status.",
      searchPlaceholder: "Search name or email...",
      filterRole: "Role",
      filterStatus: "Status",
      filterProvider: "Provider",
      filterAll: "All",
      refresh: "Refresh",
      totalUsers: "Total Users",
      activeUsers: "Active Users",
      adminUsers: "Admin Users",
      bannedUsers: "Blocked Users",
      thUser: "User Info",
      thProvider: "Provider",
      thToken: "Tokens",
      thRole: "Role",
      thStatus: "Status",
      thJoined: "Joined Date",
      thAction: "Actions",
      stActive: "Active",
      stBanned: "Blocked",
      btnEdit: "Edit",
      btnDelete: "Delete",
      btnCancel: "Cancel",
      btnSave: "Save Changes",
      btnConfirmDel: "Confirm Delete",
      modalEditTitle: "Edit User Access",
      modalDelTitle: "Delete User",
      modalDelMsg:
        "Are you sure you want to delete this user? This action cannot be undone.",
      errLoad: "Failed to load users.",
      noData: "No users found.",
      msgSuccess: "User updated successfully.",
      msgDelSuccess: "User deleted successfully.",
      roleUser: "Normal User",
      roleAdmin: "Administrator",
      statusActive: "Active",
      statusBlocked: "Blocked",
      targetAccount: "Target Account",
      systemRole: "System Role",
      accountStatus: "Account Status",
    },
    VI: {
      title: "Quản lý người dùng",
      subtitle: "Quản lý tài khoản, phân quyền và trạng thái truy cập.",
      searchPlaceholder: "Tìm theo tên hoặc email...",
      filterRole: "Vai trò",
      filterStatus: "Trạng thái",
      filterProvider: "Đăng nhập",
      filterAll: "Tất cả",
      refresh: "Làm mới",
      totalUsers: "Tổng người dùng",
      activeUsers: "Đang hoạt động",
      adminUsers: "Quản trị viên",
      bannedUsers: "Bị khóa",
      thUser: "Thông tin",
      thProvider: "Đăng nhập",
      thToken: "Token",
      thRole: "Vai trò",
      thStatus: "Trạng thái",
      thJoined: "Ngày tham gia",
      thAction: "Thao tác",
      stActive: "Hoạt động",
      stBanned: "Bị khóa",
      btnEdit: "Sửa",
      btnDelete: "Xóa",
      btnCancel: "Hủy",
      btnSave: "Lưu thay đổi",
      btnConfirmDel: "Xác nhận xóa",
      modalEditTitle: "Sửa quyền truy cập",
      modalDelTitle: "Xóa tài khoản",
      modalDelMsg:
        "Bạn có chắc chắn muốn xóa tài khoản này? Hành động này không thể hoàn tác.",
      errLoad: "Không thể tải danh sách người dùng.",
      noData: "Không tìm thấy người dùng.",
      msgSuccess: "Cập nhật thành công.",
      msgDelSuccess: "Xóa thành công.",
      roleUser: "Người dùng thường",
      roleAdmin: "Quản trị viên",
      statusActive: "Hoạt động",
      statusBlocked: "Bị khóa",
      targetAccount: "Tài khoản",
      systemRole: "Vai trò hệ thống",
      accountStatus: "Trạng thái tài khoản",
    },
  }[lang || "EN"];

  const loadData = async () => {
    setIsLoading(true);

    try {
      const data = await getAdminUsers({
        page: 1,
        limit: 200,
        search: searchTerm || undefined,
        role: roleFilter,
        status: statusFilter,
        provider: providerFilter,
      });

      const normalized = normalizeUsersResponse(data);

      setUsers(normalized.items);
      setTotalUsers(normalized.total);
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || t.errLoad);
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
      const name = getUserName(user).toLowerCase();
      const email = String(user.email || "").toLowerCase();
      const provider = getProvider(user).toLowerCase();

      const matchSearch =
        name.includes(searchTerm.toLowerCase()) ||
        email.includes(searchTerm.toLowerCase());

      const matchRole = roleFilter === "all" || user.role === roleFilter;

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "blocked" && !user.is_active);

      const matchProvider =
        providerFilter === "all" || provider.includes(providerFilter);

      return matchSearch && matchRole && matchStatus && matchProvider;
    });
  }, [users, searchTerm, roleFilter, statusFilter, providerFilter]);

  const stats = useMemo(() => {
    return {
      total: totalUsers || users.length,
      active: users.filter((user) => user.is_active).length,
      admin: users.filter((user) => user.role === "admin").length,
      blocked: users.filter((user) => !user.is_active).length,
    };
  }, [users, totalUsers]);

  const resetFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
    setStatusFilter("all");
    setProviderFilter("all");
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();

    if (!editModal.user) return;

    setIsProcessing(true);

    try {
      const userId = getUserId(editModal.user);

      if (editModal.user.role !== editModal.originalRole) {
        await updateUserRole(userId, editModal.user.role);
      }

      if (editModal.user.is_active !== editModal.originalStatus) {
        await updateUserStatus(userId, editModal.user.is_active);
      }

      toast.success(t.msgSuccess);
      setEditModal({
        open: false,
        user: null,
        originalRole: null,
        originalStatus: null,
      });
      loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || "Update failed");
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
      toast.error(error?.response?.data?.detail || error?.response?.data?.message || error?.message || "Delete failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const cardClass = `rounded-3xl border shadow-sm transition-colors ${
    isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
  }`;

  const inputClass = `border text-sm rounded-xl px-3 py-2 outline-none transition-colors ${
    isDark
      ? "bg-slate-950 border-slate-800 text-slate-300"
      : "bg-slate-50 border-slate-200 text-slate-900"
  }`;

  return (
    <div className="w-full max-w-[1440px] mx-auto space-y-6 animate-[fadeInUp_0.4s_ease-out]">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {t.subtitle}
          </p>
        </div>

        <button
          onClick={loadData}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
            isDark
              ? "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <RefreshCw size={16} />
          {t.refresh}
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          isDark={isDark}
          label={t.totalUsers}
          value={stats.total}
          icon={<Users size={18} />}
        />
        <StatCard
          isDark={isDark}
          label={t.activeUsers}
          value={stats.active}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          isDark={isDark}
          label={t.adminUsers}
          value={stats.admin}
          icon={<ShieldCheck size={18} />}
        />
        <StatCard
          isDark={isDark}
          label={t.bannedUsers}
          value={stats.blocked}
          icon={<Ban size={18} />}
        />
      </div>

      <div
        className={`p-4 rounded-2xl border shadow-sm flex flex-col xl:flex-row gap-4 ${cardClass}`}
      >
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className={`w-full pl-9 pr-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all ${
              isDark
                ? "bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                : "bg-slate-50 border-slate-200 text-slate-900"
            }`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Filter size={16} />
          </div>

          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className={inputClass}
          >
            <option value="all">
              {t.filterRole}: {t.filterAll}
            </option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClass}
          >
            <option value="all">
              {t.filterStatus}: {t.filterAll}
            </option>
            <option value="active">{t.stActive}</option>
            <option value="blocked">{t.stBanned}</option>
          </select>

          <select
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
            className={inputClass}
          >
            <option value="all">
              {t.filterProvider}: {t.filterAll}
            </option>
            <option value="google">Google</option>
            <option value="local">Local</option>
            <option value="email">Email</option>
          </select>

          <button
            onClick={resetFilters}
            className={`p-2 border rounded-xl transition-colors ${
              isDark
                ? "text-slate-400 bg-slate-950 border-slate-800 hover:text-rose-400"
                : "text-slate-400 bg-slate-50 border-slate-200 hover:text-rose-600"
            }`}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className={`rounded-3xl border shadow-sm overflow-hidden ${cardClass}`}>
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
                <th className="px-5 py-4">{t.thUser}</th>
                <th className="px-5 py-4">{t.thProvider}</th>
                <th className="px-5 py-4">{t.thToken}</th>
                <th className="px-5 py-4">{t.thRole}</th>
                <th className="px-5 py-4">{t.thStatus}</th>
                <th className="px-5 py-4">{t.thJoined}</th>
                <th className="px-5 py-4 text-right">{t.thAction}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {isLoading ? (
                Array(6)
                  .fill(0)
                  .map((_, index) => <SkeletonRow key={index} />)
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="text-center py-16 text-slate-500 font-medium"
                  >
                    {t.noData}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={getUserId(user)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border overflow-hidden ${
                            isDark
                              ? "bg-slate-800 border-slate-700 text-slate-300"
                              : "bg-slate-100 border-slate-200 text-slate-600"
                          }`}
                        >
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            getUserName(user)?.[0]?.toUpperCase() || "U"
                          )}
                        </div>

                        <div>
                          <p
                            className={`font-bold ${
                              isDark ? "text-slate-200" : "text-slate-900"
                            }`}
                          >
                            {getUserName(user)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {user.email || "N/A"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase">
                        {getProvider(user)}
                      </span>
                    </td>

                    <td className="px-5 py-3 text-sm font-bold text-teal-600 dark:text-teal-400">
                      {user.token_balance ?? user.tokens ?? 0}
                    </td>

                    <td className="px-5 py-3">
                      {user.role === "admin" ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-500">
                          <ShieldCheck size={14} /> Admin
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          <User size={14} /> User
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3">
                      {user.is_active ? (
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                            isDark
                              ? "bg-teal-900/30 text-teal-400"
                              : "bg-teal-50 text-teal-700"
                          }`}
                        >
                          <CheckCircle2
                            size={12}
                            className="inline mr-1 mb-0.5"
                          />
                          {t.stActive}
                        </span>
                      ) : (
                        <span
                          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                            isDark
                              ? "bg-rose-900/30 text-rose-400"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          <XCircle size={12} className="inline mr-1 mb-0.5" />
                          {t.stBanned}
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3 text-xs font-medium text-slate-500">
                      {formatDate(user.created_at, lang)}
                    </td>

                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() =>
                            setEditModal({
                              open: true,
                              user: { ...user },
                              originalRole: user.role,
                              originalStatus: user.is_active,
                            })
                          }
                          className={`p-2 rounded-lg border transition ${
                            isDark
                              ? "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-teal-400"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-teal-600"
                          }`}
                        >
                          <Edit size={14} />
                        </button>

                        <button
                          onClick={() =>
                            setDeleteModal({ open: true, user })
                          }
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

      {editModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <form
            onSubmit={handleUpdateUser}
            className={`w-full max-w-md rounded-3xl shadow-2xl p-6 border ${
              isDark
                ? "bg-slate-900 border-slate-800"
                : "bg-white border-slate-200"
            }`}
          >
            <h3
              className={`text-xl font-black mb-6 ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              {t.modalEditTitle}
            </h3>

            <div
              className={`p-4 rounded-xl border mb-6 flex items-center gap-3 ${
                isDark
                  ? "bg-slate-950 border-slate-800"
                  : "bg-slate-50 border-slate-100"
              }`}
            >
              <Mail className="text-slate-400 w-5 h-5" />
              <div className="overflow-hidden">
                <p className="text-xs text-slate-500 uppercase font-bold">
                  {t.targetAccount}
                </p>
                <p
                  className={`font-semibold truncate ${
                    isDark ? "text-slate-200" : "text-slate-800"
                  }`}
                >
                  {editModal.user?.email}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">
                  {t.systemRole}
                </span>
                <select
                  value={editModal.user?.role}
                  onChange={(event) =>
                    setEditModal((modal) => ({
                      ...modal,
                      user: {
                        ...modal.user,
                        role: event.target.value,
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="user">{t.roleUser}</option>
                  <option value="admin">{t.roleAdmin}</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">
                  {t.accountStatus}
                </span>
                <select
                  value={String(editModal.user?.is_active)}
                  onChange={(event) =>
                    setEditModal((modal) => ({
                      ...modal,
                      user: {
                        ...modal.user,
                        is_active: event.target.value === "true",
                      },
                    }))
                  }
                  className={inputClass}
                >
                  <option value="true">{t.statusActive}</option>
                  <option value="false">{t.statusBlocked}</option>
                </select>
              </label>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() =>
                  setEditModal({
                    open: false,
                    user: null,
                    originalRole: null,
                    originalStatus: null,
                  })
                }
                disabled={isProcessing}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm border transition ${
                  isDark
                    ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {t.btnCancel}
              </button>

              <button
                type="submit"
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                {isProcessing ? "..." : t.btnSave}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div
            className={`w-full max-w-sm rounded-3xl shadow-2xl p-6 border text-center ${
              isDark
                ? "bg-slate-900 border-slate-800"
                : "bg-white border-slate-200"
            }`}
          >
            <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>

            <h3
              className={`text-xl font-black mb-2 ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              {t.modalDelTitle}
            </h3>

            <p className="text-sm text-slate-500 mb-6">{t.modalDelMsg}</p>

            <p className="text-xs font-mono bg-slate-100 dark:bg-slate-950 p-2 rounded mb-6 truncate">
              {deleteModal.user?.email}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal({ open: false, user: null })}
                disabled={isProcessing}
                className={`flex-1 py-2.5 rounded-xl font-bold text-sm border transition ${
                  isDark
                    ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                    : "border-slate-200 hover:bg-slate-50 text-slate-700"
                }`}
              >
                {t.btnCancel}
              </button>

              <button
                onClick={handleDeleteUser}
                disabled={isProcessing}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                {isProcessing ? "..." : t.btnConfirmDel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ isDark, label, value, icon }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <span className="text-teal-500">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-5 py-4">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="space-y-2">
            <div className="w-24 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="w-32 h-3 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="w-16 h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-10 h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-12 h-5 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-16 h-5 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-20 h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
      <td className="px-5 py-4">
        <div className="w-8 h-8 ml-auto bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
      </td>
    </tr>
  );
}