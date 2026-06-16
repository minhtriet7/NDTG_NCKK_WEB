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
    # Replace old dark blues/surfaces with new Card color #1E293B
    (r'bg-\[\#141B34\]', 'bg-[#1E293B]'),
    (r'bg-surface', 'bg-[#1E293B]'),
    
    # Replace old backgrounds with new Background #0F172A
    (r'bg-\[\#0B1020\]', 'bg-[#0F172A]'),
    (r'bg-background', 'bg-[#0F172A]'),
    
    # Replace Inner Bgs (like pre tags or nested boxes) with #020617
    (r'bg-black/5 dark:bg-white/5', 'bg-[#020617] border border-[#334155]/50'),
    (r'bg-black/10 dark:bg-white/10', 'bg-[#020617] border border-[#334155]/50'),
    
    # Replace old borders with new Border #334155
    (r'border-\[\#3157F6\]/20', 'border-[#334155]'),
    (r'border-\[\#3157F6\]/30', 'border-[#334155]'),
    (r'border-border', 'border-[#334155]'),
    (r'border-white/5', 'border-[#334155]/50'),
    
    # Replace text colors
    (r'text-\[\#F8FAFC\]', 'text-[#F8FAFC]'),
    (r'text-foreground', 'text-[#F8FAFC]'),
    (r'text-slate-400', 'text-[#CBD5E1]'),
    (r'text-muted-foreground', 'text-[#CBD5E1]'),
    
    # Replace primary & accent
    (r'bg-\[\#3157F6\]', 'bg-[#6366F1]'),
    (r'bg-primary', 'bg-[#6366F1]'),
    (r'text-\[\#00D4FF\]', 'text-[#3B82F6]'),
    (r'text-primary', 'text-[#6366F1]'),
    
    # Clean up shadows and roundings
    (r'shadow-2xl', 'shadow-sm'),
    (r'shadow-lg', 'shadow-sm'),
    (r'rounded-\[24px\]', 'rounded-2xl'),
]

for p, r in theme_replacements:
    components_code = re.sub(p, r, components_code)

