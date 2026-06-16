import os
import re

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Updated {path}")

def update_file(path, pattern, replacement):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(pattern, replacement, content)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Updated {path}")

base = "client/src/components"
pages_base = "client/src/pages"

# --- 1. Home.jsx ---
home_jsx = """
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";

import HeroSection from "../../components/home/HeroSection";
import VideoDemoSection from "../../components/home/VideoDemoSection";
import AgentSystemSection from "../../components/home/AgentSystemSection";
import SupportedCurrencies from "../../components/home/SupportedCurrencies";
import StatsSection from "../../components/home/StatsSection";

export default function Home() {
  const { i18n } = useTranslation();
  const { lang } = useAppStore();
  const { isAuthenticated } = useAuthStore();
  
  useEffect(() => {
    if (lang && i18n && typeof i18n.changeLanguage === 'function') {
      if (i18n.language !== lang.toLowerCase()) {
        i18n.changeLanguage(lang.toLowerCase());
      }
    }
  }, [lang, i18n]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] transition-colors duration-300 pb-0 flex flex-col font-sans">
      <HeroSection isAuthenticated={isAuthenticated} />
      <VideoDemoSection />
      <AgentSystemSection />
      <SupportedCurrencies />
      <StatsSection />
    </div>
  );
}
"""

# --- 2. HeroSection.jsx (2-Layer Slider) ---
hero_section_jsx = """
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, ChevronRight } from 'lucide-react';
import HeroMockup from './HeroMockup';

export default function HeroSection({ isAuthenticated }) {
  const navigate = useNavigate();
  const [bgIndex, setBgIndex] = useState(0);

  // Auto-play background slider
  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const backgrounds = [
    "bg-slate-900", // Placeholder 1
    "bg-indigo-950", // Placeholder 2
    "bg-slate-950"  // Placeholder 3
  ];

  return (
    <section className="relative overflow-hidden min-h-[90vh] flex items-center justify-center">
      {/* LAYER 1: Background Slider */}
      {backgrounds.map((bg, idx) => (
        <div 
          key={idx}
          className={`absolute inset-0 transition-opacity duration-1000 ${bgIndex === idx ? 'opacity-100' : 'opacity-0'} ${bg}`}
        >
          {/* Add a subtle grid to all backgrounds to maintain tech feel */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />
        </div>
      ))}
      
      {/* Overlay to ensure text readability */}
      <div className="absolute inset-0 bg-[#0F172A]/70 backdrop-blur-[2px] z-0" />

      {/* LAYER 2: Content & Terminal Overlay */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 w-full py-20">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          
          <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-[#1E293B]/80 text-[#CBD5E1] border border-[#334155] backdrop-blur-md shadow-sm">
              <Network className="w-3.5 h-3.5 text-[#6366F1]" />
              ENTERPRISE COMPUTER VISION
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight text-[#F8FAFC]">
              Verify banknotes with <br className="hidden md:block"/>
              <span className="text-[#6366F1]">multi-agent</span> intelligence.
            </h1>

            <p className="text-lg leading-relaxed text-[#CBD5E1] max-w-xl">
              An advanced AI workflow combining visual cropping, LLM reasoning, and multimodal search to establish absolute ground truth.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto pt-4">
              <button
                onClick={() => navigate(isAuthenticated ? "/workspace" : "/auth/login")}
                className="flex items-center justify-center gap-2 bg-[#F8FAFC] hover:bg-[#CBD5E1] text-[#0F172A] px-8 py-3.5 rounded-lg text-sm font-bold transition-all shadow-lg hover:shadow-xl w-full sm:w-auto"
              >
                Start Workspace
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => navigate("/directory")}
                className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg text-sm font-bold bg-transparent text-[#CBD5E1] border border-[#334155] hover:text-[#F8FAFC] hover:bg-[#1E293B]/80 backdrop-blur-sm transition-all w-full sm:w-auto"
              >
                View Documentation
              </button>
            </div>
          </div>

          <div className="flex-1 w-full lg:max-w-xl perspective-[1000px]">
            <HeroMockup />
          </div>
          
        </div>
      </div>
    </section>
  );
}
"""

