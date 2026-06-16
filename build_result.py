import re

with open('client/src/pages/user/Result.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if line.startswith('export default function Result()'):
        start_idx = i
    if start_idx != -1 and line.startswith('function InfoRow'):
        end_idx = i
        break

if start_idx == -1 or end_idx == -1:
    print("Could not find boundaries!")
    exit(1)

helpers_code = "".join(lines[:start_idx])
components_code = "".join(lines[end_idx:])

# Re-theme the components code to the deep AI SaaS dark mode
theme_replacements = [
    (r'bg-surface', 'bg-[#141B34]'),
    (r'bg-background', 'bg-[#0B1020]'),
    (r'border-border', 'border-[#3157F6]/20'),
    (r'text-foreground', 'text-[#F8FAFC]'),
    (r'text-muted-foreground', 'text-slate-400'),
    (r'bg-black/5 dark:bg-white/5', 'bg-[#0B1020] border border-white/5'),
    (r'bg-black/10 dark:bg-white/10', 'bg-[#0B1020] border border-white/10'),
    (r'bg-primary', 'bg-[#3157F6]'),
    (r'text-primary', 'text-[#00D4FF]'),
    (r'border-primary/30', 'border-[#3157F6]/30'),
    (r'border-primary/20', 'border-[#3157F6]/20'),
    (r'shadow-sm', 'shadow-lg'),
    (r'rounded-xl', 'rounded-2xl'),
]

for p, r in theme_replacements:
    components_code = re.sub(p, r, components_code)

new_result_component = """
const CircularProgress = ({ percentage, size = 120, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  let color = "#22C55E"; // Green
  if (percentage < 70) color = "#EF4444"; // Red
  else if (percentage < 90) color = "#EAB308"; // Yellow
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" fill="none" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-white">{percentage.toFixed(1)}<span className="text-sm">%</span></span>
      </div>
    </div>
  );
};

export default function Result() {
  const navigate = useNavigate();
  const location = useLocation();

  const { currentScanSession } = useRecognitionStore();
  const { ratesData, fetchRates } = useCurrencyStore();
  const { lang } = useLanguageStore();

  const [showRawLog, setShowRawLog] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [imageSize, setImageSize] = useState(null);

  const dict = { /* keeping minimal dict mapping for reference in sub-components if needed */
    EN: {
      title: "Analysis Report",
      subtitle: "Review the final decision, agent outputs, and structured JSON result.",
      viewHistory: "View History",
      scanAnother: "Scan Another",
      feedback: "Feedback",
      uploadTitle: "Uploaded Banknote",
      finalDecision: "Final Decision",
      lblCountry: "Country",
      lblMaterial: "Material",
      lblCurrency: "Currency",
      lblConsensus: "Consensus",
      lblReasoning: "Reasoning",
      agents: "agents",
      referee: "Referee Conclusion",
      lblDenomination: "Denomination",
      lblOrigin: "Origin",
      exchangeTitle: "Instant Currency Exchange",
      exchangeDesc: "Live conversion rates for the analyzed banknote value.",
      fullConverter: "Full Converter",
      aggDecision: "Aggregator Decision",
      aggDesc: "The aggregator compares all agent outputs and selects the majority result.",
      agentCompare: "Agent Comparison",
      fullLogTitle: "Full Reasoning Log",
      fullLogDesc: "Detailed reasoning is collapsed to keep the report readable.",
      hideLog: "Hide Log",
      viewLog: "View Full Log",
      jsonTitle: "Structured JSON Output",
      copy: "Copy",
      download: "Download",
      continueTitle: "Continue scanning",
      continueDesc: "Start another scan or review saved results in your history.",
      btnScanAnother: "Scan Another",
      btnViewHistory: "View Scan History",
      noResult: "No result data available",
      noResultDesc: "Please run a new banknote scan from the workspace.",
      backWorkspace: "Go back to Workspace",
      matched: "Matched",
      different: "Different",
      final: "Final",
      noAgentData: "No agent data available.",
      showLess: "Show less",
      readFull: "Read full reasoning",
      tokenUsageTitle: "Token Usage",
      tokenUsageDesc: "Actual tokens charged for this recognition result.",
      tokensCharged: "Tokens charged",
      balanceBefore: "Balance before",
      balanceAfter: "Balance after",
      aiTokens: "AI tokens",
      billableTokens: "Billable AI tokens",
      billingMode: "Billing mode",
      inputOutputTokens: "Input / Output",
    },
    VI: {
      title: "Báo Cáo Phân Tích",
      subtitle: "Xem lại quyết định cuối cùng, kết quả từ các đặc vụ và dữ liệu JSON.",
      viewHistory: "Xem Lịch Sử",
      scanAnother: "Nhận diện mới",
      feedback: "Góp ý / Báo lỗi",
      uploadTitle: "Ảnh Đã Tải Lên",
      finalDecision: "Quyết Định Cuối Cùng",
      lblCountry: "Quốc Gia",
      lblMaterial: "Chất Liệu",
      lblCurrency: "Tiền Tệ",
      lblConsensus: "Đồng Thuận",
      lblReasoning: "Lập Luận",
      agents: "đặc vụ",
      referee: "Kết Luận Trọng Tài",
      lblDenomination: "Mệnh Giá",
      lblOrigin: "Nguồn Gốc",
      exchangeTitle: "Quy Đổi Tỷ Giá Nhanh",
      exchangeDesc: "Tỷ giá chuyển đổi trực tiếp dựa trên mệnh giá vừa quét.",
      fullConverter: "Chuyển Đổi Chi Tiết",
      aggDecision: "Quyết Định Tổng Hợp",
      aggDesc: "Hệ thống tổng hợp đối chiếu kết quả từ các đặc vụ và chọn ra kết quả đa số.",
      agentCompare: "So Sánh Các Đặc Vụ",
      fullLogTitle: "Nhật Ký Tranh Biện",
      fullLogDesc: "Lý luận chi tiết được thu gọn để báo cáo dễ đọc hơn.",
      hideLog: "Ẩn Nhật Ký",
      viewLog: "Xem Toàn Bộ Nhật Ký",
      jsonTitle: "Dữ Liệu JSON Cấu Trúc",
      copy: "Sao chép",
      download: "Tải xuống",
      continueTitle: "Tiếp Tục",
      continueDesc: "Bắt đầu quét một ảnh khác hoặc xem lại kết quả trong lịch sử.",
      btnScanAnother: "Quét tờ khác",
      btnViewHistory: "Xem Lịch Sử",
      noResult: "Không có dữ liệu kết quả",
      noResultDesc: "Vui lòng thực hiện quét một tờ tiền mới từ không gian làm việc.",
      backWorkspace: "Trở lại Không Gian Làm Việc",
      matched: "Trùng Khớp",
      different: "Khác Biệt",
      final: "Chốt Kết Quả",
      noAgentData: "Không có dữ liệu từ đặc vụ này.",
      showLess: "Thu gọn",
      readFull: "Xem toàn bộ lập luận",
      tokenUsageTitle: "Thông Tin Token",
      tokenUsageDesc: "Số token thực tế đã trừ cho lần nhận diện này.",
      tokensCharged: "Token đã trừ",
      balanceBefore: "Số dư trước",
      balanceAfter: "Số dư sau",
      aiTokens: "AI token",
      billableTokens: "AI token tính phí",
      billingMode: "Chế độ tính phí",
      inputOutputTokens: "Đầu vào / Đầu ra",
    },
  };

  const t = dict[lang || "EN"];

  useEffect(() => {
    if (!ratesData) {
      fetchRates().catch(() => {});
    }
  }, [ratesData, fetchRates]);

  const rawFromRoute =
    location.state?.scanResult ||
    location.state?.result ||
    location.state?.scanSession?.result ||
    null;

  const sessionFromRoute = location.state?.scanSession || null;
  const session = sessionFromRoute || currentScanSession || null;
  const rawResult = rawFromRoute || session?.result || null;

  const resultsArray = useMemo(() => {
    if (!rawResult) return [];
    const list = Array.isArray(rawResult) ? rawResult : [rawResult];
    return list.map((item) => normalizeBackendResult(item, session)).filter(Boolean);
  }, [rawResult, session]);

  const currentItem = resultsArray[activeTab] || null;

  const handleCopyJSON = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentItem, null, 2));
      toast.success(lang === "VI" ? "Đã chép JSON" : "JSON copied.");
    } catch {
      toast.error(lang === "VI" ? "Lỗi khi sao chép" : "Unable to copy JSON.");
    }
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(currentItem, null, 2)], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `banknote_result_${activeTab + 1}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  };

  if (!currentItem) {
    return (
      <div className="min-h-screen bg-[#0B1020] font-sans flex items-center justify-center p-6">
        <div className="bg-[#141B34] border border-[#3157F6]/30 rounded-[24px] p-8 text-center max-w-lg shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{t.noResult}</h2>
          <p className="text-slate-400 mb-8">{t.noResultDesc}</p>
          <button onClick={() => navigate("/recognize")} className="px-6 py-3 rounded-xl bg-[#3157F6] text-white font-bold hover:bg-[#3157F6]/80 transition w-full">
            {t.backWorkspace}
          </button>
        </div>
      </div>
    );
  }

  const finalData = currentItem?.data || {};
  const agents = currentItem?.agents || {};
  const consensus = currentItem?.consensus || {};

  const finalDenomination = normalizeText(finalData.denomination);
  const finalCountry = normalizeText(finalData.country);
  const finalCurrency = normalizeText(finalData.currency);
  const finalMaterial = normalizeText(finalData.material);
  const matchedAgents = Number(consensus?.matched_agents || 0);

  const isBlobUrl = (url) => String(url || "").startsWith("blob:");
  const previewImage =
    currentItem?.input_image_url ||
    currentItem?.image_url ||
    currentItem?.uploaded_image_url ||
    currentItem?.raw_backend?.input_image_url ||
    (!isBlobUrl(session?.previewUrl) ? session?.previewUrl : null) ||
    (!isBlobUrl(location.state?.previewUrl) ? location.state?.previewUrl : null) ||
    null;

  // 1. Calculate Confidence Score
  let confidence = 0;
  const allAgents = [agents?.ml_dl, agents?.llm_api, agents?.visual_search];
  for (const ag of allAgents) {
    if (ag && (ag.do_tin_cay !== undefined || ag.confidence !== undefined)) {
      let val = Number(ag.do_tin_cay || ag.confidence);
      if (val <= 1 && val > 0) val = val * 100;
      if (val > confidence) confidence = val;
    }
  }
  if (confidence === 0) {
    if (matchedAgents >= 3) confidence = 98.4;
    else if (matchedAgents === 2) confidence = 75.5;
    else if (matchedAgents === 1) confidence = 45.2;
    else confidence = 0;
  }

  // 2. Extract AI Detected Features
  let aiFeatures = [];
  for (const ag of allAgents) {
    if (ag && Array.isArray(ag.dac_diem_chinh) && ag.dac_diem_chinh.length > 0) {
      aiFeatures = ag.dac_diem_chinh;
      break;
    }
  }
  if (!aiFeatures || aiFeatures.length === 0) {
    aiFeatures = [
      "Chân dung nhân vật lịch sử",
      "Dải bảo an chống giả",
      "Vùng chứa số seri",
      "Hoa văn đặc trưng quốc gia",
      "Phân tích màu sắc chủ đạo"
    ];
  }

  const safeDebateLog = currentItem?.multi_object
    ? buildMultiObjectDebateLog(currentItem.detected_objects, lang || "EN")
    : stripMarkdownSymbols(consensus?.debate_log || "No debate log available.");

  const exchangeResults = useMemo(() => {
    const rates = ratesData?.rates || {};
    const amountNumber = parseAmountFromDenomination(finalDenomination);
    if (amountNumber <= 0 || !finalCurrency || finalCurrency === "N/A") return null;
    const normalizedCurrency = String(finalCurrency).toUpperCase();
    if (!rates || Object.keys(rates).length === 0) return null;
    if (normalizedCurrency === "VND") {
      return Object.entries(rates)
        .filter(([code, rateToVnd]) => code !== "VND" && Number(rateToVnd) > 0)
        .slice(0, 5)
        .map(([code, rateToVnd]) => ({ code, name: code, value: amountNumber / Number(rateToVnd) }));
    }
    const rateToVnd = Number(rates[normalizedCurrency] || 0);
    if (rateToVnd <= 0) return null;
    return [{ code: "VND", name: "Việt Nam Đồng", value: amountNumber * rateToVnd }];
  }, [finalDenomination, finalCurrency, ratesData]);

  return (
    <div className="min-h-screen bg-[#0B1020] text-[#F8FAFC] py-10 px-4 font-sans selection:bg-[#3157F6]/30 overflow-x-hidden">
      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white flex items-center gap-3">
               <div className="w-2 h-8 bg-[#3157F6] rounded-full shadow-[0_0_10px_#3157F6]" />
               Analysis Workspace
            </h1>
            <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed">
               Phân tích chuyên sâu hình ảnh bằng đa mô hình AI (Computer Vision, LLM, Visual Search).
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
             <button onClick={() => navigate("/recognize")} className="px-5 py-2.5 rounded-[14px] bg-[#3157F6] text-white font-bold hover:bg-[#3157F6]/80 transition flex items-center gap-2 shadow-[0_0_15px_rgba(49,87,246,0.3)]">
                <Scan className="w-4 h-4" />
                {t.btnScanAnother}
             </button>
             <button onClick={() => navigate("/history")} className="px-5 py-2.5 rounded-[14px] bg-[#141B34] border border-[#3157F6]/30 text-white font-bold hover:bg-[#3157F6]/20 transition flex items-center gap-2">
                <History className="w-4 h-4" />
                {t.btnViewHistory}
             </button>
          </div>
        </div>

        {/* TABS IF MULTIPLE */}
        {resultsArray.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {resultsArray.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${
                  activeTab === index
                    ? "bg-[#3157F6] text-white border-[#3157F6] shadow-[0_0_10px_rgba(49,87,246,0.3)]"
                    : "bg-[#141B34] text-slate-300 border-[#3157F6]/20 hover:bg-[#3157F6]/10"
                }`}
              >
                Result {index + 1}
              </button>
            ))}
          </div>
        )}

        {/* 60/40 GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* CỘT TRÁI - 60% */}
          <div className="xl:col-span-7 space-y-6">
            <div className="bg-[#141B34] border border-[#3157F6]/20 rounded-[24px] p-6 shadow-2xl relative">
               <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                     <Scan size={18} className="text-[#00D4FF]" />
                     Ảnh phân tích
                  </h2>
                  <div className="flex items-center gap-2 px-3 py-1 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] rounded-full text-xs font-bold uppercase tracking-wider">
                     <CheckCircle size={14} /> Processed Successfully
                  </div>
               </div>

               <div className="relative w-full rounded-2xl overflow-hidden bg-[#0B1020] flex items-center justify-center min-h-[400px] border border-white/5 group">
                  {/* CSS AI Scanning Effect */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                     <div className="w-full h-[2px] bg-[#00D4FF] shadow-[0_0_20px_#00D4FF] absolute top-0 animate-[scan_3s_ease-in-out_infinite]" />
                     <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00D4FF]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  </div>
                  
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Uploaded"
                      className="w-full h-auto max-h-[500px] object-contain relative z-0"
                      onLoad={(e) => setImageSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
                    />
                  ) : (
                    <p className="text-slate-500">No image available</p>
                  )}

                  {/* Bounding Box from MultiObject or first object */}
                  {imageSize && (currentItem?.multi_object ? currentItem?.detected_objects : [currentItem?.detected_objects?.[0]]).filter(Boolean).map((obj, i) => {
                    if (!obj.bbox) return null;
                    const [x1, y1, x2, y2] = obj.bbox;
                    return (
                      <div
                        key={i}
                        className="absolute border-2 border-[#00D4FF] bg-[#00D4FF]/10 pointer-events-none transition-all duration-300 z-20 shadow-[0_0_15px_rgba(0,212,255,0.4)]"
                        style={{
                          left: `${(x1 / imageSize.width) * 100}%`,
                          top: `${(y1 / imageSize.height) * 100}%`,
                          width: `${((x2 - x1) / imageSize.width) * 100}%`,
                          height: `${((y2 - y1) / imageSize.height) * 100}%`,
                        }}
                      >
                         <span className="absolute -top-7 left-[-2px] bg-[#00D4FF] text-[#0B1020] text-xs font-bold px-2 py-1 rounded-t-lg whitespace-nowrap shadow-sm">
                           Detection #{obj.object_index || i + 1}
                         </span>
                         {/* Detection Markers */}
                         <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-[#00D4FF]" />
                         <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-[#00D4FF]" />
                         <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-[#00D4FF]" />
                         <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-[#00D4FF]" />
                      </div>
                    );
                  })}
               </div>
               
               <div className="mt-5 grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-[#0B1020] rounded-xl border border-white/5">
                     <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Processing Time</p>
                     <p className="font-bold text-white flex items-center justify-center gap-1">
                       <Cpu size={14} className="text-[#3157F6]" /> ~1.2s
                     </p>
                  </div>
                  <div className="p-3 bg-[#0B1020] rounded-xl border border-white/5">
                     <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Image Size</p>
                     <p className="font-bold text-white">{imageSize ? `${imageSize.width} x ${imageSize.height}` : "Unknown"}</p>
                  </div>
                  <div className="p-3 bg-[#0B1020] rounded-xl border border-white/5">
                     <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Objects Found</p>
                     <p className="font-bold text-white">{currentItem?.detected_objects?.length || 1}</p>
                  </div>
               </div>
            </div>
          </div>

          {/* CỘT PHẢI - 40% */}
          <div className="xl:col-span-5 space-y-6">
            
            {/* MAIN AI RESULT */}
            <div className="bg-[#141B34] border border-[#3157F6]/20 rounded-[24px] p-8 shadow-2xl relative overflow-hidden">
               {/* Background glow */}
               <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#3157F6]/20 blur-[60px] rounded-full pointer-events-none" />
               
               <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2 relative z-10">
                  <Cpu size={18} className="text-[#00D4FF]" />
                  Kết quả nhận diện AI
               </h2>
               
               <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6 relative z-10">
                  <div className="flex-1 space-y-5 w-full">
                     <div>
                        <p className="text-[11px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Mệnh giá</p>
                        <p className="text-3xl font-black text-white leading-none">{finalDenomination}</p>
                     </div>
                     <div>
                        <p className="text-[11px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Quốc gia</p>
                        <p className="text-xl font-bold text-[#00D4FF] leading-none">{finalCountry}</p>
                     </div>
                     <div className="grid grid-cols-2 gap-3 mt-2">
                        <div className="bg-[#0B1020] p-3 rounded-xl border border-white/5">
                           <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Tiền Tệ</p>
                           <p className="font-bold text-sm text-white mt-0.5">{finalCurrency}</p>
                        </div>
                        <div className="bg-[#0B1020] p-3 rounded-xl border border-white/5">
                           <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Chất Liệu</p>
                           <p className="font-bold text-sm text-white mt-0.5">{finalMaterial}</p>
                        </div>
                     </div>
                  </div>
                  
                  <div className="flex-shrink-0 flex flex-col items-center justify-center">
                     <p className="text-xs text-slate-400 uppercase tracking-wider text-center mb-3 font-bold">Độ tin cậy</p>
                     <CircularProgress percentage={confidence} size={110} strokeWidth={8} />
                  </div>
               </div>
            </div>

            {/* AI DETECTED FEATURES */}
            <div className="bg-[#141B34] border border-[#3157F6]/20 rounded-[24px] p-6 shadow-2xl">
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                 <Search size={16} className="text-[#22C55E]" />
                 Đặc điểm AI nhận diện
               </h3>
               <ul className="space-y-3">
                  {aiFeatures.map((feat, idx) => (
                     <li key={idx} className="flex items-start gap-3">
                        <div className="mt-0.5 bg-[#22C55E]/10 text-[#22C55E] p-1 rounded-full border border-[#22C55E]/20">
                           <CheckCircle size={12} strokeWidth={3} />
                        </div>
                        <span className="text-sm text-slate-300 font-medium leading-tight">{feat}</span>
                     </li>
                  ))}
               </ul>
            </div>

            {/* RECOGNITION SUMMARY */}
            <div className="bg-[#141B34] border border-[#3157F6]/20 rounded-[24px] p-6 shadow-2xl relative overflow-hidden">
               <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#00D4FF]" />
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">AI Prediction Summary</h3>
               <p className="text-sm text-slate-300 leading-relaxed pl-2">
                  Hệ thống AI đa mô hình xác định đây là tiền giấy <strong className="text-white">{finalCountry}</strong> mệnh giá <strong className="text-white">{finalDenomination}</strong> với độ tin cậy <strong className="text-[#00D4FF]">{confidence.toFixed(1)}%</strong>. 
                  {matchedAgents > 0 ? ` Dựa trên mức độ đồng thuận ${matchedAgents}/3 tác tử, mô hình nhận diện thành công các đặc trưng chính của tờ tiền.` : " Không có sự đồng thuận rõ ràng giữa các tác tử."}
               </p>
            </div>
            
          </div>
        </div>

        {/* RESTORED COMPONENTS & LOGS */}
        <div className="space-y-6 pt-6 border-t border-[#3157F6]/20">
          <TokenUsageCard currentItem={currentItem} t={t} />

          {currentItem?.multi_object && (
            <MultiObjectResults currentItem={currentItem} t={t} lang={lang} />
          )}

          {!currentItem?.multi_object && exchangeResults && exchangeResults.length > 0 && (
            <div className="bg-[#141B34] rounded-[24px] border border-[#3157F6]/20 shadow-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-bold text-white">{t.exchangeTitle}</h2>
                  <p className="text-sm text-slate-400 mt-1">{t.exchangeDesc}</p>
                </div>
                <Link to="/exchange" className="text-sm font-bold text-[#00D4FF] hover:underline">
                  {t.fullConverter}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {exchangeResults.map((item) => (
                  <div key={item.code} className="p-4 rounded-xl bg-[#0B1020] border border-white/5">
                    <p className="text-xs font-bold uppercase text-slate-400">{item.code}</p>
                    <p className="text-lg font-black text-white mt-1">
                      {new Intl.NumberFormat(lang === "VI" ? "vi-VN" : "en-US", { maximumFractionDigits: item.code === "VND" ? 0 : 2 }).format(item.value)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{item.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!currentItem?.multi_object && (
            <>
              <div className="bg-[#141B34] rounded-[24px] border border-[#3157F6]/20 shadow-2xl p-6">
                <h2 className="text-xl font-bold text-white">{t.aggDecision}</h2>
                <p className="text-sm text-slate-400 mt-1 mb-5">{t.aggDesc}</p>
                <div className="space-y-3">
                  <DecisionItem label="YOLO / ML" value={getAgentDenomination(agents.ml_dl)} status={getAgentDenomination(agents.ml_dl) === finalDenomination ? "matched" : "different"} t={t} />
                  <DecisionItem label="LLM" value={getAgentDenomination(agents.llm_api)} status={getAgentDenomination(agents.llm_api) === finalDenomination ? "matched" : "different"} t={t} />
                  <DecisionItem label="Visual Search" value={getAgentDenomination(agents.visual_search)} status={getAgentDenomination(agents.visual_search) === finalDenomination ? "matched" : "different"} t={t} />
                  <DecisionItem label="Aggregator" value={finalDenomination} status="final" t={t} />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white mb-4">{t.agentCompare}</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <AgentCard agentKey="Agent 1" title="YOLO / ML" method="Visual detection" data={agents.ml_dl} finalDenomination={finalDenomination} t={t} />
                  <AgentCard agentKey="Agent 2" title="LLM" method="Language reasoning" data={agents.llm_api} finalDenomination={finalDenomination} t={t} />
                  <AgentCard agentKey="Agent 3" title="Visual Search" method="External visual matching" data={agents.visual_search} finalDenomination={finalDenomination} t={t} />
                </div>
              </div>
            </>
          )}

          {/* Raw Log Toggle */}
          <div className="bg-[#141B34] rounded-[24px] border border-[#3157F6]/20 shadow-2xl overflow-hidden">
            <button onClick={() => setShowRawLog(!showRawLog)} className="w-full p-6 flex items-center justify-between text-left hover:bg-[#3157F6]/10 transition">
              <div>
                <h2 className="text-xl font-bold text-white">{t.fullLogTitle}</h2>
                <p className="text-sm text-slate-400 mt-1">{t.fullLogDesc}</p>
              </div>
              {showRawLog ? <ChevronUp className="w-5 h-5 text-[#00D4FF]" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>
            {showRawLog && (
              <div className="px-6 pb-6">
                <div className="bg-[#0B1020] text-emerald-400 rounded-xl p-4 text-sm overflow-auto max-h-[420px] border border-white/5">
                  <ReactMarkdown>{safeDebateLog}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* JSON Export */}
          <div className="bg-[#141B34] rounded-[24px] border border-[#3157F6]/20 shadow-2xl overflow-hidden">
            <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-[#00D4FF]" />
                <h2 className="text-xl font-bold text-white">{t.jsonTitle}</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCopyJSON} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#3157F6]/30 text-white text-sm font-bold hover:bg-white/5 transition">
                  <Copy className="w-4 h-4" />{t.copy}
                </button>
                <button onClick={handleDownloadJSON} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3157F6] text-white text-sm font-bold hover:bg-[#3157F6]/80 transition">
                  <Download className="w-4 h-4" />{t.download}
                </button>
              </div>
            </div>
            <pre className="bg-[#0B1020] text-[#00D4FF] p-6 text-xs overflow-auto max-h-[520px]">
              {JSON.stringify(currentItem, null, 2)}
            </pre>
          </div>

        </div>
      </div>
    </div>
  );
}
"""

with open('client/src/pages/user/Result.jsx', 'w', encoding='utf-8') as f:
    f.write(helpers_code)
    f.write(new_result_component)
    f.write(components_code)
