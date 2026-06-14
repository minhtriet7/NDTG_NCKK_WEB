import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Activity, Database, Brain, Play, CheckCircle2, 
  Terminal, FileCode2, Clock, Settings2, FileJson, Scale,
  Loader2, AlertCircle, Maximize, Link as LinkIcon, Image as ImageIcon
} from 'lucide-react';
import { scanBanknoteDebug } from '../../services/recognitionService';

const DebugPlayground = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [error, setError] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const fileInputRef = useRef(null);
  const imgRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setError(null);
    setDebugData(null);

    // Get original image dimensions
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
  };

  const handleRunPipeline = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    setIsLoading(true);
    setError(null);
    try {
      const response = await scanBanknoteDebug(formData);
      setDebugData(response);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "Failed to run debug pipeline");
    } finally {
      setIsLoading(false);
    }
  };

  const parseSafeJSON = (data) => {
    if (!data) return null;
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  };

  const formatJSON = (obj) => {
    try {
      const parsed = parseSafeJSON(obj);
      return JSON.stringify(parsed || obj, null, 2);
    } catch {
      return typeof obj === 'string' ? obj : "Invalid JSON";
    }
  };

  const CroppedPreview = ({ imageUrl, imageSize, bbox }) => {
    if (!bbox || !imageSize.width) return null;
    
    const boxWidth = bbox.x2 - bbox.x1;
    const boxHeight = bbox.y2 - bbox.y1;
    
    // Calculate CSS percentages for perfect responsive cropping
    const posX = imageSize.width === boxWidth ? 0 : (bbox.x1 / (imageSize.width - boxWidth)) * 100;
    const posY = imageSize.height === boxHeight ? 0 : (bbox.y1 / (imageSize.height - boxHeight)) * 100;
    const bgSizeWidth = (imageSize.width / boxWidth) * 100;
    const aspectRatio = boxWidth / boxHeight;

    return (
      <div className="w-full flex justify-center bg-black/50 rounded-xl overflow-hidden border border-slate-800 p-4">
        <div 
          style={{
            width: '100%',
            maxHeight: '200px', // Prevent it from being too tall
            maxWidth: `${200 * aspectRatio}px`, // maintain aspect ratio within constraints
            aspectRatio: `${aspectRatio}`,
            backgroundImage: `url(${imageUrl})`,
            backgroundPosition: `${posX}% ${posY}%`,
            backgroundSize: `${bgSizeWidth}% auto`,
            backgroundRepeat: 'no-repeat'
          }}
          className="rounded-lg shadow-2xl border border-slate-700 shadow-black"
        />
      </div>
    );
  };

  // Tính toán tỷ lệ Box so với ảnh hiển thị
  const renderBoundingBox = (bbox, index) => {
    if (!bbox || !imgRef.current || !imageSize.width) return null;
    
    const renderedWidth = imgRef.current.clientWidth;
    const renderedHeight = imgRef.current.clientHeight;
    
    const scaleX = renderedWidth / imageSize.width;
    const scaleY = renderedHeight / imageSize.height;

    const left = bbox.x1 * scaleX;
    const top = bbox.y1 * scaleY;
    const width = (bbox.x2 - bbox.x1) * scaleX;
    const height = (bbox.y2 - bbox.y1) * scaleY;

    return (
      <div 
        key={index}
        className="absolute border-2 border-green-500 bg-green-500/10 transition-all group"
        style={{ left, top, width, height }}
      >
        <div className="absolute -top-6 left-[-2px] bg-green-500 text-black text-xs font-bold px-2 py-0.5 whitespace-nowrap">
          Obj #{index + 1} | YOLO Conf: {Math.round(bbox.confidence * 100)}%
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-6 font-mono selection:bg-teal-500/30">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* Header Title */}
        <div className="border-b border-slate-800 pb-6 flex items-center gap-4">
          <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl">
            <Terminal className="w-8 h-8 text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Multi-Agent Debug Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">
              Internal DevTool • End-to-end pipeline inspection (YOLO crop, LLM prompts, Visual Search, Aggregator)
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl font-sans font-medium flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Control & Vision */}
          <div className="xl:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-indigo-400" /> Control Panel
              </h3>

              <div className="space-y-6">
                {/* File Upload & Preview with BBox */}
                <div 
                  onClick={() => !isLoading && fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors overflow-hidden ${
                    isLoading ? 'border-slate-800 bg-slate-900 opacity-50 cursor-not-allowed' 
                    : previewUrl ? 'border-slate-700 bg-slate-800/50 hover:border-slate-500' 
                    : 'border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/5'
                  }`}
                >
                  {previewUrl ? (
                    <div className="relative inline-block w-full">
                      <img 
                        ref={imgRef}
                        src={previewUrl} 
                        alt="Preview" 
                        className="w-full h-auto object-contain rounded-lg relative z-10" 
                      />
                      {/* Vẽ Bounding Box của YOLO nếu có debugData */}
                      {debugData?.objects && debugData.objects.map((obj, idx) => {
                        const agent1Parsed = parseSafeJSON(obj.agent_1_raw);
                        const bbox = agent1Parsed?.[0]?.bbox || agent1Parsed?.bbox;
                        return renderBoundingBox(bbox, idx);
                      })}
                    </div>
                  ) : (
                    <div className="py-12">
                      <Upload className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-400">Select Image to Debug</p>
                    </div>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    accept="image/*" 
                    onChange={handleFileChange} 
                    className="hidden"
                  />
                </div>

                <button 
                  onClick={handleRunPipeline}
                  disabled={!selectedFile || isLoading}
                  className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    !selectedFile || isLoading 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/20'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Running Pipeline...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" /> Run Test Pipeline
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Execution Flow */}
            {debugData?.input_info && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-400" /> Execution Flow
                </h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-sm text-slate-500">Started At</span>
                    <span className="text-sm text-slate-300 font-medium">{new Date(debugData.input_info.started_at).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                    <span className="text-sm text-slate-500">Processing Time</span>
                    <span className="text-sm text-amber-400 font-bold">{debugData.input_info.processing_time_ms} ms</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-500">Objects Detected</span>
                    <span className="text-sm px-2 py-0.5 rounded bg-teal-500/20 text-teal-400 font-bold">{debugData.objects?.length || 0} objects</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Output Data */}
          <div className="xl:col-span-8 space-y-6">
            {!debugData ? (
              <div className="h-full border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-600 min-h-[400px]">
                <Activity className="w-12 h-12 mb-4 opacity-20" />
                <p>Waiting for pipeline execution...</p>
              </div>
            ) : (
              debugData.objects && debugData.objects.map((obj, idx) => {
                const agent1Parsed = parseSafeJSON(obj.agent_1_raw) || [];
                const a1Data = Array.isArray(agent1Parsed) ? agent1Parsed[0] : agent1Parsed;
                
                const agent2RawRespParsed = parseSafeJSON(obj.agent_2_raw?.raw_response);
                
                let agent3RawResult = obj.agent_3_raw;
                let agent3DebugLog = null;
                if (obj.agent_3_raw && typeof obj.agent_3_raw === 'object' && obj.agent_3_raw.raw_result) {
                  agent3RawResult = obj.agent_3_raw.raw_result;
                  agent3DebugLog = obj.agent_3_raw.debug_log;
                }
                
                const agent3Parsed = parseSafeJSON(agent3RawResult) || [];
                const a3Data = Array.isArray(agent3Parsed) ? agent3Parsed[0] : agent3Parsed;
                const a3RawTextParsed = parseSafeJSON(a3Data?.raw_text);

                return (
                  <div key={idx} className="space-y-6">
                    
                    {/* SECTION 3: Bóc tách Đa Tác Tử */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                        <Maximize className="w-5 h-5 text-green-400" /> Pipeline Object #{obj.object_index}
                      </h3>

                      <div className="space-y-8">
                        
                        {/* Agent 1 (ML/DL) */}
                        <div className="relative">
                          <div className="absolute -left-3 top-0 bottom-0 w-1 bg-blue-500/20 rounded-full" />
                          <div className="flex items-center gap-2 mb-3">
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-bold uppercase">Agent 1</span>
                            <span className="text-sm font-semibold text-slate-300">YOLO Detection & ResNet Classification</span>
                          </div>
                          
                          <div className="mb-4">
                            <p className="text-xs text-slate-500 font-bold mb-2 ml-1 uppercase">YOLO Cropped Image</p>
                            <CroppedPreview 
                              imageUrl={previewUrl} 
                              imageSize={imageSize} 
                              bbox={a1Data?.bbox} 
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                              <p className="text-xs text-slate-500 font-bold mb-2 uppercase">YOLO Bounding Box</p>
                              <pre className="text-blue-300 text-xs">{formatJSON(a1Data?.bbox || "No BBox")}</pre>
                            </div>
                            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                              <p className="text-xs text-slate-500 font-bold mb-2 uppercase">ResNet Top Predictions</p>
                              <pre className="text-blue-300 text-xs">{formatJSON(a1Data?.top_predictions || "No Predictions")}</pre>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 font-bold mb-1 ml-1 uppercase">Agent 1 Final JSON</p>
                          <pre className="bg-slate-950 border border-slate-800 text-green-400 p-4 rounded-xl overflow-x-auto text-xs">
                            {formatJSON(agent1Parsed)}
                          </pre>
                        </div>

                        {/* Agent 2 (LLM) */}
                        <div className="relative">
                          <div className="absolute -left-3 top-0 bottom-0 w-1 bg-purple-500/20 rounded-full" />
                          <div className="flex items-center gap-2 mb-3">
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 text-xs font-bold uppercase">Agent 2</span>
                            <span className="text-sm font-semibold text-slate-300">Gemini LLM Analysis</span>
                          </div>
                          
                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <p className="text-xs text-slate-500 font-bold mb-1 ml-1 uppercase">Prompt Đầu Vào</p>
                              <pre className="bg-slate-950 border border-slate-800 text-purple-300 p-4 rounded-xl overflow-x-auto text-xs whitespace-pre-wrap leading-relaxed">
                                {obj.agent_2_raw?.prompt_sent || "N/A"}
                              </pre>
                            </div>

                            <div>
                              <p className="text-xs text-slate-500 font-bold mb-1 ml-1 uppercase">Raw JSON Response</p>
                              <pre className="bg-slate-950 border border-slate-800 text-green-400 p-4 rounded-xl overflow-x-auto text-xs">
                                {formatJSON(agent2RawRespParsed || obj.agent_2_raw?.raw_response)}
                              </pre>
                            </div>
                          </div>
                        </div>

                        {/* Agent 3 (Visual Search) */}
                        <div className="relative">
                          <div className="absolute -left-3 top-0 bottom-0 w-1 bg-rose-500/20 rounded-full" />
                          <div className="flex items-center gap-2 mb-3">
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-xs font-bold uppercase">Agent 3</span>
                            <span className="text-sm font-semibold text-slate-300">Google Lens Visual Search & LLM Formatter</span>
                          </div>

                          {agent3DebugLog?.prompt_sent && (
                            <div className="mb-4">
                              <p className="text-xs text-slate-500 font-bold mb-1 ml-1 uppercase">Gemini Prompt (Format Lens Data)</p>
                              <pre className="bg-slate-950 border border-slate-800 text-rose-300 p-4 rounded-xl overflow-x-auto text-xs whitespace-pre-wrap leading-relaxed">
                                {agent3DebugLog.prompt_sent}
                              </pre>
                            </div>
                          )}

                          {a3RawTextParsed?.visual_matches?.length > 0 && (
                            <div className="mb-4">
                              <p className="text-xs text-slate-500 font-bold mb-2 ml-1 uppercase">Found Articles / Visual Matches</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {a3RawTextParsed.visual_matches.slice(0, 6).map((match, i) => (
                                  <a key={i} href={match.link} target="_blank" rel="noreferrer" className="block bg-slate-950 border border-slate-800 hover:border-rose-500/50 p-3 rounded-xl transition-colors">
                                    <div className="flex items-start gap-2">
                                      <LinkIcon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                      <div>
                                        <p className="text-xs text-slate-300 font-bold line-clamp-2" title={match.title}>{match.title}</p>
                                        <p className="text-[10px] text-slate-500 mt-1">{match.source}</p>
                                      </div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {agent3DebugLog?.raw_response && (
                            <div className="mb-4">
                              <p className="text-xs text-slate-500 font-bold mb-1 ml-1 uppercase">Gemini Raw JSON Response</p>
                              <pre className="bg-slate-950 border border-slate-800 text-green-400 p-4 rounded-xl overflow-x-auto text-xs">
                                {formatJSON(agent3DebugLog.raw_response)}
                              </pre>
                            </div>
                          )}

                          <p className="text-xs text-slate-500 font-bold mb-1 ml-1 uppercase">Agent 3 Final JSON</p>
                          <pre className="bg-slate-950 border border-slate-800 text-green-400 p-4 rounded-xl overflow-x-auto text-xs">
                            {formatJSON(agent3Parsed)}
                          </pre>
                          
                          {obj.agent_3_compare && (
                            <div className="mt-8 border-t border-slate-800/50 pt-6">
                              <h4 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
                                <Scale className="w-4 h-4 text-rose-400" /> Agent 3 Provider Comparison (Extractions & Results)
                              </h4>
                              
                              {(() => {
                                const v1Parsed = parseSafeJSON(obj.agent_3_compare?.v1_serpapi?.raw_result);
                                const v1Data = Array.isArray(v1Parsed) ? v1Parsed[0] : v1Parsed;
                                
                                // Lấy visual_matches từ raw_data (đáng tin cậy hơn) hoặc fallback qua raw_text
                                const v1RawData = obj.agent_3_compare?.v1_serpapi?.debug_log?.raw_data || parseSafeJSON(v1Data?.raw_text);
                                const v1Matches = v1RawData?.visual_matches || [];

                                const v2Parsed = parseSafeJSON(obj.agent_3_compare?.v2_selenium?.raw_result);
                                const v2Data = Array.isArray(v2Parsed) ? v2Parsed[0] : v2Parsed;
                                const v2Evidence = v2Data?.evidence || [];

                                return (
                                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {/* SerpApi */}
                                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-hidden flex flex-col">
                                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase mb-3 self-start">SerpApi (V1) - {v1Data?.status || "N/A"}</span>
                                      
                                      <p className="text-xs text-slate-500 font-bold mb-2 uppercase">Extracted Matches ({v1Matches.length})</p>
                                      <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {v1Matches.length > 0 ? v1Matches.map((match, i) => {
                                          let domain = match.source;
                                          if (!domain && match.link) {
                                            try { domain = new URL(match.link).hostname; } catch(e) {}
                                          }
                                          return (
                                            <a key={i} href={match.link} target="_blank" rel="noreferrer" className="block bg-slate-900 border border-slate-800 hover:border-rose-500/50 p-2 rounded-lg transition-colors">
                                              <p className="text-[11px] text-slate-300 font-bold line-clamp-1">{match.title}</p>
                                              <p className="text-[9px] text-slate-500 truncate">{domain || "Unknown Source"}</p>
                                            </a>
                                          );
                                        }) : (
                                          <p className="text-xs text-slate-500 italic">No visual matches found.</p>
                                        )}
                                      </div>

                                      <p className="text-xs text-slate-500 font-bold mb-2 uppercase mt-auto">Final JSON</p>
                                      <pre className="text-green-400 text-[10px] overflow-x-auto bg-black p-2 rounded">
                                        {formatJSON(v1Data)}
                                      </pre>
                                    </div>

                                    {/* Selenium */}
                                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-hidden flex flex-col">
                                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase mb-3 self-start">Selenium (V2) - {v2Data?.status || "N/A"}</span>
                                      
                                      <p className="text-xs text-slate-500 font-bold mb-2 uppercase">Extracted Evidence ({v2Evidence.length})</p>
                                      <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {v2Evidence.length > 0 ? v2Evidence.map((match, i) => (
                                          <a key={i} href={match.url} target="_blank" rel="noreferrer" className="block bg-slate-900 border border-slate-800 hover:border-rose-500/50 p-2 rounded-lg transition-colors">
                                            <div className="flex justify-between items-start">
                                              <p className="text-[11px] text-slate-300 font-bold line-clamp-1 flex-1 pr-2">{match.title || match.snippet}</p>
                                              {match.score !== undefined && (
                                                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded shrink-0">{(match.score).toFixed(1)}</span>
                                              )}
                                            </div>
                                            <p className="text-[9px] text-slate-500 truncate mt-1">{match.source}</p>
                                          </a>
                                        )) : (
                                          <p className="text-xs text-slate-500 italic">No evidence found.</p>
                                        )}
                                      </div>

                                      <p className="text-xs text-slate-500 font-bold mb-2 uppercase mt-auto">Final JSON</p>
                                      <pre className="text-green-400 text-[10px] overflow-x-auto bg-black p-2 rounded">
                                        {formatJSON(v2Data)}
                                      </pre>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {/* SECTION 4: Trọng tài & Kết quả */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                        <Scale className="w-5 h-5 text-orange-400" /> Aggregator Final Decision
                      </h3>

                      <div className="space-y-6">
                        
                        {/* Aggregator Log */}
                        <div>
                          <p className="text-xs text-slate-500 font-bold mb-3 uppercase tracking-wider">Voting Timeline</p>
                          <div className="space-y-3">
                            {obj.aggregator_log?.attempts?.map((attempt, i) => (
                              <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                                  <span className="font-bold text-slate-300">Attempt #{attempt.attempt}</span>
                                  {attempt.require_rerun ? (
                                    <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded">Conflict (Rerun Triggered)</span>
                                  ) : (
                                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded">Consensus Reached</span>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs text-slate-400"><span className="text-slate-500 w-16 inline-block">Votes:</span> 
                                    {attempt.votes?.map(v => v ? `[${v[0]}, ${v[1]}, ${v[2]}]` : 'Null').join(' | ')}
                                  </p>
                                  <p className="text-xs text-slate-400"><span className="text-slate-500 w-16 inline-block">Matched:</span> {attempt.matched_agents} agents</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Final JSON Output */}
                        <div>
                          <p className="text-xs text-slate-500 font-bold mb-2 uppercase tracking-wider flex items-center gap-1">
                            <FileCode2 className="w-4 h-4" /> Aggregated Final JSON
                          </p>
                          <pre className="bg-black border border-slate-800 text-teal-400 p-5 rounded-xl overflow-x-auto text-sm shadow-inner font-mono">
                            {formatJSON(obj.final_result)}
                          </pre>
                        </div>

                      </div>
                    </div>

                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default DebugPlayground;