# --- 3. HeroMockup.jsx (Terminal Code Overlay) ---
hero_mockup_jsx = """
import { useState, useEffect } from 'react';

export default function HeroMockup() {
  const [lines, setLines] = useState([]);
  const fullLog = [
    "> Initiating Banknote Scan Workflow...",
    "> [YOLOv8] Image pre-processing started.",
    "> [YOLOv8] Target acquired. Cropping bounding box... [DONE]",
    "> [OpenAI] Analyzing visible text & patterns...",
    "> [OpenAI] Extracted text: '500000', 'NĂM TRĂM NGHÌN ĐỒNG'",
    "> [Gemini] Cross-referencing portrait and geometric features...",
    "> [Gemini] Match found: Ho Chi Minh portrait (VND).",
    "> [Google Lens] Reverse visual search executing...",
    "> [Google Lens] High similarity with 500,000 VND Polymer note.",
    "> [Consensus] Evaluating agent outputs...",
    "> [Consensus] 3/3 Agents agree.",
    "> Final Result: 500,000 VND (Vietnam). Accuracy: 99.8%",
    " "
  ];

  useEffect(() => {
    let currentLine = 0;
    const interval = setInterval(() => {
      if (currentLine < fullLog.length) {
        setLines(prev => [...prev, fullLog[currentLine]]);
        currentLine++;
      } else {
        // Reset after a pause
        setTimeout(() => {
          setLines([]);
          currentLine = 0;
        }, 3000);
      }
    }, 800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto bg-[#020617]/90 backdrop-blur-xl rounded-xl border border-[#334155] shadow-2xl overflow-hidden font-mono text-sm transform lg:rotate-y-[-5deg] lg:rotate-x-[5deg] transition-transform duration-700 hover:rotate-0">
      {/* Mac-like Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#334155]/50 bg-[#0F172A]/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="mx-auto text-xs text-[#CBD5E1]/70 font-medium tracking-wide">
          bash - multi-agent-pipeline
        </div>
      </div>

      {/* Terminal Content */}
      <div className="p-5 h-[320px] overflow-y-auto flex flex-col space-y-2">
        {lines.map((line, idx) => (
          <div 
            key={idx} 
            className={`
              ${line.includes('[DONE]') || line.includes('100% Match') ? 'text-green-400' : ''}
              ${line.includes('[YOLOv8]') ? 'text-blue-400' : ''}
              ${line.includes('[OpenAI]') ? 'text-purple-400' : ''}
              ${line.includes('[Gemini]') ? 'text-cyan-400' : ''}
              ${line.includes('[Google Lens]') ? 'text-amber-400' : ''}
              ${line.includes('Final Result') ? 'text-white font-bold' : ''}
              ${!line.includes('[') && !line.includes('Final') ? 'text-[#CBD5E1]' : ''}
            `}
          >
            {line}
          </div>
        ))}
        <div className="flex items-center">
          <span className="text-[#6366F1] font-bold">~</span>
          <span className="ml-2 w-2 h-4 bg-[#CBD5E1] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
"""

# --- 4. VideoDemoSection.jsx (New) ---
video_demo_jsx = """
import { Play } from 'lucide-react';

export default function VideoDemoSection() {
  return (
    <section className="py-24 bg-[#0F172A] border-y border-[#334155]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#F8FAFC] mb-4">
            How Banknote AI Works
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-[#CBD5E1]">
            Watch our multi-agent pipeline identify, analyze, and verify a banknote in real-time.
          </p>
        </div>

        <div className="relative max-w-4xl mx-auto rounded-2xl overflow-hidden border border-[#334155] shadow-2xl bg-[#020617] aspect-video group cursor-pointer">
          {/* Placeholder for Video */}
          <div className="absolute inset-0 bg-[#1E293B]/50 flex items-center justify-center">
            <span className="text-[#CBD5E1]/30 font-mono text-xl tracking-widest">[ VIDEO PLACEHOLDER ]</span>
          </div>
          
          {/* Play Button Overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
            <div className="w-20 h-20 rounded-full bg-[#F8FAFC]/10 backdrop-blur-md border border-[#F8FAFC]/20 flex items-center justify-center text-[#F8FAFC] group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 ml-1 fill-current" />
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-6 gap-4 text-center max-w-4xl mx-auto">
          {["Upload Image", "YOLO Detection", "OpenAI Analysis", "Gemini Verification", "Google Lens", "Consensus Result"].map((step, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center text-xs font-bold text-[#CBD5E1] mb-2">
                {i + 1}
              </div>
              <span className="text-xs text-[#CBD5E1] font-medium leading-tight">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
"""

