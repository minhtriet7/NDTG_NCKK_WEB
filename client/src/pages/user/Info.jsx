import React from "react";
import {
  HelpCircle,
  BrainCircuit,
  ScanLine,
  Globe,
  Award,
  DatabaseZap,
  Sparkles,
  Coins,
  Zap,
  Network,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAppStore } from "../../store/appStore";

export default function Info() {
  const { lang, theme } = useAppStore();
  const isDark = theme === "dark";

  const content = {
    EN: {
      badge: "System Architecture v1.0",
      heroTitleA: "Powered by",
      heroTitleB: "Multi-Agent AI Intelligence",
      heroDesc:
        "BanknoteAI bridges Computer Vision and Large Language Models to improve currency recognition through independent agents and consensus validation.",
      clusterTitle: "The Neural Consensus Cluster",
      baseAccuracy: "Base Accuracy",
      operational: "Status: Operational",
      aggregatorBadge: "The Chief Arbitrator",
      aggregatorTitle: "Aggregator Agent & Logic",
      aggregatorDesc:
        "The aggregator does not analyze the image directly. It compares the independent outputs from all agents, applies strict vote rules, and only finalizes a result when the consensus threshold is satisfied.",
      pipelineTitle: "Execution Pipeline",
      pipelineDesc: "From raw image ingestion to validated structured data.",
      ctaTitle: "Ready to Deploy the Agents?",
      ctaDesc:
        "Upload a banknote image and watch the consensus protocol in action.",
      explore: "Explore Database",
      scan: "Initialize Scanner",
      agents: [
        {
          icon: ScanLine,
          color: "text-sky-500",
          bg: "bg-sky-50 dark:bg-sky-500/10",
          border: "border-sky-200 dark:border-sky-500/20",
          name: "Agent 1: YOLO ML",
          desc:
            "Spatial recognition specialist. Detects and isolates the banknote, extracts visual clues, and provides machine-learning evidence.",
          power: "85%",
        },
        {
          icon: BrainCircuit,
          color: "text-purple-500",
          bg: "bg-purple-50 dark:bg-purple-500/10",
          border: "border-purple-200 dark:border-purple-500/20",
          name: "Agent 2: Gemini LLM",
          desc:
            "Vision-language expert. Reads visual details, text, denomination clues, security patterns, and contextual information.",
          power: "92%",
        },
        {
          icon: Globe,
          color: "text-blue-500",
          bg: "bg-blue-50 dark:bg-blue-500/10",
          border: "border-blue-200 dark:border-blue-500/20",
          name: "Agent 3: Lens Engine",
          desc:
            "Global cross-reference node. Compares the uploaded image with visual references to reduce false positives.",
          power: "90%",
        },
      ],
      steps: [
        {
          icon: DatabaseZap,
          title: "1. Data Ingestion",
          text:
            "The secure API receives the image, validates it, and prepares it for the AI pipeline.",
        },
        {
          icon: Sparkles,
          title: "2. Parallel Processing",
          text:
            "The task is dispatched to YOLO, Gemini, and Lens agents. Each agent runs independently.",
        },
        {
          icon: Network,
          title: "3. Neural Consensus",
          text:
            "The aggregator compares all agent outputs and resolves agreement or conflict.",
        },
        {
          icon: Coins,
          title: "4. Token Settlement",
          text:
            "When the classification completes, the system charges exactly 1 processing token.",
        },
      ],
    },
    VI: {
      badge: "Kiến trúc hệ thống v1.0",
      heroTitleA: "Vận hành bởi",
      heroTitleB: "Trí tuệ AI đa tác tử",
      heroDesc:
        "BanknoteAI kết hợp Computer Vision và mô hình ngôn ngữ lớn để nâng độ chính xác nhận diện tiền giấy thông qua nhiều tác tử độc lập và cơ chế đồng thuận.",
      clusterTitle: "Cụm tác tử đồng thuận",
      baseAccuracy: "Độ chính xác nền",
      operational: "Trạng thái: Hoạt động",
      aggregatorBadge: "Trọng tài chính",
      aggregatorTitle: "Aggregator Agent & Logic",
      aggregatorDesc:
        "Aggregator không phân tích ảnh trực tiếp. Nó đối chiếu kết quả độc lập từ các agent, áp dụng luật vote nghiêm ngặt và chỉ chốt khi đạt ngưỡng đồng thuận.",
      pipelineTitle: "Pipeline xử lý",
      pipelineDesc: "Từ ảnh đầu vào đến dữ liệu cấu trúc đã xác thực.",
      ctaTitle: "Sẵn sàng kích hoạt các Agent?",
      ctaDesc:
        "Tải ảnh tiền giấy lên và xem cơ chế đồng thuận hoạt động.",
      explore: "Khám phá dữ liệu",
      scan: "Bắt đầu nhận diện",
      agents: [
        {
          icon: ScanLine,
          color: "text-sky-500",
          bg: "bg-sky-50 dark:bg-sky-500/10",
          border: "border-sky-200 dark:border-sky-500/20",
          name: "Agent 1: YOLO ML",
          desc:
            "Chuyên gia nhận diện không gian. Phát hiện, tách vùng tờ tiền và đưa ra bằng chứng từ mô hình học máy.",
          power: "85%",
        },
        {
          icon: BrainCircuit,
          color: "text-purple-500",
          bg: "bg-purple-50 dark:bg-purple-500/10",
          border: "border-purple-200 dark:border-purple-500/20",
          name: "Agent 2: Gemini LLM",
          desc:
            "Chuyên gia thị giác-ngôn ngữ. Đọc chi tiết ảnh, chữ, mệnh giá, đặc điểm bảo an và ngữ cảnh.",
          power: "92%",
        },
        {
          icon: Globe,
          color: "text-blue-500",
          bg: "bg-blue-50 dark:bg-blue-500/10",
          border: "border-blue-200 dark:border-blue-500/20",
          name: "Agent 3: Lens Engine",
          desc:
            "Nút đối chiếu hình ảnh toàn cầu. So sánh ảnh tải lên với nguồn tham chiếu để giảm nhận diện sai.",
          power: "90%",
        },
      ],
      steps: [
        {
          icon: DatabaseZap,
          title: "1. Nạp dữ liệu",
          text:
            "API nhận ảnh, kiểm tra hợp lệ và chuẩn bị dữ liệu cho pipeline AI.",
        },
        {
          icon: Sparkles,
          title: "2. Xử lý song song",
          text:
            "Tác vụ được gửi đến YOLO, Gemini và Lens. Mỗi agent chạy độc lập.",
        },
        {
          icon: Network,
          title: "3. Đồng thuận thần kinh",
          text:
            "Aggregator đối chiếu kết quả các agent và xử lý đồng thuận hoặc xung đột.",
        },
        {
          icon: Coins,
          title: "4. Thanh toán token",
          text:
            "Khi phân loại hoàn tất, hệ thống trừ đúng 1 token xử lý.",
        },
      ],
    },
  };

  const t = content[lang || "EN"] || content.EN;

  return (
    <div
      className={`max-w-6xl mx-auto font-sans space-y-16 py-12 px-4 sm:px-6 lg:px-8 antialiased overflow-hidden relative ${
        isDark ? "text-slate-100" : "text-slate-800"
      }`}
    >
      <div className="absolute top-0 right-0 w-96 h-96 bg-teal-400 rounded-full blur-[120px] opacity-10 animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-40 left-0 w-96 h-96 bg-indigo-500 rounded-full blur-[120px] opacity-10 animate-pulse duration-[6000ms] pointer-events-none"></div>

      <section className="text-center space-y-6 relative z-10 animate-[fadeInUp_0.8s_ease-out]">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/20 text-teal-700 dark:text-teal-300 text-sm font-bold shadow-sm">
          <HelpCircle className="w-4 h-4" />
          <span>{t.badge}</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {t.heroTitleA} <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#009688] to-blue-600">
            {t.heroTitleB}
          </span>
        </h1>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
          {t.heroDesc}
        </p>
      </section>

      <section className="relative z-10 space-y-10 pt-8">
        <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left justify-center md:justify-start">
          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
            <BrainCircuit className="w-8 h-8 text-slate-600 dark:text-slate-300" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t.clusterTitle}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {t.agents.map((agent, index) => (
            <div
              key={agent.name}
              className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 group flex flex-col relative overflow-hidden"
            >
              <div
                className={`absolute top-0 right-0 w-32 h-32 ${agent.bg} rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110`}
              ></div>

              <div className="flex items-center justify-between mb-8 relative z-10">
                <div
                  className={`w-14 h-14 ${agent.bg} ${agent.color} ${agent.border} rounded-2xl flex items-center justify-center border shadow-sm`}
                >
                  <agent.icon className="w-7 h-7" />
                </div>
                <div className="text-right">
                  <div className={`text-3xl font-black ${agent.color}`}>
                    {agent.power}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {t.baseAccuracy}
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight relative z-10">
                {agent.name}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed flex-1 relative z-10">
                {agent.desc}
              </p>

              <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-5 relative z-10"></div>
              <div
                className={`text-xs font-mono font-semibold ${agent.color} bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 relative z-10`}
              >
                // {t.operational} / Node_{index + 1}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-900 p-8 md:p-10 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group transform transition-all duration-300 hover:border-teal-700">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-900/40 via-slate-900 to-slate-900 opacity-80 z-0"></div>
          <div className="relative z-10 grid md:grid-cols-[1fr,auto] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 text-xs font-bold uppercase tracking-wider mb-4">
                <Award className="w-4 h-4" /> {t.aggregatorBadge}
              </div>
              <h3 className="text-3xl font-extrabold text-white tracking-tight mb-3">
                {t.aggregatorTitle}
              </h3>
              <p className="text-slate-300 text-sm md:text-base max-w-3xl leading-relaxed">
                {t.aggregatorDesc}
              </p>
            </div>
            <Award className="w-24 h-24 text-amber-500/20 group-hover:scale-110 transition-transform duration-500 hidden md:block" />
          </div>
        </div>
      </section>

      <section className="relative z-10 space-y-12 pt-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t.pipelineTitle}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">{t.pipelineDesc}</p>
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="absolute left-8 md:left-1/2 md:-translate-x-1/2 top-4 bottom-4 w-1 bg-slate-100 dark:bg-slate-800 rounded-full"></div>

          <div className="space-y-8">
            {t.steps.map((step, index) => (
              <div
                key={step.title}
                className={`flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8 ${
                  index % 2 === 1 ? "md:flex-row-reverse" : ""
                } group relative`}
              >
                <div className="absolute left-8 md:left-1/2 -translate-x-1/2 w-4 h-4 bg-teal-500 rounded-full border-4 border-white dark:border-slate-950 shadow-sm z-10 hidden md:block"></div>

                <div
                  className={`w-full md:w-1/2 ${
                    index % 2 === 0
                      ? "md:pr-12 md:text-right"
                      : "md:pl-12 md:text-left"
                  } pl-16 md:pl-0`}
                >
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm group-hover:shadow-md group-hover:border-teal-300 dark:group-hover:border-teal-700 transition-all duration-300 relative">
                    <div className="flex items-center gap-3 mb-3 md:hidden">
                      <step.icon className="w-5 h-5 text-teal-600" />
                      <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                        {step.title}
                      </h4>
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2 hidden md:block">
                      {index % 2 !== 0 && (
                        <step.icon className="w-5 h-5 text-teal-600 inline mr-2" />
                      )}
                      {step.title}
                      {index % 2 === 0 && (
                        <step.icon className="w-5 h-5 text-teal-600 inline ml-2" />
                      )}
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                      {step.text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 text-center py-16 bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden mt-16 group">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-teal-900/80 to-transparent z-0"></div>

        <div className="relative z-10 space-y-6 px-4">
          <Zap className="w-12 h-12 text-teal-400 mx-auto animate-pulse" />
          <h3 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            {t.ctaTitle}
          </h3>
          <p className="text-slate-300 text-base max-w-2xl mx-auto">
            {t.ctaDesc}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6">
            <Link
              to="/directory"
              className="flex items-center justify-center gap-2 bg-slate-800 text-white border border-slate-700 px-8 py-3.5 rounded-xl font-bold hover:bg-slate-700 transition active:scale-95 text-sm"
            >
              {t.explore}
            </Link>
            <Link
              to="/recognize"
              className="flex items-center justify-center gap-2 bg-[#009688] text-white px-8 py-3.5 rounded-xl font-bold hover:bg-teal-700 transition active:scale-95 text-sm shadow-lg shadow-teal-900/50"
            >
              <ScanLine className="w-5 h-5" /> {t.scan}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
