import React, { useState, useEffect } from "react";
import { Save, RefreshCw, Smartphone, HardDrive, Wrench, Shield, Bell, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { getSystemSettings, updateSystemSettings } from "../../services/adminService";

const DEFAULT_CONFIG = {
  app_name: "BanknoteAI", support_email: "support@banknoteai.com", default_language: "EN", default_theme: "system",
  public_registration_enabled: true, max_upload_size_mb: 5, token_cost_per_scan: 1, save_raw_agent_output: true,
  scan_history_retention_days: 30, maintenance_mode: false, maintenance_message: "System under maintenance.",
  allow_admin_login_during_maintenance: true, session_timeout_minutes: 120, max_login_attempts: 5,
  password_min_length: 6, require_email_verification: false, feedback_review_sla_days: 3, admin_alert_email: ""
};


function unwrapSettings(data) {
  const raw = data?.settings || data?.data || data || {};
  return { ...DEFAULT_CONFIG, ...raw };
}

export default function Settings() {
  const { theme, lang } = useAppStore();
  const isDark = theme === "dark";

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [initialConfig, setInitialConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("app");

  const t = {
    EN: { 
      title: "System Settings", sub: "Manage global app behavior, upload limits, maintenance mode, and security defaults.",
      tabs: { app: "Application", upload: "Upload & AI", maint: "Maintenance", sec: "Security", notif: "Notifications" },
      save: "Save Changes", refresh: "Refresh", saving: "Saving...",
      maintWarn: "Warning: User-facing features are currently unavailable due to maintenance mode.",
      lbl: { appName: "App Name", email: "Support Email", lang: "Default Lang", theme: "Default Theme", pubReg: "Public Registration", maxMb: "Max Upload (MB)", cost: "Token Cost / Scan", saveRaw: "Save Raw AI Output", retDays: "History Retention (Days)", maintMode: "Enable Maintenance Mode", maintMsg: "Maintenance Message", allowAdminMaint: "Allow Admin Login during Maint", timeout: "Session Timeout (Mins)", maxFail: "Max Login Attempts", passLen: "Min Password Length", reqVerify: "Require Email Verification", sla: "Feedback SLA (Days)", adminAlert: "Admin Alert Email" }
    },
    VI: { 
      title: "Cài đặt Hệ thống", sub: "Quản lý hành vi hệ thống, giới hạn tải lên, chế độ bảo trì và bảo mật.",
      tabs: { app: "Ứng dụng", upload: "Tải lên & AI", maint: "Bảo trì", sec: "Bảo mật", notif: "Thông báo" },
      save: "Lưu thay đổi", refresh: "Làm mới", saving: "Đang lưu...",
      maintWarn: "Cảnh báo: Tính năng người dùng đang tạm ngưng do hệ thống bật chế độ bảo trì.",
      lbl: { appName: "Tên ứng dụng", email: "Email hỗ trợ", lang: "Ngôn ngữ mặc định", theme: "Giao diện mặc định", pubReg: "Mở đăng ký công khai", maxMb: "Dung lượng ảnh tối đa (MB)", cost: "Phí Token / Lượt quét", saveRaw: "Lưu dữ liệu AI thô", retDays: "Lưu lịch sử (Ngày)", maintMode: "Bật Chế độ Bảo trì", maintMsg: "Thông báo bảo trì", allowAdminMaint: "Cho phép Admin đăng nhập khi bảo trì", timeout: "Hết hạn phiên (Phút)", maxFail: "Số lần sai mật khẩu tối đa", passLen: "Độ dài mật khẩu tối thiểu", reqVerify: "Bắt buộc xác thực Email", sla: "Thời hạn xử lý phản hồi (Ngày)", adminAlert: "Email nhận cảnh báo Admin" }
    },
  }[lang || "EN"];

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getSystemSettings();
      const merged = unwrapSettings(data);
      setConfig(merged);
      setInitialConfig(merged);
    } catch (error) {
      console.error("Load settings failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Failed to load settings.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig);

  const handleSave = async () => {
    if (!config.app_name) return toast.error("App name is required");
    setSaving(true);
    try {
      const updated = await updateSystemSettings(config);
      const normalized = unwrapSettings(updated);
      setConfig(normalized);
      setInitialConfig(normalized);
      toast.success(lang === "VI" ? "Đã lưu cài đặt" : "Settings saved successfully");
    } catch (error) {
      console.error("Save settings failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value }));
  };

  const inputCls = `w-full h-11 px-4 rounded-xl border outline-none transition-colors text-sm font-semibold ${isDark ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500 focus:bg-white"}`;
  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2";

  const tabs = [
    { id: "app", name: t.tabs.app, icon: <Smartphone size={18}/> },
    { id: "upload", name: t.tabs.upload, icon: <HardDrive size={18}/> },
    { id: "maint", name: t.tabs.maint, icon: <Wrench size={18}/> },
    { id: "sec", name: t.tabs.sec, icon: <Shield size={18}/> },
    { id: "notif", name: t.tabs.notif, icon: <Bell size={18}/> },
  ];

  return (
    <div className="w-full max-w-[1440px] mx-auto pb-20 animate-[fadeInUp_0.4s_ease-out]">
      {/* Header (Sticky) */}
      <div className={`sticky top-0 z-40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 py-4 md:py-6 mb-6 border-b backdrop-blur-md ${isDark ? "border-slate-800 bg-slate-950/80" : "border-slate-200 bg-slate-50/80"}`}>
        <div>
          <h1 className={`text-3xl font-black tracking-tight ${isDark?"text-white":"text-slate-900"}`}>{t.title}</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">{t.sub}</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={loadData} disabled={loading} className={`p-2.5 rounded-xl border transition ${isDark ? "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"}`}>
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={handleSave} disabled={!isDirty || saving} className="flex-1 md:flex-none px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2">
            <Save size={18}/> {saving ? t.saving : t.save}
          </button>
        </div>
      </div>

      {config.maintenance_mode && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-600 dark:text-amber-500">
          <AlertTriangle className="shrink-0 mt-0.5" size={20}/>
          <p className="text-sm font-bold leading-relaxed">{t.maintWarn}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 shrink-0 space-y-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all ${activeTab === tab.id ? (isDark ? "bg-slate-800 text-white" : "bg-white shadow-sm text-teal-600 border border-slate-200") : (isDark ? "text-slate-500 hover:bg-slate-900 hover:text-slate-300" : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700")}`}>
              {tab.icon} {tab.name}
            </button>
          ))}
        </div>

        {/* Form Content */}
        <div className={`flex-1 w-full p-6 md:p-8 rounded-3xl border shadow-sm ${isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4 mb-8"></div>
              <div className="grid grid-cols-2 gap-6"><div className="h-11 bg-slate-200 dark:bg-slate-800 rounded-xl"></div><div className="h-11 bg-slate-200 dark:bg-slate-800 rounded-xl"></div></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* SECTION: APP */}
              <div className={activeTab === "app" ? "block" : "hidden"}>
                <h3 className={`text-xl font-black mb-6 ${isDark?"text-white":"text-slate-900"}`}>{t.tabs.app}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label className={labelCls}>{t.lbl.appName}</label><input name="app_name" value={config.app_name} onChange={handleChange} className={inputCls}/></div>
                  <div><label className={labelCls}>{t.lbl.email}</label><input name="support_email" type="email" value={config.support_email} onChange={handleChange} className={inputCls}/></div>
                  <div>
                    <label className={labelCls}>{t.lbl.lang}</label>
                    <select name="default_language" value={config.default_language} onChange={handleChange} className={inputCls}><option value="EN">English</option><option value="VI">Tiếng Việt</option></select>
                  </div>
                  <div>
                    <label className={labelCls}>{t.lbl.theme}</label>
                    <select name="default_theme" value={config.default_theme} onChange={handleChange} className={inputCls}><option value="light">Light</option><option value="dark">Dark</option><option value="system">Auto (System)</option></select>
                  </div>
                  <div className="md:col-span-2 pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                      <input type="checkbox" name="public_registration_enabled" checked={config.public_registration_enabled} onChange={handleChange} className="w-5 h-5 accent-teal-600 rounded"/>
                      <span className={`text-sm font-bold ${isDark?"text-white group-hover:text-teal-400":"text-slate-900 group-hover:text-teal-600"}`}>{t.lbl.pubReg}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* SECTION: UPLOAD & AI */}
              <div className={activeTab === "upload" ? "block" : "hidden"}>
                <h3 className={`text-xl font-black mb-6 ${isDark?"text-white":"text-slate-900"}`}>{t.tabs.upload}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label className={labelCls}>{t.lbl.maxMb}</label><input name="max_upload_size_mb" type="number" min="1" value={config.max_upload_size_mb} onChange={handleChange} className={inputCls}/></div>
                  <div><label className={labelCls}>{t.lbl.cost}</label><input name="token_cost_per_scan" type="number" min="0" value={config.token_cost_per_scan} onChange={handleChange} className={inputCls}/></div>
                  <div><label className={labelCls}>{t.lbl.retDays}</label><input name="scan_history_retention_days" type="number" min="1" value={config.scan_history_retention_days} onChange={handleChange} className={inputCls}/></div>
                  
                  <div className="md:col-span-2 pt-2 space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                      <input type="checkbox" name="save_raw_agent_output" checked={config.save_raw_agent_output} onChange={handleChange} className="w-5 h-5 accent-teal-600 rounded"/>
                      <span className={`text-sm font-bold ${isDark?"text-white group-hover:text-teal-400":"text-slate-900 group-hover:text-teal-600"}`}>{t.lbl.saveRaw}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* SECTION: MAINTENANCE */}
              <div className={activeTab === "maint" ? "block" : "hidden"}>
                <h3 className={`text-xl font-black mb-6 text-rose-500`}>{t.tabs.maint}</h3>
                <div className="space-y-6">
                  <label className="flex items-center gap-3 cursor-pointer group w-fit p-4 rounded-xl border border-rose-500/30 bg-rose-500/5">
                    <input type="checkbox" name="maintenance_mode" checked={config.maintenance_mode} onChange={handleChange} className="w-5 h-5 accent-rose-600 rounded"/>
                    <span className="text-sm font-black text-rose-600 dark:text-rose-500">{t.lbl.maintMode}</span>
                  </label>
                  
                  {config.maintenance_mode && (
                    <>
                      <div><label className={labelCls}>{t.lbl.maintMsg}</label><textarea name="maintenance_message" value={config.maintenance_message} onChange={handleChange} rows="3" className={`${inputCls} h-auto py-3 resize-none border-rose-200 dark:border-rose-900/50`}/></div>
                      <label className="flex items-center gap-3 cursor-pointer group w-fit">
                        <input type="checkbox" name="allow_admin_login_during_maintenance" checked={config.allow_admin_login_during_maintenance} onChange={handleChange} className="w-5 h-5 accent-teal-600 rounded"/>
                        <span className={`text-sm font-bold ${isDark?"text-white":"text-slate-900"}`}>{t.lbl.allowAdminMaint}</span>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {/* SECTION: SECURITY */}
              <div className={activeTab === "sec" ? "block" : "hidden"}>
                <h3 className={`text-xl font-black mb-6 ${isDark?"text-white":"text-slate-900"}`}>{t.tabs.sec}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label className={labelCls}>{t.lbl.timeout}</label><input name="session_timeout_minutes" type="number" min="5" value={config.session_timeout_minutes} onChange={handleChange} className={inputCls}/></div>
                  <div><label className={labelCls}>{t.lbl.maxFail}</label><input name="max_login_attempts" type="number" min="1" value={config.max_login_attempts} onChange={handleChange} className={inputCls}/></div>
                  <div><label className={labelCls}>{t.lbl.passLen}</label><input name="password_min_length" type="number" min="6" value={config.password_min_length} onChange={handleChange} className={inputCls}/></div>
                  
                  <div className="md:col-span-2 pt-2">
                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                      <input type="checkbox" name="require_email_verification" checked={config.require_email_verification} onChange={handleChange} className="w-5 h-5 accent-teal-600 rounded"/>
                      <span className={`text-sm font-bold ${isDark?"text-white group-hover:text-teal-400":"text-slate-900 group-hover:text-teal-600"}`}>{t.lbl.reqVerify}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* SECTION: NOTIFICATIONS */}
              <div className={activeTab === "notif" ? "block" : "hidden"}>
                <h3 className={`text-xl font-black mb-6 ${isDark?"text-white":"text-slate-900"}`}>{t.tabs.notif}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div><label className={labelCls}>{t.lbl.adminAlert}</label><input name="admin_alert_email" type="email" value={config.admin_alert_email || ""} onChange={handleChange} placeholder="Optional" className={inputCls}/></div>
                  <div><label className={labelCls}>{t.lbl.sla}</label><input name="feedback_review_sla_days" type="number" min="1" value={config.feedback_review_sla_days} onChange={handleChange} className={inputCls}/></div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}