# --- 5. AgentSystemSection.jsx ---
agent_system_jsx = """
import { ScanLine, Bot, Sparkles, Search } from 'lucide-react';

export default function AgentSystemSection() {
  const agents = [
    { 
      icon: ScanLine, 
      label: "Pre-processing", 
      name: "YOLOv8 Cropper", 
      desc: "Isolates the banknote from the background, ensuring all downstream AI agents focus only on relevant pixels.",
      color: "text-blue-400",
      bg: "group-hover:bg-blue-400/10"
    },
    { 
      icon: Bot, 
      label: "Agent 1", 
      name: "OpenAI GPT-4o", 
      desc: "Performs OCR and logical reasoning on visible text, watermarks, and serial numbers to deduce currency origin.",
      color: "text-purple-400",
      bg: "group-hover:bg-purple-400/10"
    },
    { 
      icon: Sparkles, 
      label: "Agent 2", 
      name: "Google Gemini", 
      desc: "Applies deep multimodal analysis to verify historical figures and geometric patterns against its knowledge base.",
      color: "text-cyan-400",
      bg: "group-hover:bg-cyan-400/10"
    },
    { 
      icon: Search, 
      label: "Agent 3", 
      name: "Google Lens", 
      desc: "Executes a visual reverse search to compare the cropped region against millions of verified public datasets.",
      color: "text-amber-400",
      bg: "group-hover:bg-amber-400/10"
    }
  ];

  return (
    <section className="py-24 bg-[#0F172A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#F8FAFC] mb-4">
            The Architecture
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-[#CBD5E1]">
            A redundant, independent verification pipeline designed for zero-trust environments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {agents.map((agent, i) => {
            const Icon = agent.icon;
            return (
              <div 
                key={i} 
                className="group p-8 rounded-2xl bg-[#1E293B]/50 backdrop-blur-sm border border-[#334155] hover:border-[#6366F1]/50 transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`w-12 h-12 rounded-xl bg-[#020617] border border-[#334155] flex items-center justify-center mb-6 text-[#CBD5E1] transition-colors duration-300 ${agent.color} ${agent.bg}`}>
                  <Icon className="w-6 h-6" />
                </div>
                
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#CBD5E1] mb-2 block">
                  {agent.label}
                </span>
                
                <h3 className="text-xl font-bold text-[#F8FAFC] mb-3">
                  {agent.name}
                </h3>
                
                <p className="text-sm text-[#CBD5E1] leading-relaxed">
                  {agent.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
"""

# --- 6. SupportedCurrencies.jsx (New) ---
supported_currencies_jsx = """
export default function SupportedCurrencies() {
  const currencies = [
    { code: "VND", name: "Vietnamese Dong" },
    { code: "USD", name: "US Dollar" },
    { code: "EUR", name: "Euro" },
    { code: "JPY", name: "Japanese Yen" }
  ];

  return (
    <section className="py-24 bg-[#0F172A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-[#F8FAFC] mb-4">
            Supported Currencies
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-[#CBD5E1]">
            Out-of-the-box support for major global currencies, powered by extensive LLM knowledge graphs.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {currencies.map((currency, i) => (
            <div key={i} className="flex flex-col rounded-2xl overflow-hidden bg-[#1E293B]/50 border border-[#334155]">
              {/* Image Placeholder */}
              <div className="aspect-[4/3] bg-[#020617] flex items-center justify-center p-6 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[#334155]/20 to-transparent pointer-events-none" />
                <span className="text-[#334155] font-mono text-2xl font-bold">{currency.code}</span>
              </div>
              <div className="p-5 border-t border-[#334155]">
                <h4 className="text-lg font-semibold text-[#F8FAFC]">{currency.name}</h4>
                <p className="text-sm text-[#CBD5E1] mt-1">High Accuracy Model</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
"""

