import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useAppStore } from "../../store/appStore";
import toast from "react-hot-toast";
import { getMyTransactions } from "../../services/userService";
import {
  Coins,
  CheckCircle2,
  History,
  ScanLine,
  Receipt,
  Loader2,
  Lock,
  Clock,
  Landmark,
  RefreshCw,
} from "lucide-react";

import {
  getTokenPackages,
  createCheckoutSession,
  getPaymentGatewaySettings,
} from "../../services/paymentService";

function getPackageId(pkg) {
  return pkg?.id || pkg?._id || pkg?.package_key;
}

function getTokens(pkg) {
  return Number(pkg?.tokens_included ?? pkg?.tokens ?? 0);
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export default function Pricing() {
  const navigate = useNavigate();
  const { lang } = useAppStore();
  const { user, token } = useAuthStore();

  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  // bank_transfer is the only active gateway — VNPay is disabled.
  const [selectedGateway] = useState("bank_transfer");
  const [gatewaySettings, setGatewaySettings] = useState(null);
  const [transactions, setTransactions] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  const t = {
    EN: {
      title: "Recharge Tokens",
      subtitle:
        "Buy tokens to run banknote scans, review agent results, and export JSON reports.",
      currBalance: "Current Balance",
      tokenUnit: "tokens",
      toWorkspace: "Go to Scanner",
      selectPkg: "Select a package",
      bestValue: "Best Value",
      selected: "Selected",
      choose: "Choose",
      payMethod: "Payment Method",
      bankTx: "VietQR / Bank Transfer",
      bankTxDesc:
        "Scan the QR or transfer manually. Tokens are added after admin confirms your transfer.",
      summary: "Order Summary",
      pkg: "Package",
      tokensInc: "Tokens included",
      gateway: "Gateway",
      total: "Total Due",
      selectFirst: "Select a package to continue",
      btnPay: "Continue to Payment",
      loading: "Processing...",
      howItWorks: "How Tokens Work",
      step1Title: "Choose a package",
      step1Desc: "Select a token package created by the administrator.",
      step2Title: "Complete payment",
      step2Desc: "Pay via VietQR or manual bank transfer.",
      step3Title: "Receive tokens",
      step3Desc: "Tokens are added after admin confirms your transfer.",
      step4Title: "Start scanning",
      step4Desc: "Return to the scanner and analyze banknotes.",
      history: "Recent Token Activity",
      noHistory: "No token activity yet",
      noHistoryDesc: "Your transaction history will appear here.",
      noPackages: "No token packages available",
      noPackagesDesc:
        "There are no active token packages. Please contact the administrator.",
      reload: "Reload",
      thDate: "Date",
      thType: "Transaction Type",
      thTokens: "Tokens",
      thAmount: "Amount",
      thStatus: "Status",
      errSelect: "Please select a token package.",
      errPay: "Unable to process payment. Please try again.",
      errLoad: "Unable to load token packages.",
      successBank: "Bank transfer invoice generated.",
      processingBank: "Creating transfer invoice...",
      fallbackFeature1: "Multi-agent recognition result",
      fallbackFeature2: "Structured JSON output",
      fallbackFeature3: "Scan history saved",
    },
    VI: {
      title: "Nạp Token",
      subtitle:
        "Mua token để quét tiền, xem kết quả phân tích và xuất báo cáo JSON.",
      currBalance: "Số dư hiện tại",
      tokenUnit: "tokens",
      toWorkspace: "Vào trang nhận diện",
      selectPkg: "Chọn gói token",
      bestValue: "Gợi ý",
      selected: "Đã chọn",
      choose: "Chọn",
      payMethod: "Phương thức thanh toán",
      bankTx: "VietQR / Chuyển khoản",
      bankTxDesc:
        "Quét QR hoặc chuyển khoản thủ công. Token được cộng sau khi admin xác nhận giao dịch.",
      summary: "Tóm tắt đơn hàng",
      pkg: "Gói",
      tokensInc: "Token nhận được",
      gateway: "Cổng thanh toán",
      total: "Tổng thanh toán",
      selectFirst: "Chọn một gói để tiếp tục",
      btnPay: "Tiếp tục thanh toán",
      loading: "Đang tạo hóa đơn...",
      howItWorks: "Hướng dẫn mua và sử dụng Token",
      step1Title: "Chọn gói token",
      step1Desc: "Chọn gói token được quản trị viên tạo trong hệ thống.",
      step2Title: "Thanh toán",
      step2Desc: "Thanh toán qua VietQR hoặc chuyển khoản ngân hàng.",
      step3Title: "Nhận Token",
      step3Desc: "Token được cộng sau khi admin xác nhận giao dịch.",
      step4Title: "Sử dụng",
      step4Desc: "Quay lại trang nhận diện và bắt đầu phân tích tiền giấy.",
      history: "Lịch sử giao dịch gần đây",
      noHistory: "Chưa có giao dịch token",
      noHistoryDesc:
        "Lịch sử nạp và sử dụng token của bạn sẽ hiển thị tại đây.",
      noPackages: "Chưa có gói token khả dụng",
      noPackagesDesc:
        "Hiện chưa có gói token đang mở bán. Vui lòng liên hệ quản trị viên.",
      reload: "Tải lại",
      thDate: "Ngày",
      thType: "Loại giao dịch",
      thTokens: "Số lượng Token",
      thAmount: "Số tiền",
      thStatus: "Trạng thái",
      errSelect: "Vui lòng chọn một gói token.",
      errPay: "Không thể xử lý thanh toán. Vui lòng thử lại.",
      errLoad: "Không thể tải gói token.",
      successBank: "Khởi tạo hóa đơn chuyển khoản thành công.",
      processingBank: "Đang tạo hóa đơn chuyển khoản...",
      fallbackFeature1: "Kết quả nhận diện đa tác tử",
      fallbackFeature2: "Xuất dữ liệu JSON có cấu trúc",
      fallbackFeature3: "Lưu lịch sử quét",
    },
  }[lang || "EN"];

  const fallbackFeatures = useMemo(
    () => [t.fallbackFeature1, t.fallbackFeature2, t.fallbackFeature3],
    [t.fallbackFeature1, t.fallbackFeature2, t.fallbackFeature3],
  );

  const normalizePackage = (pkg) => {
    const tokens = getTokens(pkg);

    return {
      id: getPackageId(pkg),
      package_key: pkg?.package_key || pkg?.key || "",
      name: pkg?.name || "Token Package",
      description: pkg?.description || "",
      tokens,
      tokens_included: tokens,
      price_vnd: Number(pkg?.price_vnd || 0),
      price_usd: Number(pkg?.price_usd || 0),
      features:
        Array.isArray(pkg?.features) && pkg.features.length > 0
          ? pkg.features
          : fallbackFeatures,
      badge: pkg?.badge || "",
      sort_order: Number(pkg?.sort_order || 0),
      is_active: pkg?.is_active !== false,
    };
  };

  const normalizePackages = (data) => {
    return normalizeList(data)
      .map(normalizePackage)
      .filter((pkg) => pkg.is_active)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  };

  const loadData = async () => {
    setIsLoading(true);

    try {
      try {
        const settings = await getPaymentGatewaySettings();
        setGatewaySettings(settings);
        // VNPay is disabled — always use bank_transfer.
      } catch (err) {
        console.error("Failed to load gateway settings:", err);
      }

      const pkgs = await getTokenPackages();
      const normalizedPkgs = normalizePackages(pkgs);

      setPackages(normalizedPkgs);

      const suggestedPackage =
        normalizedPkgs.find((pkg) =>
          String(pkg.badge || "").toLowerCase().includes("best"),
        ) ||
        normalizedPkgs.find((pkg) =>
          String(pkg.badge || "").toLowerCase().includes("gợi"),
        ) ||
        normalizedPkgs.find((pkg) =>
          String(pkg.package_key || "").toLowerCase().includes("pro"),
        ) ||
        normalizedPkgs[1] ||
        normalizedPkgs[0] ||
        null;

      setSelectedPackage(suggestedPackage);

      if (token) {
        const txs = await getMyTransactions(5);
        setTransactions(normalizeList(txs));
      }
    } catch (error) {
      console.error("Load pricing error:", error);
      toast.error(t.errLoad);
      setPackages([]);
      setSelectedPackage(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, token]);

  const handleCheckoutClick = () => {
    if (isCheckoutLoading) return;

    if (!selectedPackage) {
      toast.error(t.errSelect);
      return;
    }

    handleCheckout();
  };

  const handleCheckout = async () => {
    if (isCheckoutLoading) return;

    if (!selectedPackage) {
      toast.error(t.errSelect);
      return;
    }

    const packageId = getPackageId(selectedPackage);

    if (!packageId) {
      toast.error(t.errSelect);
      return;
    }

    setIsCheckoutLoading(true);

    try {
      const checkoutData = await createCheckoutSession({
        package_id: packageId,
        gateway: "bank_transfer",
      });

      const invoiceData = checkoutData?.invoice || checkoutData;
      navigate("/checkout", { state: { invoice: invoiceData } });
      toast.success(t.successBank);
    } catch (error) {
      const errorMessage =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        t.errPay;
      toast.error(errorMessage);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const formatPrice = (amount) => {
    return new Intl.NumberFormat("vi-VN").format(Number(amount || 0)) + " đ";
  };

  const formatDate = (value) => {
    if (!value) return "N/A";

    try {
      return new Intl.DateTimeFormat(lang === "VI" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return "N/A";
    }
  };

  return (
    <div className="page-inner pt-6 relative pb-24 font-sans transition-colors duration-300">
      <div className="page-orb-indigo top-0 right-[-10%]" />
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pt-10 pb-10 mb-8 transition-colors relative z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2 transition-colors">
              {t.title}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed transition-colors">
              {t.subtitle}
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex items-center gap-5 w-full md:w-auto shadow-sm transition-colors">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 transition-colors">
              <Coins size={24} />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">
                {t.currBalance}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white transition-colors">
                {user?.token_balance || 0}{" "}
                <span className="text-lg text-slate-500 dark:text-slate-400 font-medium transition-colors">
                  {t.tokenUnit}
                </span>
              </p>
            </div>

            <div className="ml-auto md:ml-4 border-l border-slate-200 dark:border-slate-700 pl-5 transition-colors">
              <button
                onClick={() => navigate("/recognize")}
                className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors whitespace-nowrap"
              >
                {t.toWorkspace} &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 xl:grid-cols-3 gap-8 relative z-10">
        <div className="xl:col-span-2 space-y-8">
          {/* Package selector */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white transition-colors">
                {t.selectPkg}
              </h2>

              <button
                onClick={loadData}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition-colors disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={isLoading ? "animate-spin" : ""}
                />
                {t.reload}
              </button>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-80 bg-slate-100 dark:bg-slate-800 rounded-3xl animate-pulse transition-colors"
                  />
                ))}
              </div>
            ) : packages.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Coins className="text-slate-400" size={26} />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {t.noPackages}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  {t.noPackagesDesc}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {packages.map((pkg, idx) => {
                  const packageId = getPackageId(pkg);
                  const selectedId = getPackageId(selectedPackage);
                  const isSelected = selectedId === packageId;

                  const isHighlighted =
                    Boolean(String(pkg.badge || "").trim()) ||
                    String(pkg.package_key || "")
                      .toLowerCase()
                      .includes("pro") ||
                    idx === 1;

                  return (
                    <div
                      key={packageId || idx}
                      onClick={() => setSelectedPackage(pkg)}
                      className={`relative cursor-pointer transition-all duration-200 rounded-3xl p-6 bg-white dark:bg-slate-900 flex flex-col ${
                        isSelected
                          ? "ring-2 ring-indigo-500 dark:ring-indigo-400 border-transparent shadow-md scale-[1.02] z-10"
                          : "border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700"
                      }`}
                    >
                      {isHighlighted && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                          {pkg.badge || t.bestValue}
                        </div>
                      )}

                      <div className="mb-4">
                        <h3 className="font-bold text-lg text-slate-900 dark:text-white transition-colors">
                          {pkg.name}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 transition-colors">
                          {getTokens(pkg)} {t.tokenUnit}
                        </p>
                      </div>

                      <div className="mb-3">
                        <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight transition-colors">
                          {formatPrice(pkg.price_vnd)}
                        </span>
                      </div>

                      {pkg.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
                          {pkg.description}
                        </p>
                      )}

                      <ul className="space-y-3 mb-8 text-sm text-slate-600 dark:text-slate-300 flex-1 transition-colors">
                        {(pkg.features || []).map((feature, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 leading-snug"
                          >
                            <CheckCircle2
                              size={16}
                              className="text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5 transition-colors"
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div
                        className={`w-full py-3 rounded-xl text-center font-bold text-sm transition-colors ${
                          isSelected
                            ? "bg-indigo-600 dark:bg-indigo-500 text-white shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {isSelected ? t.selected : t.choose}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment method — VietQR / Bank Transfer only */}
          <div>
            <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white transition-colors">
              {t.payMethod}
            </h2>

            <div className="rounded-2xl border-2 border-emerald-500 dark:border-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/10 p-5 flex items-start gap-4 transition-colors">
              <div className="w-11 h-11 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center shrink-0 transition-colors">
                <Landmark className="text-emerald-600 dark:text-emerald-400" size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-900 dark:text-white transition-colors">
                    {t.bankTx}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                    <CheckCircle2 size={10} />
                    {lang === "VI" ? "Đang hoạt động" : "Active"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed transition-colors">
                  {t.bankTxDesc}
                </p>
              </div>
              <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 transition-colors" />
            </div>
          </div>
        </div>

        {/* Order summary sidebar */}
        <div className="xl:col-span-1">
          <div className="sticky top-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8 transition-colors">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2 transition-colors">
              <Receipt size={20} className="text-indigo-600 dark:text-indigo-400" />
              {t.summary}
            </h2>

            {!selectedPackage ? (
              <div className="py-10 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 transition-colors">
                <ScanLine
                  size={32}
                  className="opacity-20 mb-3 text-slate-400 dark:text-slate-500 transition-colors"
                />
                <p className="font-medium">{t.selectFirst}</p>
              </div>
            ) : (
              <>
                <div className="space-y-5 mb-6">
                  <div className="flex justify-between items-center text-sm gap-4">
                    <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">
                      {t.pkg}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white transition-colors text-right">
                      {selectedPackage.name}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">
                      {t.tokensInc}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white transition-colors">
                      {getTokens(selectedPackage)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-sm gap-4">
                    <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">
                      {t.gateway}
                    </span>
                    <span className="font-bold uppercase text-emerald-600 dark:text-emerald-400 transition-colors text-right">
                      {t.bankTx}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-5 mb-8 transition-colors">
                  <div className="flex justify-between items-end gap-4">
                    <span className="text-slate-900 dark:text-white font-bold transition-colors">
                      {t.total}
                    </span>
                    <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight transition-colors text-right">
                      {formatPrice(selectedPackage.price_vnd)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleCheckoutClick}
                  disabled={isCheckoutLoading}
                  className="w-full py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed bg-slate-900 dark:bg-indigo-600 text-white hover:bg-slate-800 dark:hover:bg-indigo-500"
                >
                  {isCheckoutLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Lock size={18} />
                  )}
                  {isCheckoutLoading ? t.processingBank : t.btnPay}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-24 relative z-10">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 text-center transition-colors">
          {t.howItWorks}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { step: "1", title: t.step1Title, desc: t.step1Desc },
            { step: "2", title: t.step2Title, desc: t.step2Desc },
            { step: "3", title: t.step3Title, desc: t.step3Desc },
            { step: "4", title: t.step4Title, desc: t.step4Desc },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center transition-colors"
            >
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-black rounded-full flex items-center justify-center mb-4 border border-indigo-100 dark:border-indigo-800/50 transition-colors">
                {item.step}
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-2 transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium transition-colors">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent transaction history */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-20">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2 transition-colors">
          <History size={24} className="text-slate-400 dark:text-slate-500" />
          {t.history}
        </h2>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
          {transactions.length === 0 ? (
            <div className="p-16 text-center flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-800/50 transition-colors">
              <Clock
                size={48}
                className="text-slate-300 dark:text-slate-600 mb-4 transition-colors"
              />
              <h3 className="text-slate-900 dark:text-white font-bold text-lg transition-colors">
                {t.noHistory}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 font-medium transition-colors">
                {t.noHistoryDesc}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 transition-colors">
                  <tr>
                    <th className="px-6 py-4">{t.thDate}</th>
                    <th className="px-6 py-4">{t.thType}</th>
                    <th className="px-6 py-4">{t.thTokens}</th>
                    <th className="px-6 py-4">{t.thAmount}</th>
                    <th className="px-6 py-4">{t.thStatus}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium transition-colors">
                  {transactions.map((tx, idx) => (
                    <tr
                      key={tx.id || idx}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">{formatDate(tx.created_at)}</td>
                      <td className="px-6 py-4 text-slate-900 dark:text-slate-100 transition-colors">
                        {tx.package_name ||
                          tx.payment_gateway ||
                          (lang === "VI" ? "Nạp token" : "Token recharge")}
                      </td>
                      <td className="px-6 py-4 text-indigo-600 dark:text-indigo-400 font-bold transition-colors">
                        +{tx.tokens_added || 0}
                      </td>
                      <td className="px-6 py-4">{formatPrice(tx.amount)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-lg border text-xs font-bold uppercase tracking-wider transition-colors ${
                            tx.status === "success" || tx.status === "paid"
                              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
                              : tx.status === "pending"
                                ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
                                : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
