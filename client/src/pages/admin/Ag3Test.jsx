import React, { useState, useEffect } from "react";
import { 
  Box, 
  SearchCheck, 
  UploadCloud, 
  Play, 
  AlertCircle, 
  CheckCircle,
  XCircle,
  Clock,
  List,
  Cpu,
  Database,
  Code
} from "lucide-react";

export default function Ag3Test() {
  // State for form
  const [file, setFile] = useState(null);
  const [provider, setProvider] = useState("auto");
  const [mode, setMode] = useState("full_ag3");
  const [useOriginalImage, setUseOriginalImage] = useState(false);
  const [enableSelenium, setEnableSelenium] = useState(false);
  const [enableGroqReader, setEnableGroqReader] = useState(true);
  const [groqReaderMode, setGroqReaderMode] = useState("always");
  const [returnRaw, setReturnRaw] = useState(false);
  
  const [candidateCountry, setCandidateCountry] = useState("");
  const [candidateCurrency, setCandidateCurrency] = useState("");
  const [candidateDenomination, setCandidateDenomination] = useState("");
  
  const [topN, setTopN] = useState(5);
  const [timeoutSec, setTimeoutSec] = useState(15);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleRunTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    if (file && mode !== "candidate_only") {
      formData.append("image_file", file);
    }
    
    const options = {
      mode,
      provider,
      use_original_image: useOriginalImage,
      enable_selenium: enableSelenium,
      enable_groq_evidence_reader: enableGroqReader,
      groq_evidence_reader_mode: groqReaderMode,
      return_raw_response: returnRaw,
      top_n_evidence: topN,
      timeout_seconds: timeoutSec,
      candidate_country: candidateCountry,
      candidate_currency: candidateCurrency,
      candidate_denomination: candidateDenomination,
      image_max_side: 512
    };

    formData.append("options", JSON.stringify(options));

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch("/api/admin/ag3-test/run", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Test failed");
      }
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStatus = (status) => {
    if (status === "completed" || status === "Completed" || status === true) {
      return <span className="flex items-center text-green-500 font-semibold"><CheckCircle className="w-4 h-4 mr-1"/> {String(status)}</span>;
    }
    if (status === "skipped" || status === "Partial") {
      return <span className="flex items-center text-orange-500 font-semibold"><AlertCircle className="w-4 h-4 mr-1"/> {String(status)}</span>;
    }
    if (status === "failed" || status === "Failed" || status === false) {
      return <span className="flex items-center text-red-500 font-semibold"><XCircle className="w-4 h-4 mr-1"/> {String(status)}</span>;
    }
    return <span className="text-gray-500">{String(status)}</span>;
  };

  const CodeBlock = ({ data }) => (
    <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SearchCheck className="w-8 h-8 text-blue-500" />
          AG3 Visual Search Isolated Test
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Form Controls */}
        <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4 md:col-span-1">
          <h2 className="font-bold border-b pb-2">1. Input Configuration</h2>
          
          <div>
            <label className="block text-sm font-medium mb-1">Mode</label>
            <select className="w-full border p-2 rounded" value={mode} onChange={e=>setMode(e.target.value)}>
              <option value="full_ag3">full_ag3</option>
              <option value="serpapi_only">serpapi_only</option>
              <option value="selenium_only">selenium_only</option>
              <option value="lens_only">lens_only</option>
              <option value="evidence_only">evidence_only</option>
              <option value="groq_reader_only">groq_reader_only</option>
              <option value="candidate_only">candidate_only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Provider Requested</label>
            <select className="w-full border p-2 rounded" value={provider} onChange={e=>setProvider(e.target.value)}>
              <option value="auto">auto</option>
              <option value="serpapi">serpapi</option>
              <option value="selenium">selenium</option>
            </select>
          </div>

          {mode !== "candidate_only" && (
            <div>
              <label className="block text-sm font-medium mb-1">Test Image</label>
              <input type="file" className="w-full border p-1 rounded text-sm" accept="image/*" onChange={e=>setFile(e.target.files[0])} />
            </div>
          )}

          {mode === "candidate_only" && (
            <div className="space-y-2 p-3 bg-gray-50 border rounded text-sm">
              <div><label>Country:</label> <input className="w-full border p-1" value={candidateCountry} onChange={e=>setCandidateCountry(e.target.value)}/></div>
              <div><label>Currency:</label> <input className="w-full border p-1" value={candidateCurrency} onChange={e=>setCandidateCurrency(e.target.value)}/></div>
              <div><label>Denom:</label> <input className="w-full border p-1" value={candidateDenomination} onChange={e=>setCandidateDenomination(e.target.value)}/></div>
            </div>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enableGroqReader} onChange={e=>setEnableGroqReader(e.target.checked)}/> Enable Groq Reader
            </label>
            {enableGroqReader && (
              <select className="w-full border p-1 text-sm rounded ml-6 w-11/12" value={groqReaderMode} onChange={e=>setGroqReaderMode(e.target.value)}>
                <option value="always">Mode: always</option>
                <option value="when_weak">Mode: when_weak</option>
                <option value="never">Mode: never</option>
              </select>
            )}
            
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enableSelenium} onChange={e=>setEnableSelenium(e.target.checked)}/> Enable Selenium
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useOriginalImage} onChange={e=>setUseOriginalImage(e.target.checked)}/> Skip Vision Resize
            </label>
            <label className="flex items-center gap-2 text-sm text-red-600 font-medium">
              <input type="checkbox" checked={returnRaw} onChange={e=>setReturnRaw(e.target.checked)}/> Return Full Raw JSON
            </label>
          </div>

          <button 
            onClick={handleRunTest} 
            disabled={loading || (!file && mode !== "candidate_only")}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:bg-gray-400 hover:bg-blue-700"
          >
            {loading ? <Clock className="animate-spin" /> : <Play />} RUN AG3 TEST
          </button>
          
          {error && <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded border border-red-200">{error}</div>}
        </div>

        {/* Results Sections */}
        <div className="md:col-span-2 space-y-6">
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 min-h-[300px] border-2 border-dashed rounded-xl">
              <Cpu className="w-16 h-16 mb-4" />
              <p>Configure parameters and click RUN TEST</p>
            </div>
          )}

          {result && (
            <>
              {/* FLOW TRACE */}
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><List /> Flow Trace</h2>
                <div className="space-y-2">
                  {result.flow_trace.map((step, idx) => (
                    <div key={idx} className="flex flex-col p-3 border rounded-lg bg-gray-50 text-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-gray-700">{step.step}</span>
                        <span>{renderStatus(step.status)}</span>
                      </div>
                      <div className="text-gray-500 flex justify-between">
                        <span>Time: {step.duration_ms} ms</span>
                        {step.reason && <span className="text-orange-500">Reason: {step.reason}</span>}
                        {step.error_message && <span className="text-red-500 truncate max-w-[200px]" title={step.error_message}>{step.error_type}: {step.error_message}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SUMMARY */}
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Database /> AG3 Final Output</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-blue-50 rounded border border-blue-100">
                    <div className="text-blue-500 font-semibold text-xs uppercase mb-1">Status</div>
                    <div className="text-lg font-bold">{renderStatus(result.ag3_final.status)}</div>
                  </div>
                  <div className="p-3 bg-purple-50 rounded border border-purple-100">
                    <div className="text-purple-500 font-semibold text-xs uppercase mb-1">Consensus Voting</div>
                    <div className="text-lg font-bold">{result.ag3_final.not_counted_in_consensus ? <span className="text-red-500">Non-Voting</span> : <span className="text-green-500">Voting Eligible</span>}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded border col-span-2 flex justify-between items-center">
                    <div>
                      <div className="text-gray-500 text-xs font-semibold mb-1 uppercase">Identity Parsed</div>
                      <div className="font-bold">{result.ag3_final.quoc_gia} - {result.ag3_final.ma_tien_te} - {result.ag3_final.menh_gia}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 text-xs font-semibold mb-1 uppercase">Confidence</div>
                      <div className="font-bold">{(result.ag3_final.do_tin_cay * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RECONCILIATION & VALIDATOR */}
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="font-bold text-lg mb-4">Reconciliation & Validation</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="border rounded p-3 text-sm">
                    <div className="font-bold mb-2 pb-1 border-b text-gray-700">Reconciliation</div>
                    <div>Agreement Level: <span className="font-semibold">{result.reconciliation.agreement_level}</span></div>
                    <div>Eligible: {renderStatus(result.reconciliation.eligible_for_validation)}</div>
                    {result.reconciliation.reason && <div className="text-gray-500 italic mt-1">{result.reconciliation.reason}</div>}
                  </div>
                  <div className="border rounded p-3 text-sm">
                    <div className="font-bold mb-2 pb-1 border-b text-gray-700">Validator</div>
                    <div>Attempted: {renderStatus(result.validator.attempted)}</div>
                    <div>Passed: {renderStatus(result.validator.passed)}</div>
                    {result.validator.validation_errors?.length > 0 && (
                      <ul className="text-red-500 list-disc ml-4 mt-1">
                        {result.validator.validation_errors.map((e, i)=><li key={i}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* DET PARSER & GROQ READER */}
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="font-bold text-lg mb-4">Parsers Output</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded p-3 text-sm">
                    <div className="font-bold mb-2 pb-1 border-b text-gray-700">Deterministic Parser</div>
                    <div>Status: {renderStatus(result.deterministic_parser.status)}</div>
                    <div>Support Count: {result.deterministic_parser.support_count}</div>
                    <div>Exact Amount: {result.deterministic_parser.exact_amount_support_count}</div>
                    <div>Conflict Count: {result.deterministic_parser.conflict_count}</div>
                    <div>Indep. Sources: {result.deterministic_parser.independent_source_count}</div>
                    {result.deterministic_parser.reason && <div className="mt-2 text-xs text-gray-500 border-t pt-1">{result.deterministic_parser.reason}</div>}
                  </div>
                  <div className="border rounded p-3 text-sm">
                    <div className="font-bold mb-2 pb-1 border-b text-gray-700">Groq Evidence Reader</div>
                    <div>Called: {renderStatus(result.groq_evidence_reader.called)}</div>
                    <div>Status: {renderStatus(result.groq_evidence_reader.status)}</div>
                    <div>Support Count: {result.groq_evidence_reader.support_count || 0}</div>
                    <div>Conflict Count: {result.groq_evidence_reader.conflict_count || 0}</div>
                    <div>Noise Count: {result.groq_evidence_reader.noise_count || 0}</div>
                    {result.groq_evidence_reader.skipped_reason && <div className="text-orange-500 text-xs mt-1">Skipped: {result.groq_evidence_reader.skipped_reason}</div>}
                    {result.groq_evidence_reader.error_message && <div className="text-red-500 text-xs mt-1">Error: {result.groq_evidence_reader.error_message}</div>}
                  </div>
                </div>
              </div>

              {/* EVIDENCE TABLE */}
              <div className="bg-white p-6 rounded-xl shadow-sm border overflow-hidden">
                <h2 className="font-bold text-lg mb-4">Evidence Harvest ({result.evidence_harvest.count})</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2 border">Rnk</th>
                        <th className="p-2 border">Domain</th>
                        <th className="p-2 border">Title / Snippet</th>
                        <th className="p-2 border">Country / Curr / Amts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.evidence_harvest.items.map((item, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2 border font-bold text-center">{item.rank}</td>
                          <td className="p-2 border">
                            <div className="font-semibold text-blue-600"><a href={item.url} target="_blank" rel="noreferrer">{item.domain}</a></div>
                            <div className="text-gray-400">{item.bucket}</div>
                          </td>
                          <td className="p-2 border">
                            <div className="font-semibold mb-1">{item.title}</div>
                            <div className="text-gray-600 line-clamp-2">{item.snippet}</div>
                          </td>
                          <td className="p-2 border">
                            <div><span className="font-semibold text-gray-500">Loc:</span> {item.detected_country || '-'}</div>
                            <div><span className="font-semibold text-gray-500">Cur:</span> {item.detected_currency || '-'}</div>
                            <div><span className="font-semibold text-gray-500">Amt:</span> {item.detected_amounts?.join(', ') || '-'}</div>
                          </td>
                        </tr>
                      ))}
                      {result.evidence_harvest.count === 0 && (
                        <tr><td colSpan="4" className="text-center p-4 text-gray-500">No evidence found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RAW JSON */}
              <div className="bg-white p-6 rounded-xl shadow-sm border">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Code /> Raw Debug Data</h2>
                <details className="mb-2">
                  <summary className="cursor-pointer font-semibold text-gray-700 bg-gray-100 p-2 rounded">Config & Core Debug</summary>
                  <div className="mt-2"><CodeBlock data={{
                    config: result.config_debug,
                    image: result.image_debug,
                    timing_ms: result.timing_ms
                  }} /></div>
                </details>
                <details className="mb-2">
                  <summary className="cursor-pointer font-semibold text-gray-700 bg-gray-100 p-2 rounded">Provider Debug (SerpAPI/Selenium)</summary>
                  <div className="mt-2"><CodeBlock data={{
                    serpapi: result.serpapi_debug,
                    selenium: result.selenium_debug
                  }} /></div>
                </details>
                <details className="mb-2">
                  <summary className="cursor-pointer font-semibold text-gray-700 bg-gray-100 p-2 rounded">Groq Classification Array</summary>
                  <div className="mt-2"><CodeBlock data={result.groq_evidence_reader.evidence_classification || "Not available"} /></div>
                </details>
                <details>
                  <summary className="cursor-pointer font-semibold text-gray-700 bg-gray-100 p-2 rounded">Full Raw JSON Payload</summary>
                  <div className="mt-2"><CodeBlock data={result} /></div>
                </details>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