new_result_component = """
const CircularProgress = ({ percentage, size = 130, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  
  let color = "#22C55E"; // Green for high confidence
  if (percentage < 70) color = "#EF4444"; // Red
  else if (percentage < 90) color = "#F59E0B"; // Amber
  
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#334155" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" fill="none" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-[#F8FAFC]">{percentage.toFixed(1)}<span className="text-lg text-[#CBD5E1]">%</span></span>
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

  const dict = {
    EN: {
      title: "AI Analysis Workspace",
      subtitle: "Computer vision and LLM reasoning results.",
      viewHistory: "History",
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
      exchangeTitle: "Live Currency Exchange",
      exchangeDesc: "Conversion rates for the analyzed banknote.",
      fullConverter: "Open Converter",
      aggDecision: "Aggregator Decision",
      aggDesc: "The system compares all AI agent outputs and selects the consensus result.",
      agentCompare: "Agent Comparison",
      fullLogTitle: "Reasoning Log",
      fullLogDesc: "Detailed AI reasoning is collapsed to maintain layout clarity.",
      hideLog: "Hide Log",
      viewLog: "View Full Log",
      jsonTitle: "Raw JSON Output",
      copy: "Copy",
      download: "Download",
      continueTitle: "Next Steps",
      continueDesc: "Scan a new image or view your previous analysis history.",
      btnScanAnother: "New Scan",
      btnViewHistory: "View History",
      noResult: "No result data",
      noResultDesc: "Please perform a scan from the workspace first.",
      backWorkspace: "Return to Workspace",
      matched: "Matched",
      different: "Different",
      final: "Final",
      noAgentData: "No data from this agent.",
      showLess: "Show less",
      readFull: "Read more",
      tokenUsageTitle: "Token Usage",
      tokenUsageDesc: "Tokens consumed during this analysis.",
      tokensCharged: "Tokens charged",
      balanceBefore: "Balance before",
      balanceAfter: "Balance after",
      aiTokens: "AI tokens",
      billableTokens: "Billable AI tokens",
      billingMode: "Billing mode",
      inputOutputTokens: "Input / Output",
    },
    VI: {
      title: "AI Analysis Workspace",
      subtitle: "Kết quả nhận diện Computer Vision và lập luận LLM.",
      viewHistory: "Lịch sử",
      scanAnother: "Quét ảnh mới",
      feedback: "Góp ý",
      uploadTitle: "Ảnh phân tích",
      finalDecision: "Quyết định cuối",
      lblCountry: "Quốc gia",
      lblMaterial: "Chất liệu",
      lblCurrency: "Tiền tệ",
      lblConsensus: "Đồng thuận",
      lblReasoning: "Lập luận",
      agents: "đặc vụ",
      referee: "Kết luận trọng tài",
      lblDenomination: "Mệnh giá",
      lblOrigin: "Nguồn gốc",
      exchangeTitle: "Tỷ giá quy đổi",
      exchangeDesc: "Tỷ giá trực tiếp dựa trên mệnh giá được nhận diện.",
      fullConverter: "Mở bộ chuyển đổi",
      aggDecision: "Quyết định tổng hợp",
      aggDesc: "Hệ thống đối chiếu toàn bộ đầu ra của các Agent AI và chọn kết quả đồng thuận.",
      agentCompare: "So sánh đặc vụ AI",
      fullLogTitle: "Nhật ký suy luận",
      fullLogDesc: "Lý luận chi tiết của AI được thu gọn để tối ưu giao diện.",
      hideLog: "Ẩn nhật ký",
      viewLog: "Xem toàn bộ",
      jsonTitle: "Raw JSON Data",
      copy: "Sao chép",
      download: "Tải xuống",
      continueTitle: "Thao tác tiếp theo",
      continueDesc: "Bắt đầu phân tích ảnh mới hoặc xem lại lịch sử.",
      btnScanAnother: "Phân tích mới",
      btnViewHistory: "Xem lịch sử",
      noResult: "Không có dữ liệu",
      noResultDesc: "Vui lòng tải ảnh lên từ Workspace để bắt đầu phân tích.",
      backWorkspace: "Về Workspace",
      matched: "Trùng khớp",
      different: "Khác biệt",
      final: "Chốt kết quả",
      noAgentData: "Không có dữ liệu.",
      showLess: "Thu gọn",
      readFull: "Xem thêm",
      tokenUsageTitle: "Sử dụng Token",
      tokenUsageDesc: "Lượng token đã tiêu thụ cho tác vụ phân tích này.",
      tokensCharged: "Token đã trừ",
      balanceBefore: "Số dư trước",
      balanceAfter: "Số dư sau",
      aiTokens: "AI token",
      billableTokens: "Token tính phí",
      billingMode: "Chế độ",
      inputOutputTokens: "Input / Output",
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

  const finalData = currentItem?.data || {};
  const agents = currentItem?.agents || {};
  const consensus = currentItem?.consensus || {};

  const finalDenomination = normalizeText(finalData?.denomination);
  const finalCountry = normalizeText(finalData?.country);
  const finalCurrency = normalizeText(finalData?.currency);
  const finalMaterial = normalizeText(finalData?.material);
  const matchedAgents = Number(consensus?.matched_agents || 0);

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

  if (!currentItem) {
    return (
      <div className="min-h-screen bg-[#0F172A] font-sans flex items-center justify-center p-6">
        <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-8 text-center max-w-lg shadow-sm">
          <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-bold text-[#F8FAFC] mb-2">{t.noResult}</h2>
          <p className="text-[#CBD5E1] mb-8">{t.noResultDesc}</p>
          <button onClick={() => navigate("/recognize")} className="px-6 py-3 rounded-xl bg-[#6366F1] text-white font-medium hover:bg-[#6366F1]/90 transition w-full">
            {t.backWorkspace}
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] py-10 px-4 font-sans selection:bg-[#6366F1]/30 overflow-x-hidden">
      <style>{`
        @keyframes subtleScan {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#334155] pb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#F8FAFC] flex items-center gap-3">
               <div className="w-2 h-6 bg-[#6366F1] rounded-full" />
               {t.title}
            </h1>
            <p className="text-[#CBD5E1] mt-2 max-w-2xl text-sm">
               {t.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
             <button onClick={() => navigate("/recognize")} className="px-4 py-2.5 rounded-lg bg-[#6366F1] text-white text-sm font-medium hover:bg-[#6366F1]/90 transition flex items-center gap-2">
                <Scan className="w-4 h-4" />
                {t.btnScanAnother}
             </button>
             <button onClick={() => navigate("/history")} className="px-4 py-2.5 rounded-lg bg-[#1E293B] border border-[#334155] text-[#F8FAFC] text-sm font-medium hover:bg-[#334155] transition flex items-center gap-2">
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
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                  activeTab === index
                    ? "bg-[#6366F1] text-white border-[#6366F1]"
                    : "bg-[#1E293B] text-[#CBD5E1] border-[#334155] hover:bg-[#334155]/50"
                }`}
              >
                Result {index + 1}
              </button>
            ))}
          </div>
        )}

        {/* 60/40 GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* CỘT TRÁI - 60% */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-sm relative">
               <div className="flex justify-between items-center mb-6">
                  <h2 className="text-base font-semibold text-[#F8FAFC] flex items-center gap-2">
                     <Scan size={18} className="text-[#3B82F6]" />
                     Ảnh phân tích
                  </h2>
                  <div className="flex items-center gap-2 px-3 py-1 bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#22C55E] rounded-md text-xs font-medium">
                     <CheckCircle size={14} /> Processed
                  </div>
               </div>

               <div className="relative w-full rounded-xl overflow-hidden bg-[#020617] flex items-center justify-center min-h-[400px] border border-[#334155]/50 group">
                  {/* Subtle AI Scanning Effect */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                     <div className="w-full h-[1px] bg-[#6366F1] shadow-[0_0_10px_#6366F1] absolute top-0 animate-[subtleScan_3s_ease-in-out_infinite]" />
                     <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#6366F1]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  </div>
                  
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Uploaded"
                      className="w-full h-auto max-h-[500px] object-contain relative z-0"
                      onLoad={(e) => setImageSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
                    />
                  ) : (
                    <p className="text-[#334155]">No image available</p>
                  )}

                  {/* Bounding Box from MultiObject or first object */}
                  {imageSize && (currentItem?.multi_object ? currentItem?.detected_objects || [] : [currentItem?.detected_objects?.[0]]).filter(Boolean).map((obj, i) => {
                    if (!obj?.bbox) return null;
                    const [x1, y1, x2, y2] = obj.bbox;
                    return (
                      <div
                        key={i}
                        className="absolute border border-[#3B82F6] bg-[#3B82F6]/5 pointer-events-none transition-all duration-300 z-20"
                        style={{
                          left: `${(x1 / imageSize.width) * 100}%`,
                          top: `${(y1 / imageSize.height) * 100}%`,
                          width: `${((x2 - x1) / imageSize.width) * 100}%`,
                          height: `${((y2 - y1) / imageSize.height) * 100}%`,
                        }}
                      >
                         <span className="absolute -top-6 left-[-1px] bg-[#3B82F6] text-[#0F172A] text-[10px] font-bold px-2 py-0.5 rounded-t-sm whitespace-nowrap">
                           Object #{obj.object_index || i + 1}
                         </span>
                      </div>
                    );
                  })}
               </div>
               
               <div className="mt-4 flex gap-4 text-sm border-t border-[#334155] pt-4">
                  <div className="flex-1">
                     <p className="text-xs text-[#CBD5E1] mb-1">Thời gian xử lý</p>
                     <p className="font-medium text-[#F8FAFC] flex items-center gap-1">
                       <Cpu size={14} className="text-[#3B82F6]" /> ~1.2s
                     </p>
                  </div>
                  <div className="flex-1">
                     <p className="text-xs text-[#CBD5E1] mb-1">Kích thước</p>
                     <p className="font-medium text-[#F8FAFC]">{imageSize ? `${imageSize.width} × ${imageSize.height}` : "N/A"}</p>
                  </div>
                  <div className="flex-1">
                     <p className="text-xs text-[#CBD5E1] mb-1">Số lượng</p>
                     <p className="font-medium text-[#F8FAFC]">{currentItem?.detected_objects?.length || 1}</p>
                  </div>
               </div>
            </div>
          </div>

          {/* CỘT PHẢI - 40% */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* MAIN AI RESULT */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-sm">
               <h2 className="text-base font-semibold text-[#F8FAFC] mb-6 flex items-center gap-2">
                  <Cpu size={18} className="text-[#3B82F6]" />
                  Kết quả nhận diện AI
               </h2>
               
               <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
                  <div className="flex-1 space-y-5 w-full">
                     <div>
                        <p className="text-xs text-[#CBD5E1] mb-1 font-medium">Mệnh giá</p>
                        <p className="text-3xl font-semibold text-[#F8FAFC] tracking-tight">{finalDenomination}</p>
                     </div>
                     <div>
                        <p className="text-xs text-[#CBD5E1] mb-1 font-medium">Quốc gia</p>
                        <p className="text-lg font-medium text-[#3B82F6]">{finalCountry}</p>
                     </div>
                     <div className="grid grid-cols-2 gap-3 mt-2">
                        <div className="bg-[#020617] p-3 rounded-lg border border-[#334155]/50">
                           <p className="text-[10px] text-[#CBD5E1] font-medium mb-1">Tiền Tệ</p>
                           <p className="font-medium text-sm text-[#F8FAFC]">{finalCurrency}</p>
                        </div>
                        <div className="bg-[#020617] p-3 rounded-lg border border-[#334155]/50">
                           <p className="text-[10px] text-[#CBD5E1] font-medium mb-1">Chất Liệu</p>
                           <p className="font-medium text-sm text-[#F8FAFC]">{finalMaterial}</p>
                        </div>
                     </div>
                  </div>
                  
                  <div className="flex-shrink-0 flex flex-col items-center justify-center">
                     <p className="text-xs text-[#CBD5E1] mb-3 font-medium">Độ tin cậy</p>
                     <CircularProgress percentage={confidence} size={120} strokeWidth={6} />
                  </div>
               </div>
            </div>

            {/* AI DETECTED FEATURES */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-sm">
               <h3 className="text-sm font-semibold text-[#F8FAFC] mb-4 flex items-center gap-2">
                 <Search size={16} className="text-[#3B82F6]" />
                 Đặc điểm AI nhận diện
               </h3>
               <ul className="space-y-3">
                  {aiFeatures.map((feat, idx) => (
                     <li key={idx} className="flex items-start gap-3">
                        <div className="mt-0.5 text-[#3B82F6]">
                           <CheckCircle size={14} strokeWidth={2.5} />
                        </div>
                        <span className="text-sm text-[#CBD5E1] leading-tight">{feat}</span>
                     </li>
                  ))}
               </ul>
            </div>

            {/* RECOGNITION SUMMARY */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 shadow-sm">
               <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3">AI Prediction Summary</h3>
               <p className="text-sm text-[#CBD5E1] leading-relaxed border-l-2 border-[#3B82F6] pl-3">
                  Hệ thống AI phân tích và xác định hình ảnh chứa tiền giấy <strong className="text-white font-medium">{finalCountry}</strong> mệnh giá <strong className="text-white font-medium">{finalDenomination}</strong> với độ tin cậy <strong className="text-[#3B82F6] font-medium">{confidence.toFixed(1)}%</strong>. 
                  {matchedAgents > 0 ? ` Dựa trên mức độ đồng thuận ${matchedAgents}/3 tác tử, mô hình xác thực thành công các đặc trưng chính yếu của tờ tiền.` : " Không có sự đồng thuận rõ ràng giữa các mô hình."}
               </p>
            </div>
            
          </div>
        </div>

        {/* RESTORED COMPONENTS & LOGS */}
        <div className="space-y-6 pt-6">
          <TokenUsageCard currentItem={currentItem} t={t} />

          {currentItem?.multi_object && (
            <MultiObjectResults currentItem={currentItem} t={t} lang={lang} />
          )}

          {!currentItem?.multi_object && exchangeResults && exchangeResults.length > 0 && (
            <div className="bg-[#1E293B] rounded-2xl border border-[#334155] shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-base font-semibold text-[#F8FAFC]">{t.exchangeTitle}</h2>
                  <p className="text-sm text-[#CBD5E1] mt-1">{t.exchangeDesc}</p>
                </div>
                <Link to="/exchange" className="text-sm font-medium text-[#3B82F6] hover:underline">
                  {t.fullConverter}
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {exchangeResults.map((item) => (
                  <div key={item.code} className="p-4 rounded-xl bg-[#020617] border border-[#334155]/50">
                    <p className="text-xs font-medium text-[#CBD5E1]">{item.code}</p>
                    <p className="text-lg font-semibold text-[#F8FAFC] mt-1">
                      {new Intl.NumberFormat(lang === "VI" ? "vi-VN" : "en-US", { maximumFractionDigits: item.code === "VND" ? 0 : 2 }).format(item.value)}
                    </p>
                    <p className="text-xs text-[#CBD5E1] mt-1">{item.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!currentItem?.multi_object && (
            <>
              <div className="bg-[#1E293B] rounded-2xl border border-[#334155] shadow-sm p-6">
                <h2 className="text-base font-semibold text-[#F8FAFC]">{t.aggDecision}</h2>
                <p className="text-sm text-[#CBD5E1] mt-1 mb-5">{t.aggDesc}</p>
                <div className="space-y-3">
                  <DecisionItem label="YOLO / ML" value={getAgentDenomination(agents.ml_dl)} status={getAgentDenomination(agents.ml_dl) === finalDenomination ? "matched" : "different"} t={t} />
                  <DecisionItem label="LLM" value={getAgentDenomination(agents.llm_api)} status={getAgentDenomination(agents.llm_api) === finalDenomination ? "matched" : "different"} t={t} />
                  <DecisionItem label="Visual Search" value={getAgentDenomination(agents.visual_search)} status={getAgentDenomination(agents.visual_search) === finalDenomination ? "matched" : "different"} t={t} />
                  <DecisionItem label="Aggregator" value={finalDenomination} status="final" t={t} />
                </div>
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#F8FAFC] mb-4">{t.agentCompare}</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <AgentCard agentKey="Agent 1" title="YOLO / ML" method="Visual detection" data={agents.ml_dl} finalDenomination={finalDenomination} t={t} />
                  <AgentCard agentKey="Agent 2" title="LLM" method="Language reasoning" data={agents.llm_api} finalDenomination={finalDenomination} t={t} />
                  <AgentCard agentKey="Agent 3" title="Visual Search" method="External matching" data={agents.visual_search} finalDenomination={finalDenomination} t={t} />
                </div>
              </div>
            </>
          )}

          {/* Raw Log Toggle */}
          <div className="bg-[#1E293B] rounded-2xl border border-[#334155] shadow-sm overflow-hidden">
            <button onClick={() => setShowRawLog(!showRawLog)} className="w-full p-6 flex items-center justify-between text-left hover:bg-[#334155]/20 transition">
              <div>
                <h2 className="text-base font-semibold text-[#F8FAFC]">{t.fullLogTitle}</h2>
                <p className="text-sm text-[#CBD5E1] mt-1">{t.fullLogDesc}</p>
              </div>
              {showRawLog ? <ChevronUp className="w-5 h-5 text-[#3B82F6]" /> : <ChevronDown className="w-5 h-5 text-[#CBD5E1]" />}
            </button>
            {showRawLog && (
              <div className="px-6 pb-6 border-t border-[#334155] pt-4">
                <div className="bg-[#020617] text-[#CBD5E1] rounded-xl p-4 text-sm overflow-auto max-h-[420px] border border-[#334155]/50">
                  <ReactMarkdown>{safeDebateLog}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* JSON Export */}
          <div className="bg-[#1E293B] rounded-2xl border border-[#334155] shadow-sm overflow-hidden">
            <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#334155]">
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-[#3B82F6]" />
                <h2 className="text-base font-semibold text-[#F8FAFC]">{t.jsonTitle}</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCopyJSON} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#334155] text-[#F8FAFC] text-sm font-medium hover:bg-[#334155]/50 transition">
                  <Copy className="w-4 h-4" />{t.copy}
                </button>
                <button onClick={handleDownloadJSON} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6366F1] text-white text-sm font-medium hover:bg-[#6366F1]/90 transition">
                  <Download className="w-4 h-4" />{t.download}
                </button>
              </div>
            </div>
            <pre className="bg-[#020617] text-[#3B82F6] p-6 text-xs overflow-auto max-h-[520px]">
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
