import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Play, Pause, Volume2, VolumeX, Eye, EyeOff, Cpu, Brain, CheckCircle2 } from "lucide-react";
import { useScrollReveal } from "../../hooks/useScrollReveal";

const PIPELINE_STEPS = [
  { icon: Eye,          label: "Upload",          desc: "Image ingestion" },
  { icon: Cpu,          label: "YOLO Detection",  desc: "Banknote crop"   },
  { icon: Brain,        label: "LLM Analysis",    desc: "Text & pattern"  },
  { icon: Brain,        label: "Visual Search",   desc: "Reference match" },
  { icon: CheckCircle2, label: "Consensus",        desc: "Majority vote"   },
];

export default function VideoDemoSection() {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isScanActive, setIsScanActive] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  const videoRef = useRef(null);
  const ref = useScrollReveal();

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      if (isPlaying) {
        videoRef.current.play().catch((err) => {
          console.log("Autoplay blocked or interrupted: ", err);
          setIsPlaying(false);
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, isMuted]);

  const handleVideoClick = () => {
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 1;
      setCurrentTime(current);
      setProgress(current / dur);

      const stepCount = PIPELINE_STEPS.length;
      const stepIndex = Math.min(Math.floor((current / dur) * stepCount), stepCount - 1);
      setActiveStep(stepIndex);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleTimelineClick = (e) => {
    e.stopPropagation();
    if (videoRef.current && duration) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      const clickPct = Math.max(0, Math.min(1, clickX / width));
      videoRef.current.currentTime = clickPct * duration;
      setProgress(clickPct);
      setCurrentTime(clickPct * duration);
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "00:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <section ref={ref} className="py-28 relative section-mid overflow-hidden">

      {/* Background radial */}
      <div className="absolute inset-0 pointer-events-none
        bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06)_0%,transparent_68%)]
        dark:bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.05)_0%,transparent_70%)]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">

        {/* ── Section header ── */}
        <div className="text-center mb-14 scroll-reveal">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/10 border border-indigo-500/20 mb-5 shadow-sm backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
            <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-indigo-700 dark:text-indigo-300">
              {t("landing.video_label", "Platform Demo")}
            </span>
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight on-deep-title mb-5">
            {t("landing.video_title", "How Banknote AI Works")}
          </h2>
          <p className="max-w-2xl mx-auto text-lg on-deep-body font-medium leading-relaxed">
            {t(
              "landing.video_desc",
              "Watch our multi-agent pipeline identify, analyze, and verify a banknote in real-time. Full transparency at every step."
            )}
          </p>
        </div>

        {/* ── Video container ── */}
        <div className="scroll-reveal reveal-delay-1 relative max-w-5xl mx-auto rounded-2xl overflow-hidden
                        border border-slate-200 dark:border-white/[0.07]
                        shadow-[0_24px_60px_rgba(0,0,0,0.10)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.5)]
                        group cursor-pointer animate-breathing-glow"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Aspect ratio wrapper */}
          <div className="relative aspect-video bg-slate-100 dark:bg-[#050B18]/90 overflow-hidden">

            {/* Video element */}
            <video
              ref={videoRef}
              src="/vdhome.mp4"
              autoPlay
              muted={isMuted}
              loop
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onClick={handleVideoClick}
              className="absolute inset-0 w-full h-full object-cover z-0"
            />

            {/* Grid overlay inside video */}
            <div className="absolute inset-0 pointer-events-none z-10
              bg-[linear-gradient(to_right,rgba(99,102,241,0.03)_1px,transparent_1px),
                  linear-gradient(to_bottom,rgba(99,102,241,0.03)_1px,transparent_1px)]
              dark:bg-[linear-gradient(to_right,#1E293B15_1px,transparent_1px),
                       linear-gradient(to_bottom,#1E293B15_1px,transparent_1px)]
              bg-[size:3rem_3rem]" />

            {/* Corner markers — professional camera-style */}
            {[
              "top-3 left-3 border-t-2 border-l-2",
              "top-3 right-3 border-t-2 border-r-2",
              "bottom-3 left-3 border-b-2 border-l-2",
              "bottom-3 right-3 border-b-2 border-r-2",
            ].map((cls, i) => (
              <div
                key={i}
                className={`absolute w-6 h-6 z-10 ${cls} border-indigo-400/40 dark:border-indigo-500/30 rounded-[3px] pointer-events-none`}
              />
            ))}

            {/* HUD Overlay */}
            <div className="absolute top-4 left-6 right-6 flex justify-between items-center pointer-events-none z-10 font-mono text-[9px] sm:text-[10px] text-white/60 tracking-wider">
              <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-2 py-1 rounded border border-white/10">
                <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-red-500 animate-pulse" : "bg-slate-400"}`} />
                <span>DEMO_RUN</span>
              </div>
              <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded border border-white/10">
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                <span className="text-white/30">|</span>
                <span>AUTO_AGENT_V2</span>
              </div>
            </div>

            {/* Scan line animation */}
            {isScanActive && isPlaying && (
              <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent
                              pointer-events-none animate-scan-line z-10" />
            )}

            {/* Play button overlay */}
            {!isPlaying && (
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] transition-all duration-300 z-20"
                onClick={handleVideoClick}
              >
                <div className="w-20 h-20 rounded-full flex items-center justify-center border border-white/20 bg-white/10 backdrop-blur-md shadow-2xl scale-100 hover:scale-110 hover:bg-indigo-600 hover:border-indigo-500 transition-all duration-300">
                  <Play className="w-8 h-8 ml-1 text-white fill-current" />
                </div>
              </div>
            )}

            {/* Mini Controls Bar - visible on hover */}
            <div 
              className={`absolute bottom-4 left-4 right-4 flex items-center justify-between px-4 py-2 rounded-lg bg-black/70 border border-white/10 backdrop-blur-md transition-all duration-300 z-30
                         ${hovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={handleVideoClick}
                  className="p-1.5 rounded hover:bg-white/10 text-white transition-colors"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                
                <span className="text-[11px] font-mono text-white/70">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Scan Line Toggle */}
                <button
                  onClick={() => setIsScanActive(!isScanActive)}
                  className={`p-1.5 rounded hover:bg-white/10 transition-colors flex items-center gap-1.5 text-[11px] font-mono
                              ${isScanActive ? "text-indigo-400" : "text-white/60"}`}
                  title={isScanActive ? "Disable Laser Overlay" : "Enable Laser Overlay"}
                >
                  {isScanActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <span className="hidden md:inline">SCAN_LASER</span>
                </button>

                {/* Mute Toggle */}
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1.5 rounded hover:bg-white/10 text-white transition-colors"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Custom Timeline Progress Bar */}
            <div 
              className="absolute bottom-0 inset-x-0 h-1 bg-white/10 hover:h-2 cursor-pointer transition-all duration-200 z-30 group/timeline"
              onClick={handleTimelineClick}
            >
              <div 
                className="h-full bg-indigo-500 relative transition-all"
                style={{ width: `${progress * 100}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border border-indigo-600 scale-0 group-hover/timeline:scale-100 transition-transform" />
              </div>
            </div>

          </div>

          {/* Bottom meta bar */}
          <div className="flex items-center justify-between px-5 py-3
                          bg-slate-50/90 dark:bg-[#0F172A]/80 backdrop-blur-sm
                          border-t border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isPlaying ? t("landing.video_status_active", "AI System: Scanning & Analyzing") : t("landing.video_status_paused", "AI System: Paused")}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-600">
              multi-agent-pipeline · v2.0
            </span>
          </div>
        </div>

        {/* ── Pipeline steps ── */}
        <div className="mt-14 max-w-4xl mx-auto scroll-reveal reveal-delay-2">
          <div className="flex items-start justify-between gap-0 relative">

            {/* Connector line behind */}
            <div className="absolute top-5 left-10 right-10 h-px
                            bg-gradient-to-r from-indigo-200 via-purple-200 to-indigo-200
                            dark:from-indigo-500/20 dark:via-purple-500/20 dark:to-indigo-500/20" />

            {PIPELINE_STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === activeStep && isPlaying;
              const isCompleted = i < activeStep;

              let circleClass = "w-10 h-10 rounded-full flex items-center justify-center mb-3 border-2 transition-all duration-300 shadow-sm ";
              let labelClass = "text-[11px] font-bold text-center leading-tight mb-0.5 transition-colors ";
              let descClass = "text-[10px] text-center font-mono hidden sm:block transition-colors ";

              if (isActive) {
                circleClass += "border-indigo-500 bg-indigo-600 text-white scale-110 shadow-[0_0_15px_rgba(99,102,241,0.6)]";
                labelClass += "text-indigo-600 dark:text-indigo-400 font-extrabold";
                descClass += "text-slate-900 dark:text-slate-200";
              } else if (isCompleted) {
                circleClass += "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400";
                labelClass += "text-emerald-600/80 dark:text-emerald-400/80";
                descClass += "text-slate-400 dark:text-slate-500";
              } else {
                circleClass += "border-slate-200 dark:border-white/10 bg-white dark:bg-[#1E293B] text-slate-400 dark:text-slate-600";
                labelClass += "on-deep-title opacity-60";
                descClass += "on-deep-muted opacity-60";
              }

              return (
                <div key={i} className="flex flex-col items-center relative z-10 flex-1 group">
                  {/* Step circle */}
                  <div className={circleClass}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={labelClass}>
                    {step.label}
                  </span>
                  <span className={descClass}>
                    {step.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
}
