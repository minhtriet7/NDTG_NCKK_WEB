import React from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Terminal, MessageSquare } from "lucide-react";
import { useLanguageStore } from "../../store/languageStore";

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "");

const formatConfidence = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "N/A";
  return `${Math.round((number <= 1 ? number * 100 : number) * 10) / 10}%`;
};

const formatDate = (value, lang) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(lang === "VI" ? "vi-VN" : "en-US");
};

export default function AgentResultDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useLanguageStore();
  const result =
    location.state?.scanResult ||
    location.state?.result ||
    location.state?.agentResult ||
    null;
  const finalResult =
    result?.final_result ||
    result?.result?.final_result ||
    result?.data ||
    {};
  const agentResults =
    result?.agent_results ||
    result?.result?.agent_results ||
    [
      result?.agents?.ml_dl && { agent: "OpenAI", data: result.agents.ml_dl },
      result?.agents?.llm_api && { agent: "LLM", data: result.agents.llm_api },
      result?.agents?.visual_search && { agent: "Lens", data: result.agents.visual_search },
    ].filter(Boolean);
  const denomination = firstDefined(
    finalResult.final_denomination,
    finalResult.menh_gia,
    finalResult.denomination,
    result?.data?.denomination,
    "N/A",
  );
  const country = firstDefined(
    finalResult.quoc_gia,
    finalResult.country,
    finalResult.final_country,
    result?.data?.country,
    "N/A",
  );
  const currency = firstDefined(
    finalResult.currency,
    finalResult.currency_code,
    finalResult.ma_tien_te,
    result?.data?.currency,
    "N/A",
  );
  const material = firstDefined(
    finalResult.chat_lieu,
    finalResult.material,
    result?.data?.material,
    "N/A",
  );
  const confidenceValue = firstDefined(
    finalResult.confidence,
    finalResult.do_tin_cay,
    result?.confidence,
    result?.data?.confidence,
  );
  const labels =
    lang === "VI"
      ? {
          back: "Về lịch sử",
          report: "Báo kết quả nhận diện sai",
          title: "Chi tiết kết quả nhận diện",
          subtitle: "Dữ liệu thực tế được trả về từ hệ thống nhận diện.",
          status: "Trạng thái",
          denomination: "Mệnh giá",
          country: "Quốc gia",
          currency: "Tiền tệ",
          material: "Chất liệu",
          confidence: "Độ tin cậy",
          createdAt: "Thời gian",
          agents: "Kết quả từng AI",
          raw: "Dữ liệu JSON",
          noResult: "Không có dữ liệu kết quả để hiển thị.",
        }
      : {
          back: "Back to history",
          report: "Report wrong recognition",
          title: "Recognition result detail",
          subtitle: "Actual data returned by the recognition system.",
          status: "Status",
          denomination: "Denomination",
          country: "Country",
          currency: "Currency",
          material: "Material",
          confidence: "Confidence",
          createdAt: "Created at",
          agents: "AI agent results",
          raw: "Raw JSON",
          noResult: "No result data is available.",
        };

  const handleReportWrongRecognition = () => {
    const relatedResultId = result?.id || result?._id || result?.result_id || "";
    const imageUrl =
      result?.image_url ||
      result?.uploaded_image_url ||
      result?.thumbnail_url ||
      result?.data?.image_url ||
      "";
    const actualResult = [denomination, country]
      .filter(Boolean)
      .join(" - ");

    navigate("/feedback", {
      state: {
        scanResult: result,
        feedbackDraft: {
          scanResult: result,
          feedback_type: "wrong_result",
          priority: "high",
          subject: "Wrong recognition result",
          message: "",
          related_result_id: relatedResultId,
          actual_result: actualResult,
          expected_result: "",
          country,
          confidence: confidenceValue,
          image_url: imageUrl,
        },
      },
    });
  };

  if (!result) {
    return (
      <div className="max-w-4xl mx-auto font-sans">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {labels.noResult}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto font-sans space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/history" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition">
          <ArrowLeft className="w-4 h-4"/> {labels.back}
        </Link>

        <button
          type="button"
          onClick={handleReportWrongRecognition}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <MessageSquare className="h-4 w-4" />
          {labels.report}
        </button>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{labels.title}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{labels.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [labels.status, firstDefined(result.status, finalResult.status, "N/A")],
          [labels.denomination, denomination],
          [labels.country, country],
          [labels.currency, currency],
          [labels.material, material],
          [labels.confidence, formatConfidence(confidenceValue)],
          [labels.createdAt, formatDate(result.created_at, lang)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
            <p className="mt-1 break-words font-black text-slate-900 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {agentResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-black text-slate-900 dark:text-slate-100">{labels.agents}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {agentResults.map((agent, index) => {
              const data = agent?.data || agent?.result || agent || {};
              return (
                <div key={`${agent?.agent || "agent"}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400">
                    {agent?.agent || `Agent ${index + 1}`}
                  </p>
                  <p className="mt-2 font-black text-slate-900 dark:text-slate-100">
                    {firstDefined(data.menh_gia, data.denomination, "N/A")}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {firstDefined(data.quoc_gia, data.country, "N/A")} · {formatConfidence(firstDefined(data.do_tin_cay, data.confidence))}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-slate-300 shadow-inner">
        <div className="flex items-center gap-2 text-teal-400 font-bold mb-3 uppercase tracking-wider">
          <Terminal className="w-4 h-4"/> {labels.raw}
        </div>
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-emerald-400">
          {JSON.stringify(result, null, 2)}
        </pre>
      </div>
    </div>
  );
}
