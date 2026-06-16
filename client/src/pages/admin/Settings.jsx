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
      title: "System Configuration",
      sub: "Global application variables and service endpoints.",
      save: "Save Changes",
      saving: "Saving...",
      refresh: "Sync",
      maintWarn: "Warning: Client applications are currently suspended due to maintenance override.",
      tabs: {
        app: "General",
        features: "Features",
        upload: "Processing",
        payment: "Gateways",
        billing: "Billing Model",
        email: "Mail Server",
        maint: "Operations",
        sec: "Security",
      },
    },
    VI: {
      title: "Cấu hình Hệ thống",
      sub: "Các biến toàn cục và kết nối dịch vụ ứng dụng.",
      save: "Lưu cấu hình",
      saving: "Đang lưu...",
      refresh: "Đồng bộ",
      maintWarn: "Cảnh báo: Ứng dụng client đang tạm ngưng do cờ bảo trì hệ thống bật.",
      tabs: {
        app: "Chung",
        features: "Tính năng",
        upload: "Xử lý",
        payment: "Thanh toán",
        billing: "Mô hình Phí",
        email: "Mail Server",
        maint: "Vận hành",
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
      toast.error(error?.response?.data?.detail || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const isDirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(initialConfig), [config, initialConfig]);

  const updateField = (name, value) => {
    setConfig((prev) => ({ ...prev, [name]: value }));
  };

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;
    updateField(name, type === "checkbox" ? checked : type === "number" ? Number(value) : value);
  };

  const handleSave = async () => {
    if (!config.app_name?.trim()) return toast.error("App name is required.");
    if (!config.support_email?.trim()) return toast.error("Support email is required.");
    const payload = normalizePayload(config);
    setSaving(true);
    try {
      const updated = await updateSystemSettings(payload);
      const normalized = unwrapSettings(updated);
      setConfig(normalized);
      setInitialConfig(normalized);
      toast.success(lang === "VI" ? "Đã lưu cấu hình." : "Configuration saved.");
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const pageBg = isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900";
  const panelCls = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const inputCls = `w-full h-10 px-3 rounded-md border outline-none transition-colors text-sm font-medium ${
    isDark ? "bg-slate-950 border-slate-800 text-white focus:border-teal-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-teal-500 focus:bg-white"
  }`;
  const labelCls = "block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5";

  const tabs = [
    { id: "app", name: text.tabs.app, icon: <Smartphone size={16} /> },
    { id: "features", name: text.tabs.features, icon: <ToggleLeft size={16} /> },
    { id: "upload", name: text.tabs.upload, icon: <HardDrive size={16} /> },
    { id: "payment", name: text.tabs.payment, icon: <CreditCard size={16} /> },
    { id: "billing", name: text.tabs.billing, icon: <Coins size={16} /> },
    { id: "email", name: text.tabs.email, icon: <Bell size={16} /> },
    { id: "maint", name: text.tabs.maint, icon: <Wrench size={16} /> },
    { id: "sec", name: text.tabs.sec, icon: <Shield size={16} /> },
  ];

  if (loading) {
    return (
      <div className={`min-h-[70vh] flex items-center justify-center ${pageBg}`}>
        <RefreshCw className="animate-spin text-teal-600" size={24} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto pb-20 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{text.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">{text.sub}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={loadData} disabled={loading} className={`h-10 px-4 rounded-lg font-bold text-sm border flex items-center gap-2 transition ${isDark ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300" : "border-slate-300 bg-white hover:bg-slate-50 text-slate-700"}`}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {text.refresh}
          </button>
          <button onClick={handleSave} disabled={!isDirty || saving} className="flex-1 sm:flex-none h-10 px-6 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white font-bold rounded-lg shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2">
            <Save size={14} /> {saving ? text.saving : text.save}
          </button>
        </div>
      </div>

      {isDirty && (
         <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center gap-3 animate-[fadeIn_0.3s_ease]">
           <AlertTriangle size={16} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
           <p className="text-sm font-bold text-indigo-800 dark:text-indigo-300">You have unsaved changes. Please save to apply your new configuration.</p>
         </div>
      )}

      {config.maintenance_mode && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{text.maintWarn}</p>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <div className="w-full md:w-64 shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === tab.id ? (isDark ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-900") : isDark ? "text-slate-400 hover:bg-slate-800/50 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
              {tab.icon} {tab.name}
            </button>
          ))}
        </div>

        <div className="flex-1 w-full space-y-6">
          {activeTab === "app" && (
            <Section title="General" panelCls={panelCls}>
              <Grid>
                <Input label="App Name" name="app_name" value={config.app_name} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Support Email" name="support_email" value={config.support_email} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Select label="Default Language" name="default_language" value={config.default_language} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["EN", "VI"]} />
                <Select label="Default Theme" name="default_theme" value={config.default_theme} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["system", "light", "dark"]} />
              </Grid>
            </Section>
          )}

          {activeTab === "features" && (
            <Section title="Feature Flags" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Public Registration" name="public_registration_enabled" checked={config.public_registration_enabled} onChange={handleInputChange} />
                <Toggle title="Email / Password Login" name="feature_email_password_login_enabled" checked={config.feature_email_password_login_enabled} onChange={handleInputChange} />
                <Toggle title="Google OAuth Login" name="feature_google_login_enabled" checked={config.feature_google_login_enabled} onChange={handleInputChange} />
                <Toggle title="Vision Processing" name="feature_scan_enabled" checked={config.feature_scan_enabled} onChange={handleInputChange} />
                <Toggle title="Currency Converter" name="feature_currency_converter_enabled" checked={config.feature_currency_converter_enabled} onChange={handleInputChange} />
                <Toggle title="Payment Subsystem" name="feature_payment_enabled" checked={config.feature_payment_enabled} onChange={handleInputChange} />
                <Toggle title="Feedback Subsystem" name="feature_feedback_enabled" checked={config.feature_feedback_enabled} onChange={handleInputChange} />
                <Toggle title="History Access" name="feature_history_enabled" checked={config.feature_history_enabled} onChange={handleInputChange} />
              </ToggleGrid>
            </Section>
          )}

          {activeTab === "upload" && (
            <Section title="Processing Boundaries" panelCls={panelCls}>
              <Grid>
                <Input label="Max Payload Size (MB)" name="max_upload_size_mb" type="number" value={config.max_upload_size_mb} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Log Retention (Days)" name="scan_history_retention_days" type="number" value={config.scan_history_retention_days} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Default Token Cost" name="token_cost_per_scan" type="number" value={config.token_cost_per_scan} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Allowed MIME Types" name="allowed_image_types_text" value={(config.allowed_image_types || []).join(", ")} onChange={(event) => updateField("allowed_image_types", event.target.value.split(",").map((v) => v.trim()).filter(Boolean))} inputCls={inputCls} labelCls={labelCls} />
              </Grid>
            </Section>
          )}

          {activeTab === "payment" && (
            <Section title="Payment Integrations" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="SEPAY Gateway" name="sepay_enabled" checked={config.sepay_enabled} onChange={handleInputChange} />
                <Toggle title="VNPay Gateway" name="vnpay_enabled" checked={config.vnpay_enabled} onChange={handleInputChange} />
                <Toggle title="Mock Processor (Dev)" name="mock_payment_enabled" checked={config.mock_payment_enabled} onChange={handleInputChange} />
              </ToggleGrid>
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <Grid>
                  <Select label="Primary Gateway" name="payment_gateway_default" value={config.payment_gateway_default} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["sepay", "vnpay", "mock"]} />
                  <Input label="SEPAY Inst Name" name="sepay_bank_name" value={config.sepay_bank_name || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="SEPAY Account No." name="sepay_account_number" value={config.sepay_account_number || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="SEPAY Account Holder" name="sepay_account_name" value={config.sepay_account_name || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="VNPay Return URI" name="vnpay_return_url" value={config.vnpay_return_url || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="VNPay Webhook URI" name="vnpay_ipn_url" value={config.vnpay_ipn_url || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                </Grid>
              </div>
            </Section>
          )}

          {activeTab === "billing" && (
            <Section title="Billing Engine" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Enable Metering" name="token_billing_enabled" checked={config.token_billing_enabled} onChange={handleInputChange} />
                <Toggle title="Dynamic AI Metering" name="dynamic_ai_token_billing_enabled" checked={config.dynamic_ai_token_billing_enabled} onChange={handleInputChange} />
                <Toggle title="SLA Error Refund" name="refund_on_system_error" checked={config.refund_on_system_error} onChange={handleInputChange} />
                <Toggle title="Agent Timeout Refund" name="refund_on_agent_failure" checked={config.refund_on_agent_failure} onChange={handleInputChange} />
                <Toggle title="Bill Review Cases" name="charge_when_needs_review" checked={config.charge_when_needs_review} onChange={handleInputChange} />
                <Toggle title="Retain Metering Logs" name="save_token_usage_logs" checked={config.save_token_usage_logs} onChange={handleInputChange} />
                <Toggle title="Client Telemetry UI" name="show_token_usage_to_user" checked={config.show_token_usage_to_user} onChange={handleInputChange} />
                <Toggle title="Admin Telemetry UI" name="show_ai_token_usage_to_admin" checked={config.show_ai_token_usage_to_admin} onChange={handleInputChange} />
              </ToggleGrid>
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <Grid>
                  <Select label="Pricing Strategy" name="token_billing_mode" value={config.token_billing_mode} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["fixed", "dynamic"]} />
                  <Input label="Tokenizer Model" name="token_count_model" value={config.token_count_model} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Conversion Multiplier" name="ai_token_to_system_token_rate" type="number" value={config.ai_token_to_system_token_rate} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Surcharge Rate" name="token_billing_tax_rate" type="number" step="0.01" value={config.token_billing_tax_rate} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Select label="Fraction Rounding" name="token_billing_rounding_mode" value={config.token_billing_rounding_mode} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} options={["ceil", "round", "floor"]} />
                  <Input label="Floor Cost Limit" name="min_tokens_per_scan" type="number" value={config.min_tokens_per_scan} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Ceiling Cost Limit" name="max_tokens_per_scan" type="number" value={config.max_tokens_per_scan} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                </Grid>
              </div>
            </Section>
          )}

          {activeTab === "email" && (
            <Section title="SMTP Configuration" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Service Enabled" name="email_notifications_enabled" checked={config.email_notifications_enabled} onChange={handleInputChange} />
                <Toggle title="Trigger: Registration" name="email_on_register" checked={config.email_on_register} onChange={handleInputChange} />
                <Toggle title="Trigger: OAuth Init" name="email_on_google_first_login" checked={config.email_on_google_first_login} onChange={handleInputChange} />
                <Toggle title="Trigger: Password Reset" name="email_on_password_reset" checked={config.email_on_password_reset} onChange={handleInputChange} />
                <Toggle title="Trigger: Payment Setup" name="email_on_payment_created" checked={config.email_on_payment_created} onChange={handleInputChange} />
                <Toggle title="Trigger: Payment Auth" name="email_on_payment_success" checked={config.email_on_payment_success} onChange={handleInputChange} />
                <Toggle title="Trigger: Payment Decline" name="email_on_payment_failed" checked={config.email_on_payment_failed} onChange={handleInputChange} />
                <Toggle title="Trigger: Task Complete" name="email_on_recognition_completed" checked={config.email_on_recognition_completed} onChange={handleInputChange} />
                <Toggle title="Trigger: Task Abort" name="email_on_recognition_failed" checked={config.email_on_recognition_failed} onChange={handleInputChange} />
                <Toggle title="Trigger: Ticket Open" name="email_on_feedback_created" checked={config.email_on_feedback_created} onChange={handleInputChange} />
                <Toggle title="Trigger: Ticket Reply" name="email_on_feedback_replied" checked={config.email_on_feedback_replied} onChange={handleInputChange} />
                <Toggle title="Trigger: Core Dump/Error" name="email_admin_on_system_error" checked={config.email_admin_on_system_error} onChange={handleInputChange} />
              </ToggleGrid>
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <Grid>
                  <Input label="Host Name" name="smtp_host" value={config.smtp_host || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="TCP Port" name="smtp_port" type="number" value={config.smtp_port} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Authentication ID" name="smtp_username" value={config.smtp_username || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Sender Identity" name="smtp_from_email" value={config.smtp_from_email || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Sender Alias" name="smtp_from_name" value={config.smtp_from_name || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                  <Input label="Ops Alert Address" name="admin_alert_email" value={config.admin_alert_email || ""} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                </Grid>
              </div>
            </Section>
          )}

          {activeTab === "maint" && (
            <Section title="Operations Manager" panelCls={panelCls}>
              <ToggleGrid>
                <Toggle title="Suspend Public Access" name="maintenance_mode" checked={config.maintenance_mode} onChange={handleInputChange} />
                <Toggle title="Allow Staff Bypass" name="allow_admin_login_during_maintenance" checked={config.allow_admin_login_during_maintenance} onChange={handleInputChange} />
              </ToggleGrid>
              <div className="mt-6">
                <label className={labelCls}>Status Page Message</label>
                <textarea
                  name="maintenance_message"
                  value={config.maintenance_message || ""}
                  onChange={handleInputChange}
                  className={`w-full h-24 p-3 rounded-md border outline-none text-sm transition-colors resize-y ${isDark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                />
              </div>
            </Section>
          )}

          {activeTab === "sec" && (
            <Section title="Security Constraints" panelCls={panelCls}>
              <Grid>
                <Input label="Auth Token TTL (m)" name="session_timeout_minutes" type="number" value={config.session_timeout_minutes} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Max Brute Attempts" name="max_login_attempts" type="number" value={config.max_login_attempts} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Entropy Threshold" name="password_min_length" type="number" value={config.password_min_length} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
                <Input label="Ticket SLA Deadline (d)" name="feedback_review_sla_days" type="number" value={config.feedback_review_sla_days} onChange={handleInputChange} inputCls={inputCls} labelCls={labelCls} />
              </Grid>
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <ToggleGrid>
                  <Toggle title="Enforce Email Verification" name="require_email_verification" checked={config.require_email_verification} onChange={handleInputChange} />
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
    <section className={`rounded-xl border shadow-sm p-6 ${panelCls}`}>
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">{children}</div>;
}

function ToggleGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function Input({ label, name, value, onChange, inputCls, labelCls, type = "text", step }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input name={name} type={type} step={step} value={value ?? ""} onChange={onChange} className={inputCls} />
    </div>
  );
}

function Select({ label, name, value, onChange, inputCls, labelCls, options }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select name={name} value={value ?? ""} onChange={onChange} className={inputCls}>
        {options.map((option) => (
          <option key={option} value={option}>{String(option).toUpperCase()}</option>
        ))}
      </select>
    </div>
  );
}

function Toggle({ title, name, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 cursor-pointer group">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{title}</span>
      <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-slate-900 dark:bg-white" : "bg-slate-300 dark:bg-slate-700"}`}>
        <span className={`inline-block h-3 w-3 transform rounded-full bg-white dark:bg-slate-900 transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </div>
      <input type="checkbox" name={name} checked={Boolean(checked)} onChange={onChange} className="sr-only" />
    </label>
  );
}