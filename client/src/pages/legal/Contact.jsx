import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, MessageSquare, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export default function Contact() {
  const { i18n } = useTranslation();
  const isVi = i18n.language === 'vi' || i18n.language?.startsWith('vi');

  const [formState, setFormState] = useState({
    name: '',
    email: '',
    subject: 'General Inquiry',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success(isVi ? "Gửi tin nhắn thành công! Chúng tôi sẽ phản hồi sớm." : "Message sent successfully! Our team will respond shortly.");
      setFormState({
        name: '',
        email: '',
        subject: isVi ? 'Yêu cầu Chung' : 'General Inquiry',
        message: ''
      });
    }, 1200);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="w-full min-h-screen bg-background dark:bg-[#0B1120] text-foreground dark:text-[#F8FAFC] font-sans transition-colors duration-300 py-12 lg:py-20 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-500/5 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight mb-4 text-slate-900 dark:text-white">
            {isVi ? "Liên hệ với chúng tôi" : "Get in touch"}
          </h1>
          <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
            {isVi
              ? "Bạn có câu hỏi về hệ thống nhận diện đa tác tử hoặc muốn hợp tác? Điền biểu mẫu dưới đây hoặc liên hệ trực tiếp."
              : "Have questions about our multi-agent recognition system or want to partner with us? Fill out the form below or reach out directly."}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Contact Details (Left) */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-white dark:bg-[#1E293B]/20 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                {isVi ? "Thông tin Liên hệ" : "Contact Information"} <Sparkles className="w-5 h-5 text-indigo-500" />
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                {isVi
                  ? "Dù bạn là nhà nghiên cứu, nhà phát triển hay tổ chức tài chính, chúng tôi luôn sẵn sàng thảo luận về tích hợp API, cấp phép dữ liệu và các gói tùy chỉnh riêng biệt."
                  : "Whether you are a researcher, developer, or financial operator, we are always open to discuss integrations, dataset licensing, and customization options."}
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{isVi ? "Email hỗ trợ" : "Email Us"}</h4>
                    <a href="mailto:contact@banknoteai.com" className="text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition-colors">
                      contact@banknoteai.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{isVi ? "Điện thoại" : "Call Us"}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      +84 932867567
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{isVi ? "Trụ sở chính" : "Our Headquarter"}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      {isVi
                        ? "Cần Thơ"
                        : "Cần Thơ"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6 flex items-start gap-4">
              <MessageSquare className="w-6 h-6 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isVi ? "Bạn cần hỗ trợ kỹ thuật?" : "Looking for technical support?"}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {isVi
                    ? "Nếu bạn gặp sự cố thanh toán hoặc số dư token, vui lòng truy cập Trung tâm Hỗ trợ để được giải đáp tức thì."
                    : "If you have a billing issue or need quick help with your token balance, please visit our Support Center for instant assistance."}
                </p>
              </div>
            </div>
          </div>

          {/* Contact Form (Right) */}
          <div className="lg:col-span-7 bg-white dark:bg-[#1E293B]/40 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-8 sm:p-10 shadow-sm relative">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    {isVi ? "Họ và Tên" : "Your Name"}
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formState.name}
                    onChange={handleInputChange}
                    required
                    placeholder={isVi ? "Nhập tên của bạn" : "Enter your name"}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400/50 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    {isVi ? "Địa chỉ Email" : "Email Address"}
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formState.email}
                    onChange={handleInputChange}
                    required
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400/50 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {isVi ? "Chủ đề liên hệ" : "Subject"}
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formState.subject}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400/50 focus:border-transparent transition-all"
                >
                  <option value={isVi ? "Yêu cầu Chung" : "General Inquiry"}>
                    {isVi ? "Yêu cầu Chung" : "General Inquiry"}
                  </option>
                  <option value={isVi ? "Giải pháp Doanh nghiệp" : "Enterprise Solution"}>
                    {isVi ? "Giải pháp Doanh nghiệp" : "Enterprise Solution"}
                  </option>
                  <option value={isVi ? "Tích hợp API & Hợp tác" : "API Integration"}>
                    {isVi ? "Tích hợp API & Hợp tác" : "API Integration / Partnership"}
                  </option>
                  <option value={isVi ? "Báo cáo Lỗi hệ thống" : "Report a Bug"}>
                    {isVi ? "Báo cáo Lỗi hệ thống" : "Report a Bug"}
                  </option>
                  <option value={isVi ? "Hóa đơn & Hoàn tiền" : "Billing & Refund"}>
                    {isVi ? "Hóa đơn & Hoàn tiền" : "Billing & Refund"}
                  </option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {isVi ? "Nội dung tin nhắn" : "Your Message"}
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formState.message}
                  onChange={handleInputChange}
                  required
                  rows="5"
                  placeholder={isVi ? "Chúng tôi có thể giúp gì cho bạn..." : "Tell us how we can help you..."}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400/50 focus:border-transparent transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-sm shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isVi ? "Đang gửi tin nhắn..." : "Sending Message..."}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {isVi ? "Gửi tin nhắn" : "Send Message"}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