# --- 7. StatsSection.jsx ---
stats_section_jsx = """
export default function StatsSection() {
  const stats = [
    { label: "Analyses Performed", value: "1.2M+" },
    { label: "Consensus Accuracy", value: "99.8%" },
    { label: "Supported Regions", value: "20+" },
    { label: "Average Latency", value: "< 2.5s" },
  ];

  return (
    <section className="py-20 bg-[#020617] border-y border-[#334155]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 text-center lg:text-left">
          {stats.map((stat, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-4xl md:text-5xl font-bold text-[#F8FAFC] tracking-tight mb-2">
                {stat.value}
              </span>
              <span className="text-sm md:text-base text-[#CBD5E1] font-medium">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
"""

# --- 8. Footer.jsx (Enterprise SaaS) ---
footer_jsx = """
import { Link } from 'react-router-dom';
import { BoxSelect, Twitter, Github, Linkedin, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#020617] pt-20 pb-10 border-t border-[#334155] font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
          
          <div className="col-span-2 lg:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-6">
              <div className="text-[#F8FAFC]">
                <BoxSelect className="w-6 h-6 stroke-[1.5]" />
              </div>
              <span className="text-xl font-bold tracking-tight text-[#F8FAFC]">
                Banknote<span className="font-light text-[#CBD5E1]">AI</span>
              </span>
            </Link>
            <p className="text-[#CBD5E1] text-sm leading-relaxed max-w-xs mb-8">
              The enterprise-grade multi-agent computer vision platform for secure banknote verification.
            </p>
            <div className="flex items-center gap-4 text-[#CBD5E1]">
              <a href="#" className="hover:text-[#F8FAFC] transition-colors"><Twitter className="w-5 h-5" /></a>
              <a href="#" className="hover:text-[#F8FAFC] transition-colors"><Github className="w-5 h-5" /></a>
              <a href="#" className="hover:text-[#F8FAFC] transition-colors"><Linkedin className="w-5 h-5" /></a>
              <a href="mailto:contact@banknoteai.com" className="hover:text-[#F8FAFC] transition-colors"><Mail className="w-5 h-5" /></a>
            </div>
          </div>

          <div>
            <h4 className="text-[#F8FAFC] font-semibold mb-6 tracking-wide">Platform</h4>
            <ul className="space-y-4 text-sm text-[#CBD5E1]">
              <li><Link to="/workspace" className="hover:text-[#F8FAFC] transition-colors">Workspace</Link></li>
              <li><Link to="/directory" className="hover:text-[#F8FAFC] transition-colors">Directory</Link></li>
              <li><Link to="/pricing" className="hover:text-[#F8FAFC] transition-colors">Pricing</Link></li>
              <li><Link to="/exchange" className="hover:text-[#F8FAFC] transition-colors">Currency Exchange</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#F8FAFC] font-semibold mb-6 tracking-wide">Company</h4>
            <ul className="space-y-4 text-sm text-[#CBD5E1]">
              <li><Link to="/about" className="hover:text-[#F8FAFC] transition-colors">About Us</Link></li>
              <li><Link to="/support" className="hover:text-[#F8FAFC] transition-colors">Support</Link></li>
              <li><Link to="/contact" className="hover:text-[#F8FAFC] transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[#F8FAFC] font-semibold mb-6 tracking-wide">Legal</h4>
            <ul className="space-y-4 text-sm text-[#CBD5E1]">
              <li><Link to="/privacy-policy" className="hover:text-[#F8FAFC] transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms-of-service" className="hover:text-[#F8FAFC] transition-colors">Terms of Service</Link></li>
              <li><Link to="/data-deletion" className="hover:text-[#F8FAFC] transition-colors">Data Deletion</Link></li>
              <li><Link to="/ai-disclaimer" className="hover:text-[#F8FAFC] transition-colors">AI Disclaimer</Link></li>
            </ul>
          </div>
          
        </div>

        <div className="pt-8 border-t border-[#334155] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[#CBD5E1] text-xs">
            &copy; {new Date().getFullYear()} BanknoteAI Platform. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-xs font-mono text-[#CBD5E1]">All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
"""

