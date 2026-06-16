import json
import os
import re

# 1. Update translation JSONs
en_path = "client/src/locales/en/translation.json"
vi_path = "client/src/locales/vi/translation.json"

exch_en = {
    "title": "Market Exchange Converter",
    "subtitle": "Convert supported currencies using the latest rates cached by BanknoteAI.",
    "source": "Source",
    "provider": "Provider",
    "active": "Active currencies",
    "lastUpdated": "Last updated",
    "amtFrom": "Amount & From",
    "convertedTo": "Converted To",
    "scanBtn": "Scan a Banknote",
    "btnRefresh": "Refresh",
    "info": "Rates are for informational purposes only.",
    "staleWarn": "Rates may be outdated. Please verify before using them for real transactions.",
    "noRates": "No market rates configured.",
    "fresh": "Fresh",
    "stale": "Stale",
    "loadError": "Unable to load exchange rates."
}

exch_vi = {
    "title": "Quy đổi Tỷ giá Thị trường",
    "subtitle": "Quy đổi các đồng tiền bằng tỷ giá mới nhất được lưu trong BanknoteAI.",
    "source": "Nguồn",
    "provider": "Nhà cung cấp",
    "active": "Tiền tệ đang bật",
    "lastUpdated": "Cập nhật lần cuối",
    "amtFrom": "Số lượng & Từ",
    "convertedTo": "Thành tiền",
    "scanBtn": "Quét Tiền Giấy",
    "btnRefresh": "Làm mới",
    "info": "Tỷ giá chỉ mang tính chất tham khảo.",
    "staleWarn": "Tỷ giá có thể đã cũ. Vui lòng kiểm tra trước khi dùng cho giao dịch thực tế.",
    "noRates": "Chưa có tỷ giá thị trường được cấu hình.",
    "fresh": "Mới",
    "stale": "Cũ",
    "loadError": "Không thể tải tỷ giá."
}

dir_en = {
    "title": "Banknote Directory",
    "subtitle": "Browse supported regional banknotes. Explore detailed metadata and AI compatibility.",
    "searchPlaceholder": "Search by country, currency code (e.g., VND, THB)...",
    "noResults": "No banknotes match your search criteria.",
    "material": "Material",
    "series": "Series",
    "features": "Key Features",
    "btnScan": "Scan Similar Note",
    "noImage": "Image not available",
    "reload": "Reload",
    "error": "Unable to load banknote directory."
}

dir_vi = {
    "title": "Từ Điển Tiền Giấy",
    "subtitle": "Tra cứu các loại tiền tệ được hệ thống AI hỗ trợ. Xem chi tiết thông số và hình ảnh gốc.",
    "searchPlaceholder": "Tìm theo quốc gia, mã tiền tệ (VD: VND, THB)...",
    "noResults": "Không tìm thấy tờ tiền nào phù hợp với từ khóa.",
    "material": "Chất liệu",
    "series": "Năm phát hành",
    "features": "Đặc điểm nhận dạng",
    "btnScan": "Quét tờ tiền tương tự",
    "noImage": "Chưa có hình ảnh gốc",
    "reload": "Tải lại",
    "error": "Không thể tải danh mục tiền giấy."
}

def update_json(path, exch, direct):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    data["exchange"] = exch
    data["directory"] = direct
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

update_json(en_path, exch_en, dir_en)
update_json(vi_path, exch_vi, dir_vi)

# 2. Update CurrencyConverter.jsx
cc_path = "client/src/pages/user/CurrencyConverter.jsx"
with open(cc_path, 'r', encoding='utf-8') as f:
    cc_content = f.read()

# Replace block and inject useTranslation
if "import { useTranslation } from" not in cc_content:
    cc_content = cc_content.replace('import React, { useEffect', 'import { useTranslation } from "react-i18next";\nimport React, { useEffect')

# Find the block from const t = { ... }[lang || "EN"]; and replace it
cc_block_pattern = re.compile(r'const t = \{[\s\S]*?\}\[lang \|\| "EN"\];', re.MULTILINE)
cc_content = cc_block_pattern.sub('const { t } = useTranslation();', cc_content)

# Replace t.xyz with t('exchange.xyz')
cc_content = re.sub(r'\bt\.(\w+)\b', r"t('exchange.\1')", cc_content)
# Fix t('exchange.EN') or anything like that if they exist (they shouldn't)

with open(cc_path, 'w', encoding='utf-8') as f:
    f.write(cc_content)

# 3. Update BanknoteDirectory.jsx
bd_path = "client/src/pages/user/BanknoteDirectory.jsx"
with open(bd_path, 'r', encoding='utf-8') as f:
    bd_content = f.read()

if "import { useTranslation } from" not in bd_content:
    bd_content = bd_content.replace('import React, { useEffect', 'import { useTranslation } from "react-i18next";\nimport React, { useEffect')

bd_block_pattern = re.compile(r'const t = \{[\s\S]*?\};\s*const text = t\[lang \|\| "EN"\] \|\| t\.EN;', re.MULTILINE)
bd_content = bd_block_pattern.sub('const { t } = useTranslation();', bd_content)

bd_content = re.sub(r'\btext\.(\w+)\b', r"t('directory.\1')", bd_content)

with open(bd_path, 'w', encoding='utf-8') as f:
    f.write(bd_content)

print("Conversion complete.")
