
import { Routes, Route, Navigate } from "react-router-dom";

// Common
import ScrollToTop from "../components/common/ScrollToTop.jsx";
import GlobalTaskTracker from "../components/common/GlobalTaskTracker.jsx";

// Layouts
import MainLayout from "../layouts/MainLayout.jsx";
import AuthLayout from "../layouts/AuthLayout.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";

// Middleware phân quyền
import { UserRoute, AdminRoute } from "./PrivateRoutes.jsx";

// Pages - Auth
import Login from "../pages/auth/Login.jsx";
import Register from "../pages/auth/Register.jsx";
import ForgotPassword from "../pages/auth/ForgotPassword.jsx";
import AdminLogin from "../pages/auth/AdminLogin.jsx";
import GoogleSuccess from "../pages/auth/GoogleSuccess.jsx";
import VerifyEmail from "../pages/auth/VerifyEmail.jsx";

// Pages - User
import Home from "../pages/user/Home.jsx";
import Recognition from "../pages/user/Recognition.jsx";
import Processing from "../pages/user/Processing.jsx";
import Result from "../pages/user/Result.jsx";
import AgentResultDetail from "../pages/user/AgentResultDetail.jsx";
import History from "../pages/user/History.jsx";
import BanknoteDirectory from "../pages/user/BanknoteDirectory.jsx";
import CurrencyConverter from "../pages/user/CurrencyConverter.jsx";
import Pricing from "../pages/user/Pricing.jsx";
import Transactions from "../pages/user/Transactions.jsx";
import Profile from "../pages/user/Profile.jsx";
import Feedback from "../pages/user/Feedback.jsx";
import UserGuide from "../pages/user/UserGuide.jsx";
import Info from "../pages/user/Info.jsx";
import SepayCheckout from "../pages/user/SepayCheckout.jsx";
import Checkout from "../pages/user/Checkout.jsx";
import PaymentReturn from "../pages/user/PaymentReturn.jsx";

// Pages - Legal
import About from "../pages/legal/About.jsx";
import PrivacyPolicy from "../pages/legal/PrivacyPolicy.jsx";
import TermsOfService from "../pages/legal/TermsOfService.jsx";
import DataDeletion from "../pages/legal/DataDeletion.jsx";
import Support from "../pages/legal/Support.jsx";
import Contact from "../pages/legal/Contact.jsx";
import AiDisclaimer from "../pages/legal/AiDisclaimer.jsx";


// Pages - Admin
import Dashboard from "../pages/admin/Dashboard.jsx";
import UsersManager from "../pages/admin/UsersManager.jsx";
import BanknotesManager from "../pages/admin/BanknotesManager.jsx";
import ResultsManager from "../pages/admin/ResultsManager.jsx";
import AgentsConfig from "../pages/admin/AgentsConfig.jsx";
import AgentsManager from "../pages/admin/AgentsManager.jsx";
import AggregatorConfig from "../pages/admin/AggregatorConfig.jsx";
import AiModelConfig from "../pages/admin/AiModelConfig.jsx";
import CurrencyRatesManager from "../pages/admin/CurrencyRatesManager.jsx";
import FeedbacksManager from "../pages/admin/FeedbacksManager.jsx";
import GoogleLensConfig from "../pages/admin/GoogleLensConfig.jsx";
import LlmConfig from "../pages/admin/LlmConfig.jsx";
import SystemLogs from "../pages/admin/SystemLogs.jsx";
import TokenPackagesManager from "../pages/admin/TokenPackagesManager.jsx";
import TransactionsManager from "../pages/admin/TransactionsManager.jsx";
import Settings from "../pages/admin/Settings.jsx";
import PagesManager from "../pages/admin/PagesManager.jsx";

// Error Components
import NotFound404 from "../errors/NotFound404.jsx";