# --- 9. Legal Pages Template ---
legal_template = """
export default function {Name}() {{
  return (
    <div className="min-h-screen bg-[#0F172A] pt-32 pb-24 text-[#F8FAFC] font-sans">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight mb-8">{Title}</h1>
        <div className="prose prose-invert prose-slate max-w-none">
          <p className="text-lg text-[#CBD5E1] mb-6">Last updated: June 15, 2026</p>
          <p className="text-[#CBD5E1] leading-relaxed mb-6">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. 
            Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          </p>
          <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#F8FAFC]">1. Information We Collect</h2>
          <p className="text-[#CBD5E1] leading-relaxed mb-6">
            Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. 
            Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          </p>
          {ExtraContent}
        </div>
      </div>
    </div>
  );
}}
"""

legal_pages = {
    "PrivacyPolicy": "Privacy Policy",
    "TermsOfService": "Terms of Service",
    "DataDeletion": "Data Deletion Request",
    "Support": "Support Center",
    "Contact": "Contact Us",
    "AiDisclaimer": "AI Disclaimer"
}


# --- Execute File Writing ---

write_file(f"{pages_base}/user/Home.jsx", home_jsx)
write_file(f"{base}/home/HeroSection.jsx", hero_section_jsx)
write_file(f"{base}/home/HeroMockup.jsx", hero_mockup_jsx)
write_file(f"{base}/home/VideoDemoSection.jsx", video_demo_jsx)
write_file(f"{base}/home/AgentSystemSection.jsx", agent_system_jsx)
write_file(f"{base}/home/SupportedCurrencies.jsx", supported_currencies_jsx)
write_file(f"{base}/home/StatsSection.jsx", stats_section_jsx)
write_file(f"{base}/layout/Footer.jsx", footer_jsx)

# Legal pages
for name, title in legal_pages.items():
    content = legal_template.format(Name=name, Title=title, ExtraContent="")
    write_file(f"{pages_base}/legal/{name}.jsx", content)

# --- 10. Update AppRoutes.jsx ---
app_routes_path = "client/src/routes/AppRoutes.jsx"
with open(app_routes_path, 'r', encoding='utf-8') as f:
    routes_content = f.read()

# Add missing imports for legal pages
imports_to_add = """
import DataDeletion from "../pages/legal/DataDeletion.jsx";
import Support from "../pages/legal/Support.jsx";
import Contact from "../pages/legal/Contact.jsx";
import AiDisclaimer from "../pages/legal/AiDisclaimer.jsx";
"""

if "import DataDeletion" not in routes_content:
    routes_content = routes_content.replace(
        "import TermsOfService from \"../pages/legal/TermsOfService.jsx\";",
        "import TermsOfService from \"../pages/legal/TermsOfService.jsx\";" + imports_to_add
    )

# Add routes
routes_to_add = """
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="/support" element={<Support />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/ai-disclaimer" element={<AiDisclaimer />} />
"""

if "/data-deletion" not in routes_content:
    routes_content = routes_content.replace(
        "<Route path=\"/terms\" element={<TermsOfService />} />",
        "<Route path=\"/terms-of-service\" element={<TermsOfService />} />\n          <Route path=\"/privacy-policy\" element={<PrivacyPolicy />} />" + routes_to_add
    )

with open(app_routes_path, 'w', encoding='utf-8') as f:
    f.write(routes_content)
print(f"Updated {app_routes_path}")

# Update MainLayout to ensure Footer is there if it isn't
main_layout_path = "client/src/layouts/MainLayout.jsx"
with open(main_layout_path, 'r', encoding='utf-8') as f:
    main_layout_content = f.read()

if "Footer" not in main_layout_content:
    main_layout_content = main_layout_content.replace(
        "import Header from \"../components/layout/Header\";",
        "import Header from \"../components/layout/Header\";\nimport Footer from \"../components/layout/Footer\";"
    )
    main_layout_content = main_layout_content.replace(
        "</main>",
        "</main>\n      <Footer />"
    )
    with open(main_layout_path, 'w', encoding='utf-8') as f:
        f.write(main_layout_content)
    print(f"Updated {main_layout_path}")

