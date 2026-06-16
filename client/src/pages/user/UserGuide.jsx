import React from "react";
import { BookOpen, Camera, ShieldCheck, Coins, ScanLine, Clock } from "lucide-react";
import { useAppStore } from "../../store/appStore";

export default function UserGuide() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const t = {
    EN: {
      title: "User Handbook",
      subtitle:
        "Learn how to maximize the efficiency of the Multi-Agent grading pipeline.",
      steps: [
        {
          title: "Upload High-Resolution Imagery",
          desc:
            "Place the banknote flat on a high-contrast background. Use uniform lighting and avoid heavy shadows, blur, glare, or cropped corners.",
          icon: Camera,
        },
        {
          title: "Execution and Token Mechanics",
          desc:
            "Each successful scan consumes exactly 1 token. The image is analyzed by the ML, LLM, and visual-search agents before the aggregator selects the final result.",
          icon: Coins,
        },
        {
          title: "Review the Agent Report",
          desc:
            "After processing, review the final decision, individual agent outputs, consensus status, and structured JSON report.",
          icon: ShieldCheck,
        },
        {
          title: "Send Feedback When Needed",
          desc:
            "If the result looks incorrect, use the Feedback page from the result screen. Include the expected denomination and country.",
          icon: BookOpen,
        },
      ],
      tipsTitle: "Quick capture checklist",
      tips: [
        "Use the front side of the banknote when possible.",
        "Keep the full banknote inside the image frame.",
        "Avoid reflective plastic covers and strong glare.",
        "Use the feedback form for wrong-result cases.",
      ],
      cta: "Start a Scan",
    },
    VI: {
      title: "Hướng Dẫn Sử Dụng",
      subtitle:
        "Tìm hiểu cách sử dụng pipeline đa tác tử để nhận diện tiền giấy hiệu quả hơn.",
      steps: [
        {
          title: "Tải ảnh rõ nét",
          desc:
            "Đặt tờ tiền phẳng trên nền tương phản cao. Nên chụp đủ sáng, tránh bóng đổ, mờ nhòe, lóa sáng hoặc bị cắt mất góc.",
          icon: Camera,
        },
        {
          title: "Cơ chế xử lý và token",
          desc:
            "Mỗi lần quét thành công dùng đúng 1 token. Ảnh được xử lý bởi Agent ML, Agent LLM, Agent tìm kiếm ảnh, sau đó Aggregator chốt kết quả cuối.",
          icon: Coins,
        },
        {
          title: "Xem báo cáo tác tử",
          desc:
            "Sau khi xử lý, bạn có thể xem quyết định cuối, kết quả từng agent, trạng thái đồng thuận và dữ liệu JSON cấu trúc.",
          icon: ShieldCheck,
        },
        {
          title: "Gửi phản hồi khi cần",
          desc:
            "Nếu kết quả chưa đúng, hãy gửi phản hồi từ trang kết quả. Nên ghi rõ mệnh giá và quốc gia bạn mong đợi.",
          icon: BookOpen,
        },
      ],
      tipsTitle: "Checklist chụp ảnh nhanh",
      tips: [
        "Ưu tiên chụp mặt trước của tờ tiền.",
        "Đảm bảo toàn bộ tờ tiền nằm trong khung ảnh.",
        "Tránh bọc nhựa phản quang hoặc ánh sáng quá gắt.",
        "Dùng form phản hồi nếu hệ thống nhận diện sai.",
      ],
      cta: "Bắt đầu quét",
    },
  }[lang || "EN"];

  return (
    <div className="page-inner py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden min-h-screen">
      <div className="page-orb-indigo top-0 right-0 opacity-20"></div>
      <div className="page-orb-indigo bottom-40 left-0 opacity-20"></div>

      <div className="max-w-4xl mx-auto space-y-8 relative z-10">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20 text-xs font-black uppercase tracking-wider mb-4">
            <BookOpen className="w-4 h-4" />
            Handbook
          </div>

          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {t.title}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            {t.subtitle}
          </p>
        </div>

        <div className="space-y-5">
          {t.steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <div
                key={step.title}
                className="card-base p-6 flex gap-4 transition-all duration-300 hover:shadow-md hover:border-indigo-500"
              >
                <div className="w-11 h-11 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 rounded-xl flex items-center justify-center shrink-0 font-black">
                  {index + 1}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                      {step.title}
                    </h4>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card-base p-6 shadow-sm overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/10 to-transparent z-0 pointer-events-none"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">{t.tipsTitle}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {t.tips.map((tip) => (
                <div
                  key={tip}
                  className="flex items-start gap-2 bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300"
                >
                  <ShieldCheck className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <a
            href="/recognize"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 transition-all"
          >
            <ScanLine className="w-5 h-5" />
            {t.cta}
          </a>
        </div>
      </div>
    </div>
  );
}
