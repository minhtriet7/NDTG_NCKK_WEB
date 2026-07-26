import React, { useState } from "react";
import { API_BASE_URL, getStoredToken } from "../../services/api";
import { SearchCheck, Play, Clock, CheckCircle } from "lucide-react";

export default function Ag3Test() {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("full_ag3");
  const [provider, setProvider] = useState("auto");
  const [enableGroqReader, setEnableGroqReader] = useState(true);
  const [enableSelenium, setEnableSelenium] = useState(true);
  const [disableSeleniumProxy, setDisableSeleniumProxy] = useState(true);
  const [returnRaw, setReturnRaw] = useState(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const options = {
      mode,
      provider_requested: provider,
      provider,
      enable_groq_reader: enableGroqReader,
      enable_selenium: enableSelenium,
      disable_selenium_proxy: disableSeleniumProxy,
      return_raw: returnRaw,
      return_full_raw_json: returnRaw
    };

    if (!file && mode !== "candidate_only") {
      setError("Vui lòng chọn ảnh trước.");
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("options", JSON.stringify(options));
    if (file) {
      formData.append("image", file, file.name);
      formData.append("image_file", file, file.name);
    }

    try {
      const token = getStoredToken();
      if (!token) {
        setError("Bạn cần đăng nhập admin trước khi test AG3.");
        setLoading(false);
        return;
      }

      const requestUrl = `${API_BASE_URL}/admin/ag3-test/run`;

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const text = await response.text();
      let responseData;
      try {
        responseData = text ? JSON.parse(text) : {};
      } catch (e) {
        responseData = text;
      }

      if (!response.ok) {
        throw { response: { status: response.status, data: responseData }, request_url: requestUrl };
      }

      setResult(responseData);
    } catch (err) {
      const status = err?.response?.status || 500;
      const backendData = err?.response?.data;
      const requestUrl = err?.request_url || `${API_BASE_URL}/admin/ag3-test/run`;

      const safeError = backendData && typeof backendData === "object"
        ? {
            ...backendData,
            ok: backendData.ok ?? false,
            http_status: backendData.http_status ?? status,
            request_url: requestUrl,
          }
        : {
            ok: false,
            error_type: "http_error",
            error_message: err?.message || "Unknown request error",
            http_status: status,
            request_url: requestUrl,
          };

      setResult(safeError);
      setError(safeError.error_message || `HTTP ${status}`);
    } finally {
      setLoading(false);
    }
  };

  const SummaryBlock = ({ data, title }) => {
    if (!data) return null;
    return (
      <div className="border p-3 rounded mb-2 bg-gray-50 text-sm">
        <h3 className="font-bold mb-2">{title}</h3>
        <div>Status: <span className={data.summary?.status === "Completed" ? "text-green-600 font-bold" : "text-orange-500 font-bold"}>{data.summary?.status}</span></div>
        <div>Result: {data.summary?.country} / {data.summary?.currency} / {data.summary?.denomination}</div>
        <div>Evidence: {data.summary?.evidence_count} | Articles: {data.summary?.article_count}</div>
        <div>Groq called: {String(data.groq_evidence_reader?.called)}</div>
        {data.groq_evidence_reader?.called && (
          <div className="ml-2 pl-2 border-l-2 text-xs text-gray-600">
            <div>Support: {data.groq_evidence_reader?.support_count || 0} | Conflict: {data.groq_evidence_reader?.conflict_count || 0} | Noise: {data.groq_evidence_reader?.noise_count || 0}</div>
            {data.groq_evidence_reader?.skipped_reason && <div className="text-orange-500">Skipped: {data.groq_evidence_reader.skipped_reason}</div>}
          </div>
        )}

        {data.promotion_trace && (
          <div className="mt-2 text-xs border-t pt-2 border-gray-200">
            <div className="font-bold">Promotion Trace:</div>
            <ul className="list-disc ml-4 text-gray-600">
              <li>Support Signals: {data.promotion_trace.support_signal_count}</li>
              <li>Indep Sources: {data.promotion_trace.independent_source_count}</li>
              <li>Exact Amounts: {data.promotion_trace.exact_amount_support_count}</li>
              <li>Page Text Checked/Support: {data.promotion_trace.page_text_checked_count} / {data.promotion_trace.page_text_support_count}</li>
              <li>Noise Filtered: {data.promotion_trace.noise_filtered_evidence}</li>
              {data.promotion_trace.reason && <li>Reason: {data.promotion_trace.reason}</li>}
            </ul>
          </div>
        )}

        <div>Latency: {data.latency_ms} ms</div>

        {data.validator && data.validator.length > 0 && (
          <div className="text-red-500 text-xs mt-1 bg-red-50 p-2 rounded border border-red-100">
            <strong>Validator Partial/Errors:</strong>
            <ul className="list-disc ml-4 mt-1">
              {data.validator.map((v, i) => <li key={i}>{v}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <SearchCheck className="text-blue-500" /> AG3 Visual Search Test
      </h1>

      <div className="bg-white p-4 rounded border shadow-sm space-y-3">
        <div>
          <label className="block text-sm font-bold mb-1">Test Image</label>
          <input type="file" className="border p-1 w-full" accept="image/*" onChange={e=>setFile(e.target.files[0])} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">Mode</label>
            <select className="w-full border p-2 rounded" value={mode} onChange={e=>setMode(e.target.value)}>
              <option value="full_ag3">full_ag3</option>
              <option value="serpapi_only">serpapi_only</option>
              <option value="selenium_only">selenium_only</option>
              <option value="compare_serpapi_selenium">compare_serpapi_selenium</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Provider</label>
            <select className="w-full border p-2 rounded" value={provider} onChange={e=>setProvider(e.target.value)}>
              <option value="auto">auto</option>
              <option value="serpapi">serpapi</option>
              <option value="selenium">selenium</option>
            </select>
          </div>
        </div>
        <div className="flex gap-4 text-sm font-medium">
          <label><input type="checkbox" checked={enableGroqReader} onChange={e=>setEnableGroqReader(e.target.checked)}/> Enable Groq Reader</label>
          <label><input type="checkbox" checked={enableSelenium} onChange={e=>setEnableSelenium(e.target.checked)}/> Enable Selenium</label>
          <label><input type="checkbox" checked={disableSeleniumProxy} onChange={e=>setDisableSeleniumProxy(e.target.checked)}/> Disable Selenium Proxy</label>
          <label><input type="checkbox" checked={returnRaw} onChange={e=>setReturnRaw(e.target.checked)}/> Return Raw JSON</label>
        </div>
        <button
          onClick={handleRunTest}
          disabled={loading}
          className="bg-blue-600 text-white w-full p-2 rounded font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Clock className="animate-spin" /> : <Play />} RUN AG3 TEST
        </button>
      </div>

      {error && <div className="p-3 bg-red-100 text-red-700 rounded border border-red-200 text-sm">{error}</div>}

      {result && (
        <div className="space-y-4">
          {result.request_url && (
            <div className="p-2 bg-gray-100 text-xs text-gray-500 rounded border">
              Req: {result.request_url} | Status: {result.http_status}
              {result.error_type && <span className="text-red-500 ml-2">[{result.error_type}] {result.error_message}</span>}
            </div>
          )}

          {result.comparison && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded">
              <h2 className="font-bold text-blue-800 flex items-center gap-2 mb-2"><CheckCircle size={18}/> Comparison Winner: {result.comparison.winner.toUpperCase()}</h2>
              <div className="text-sm mb-3">Primary: {result.comparison.primary_provider} | Fallback: {result.comparison.fallback_provider}</div>
              <div className="text-sm text-gray-600 mb-3">{result.comparison.reason}</div>
              <div className="grid grid-cols-2 gap-4">
                <SummaryBlock data={result.branches?.serpapi} title="SerpAPI Branch" />
                <SummaryBlock data={result.branches?.selenium} title="Selenium Branch" />
              </div>
            </div>
          )}

          {!result.comparison && result.summary && (
            <SummaryBlock data={result} title={`Single Run: ${result.mode} (${result.provider_used})`} />
          )}

          <div className="bg-gray-900 rounded p-4 overflow-x-auto text-green-400 text-xs">
            <h3 className="text-white font-bold mb-2">Raw JSON Response:</h3>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