// Dev
import DebugPlayground from "../pages/dev/DebugPlayground.jsx";

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <GlobalTaskTracker />
      <Routes>
        {/* ===================================================== */}
        {/* PUBLIC + USER APP LAYOUT */}
        {/* ===================================================== */}
        
        {/* Dev Playground (Hidden from navigation) */}
        <Route path="/dev/debug" element={<DebugPlayground />} />
        
        <Route element={<MainLayout />}>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/directory" element={<BanknoteDirectory />} />

          {/* Legal */}
          <Route path="/privacy" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="/privacy-policy" element={<Navigate to="/legal/privacy" replace />} />
          <Route path="/terms-of-service" element={<Navigate to="/legal/terms" replace />} />
          
          <Route path="/legal/privacy" element={<PrivacyPolicy />} />
          <Route path="/legal/terms" element={<TermsOfService />} />
          <Route path="/legal/data-deletion" element={<DataDeletion />} />
          <Route path="/legal/ai-disclaimer" element={<AiDisclaimer />} />
          
          <Route path="/about" element={<About />} />
          <Route path="/legal/about" element={<Navigate to="/about" replace />} />
          <Route path="/support" element={<Support />} />
          <Route path="/contact" element={<Contact />} />


          {/* Alias tỷ giá */}
          <Route path="/currency-converter" element={<CurrencyConverter />} />
          <Route path="/exchange" element={<CurrencyConverter />} />

          <Route path="/guide" element={<UserGuide />} />
          <Route path="/info" element={<Info />} />

          {/* Private user */}
          <Route element={<UserRoute />}>
            {/* Alias workspace */}
            <Route path="/recognize" element={<Recognition />} />
            <Route path="/workspace" element={<Recognition />} />

            <Route path="/processing" element={<Processing />} />
            <Route path="/processing/:taskId" element={<Processing />} />
            <Route path="/result" element={<Result />} />

            {/* Alias agent detail */}
            <Route path="/result/detail" element={<AgentResultDetail />} />
            <Route path="/agent-result-detail" element={<AgentResultDetail />} />

            <Route path="/history" element={<History />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/sepay-checkout" element={<SepayCheckout />} />
            <Route path="/payment/success" element={<PaymentReturn status="success" />} />
            <Route path="/payment/failed" element={<PaymentReturn status="failed" />} />
          </Route>
        </Route>

        {/* ===================================================== */}
        {/* AUTH LAYOUT */}
        {/* ===================================================== */}
        <Route path="/auth" element={<AuthLayout />}>
          <Route index element={<Navigate to="/auth/login" replace />} />

          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="verify-email" element={<VerifyEmail />} />

          {/* Admin login */}
          <Route path="admin-login" element={<AdminLogin />} />
          <Route path="admin" element={<Navigate to="/auth/admin-login" replace />} />

          {/* Google OAuth success */}
          <Route path="google/success" element={<GoogleSuccess />} />
        </Route>

        {/* ===================================================== */}
        {/* ADMIN PANEL */}
        {/* ===================================================== */}
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route
              path="/admin"
              element={<Navigate to="/admin/dashboard" replace />}
            />

            {/* Overview & System */}
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/logs" element={<SystemLogs />} />
            <Route path="/admin/settings" element={<Settings />} />
            <Route path="/admin/pages" element={<PagesManager />} />

            {/* User & Payments */}
            <Route path="/admin/users" element={<UsersManager />} />
            <Route
              path="/admin/token-packages"
              element={<TokenPackagesManager />}
            />
            <Route
              path="/admin/transactions"
              element={<TransactionsManager />}
            />
            <Route path="/admin/feedbacks" element={<FeedbacksManager />} />

            {/* Recognition Data */}
            <Route path="/admin/results" element={<ResultsManager />} />
            <Route path="/admin/banknotes" element={<BanknotesManager />} />
            <Route
              path="/admin/currency-rates"
              element={<CurrencyRatesManager />}
            />

            {/* AI Agents */}
            <Route path="/admin/agents" element={<AgentsManager />} />
            <Route path="/admin/agents/config" element={<AgentsConfig />} />
            <Route path="/admin/agents/ai-model" element={<AiModelConfig />} />
            <Route path="/admin/agents/llm" element={<LlmConfig />} />
            <Route
              path="/admin/agents/google-lens"
              element={<GoogleLensConfig />}
            />
            <Route
              path="/admin/agents/aggregator"
              element={<AggregatorConfig />}
            />
          </Route>
        </Route>

        {/* ===================================================== */}
        {/* 404 */}
        {/* ===================================================== */}
        <Route path="/404" element={<NotFound404 />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  );
}
