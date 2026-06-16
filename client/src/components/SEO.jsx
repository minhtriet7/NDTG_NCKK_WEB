import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useAppStore } from '../store/appStore';

export default function SEO({ 
  title, 
  description, 
  keywords, 
  ogImage, 
  noindex = false,
  isApp = false // Flag cho biết đây là trang App hay Admin
}) {
  const { lang } = useAppStore();
  
  // Tên thương hiệu cơ sở
  const siteName = "BanknoteAI";
  
  // Hậu tố thay đổi tuỳ thuộc vào trang App hay Admin
  const suffix = isApp ? siteName : `${siteName} Admin`;

  // Tạo Title hoàn chỉnh
  const fullTitle = title ? `${title} | ${suffix}` : suffix;

  // Mô tả mặc định nếu không truyền
  const defaultDesc = lang === 'VI' 
    ? "Hệ thống Nhận dạng Tiền giấy Ứng dụng Trí tuệ Nhân tạo Đa tác tử."
    : "Multi-Agent AI Banknote Recognition System.";

  const finalDesc = description || defaultDesc;

  return (
    <Helmet>
      {/* Thẻ cơ bản */}
      <title>{fullTitle}</title>
      <meta name="description" content={finalDesc} />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Chống lập chỉ mục cho trang Admin hoặc các trang yêu cầu bảo mật */}
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph (Facebook/Zalo) */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={finalDesc} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={siteName} />
      {ogImage && <meta property="og:image" content={ogImage} />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={finalDesc} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
    </Helmet>
  );
}
