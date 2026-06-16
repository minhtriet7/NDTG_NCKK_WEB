import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store/appStore";
import { useAuthStore } from "../../store/authStore";

import HeroSection from "../../components/home/HeroSection";
import StatsSection from "../../components/home/StatsSection";
import VideoDemoSection from "../../components/home/VideoDemoSection";
import WorkflowSection from "../../components/home/WorkflowSection";
import AgentSystemSection from "../../components/home/AgentSystemSection";

import { ScanLine, Target, Globe, Database } from "lucide-react";

export default function Home() {
  const { t, i18n } = useTranslation();
  const { lang } = useAppStore();
  const { isAuthenticated, user } = useAuthStore();
  
  useEffect(() => {
    // Đảm bảo i18n tồn tại và có hàm changeLanguage trước khi gọi để tránh lỗi trắng trang
    if (lang && i18n && typeof i18n.changeLanguage === 'function') {
      if (i18n.language !== lang.toLowerCase()) {
        i18n.changeLanguage(lang.toLowerCase());
      }
    }
  }, [lang, i18n]);

  const tokenBalance = isAuthenticated && user?.token_balance != null ? user.token_balance : null;

  const mockStats = [
    { label: t('stats.label1', 'Lượt nhận diện'), value: '1.2M+', icon: ScanLine },
    { label: t('stats.label2', 'Độ chính xác'), value: '98.5%', icon: Target },
    { label: t('stats.label3', 'Quốc gia hỗ trợ'), value: '10+', icon: Globe },
    { label: t('stats.label4', 'Dữ liệu huấn luyện'), value: '500K+', icon: Database },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300 pb-20">
      <HeroSection isAuthenticated={isAuthenticated} tokenBalance={tokenBalance} />
      <StatsSection stats={mockStats} />
      <VideoDemoSection />
      <WorkflowSection />
      <AgentSystemSection />
    </div>
  );
}
