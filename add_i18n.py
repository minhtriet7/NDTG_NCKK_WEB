import json
import os
import re

# 1. Update JSON files
en_path = "client/src/locales/en/translation.json"
vi_path = "client/src/locales/vi/translation.json"

landing_en = {
  "landing": {
    "hero_badge": "ENTERPRISE COMPUTER VISION",
    "hero_title": "Verify banknotes with multi-agent intelligence.",
    "hero_desc": "An advanced AI workflow combining visual cropping, LLM reasoning, and multimodal search to establish absolute ground truth.",
    "btn_start": "Start Workspace",
    "btn_docs": "View Documentation",
    "video_title": "How Banknote AI Works",
    "video_desc": "Watch our multi-agent pipeline identify, analyze, and verify a banknote in real-time.",
    "agents_title": "The Architecture",
    "agents_desc": "A redundant, independent verification pipeline designed for zero-trust environments.",
    "curr_title": "Supported Currencies",
    "curr_desc": "Out-of-the-box support for major global currencies, powered by extensive LLM knowledge graphs."
  }
}

landing_vi = {
  "landing": {
    "hero_badge": "THỊ GIÁC MÁY TÍNH DOANH NGHIỆP",
    "hero_title": "Xác thực tiền giấy bằng trí tuệ nhân tạo đa luồng.",
    "hero_desc": "Một quy trình AI tiên tiến kết hợp cắt ảnh tự động, phân tích LLM và tìm kiếm đa phương thức để xác thực độ chính xác tuyệt đối.",
    "btn_start": "Mở Không gian làm việc",
    "btn_docs": "Xem Tài liệu hướng dẫn",
    "video_title": "Banknote AI Hoạt Động Thế Nào?",
    "video_desc": "Theo dõi quy trình nhận diện, phân tích và xác thực tiền giấy của chúng tôi trong thời gian thực.",
    "agents_title": "Kiến Trúc Hệ Thống",
    "agents_desc": "Hệ thống đường ống xác thực độc lập, đa tầng được thiết kế cho môi trường độ tin cậy cao.",
    "curr_title": "Hỗ Trợ Đa Tiền Tệ",
    "curr_desc": "Sẵn sàng hỗ trợ các loại tiền tệ phổ biến trên thế giới, được vận hành bởi mạng lưới tri thức LLM sâu rộng."
  }
}

def update_json(path, new_data):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    data.update(new_data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

update_json(en_path, landing_en)
update_json(vi_path, landing_vi)

# 2. Update Components
def inject_useTranslation(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "useTranslation" not in content:
        content = content.replace('import', 'import { useTranslation } from "react-i18next";\nimport', 1)
        content = re.sub(r'export default function (\w+)\((.*?)\) {', r'export default function \1(\2) {\n  const { t } = useTranslation();', content)
        
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# HeroSection
inject_useTranslation('client/src/components/home/HeroSection.jsx', {
    'ENTERPRISE COMPUTER VISION': "{t('landing.hero_badge', 'ENTERPRISE COMPUTER VISION')}",
    'Verify banknotes with <br className="hidden md:block"/>\n              <span className="text-[#6366F1]">multi-agent</span> intelligence.': "{t('landing.hero_title', 'Verify banknotes with multi-agent intelligence.')}",
    'An advanced AI workflow combining visual cropping, LLM reasoning, and multimodal search to establish absolute ground truth.': "{t('landing.hero_desc', 'An advanced AI workflow combining visual cropping, LLM reasoning, and multimodal search to establish absolute ground truth.')}",
    'Start Workspace': "{t('landing.btn_start', 'Start Workspace')}",
    'View Documentation': "{t('landing.btn_docs', 'View Documentation')}"
})

# VideoDemoSection
inject_useTranslation('client/src/components/home/VideoDemoSection.jsx', {
    'How Banknote AI Works': "{t('landing.video_title', 'How Banknote AI Works')}",
    'Watch our multi-agent pipeline identify, analyze, and verify a banknote in real-time.': "{t('landing.video_desc', 'Watch our multi-agent pipeline identify, analyze, and verify a banknote in real-time.')}"
})

# AgentSystemSection
inject_useTranslation('client/src/components/home/AgentSystemSection.jsx', {
    'The Architecture': "{t('landing.agents_title', 'The Architecture')}",
    'A redundant, independent verification pipeline designed for zero-trust environments.': "{t('landing.agents_desc', 'A redundant, independent verification pipeline designed for zero-trust environments.')}"
})

# SupportedCurrencies
inject_useTranslation('client/src/components/home/SupportedCurrencies.jsx', {
    'Supported Currencies': "{t('landing.curr_title', 'Supported Currencies')}",
    'Out-of-the-box support for major global currencies, powered by extensive LLM knowledge graphs.': "{t('landing.curr_desc', 'Out-of-the-box support for major global currencies, powered by extensive LLM knowledge graphs.')}"
})
