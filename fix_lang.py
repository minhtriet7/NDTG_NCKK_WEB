import json
import os
import re

# 1. Update i18n JSON files for Header
en_path = "client/src/locales/en/translation.json"
vi_path = "client/src/locales/vi/translation.json"

header_en = {
  "header": {
    "home": "Home",
    "dir": "Directory",
    "ex": "Exchange",
    "workspace": "Workspace",
    "history": "History",
    "pricing": "Pricing",
    "login": "Log in",
    "signup": "Sign up",
    "logoutSuccess": "Logged out successfully!",
    "confirm": "Log out",
    "logoutConfirmTitle": "Confirm Logout",
    "logoutConfirmDesc": "Are you sure you want to log out of your account?",
    "cancel": "Cancel"
  }
}

header_vi = {
  "header": {
    "home": "Trang chủ",
    "dir": "Danh mục",
    "ex": "Tỷ giá",
    "workspace": "Không gian làm việc",
    "history": "Lịch sử",
    "pricing": "Bảng giá",
    "login": "Đăng nhập",
    "signup": "Đăng ký",
    "logoutSuccess": "Đăng xuất thành công!",
    "confirm": "Đăng xuất",
    "logoutConfirmTitle": "Xác nhận Đăng xuất",
    "logoutConfirmDesc": "Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?",
    "cancel": "Hủy"
  }
}

def update_json(path, new_data):
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    data.update(new_data)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

update_json(en_path, header_en)
update_json(vi_path, header_vi)

# 2. Fix Logo size in Header.jsx
header_jsx = "client/src/components/layout/Header.jsx"
with open(header_jsx, 'r', encoding='utf-8') as f:
    content = f.read()

# Make the logo container wider and slightly taller
content = content.replace(
    '<div className="w-8 h-8 flex items-center justify-center">',
    '<div className="h-10 w-auto flex items-center justify-center">'
)
# Hide the text "BanknoteAI" since the logo image already has text (most likely)
content = content.replace(
    '<span className="text-xl font-bold tracking-tight text-foreground dark:text-[#F8FAFC]">',
    '<span className="hidden text-xl font-bold tracking-tight text-foreground dark:text-[#F8FAFC]">'
)

with open(header_jsx, 'w', encoding='utf-8') as f:
    f.write(content)

# 3. Fix Logo size in Footer.jsx
footer_jsx = "client/src/components/layout/Footer.jsx"
with open(footer_jsx, 'r', encoding='utf-8') as f:
    f_content = f.read()

f_content = f_content.replace(
    '<div className="w-6 h-6 flex items-center justify-center">',
    '<div className="h-10 w-auto flex items-center justify-center">'
)
f_content = f_content.replace(
    '<span className="text-xl font-bold tracking-tight text-foreground dark:text-[#F8FAFC]">',
    '<span className="hidden text-xl font-bold tracking-tight text-foreground dark:text-[#F8FAFC]">'
)

with open(footer_jsx, 'w', encoding='utf-8') as f:
    f.write(f_content)

# 4. Fix ThemeLangToggle.jsx to strictly call i18n.changeLanguage
toggle_jsx = "client/src/components/common/ThemeLangToggle.jsx"
with open(toggle_jsx, 'r', encoding='utf-8') as f:
    t_content = f.read()

if "import { useTranslation } from" not in t_content:
    t_content = t_content.replace('import React from "react";', 'import React from "react";\nimport { useTranslation } from "react-i18next";')

if "const { i18n } = useTranslation();" not in t_content:
    t_content = t_content.replace('const appStore = useAppStore();', 'const appStore = useAppStore();\n  const { i18n } = useTranslation();')

if "i18n.changeLanguage" not in t_content:
    t_content = t_content.replace(
        'useLanguageStore.getState().setLanguage(nextLang);\n    }',
        'useLanguageStore.getState().setLanguage(nextLang);\n    }\n\n    if (i18n && typeof i18n.changeLanguage === "function") {\n      i18n.changeLanguage(nextLang.toLowerCase());\n    }'
    )

with open(toggle_jsx, 'w', encoding='utf-8') as f:
    f.write(t_content)

print("Fixes applied.")
