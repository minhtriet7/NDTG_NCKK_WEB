import React, { useState } from 'react';
import { HelpCircle, MessageSquare, BookOpen, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Support() {
  const { i18n } = useTranslation();
  const [openFaq, setOpenFaq] = useState(null);
  const isVi = i18n.language === 'vi' || i18n.language?.startsWith('vi');

  const faqsEn = [
    {
      question: "How do tokens work in BanknoteAI?",
      answer: "Tokens are used as utility credits on the platform. Every banknote scan executes parallel analysis processes across our Machine Learning, LLM, and Visual Search agents. This multi-agent verification consumes 1 token. Tokens can be purchased in packages from our Pricing page."
    },
    {
      question: "What payment gateways are supported?",
      answer: "We support VietQR/SePay (direct bank transfer via instant dynamic QR codes) and VNPay sandbox accounts. All payments are encrypted and processed securely. Tokens are credited to your profile automatically within seconds of a successful transfer."
    },
    {
      question: "How accurate is the AI recognition consensus?",
      answer: "Our three-agent consensus system (ML pattern model, LLM text analyzer, and Visual Search engine) has an average accuracy of over 98% on standard Southeast Asian banknotes. In case of damaged, worn, or highly stained banknotes, the aggregator might flag a 'Conflict' status, allowing you to manually verify the individual agent outputs."
    },
    {
      question: "Can I retrieve my scan history?",
      answer: "Yes. If you are logged into your account, all scans are automatically logged and saved to your history. You can view previous scans, inspect individual agent voting records, and download structural JSON metadata at any time."
    },
    {
      question: "How can I request a refund or report a failed scan?",
      answer: "If our system encounters an API timeout or server error that prevents a scan result from being generated, your token is automatically refunded. If you believe there was a billing discrepancy, please contact our support desk with your Transaction ID at support@banknoteai.com."
    }
  ];

  const faqsVi = [
    {
      question: "Token hoạt động như thế nào trong BanknoteAI?",
      answer: "Token được sử dụng làm số dư tiện ích trên nền tảng. Mỗi lượt quét nhận diện tiền giấy sẽ chạy song song các phân tích của tác tử Học máy, Tác tử ngôn ngữ và Tác tử Tìm kiếm thị giác. Lượt quét đồng thuận đa tác tử này tiêu tốn 1 token. Bạn có thể mua thêm token tại trang Gói nạp."
    },
    {
      question: "Hệ thống hỗ trợ cổng thanh toán nào?",
      answer: "Chúng tôi hỗ trợ VietQR/SePay (chuyển khoản ngân hàng tức thời qua mã QR động) và cổng thanh toán thử nghiệm VNPay. Mọi thanh toán được bảo mật cao và token sẽ được cộng tự động vào ví của bạn sau vài giây giao dịch thành công."
    },
    {
      question: "Độ chính xác của việc nhận diện AI đồng thuận là bao nhiêu?",
      answer: "Hệ thống đồng thuận 3 tác tử của chúng tôi có độ chính xác trung bình trên 98% đối với các loại tiền giấy Đông Nam Á lưu hành phổ biến. Với các tờ tiền cũ, nhàu hoặc bẩn nặng, bộ gom có thể trả về trạng thái 'Xung đột' để bạn kiểm tra thủ công phiếu bầu của từng tác tử."
    },
    {
      question: "Tôi có thể xem lại lịch sử quét của mình không?",
      answer: "Có. Nếu bạn đăng nhập tài khoản, mọi lượt quét đều được lưu tự động. Bạn có thể xem kết quả chi tiết, kiểm tra thông số agent và tải về cấu trúc dữ liệu JSON bất kỳ lúc nào."
    },
    {
      question: "Làm thế nào để yêu cầu hoàn token hoặc báo cáo lỗi quét?",
      answer: "Nếu hệ thống gặp lỗi timeout từ server khiến lượt quét không ra kết quả, token sẽ được tự động hoàn lại. Nếu có chênh lệch tài khoản hoặc giao dịch lỗi, vui lòng gửi email kèm Mã giao dịch tới support@banknoteai.com."
    }
  ];

  const faqs = isVi ? faqsVi : faqsEn;

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="w-full min-h-screen bg-background dark:bg-[#0B1120] text-foreground dark:text-[#F8FAFC] font-sans transition-colors duration-300 py-12 lg:py-20 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-4 text-slate-900 dark:text-white">
            {isVi ? "Trung tâm Hỗ trợ" : "Support Center"}
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            {isVi 
              ? "Bạn cần trợ giúp về số dư token, giao dịch nạp tiền hoặc lỗi quét? Hãy tra cứu FAQ hoặc liên hệ với chúng tôi."
              : "Need help with your scans, billing, or token balance? Search our FAQs or get in touch with our engineering team."}
          </p>
        </div>

        {/* Support Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="bg-white dark:bg-[#1E293B]/40 border border-slate-100 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
            <BookOpen className="w-8 h-8 text-indigo-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {isVi ? "Tài liệu Hướng dẫn" : "Documentation"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {isVi 
                ? "Khám phá các hướng dẫn sử dụng, bảng thư mục tiền tệ và cách tối ưu hóa các tác tử."
                : "Explore user guides, currency tables, and instructions on fine-tuning agents."}
            </p>
            <a href="/guide" className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              {isVi ? "Xem hướng dẫn" : "Read guides"} &rarr;
            </a>
          </div>

          <div className="bg-white dark:bg-[#1E293B]/40 border border-slate-100 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
            <MessageSquare className="w-8 h-8 text-emerald-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {isVi ? "Email Hỗ trợ" : "Email Support"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {isVi 
                ? "Gửi các yêu cầu thanh toán hoặc đăng ký tài khoản API doanh nghiệp."
                : "Submit billing queries or request bulk API enterprise access details."}
            </p>
            <a href="mailto:support@banknoteai.com" className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
              {isVi ? "Gửi email hỗ trợ" : "Email support"} &rarr;
            </a>
          </div>

          <div className="bg-white dark:bg-[#1E293B]/40 border border-slate-100 dark:border-slate-800/80 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
            <AlertCircle className="w-8 h-8 text-amber-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {isVi ? "Trạng thái Hệ thống" : "System Status"}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {isVi 
                ? "Kiểm tra hiệu năng thời gian thực của máy chủ và phản hồi từ các agent AI."
                : "Check real-time system performance, model latencies, and agent status."}
            </p>
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-semibold mt-4">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              {isVi ? "Hệ thống hoạt động bình thường" : "All systems online"}
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="bg-white dark:bg-[#1E293B]/20 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 sm:p-10 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8 flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-indigo-500" />
            {isVi ? "Câu hỏi Thường gặp" : "Frequently Asked Questions"}
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div 
                  key={index}
                  className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 pb-4 last:pb-0"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full flex items-center justify-between text-left py-3 font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <span>{faq.question}</span>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {isOpen && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mt-2 pl-1 animate-fadeIn">
                      {faq.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

