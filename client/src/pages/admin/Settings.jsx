import React, { useEffect, useMemo, useState } from "react";
import {
  Save,
  RefreshCw,
  Smartphone,
  HardDrive,
  Wrench,
  Shield,
  Bell,
  AlertTriangle,
  CreditCard,
  Coins,
  ToggleLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "../../store/appStore";
import { getSystemSettings, updateSystemSettings } from "../../services/adminService";

const DEFAULT_CONFIG = {
  app_name: "BanknoteAI",
  support_email: "support@banknoteai.com",
  default_language: "EN",
  default_theme: "system",

  public_registration_enabled: true,
  feature_email_password_login_enabled: true,
  feature_google_login_enabled: true,
  feature_scan_enabled: true,
  feature_currency_converter_enabled: true,
  feature_payment_enabled: true,
  feature_feedback_enabled: true,
  feature_history_enabled: true,

  max_upload_size_mb: 5,
  allowed_image_types: ["jpg", "jpeg", "png", "webp"],
  scan_history_retention_days: 30,
  token_cost_per_scan: 1,

  payment_gateway_default: "sepay",
  enabled_payment_gateways: ["sepay"],

  sepay_enabled: true,
  vnpay_enabled: false,
  mock_payment_enabled: false,

  sepay_bank_name: "",
  sepay_account_number: "",
  sepay_account_name: "",

  vnpay_tmn_code_configured: false,
  vnpay_hash_secret_configured: false,
  vnpay_return_url: "",
  vnpay_ipn_url: "",

  token_billing_enabled: true,
  token_billing_mode: "fixed",
  dynamic_ai_token_billing_enabled: false,
  token_count_model: "gpt-3.5-turbo",

  ai_token_to_system_token_rate: 1000,
  token_billing_tax_rate: 0.1,
  token_billing_rounding_mode: "ceil",

  min_tokens_per_scan: 1,
  max_tokens_per_scan: 10,

  refund_on_system_error: true,
  refund_on_agent_failure: false,
  charge_when_needs_review: true,

  save_token_usage_logs: true,
  show_token_usage_to_user: true,
  show_ai_token_usage_to_admin: true,

  email_notifications_enabled: false,

  email_on_register: true,
  email_on_google_first_login: true,
  email_on_password_reset: true,
  email_on_payment_created: true,
  email_on_payment_success: true,
  email_on_payment_failed: true,
  email_on_recognition_completed: false,
  email_on_recognition_failed: true,
  email_on_feedback_created: true,
  email_on_feedback_replied: true,
  email_admin_on_system_error: true,

  smtp_configured: false,
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_from_email: "",
  smtp_from_name: "BanknoteAI",

  maintenance_mode: false,
  maintenance_message: "System under maintenance.",
  allow_admin_login_during_maintenance: true,

  session_timeout_minutes: 120,
  max_login_attempts: 5,
  password_min_length: 6,
  require_email_verification: false,

  feedback_review_sla_days: 3,
  admin_alert_email: "",
};

function unwrapSettings(data) {
  const raw = data?.settings || data?.data || data || {};
  return { ...DEFAULT_CONFIG, ...raw };
}

function normalizePayload(config) {
  const gateways = [];

  if (config.sepay_enabled) gateways.push("sepay");
  if (config.vnpay_enabled) gateways.push("vnpay");
  if (config.mock_payment_enabled) gateways.push("mock");

  let defaultGateway = config.payment_gateway_default || "sepay";

  if (!gateways.includes(defaultGateway)) {
    defaultGateway = gateways[0] || "sepay";
  }

  return {
    ...config,
    enabled_payment_gateways: gateways,
    payment_gateway_default: defaultGateway,
    max_upload_size_mb: Number(config.max_upload_size_mb || 5),
    scan_history_retention_days: Number(config.scan_history_retention_days || 30),
    token_cost_per_scan: Number(config.token_cost_per_scan || 1),
    ai_token_to_system_token_rate: Number(config.ai_token_to_system_token_rate || 1000),
    token_billing_tax_rate: Number(config.token_billing_tax_rate || 0),
    min_tokens_per_scan: Number(config.min_tokens_per_scan || 0),
    max_tokens_per_scan: Number(config.max_tokens_per_scan || 1),
    smtp_port: Number(config.smtp_port || 587),
    session_timeout_minutes: Number(config.session_timeout_minutes || 120),
    max_login_attempts: Number(config.max_login_attempts || 5),
    password_min_length: Number(config.password_min_length || 6),
    feedback_review_sla_days: Number(config.feedback_review_sla_days || 3),
  };
}

export default function Settings() {
  const { theme, lang } = useAppStore();
  const isDark = theme === "dark";

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [initialConfig, setInitialConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("app");

  const text = {
    EN: {
      title: "System Settings",
      sub: "Manage global app behavior, payment gateways, token billing, notifications, maintenance, and security.",
      save: "Save Changes",
      saving: "Saving...",
      refresh: "Refresh",
      maintWarn: "Warning: user-facing features are currently unavailable due to maintenance mode.",
      tabs: {
        app: "Application",
        features: "Features",
        upload: "Upload & Scan",
        payment: "Payment",
        billing: "Token Billing",
        email: "Email",
        maint: "Maintenance",
        sec: "Security",
      },
    },
    VI: {
      title: "Cài đặt Hệ thống",
      sub: "Quản lý ứng dụng, cổng thanh toán, cách trừ token, email, bảo trì và bảo mật.",
      save: "Lưu thay đổi",
      saving: "Đang lưu...",
      refresh: "Làm mới",
      maintWarn: "Cảnh báo: các chức năng người dùng đang bị tạm ngưng do chế độ bảo trì.",
      tabs: {
        app: "Ứng dụng",
        features: "Tính năng",
        upload: "Upload & Scan",
        payment: "Thanh toán",
        billing: "Trừ Token",
        email: "Email",
        maint: "Bảo trì",
        sec: "Bảo mật",
      },
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

  useEffect(() => {
    loadData();
  }, []);

  const isDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(initialConfig);
  }, [config, initialConfig]);

  const updateField = (name, value) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;

    updateField(
      name,
      type === "checkbox"
        ? checked
        : type === "number"
          ? Number(value)
          : value,
    );
  };

  const handleSave = async () => {
    if (!config.app_name?.trim()) {
      toast.error("App name is required.");
      return;
    }

    if (!config.support_email?.trim()) {
      toast.error("Support email is required.");
      return;
    }

    const payload = normalizePayload(config);

    setSaving(true);
    try {
      const updated = await updateSystemSettings(payload);
      const normalized = unwrapSettings(updated);

      setConfig(normalized);
      setInitialConfig(normalized);
      toast.success(lang === "VI" ? "Đã lưu cài đặt." : "Settings saved successfully.");
    } catch (error) {
      console.error("Save settings failed:", error);
      toast.error(
        error?.response?.data?.detail ||
          error?.response?.data?.message ||
          "Failed to save settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const pageBg = isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900";
  const panelCls = isDark
    ? "bg-slate-900 border-slate-800"
    : "bg-white border-slate-200";
  const inputCls = `w-full h-11 px-4 rounded-xl border outline-none transition-colors text-sm font-semibold ${
    isDark
      ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500"
      : "bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500 focus:bg-white"
  }`;
  const labelCls = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2";

  const tabs = [
    { id: "app", name: text.tabs.app, icon: <Smartphone size={18} /> },
    { id: "features", name: text.tabs.features, icon: <ToggleLeft size={18} /> },
    { id: "upload", name: text.tabs.upload, icon: <HardDrive size={18} /> },
    { id: "payment", name: text.tabs.payment, icon: <CreditCard size={18} /> },
    { id: "billing", name: text.tabs.billing, icon: <Coins size={18} /> },
    { id: "email", name: text.tabs.email, icon: <Bell size={18} /> },
    { id: "maint", name: text.tabs.maint, icon: <Wrench size={18} /> },
    { id: "sec", name: text.tabs.sec, icon: <Shield size={18} /> },
  ];

  if (loading) {
    return (
      <div className={`min-h-[70vh] flex items-center justify-center ${pageBg}`}>
        <RefreshCw className="animate-spin text-teal-600" size={30} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1440px] mx-auto pb-20 animate-[fadeInUp_0.4s_ease-out]">
      <div
        className={`sticky top-0 z-40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 py-4 md:py-6 mb-6 border-b backdrop-blur-md ${
          isDark
            ? "border-slate-800 bg-slate-950/80"
            : "border-slate-200 bg-slate-50/80"
        }`}
      >
        <div>
          <h1 className={`text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
            {text.title}
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{text.sub}</p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={loadData}
            disabled={loading}
            title={text.refresh}
            className={`p-2.5 rounded-xl border transition ${
              isDark
                ? "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            }`}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex-1 md:flex-none px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {saving ? text.saving : text.save}
          </button>
        </div>
      </div>

      {config.maintenance_mode && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-600 dark:text-amber-500">
          <AlertTriangle className="shrink-0 mt-0.5" size={20} />
          <p className="text-sm font-bold leading-relaxed">{text.maintWarn}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8 items-start">
        <div className="w-full md:w-72 shrink-0 space-y-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${
                activeTab === tab.id
                  ? "bg-teal-600 text-white shadow-lg shadow-teal-600/20"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-900 hover:text-white"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
              }`}
            >
              {tab.icon}
              {tab.name}
            </button>
          ))}
        </div>

        <div className="flex-1 w-full space-y-6">
          {activeTab === "app" && (
            <Section title="Application" panelCls={panelCls}>
              <Grid>
                <Input label="App Name" name="app_name" value={config.app_name} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Support Email" name="support_email" value={config.support_email} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Select label="Default Language" name="default_language" value={config.default_language} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["EN", "VI"]} />
                <Select label="Default Theme" name="default_theme" value={config.default_theme} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["system", "light", "dark"]} />
              </Grid>
            </Section>
          )}

          {activeTab === "features" && (
            <Section title="Feature Toggles" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Public Registration" name="public_registration_enabled" checked={config.public_registration_enabled} onChange={handleInputChange} />
                <Toggle title="Email / Password Login" name="feature_email_password_login_enabled" checked={config.feature_email_password_login_enabled} onChange={handleInputChange} />
                <Toggle title="Google Login" name="feature_google_login_enabled" checked={config.feature_google_login_enabled} onChange={handleInputChange} />
                <Toggle title="AI Scan" name="feature_scan_enabled" checked={config.feature_scan_enabled} onChange={handleInputChange} />
                <Toggle title="Currency Converter" name="feature_currency_converter_enabled" checked={config.feature_currency_converter_enabled} onChange={handleInputChange} />
                <Toggle title="Payment / Top-up" name="feature_payment_enabled" checked={config.feature_payment_enabled} onChange={handleInputChange} />
                <Toggle title="Feedback" name="feature_feedback_enabled" checked={config.feature_feedback_enabled} onChange={handleInputChange} />
                <Toggle title="History" name="feature_history_enabled" checked={config.feature_history_enabled} onChange={handleInputChange} />
              </ToggleGrid>
            </Section>
          )}

          {activeTab === "upload" && (
            <Section title="Upload & Recognition" panelCls={panelCls}>
              <Grid>
                <Input label="Max Upload Size MB" name="max_upload_size_mb" type="number" value={config.max_upload_size_mb} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="History Retention Days" name="scan_history_retention_days" type="number" value={config.scan_history_retention_days} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Fixed Token Cost / Scan" name="token_cost_per_scan" type="number" value={config.token_cost_per_scan} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Allowed Image Types" name="allowed_image_types_text" value={(config.allowed_image_types || []).join(", ")} onChange={(event) => updateField("allowed_image_types", event.target.value.split(",").map((v) => v.trim()).filter(Boolean))} inputCls={inputCls} labelCls={labelCls} />
              </Grid>
            </Section>
          )}

          {activeTab === "payment" && (
            <Section title="Payment Gateway" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Enable SEPAY" name="sepay_enabled" checked={config.sepay_enabled} onChange={handleInputChange} />
                <Toggle title="Enable VNPay" name="vnpay_enabled" checked={config.vnpay_enabled} onChange={handleInputChange} />
                <Toggle title="Enable Mock Payment" name="mock_payment_enabled" checked={config.mock_payment_enabled} onChange={handleInputChange} />
              </ToggleGrid>

              <div className="mt-6">
                <Grid>
                  <Select label="Default Gateway" name="payment_gateway_default" value={config.payment_gateway_default} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["sepay", "vnpay", "mock"]} />
                  <Input label="SEPAY Bank Name" name="sepay_bank_name" value={config.sepay_bank_name || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="SEPAY Account Number" name="sepay_account_number" value={config.sepay_account_number || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="SEPAY Account Name" name="sepay_account_name" value={config.sepay_account_name || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="VNPay Return URL" name="vnpay_return_url" value={config.vnpay_return_url || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="VNPay IPN URL" name="vnpay_ipn_url" value={config.vnpay_ipn_url || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                </Grid>
              </div>
            </Section>
          )}

          {activeTab === "billing" && (
            <Section title="Token Billing" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Enable Token Billing" name="token_billing_enabled" checked={config.token_billing_enabled} onChange={handleInputChange} />
                <Toggle title="Dynamic AI Token Billing" name="dynamic_ai_token_billing_enabled" checked={config.dynamic_ai_token_billing_enabled} onChange={handleInputChange} />
                <Toggle title="Refund on System Error" name="refund_on_system_error" checked={config.refund_on_system_error} onChange={handleInputChange} />
                <Toggle title="Refund on Agent Failure" name="refund_on_agent_failure" checked={config.refund_on_agent_failure} onChange={handleInputChange} />
                <Toggle title="Charge Needs Review" name="charge_when_needs_review" checked={config.charge_when_needs_review} onChange={handleInputChange} />
                <Toggle title="Save Token Usage Logs" name="save_token_usage_logs" checked={config.save_token_usage_logs} onChange={handleInputChange} />
                <Toggle title="Show Usage To User" name="show_token_usage_to_user" checked={config.show_token_usage_to_user} onChange={handleInputChange} />
                <Toggle title="Show AI Usage To Admin" name="show_ai_token_usage_to_admin" checked={config.show_ai_token_usage_to_admin} onChange={handleInputChange} />
              </ToggleGrid>

              <div className="mt-6">
                <Grid>
                  <Select label="Billing Mode" name="token_billing_mode" value={config.token_billing_mode} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["fixed", "dynamic"]} />
                  <Input label="token-count Model" name="token_count_model" value={config.token_count_model} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="AI Tokens / 1 System Token" name="ai_token_to_system_token_rate" type="number" value={config.ai_token_to_system_token_rate} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Tax / Surcharge Rate" name="token_billing_tax_rate" type="number" step="0.01" value={config.token_billing_tax_rate} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Select label="Rounding Mode" name="token_billing_rounding_mode" value={config.token_billing_rounding_mode} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["ceil", "round", "floor"]} />
                  <Input label="Min Tokens / Scan" name="min_tokens_per_scan" type="number" value={config.min_tokens_per_scan} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Max Tokens / Scan" name="max_tokens_per_scan" type="number" value={config.max_tokens_per_scan} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                </Grid>
              </div>

              <div className="mt-6 rounded-2xl border border-teal-500/20 bg-teal-500/10 p-4 text-sm text-teal-700 dark:text-teal-300">
                Dynamic billing formula: <b>ceil((input_tokens + output_tokens) × (1 + tax_rate) / rate)</b>.
                Recommended: keep fixed mode for user charging, use dynamic mode first for logging/admin analytics.
              </div>
            </Section>
          )}

          {activeTab === "email" && (
            <Section title="Email Notifications" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Enable Email Notifications" name="email_notifications_enabled" checked={config.email_notifications_enabled} onChange={handleInputChange} />
                <Toggle title="Register Success" name="email_on_register" checked={config.email_on_register} onChange={handleInputChange} />
                <Toggle title="Google First Login" name="email_on_google_first_login" checked={config.email_on_google_first_login} onChange={handleInputChange} />
                <Toggle title="Password Reset" name="email_on_password_reset" checked={config.email_on_password_reset} onChange={handleInputChange} />
                <Toggle title="Payment Created" name="email_on_payment_created" checked={config.email_on_payment_created} onChange={handleInputChange} />
                <Toggle title="Payment Success" name="email_on_payment_success" checked={config.email_on_payment_success} onChange={handleInputChange} />
                <Toggle title="Payment Failed" name="email_on_payment_failed" checked={config.email_on_payment_failed} onChange={handleInputChange} />
                <Toggle title="Recognition Completed" name="email_on_recognition_completed" checked={config.email_on_recognition_completed} onChange={handleInputChange} />
                <Toggle title="Recognition Failed" name="email_on_recognition_failed" checked={config.email_on_recognition_failed} onChange={handleInputChange} />
                <Toggle title="Feedback Created" name="email_on_feedback_created" checked={config.email_on_feedback_created} onChange={handleInputChange} />
                <Toggle title="Feedback Replied" name="email_on_feedback_replied" checked={config.email_on_feedback_replied} onChange={handleInputChange} />
                <Toggle title="Admin System Error Alert" name="email_admin_on_system_error" checked={config.email_admin_on_system_error} onChange={handleInputChange} />
              </ToggleGrid>

              <div className="mt-6">
                <Grid>
                  <Input label="SMTP Host" name="smtp_host" value={config.smtp_host || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="SMTP Port" name="smtp_port" type="number" value={config.smtp_port} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="SMTP Username" name="smtp_username" value={config.smtp_username || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="From Email" name="smtp_from_email" value={config.smtp_from_email || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="From Name" name="smtp_from_name" value={config.smtp_from_name || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Admin Alert Email" name="admin_alert_email" value={config.admin_alert_email || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                </Grid>
              </div>
            </Section>
          )}

          {activeTab === "maint" && (
            <Section title="Maintenance" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Enable Maintenance Mode" name="maintenance_mode" checked={config.maintenance_mode} onChange={handleInputChange} />
                <Toggle title="Allow Admin Login During Maintenance" name="allow_admin_login_during_maintenance" checked={config.allow_admin_login_during_maintenance} onChange={handleInputChange} />
              </ToggleGrid>

              <div className="mt-6">
                <label className={labelCls}>Maintenance Message</label>
                <textarea
                  name="maintenance_message"
                  value={config.maintenance_message || ""}
                  onChange={handleInputChange}
                  className={`${inputCls} min-h-[110px] py-3 resize-y`}
                />
              </div>
            </Section>
          )}

          {activeTab === "sec" && (
            <Section title="Security" panelCls={panelCls}>
              <Grid>
                <Input label="Session Timeout Minutes" name="session_timeout_minutes" type="number" value={config.session_timeout_minutes} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Max Login Attempts" name="max_login_attempts" type="number" value={config.max_login_attempts} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Password Min Length" name="password_min_length" type="number" value={config.password_min_length} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Feedback SLA Days" name="feedback_review_sla_days" type="number" value={config.feedback_review_sla_days} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
              </Grid>

              <div className="mt-6">
                <ToggleGrid>
                  <Toggle title="Require Email Verification" name="require_email_verification" checked={config.require_email_verification} onChange={handleInputChange} />
                </ToggleGrid>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, panelCls, children }) {
  return (
    <section className={`rounded-3xl border shadow-sm p-5 md:p-6 ${panelCls}`}>
      <h2 className="text-xl font-black mb-5">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>;
}

function ToggleGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Input({
  label,
  name,
  value,
  onChange,
  inputCls,
  labelCls,
  type = "text",
  step,
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        value={value ?? ""}
        onChange={onChange}
        className={inputCls}
      />
    </div>
  );
}

function Select({
  label,
  name,
  value,
  onChange,
  inputCls,
  labelCls,
  options,
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        name={name}
        value={value ?? ""}
        onChange={onChange}
        className={inputCls}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {String(option).toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({ title, name, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer hover:border-teal-500/50 transition">
      <span className="text-sm font-bold">{title}</span>
      <input
        type="checkbox"
        name={name}
        checked={Boolean(checked)}
        onChange={onChange}
        className="h-5 w-5 accent-teal-600"
      />
    </label>
  );
}