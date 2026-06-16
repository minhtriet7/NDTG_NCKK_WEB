import os
import glob

def fix_colors_in_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Define color replacements
    replacements = {
        'bg-[#0F172A]': 'bg-background dark:bg-[#0F172A]',
        'bg-[#1E293B]': 'bg-surface dark:bg-[#1E293B]',
        'bg-[#020617]': 'bg-background/50 dark:bg-[#020617]',
        'border-[#334155]': 'border-border-theme dark:border-[#334155]',
        'text-[#F8FAFC]': 'text-foreground dark:text-[#F8FAFC]',
        'text-[#CBD5E1]': 'text-secondary dark:text-[#CBD5E1]',
        'from-[#334155]': 'from-border-theme dark:from-[#334155]',
        'bg-[#F8FAFC]': 'bg-foreground dark:bg-[#F8FAFC]',
        'text-[#0F172A]': 'text-background dark:text-[#0F172A]',
    }

    for old, new in replacements.items():
        # Prevent double replacements if script run multiple times
        if new not in content:
            content = content.replace(old, new)
            
    # Fix 'text-[#0F172A]' specifically in buttons if needed
    content = content.replace('text-background dark:text-[#0F172A] px-8', 'text-background dark:text-[#0F172A] px-8')
    content = content.replace('text-background dark:text-[#0F172A] px-5', 'text-background dark:text-[#0F172A] px-5')

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Fixed colors in {path}")

# List of files to process
files_to_fix = [
    'client/src/components/layout/Header.jsx',
    'client/src/components/layout/Footer.jsx',
    'client/src/components/home/HeroSection.jsx',
    'client/src/components/home/HeroMockup.jsx',
    'client/src/components/home/VideoDemoSection.jsx',
    'client/src/components/home/AgentSystemSection.jsx',
    'client/src/components/home/SupportedCurrencies.jsx',
    'client/src/components/home/StatsSection.jsx',
    'client/src/pages/user/Home.jsx'
]

# Add legal pages
files_to_fix.extend(glob.glob('client/src/pages/legal/*.jsx'))

for file in files_to_fix:
    if os.path.exists(file):
        fix_colors_in_file(file)

# --- Fix ThemeLangToggle.jsx Language Sync ---
toggle_path = 'client/src/components/common/ThemeLangToggle.jsx'
with open(toggle_path, 'r', encoding='utf-8') as f:
    toggle_content = f.read()

if "import { useLanguageStore }" not in toggle_content:
    toggle_content = toggle_content.replace(
        'import { useAppStore } from "../../store/appStore";',
        'import { useAppStore } from "../../store/appStore";\nimport { useLanguageStore } from "../../store/languageStore";'
    )

if "useLanguageStore.getState().setLanguage(" not in toggle_content:
    toggle_content = toggle_content.replace(
        'useAppStore.setState({ lang: nextLang });\n    }',
        'useAppStore.setState({ lang: nextLang });\n    }\n\n    // Synchronize with the secondary language store used by Result/History pages\n    if (typeof useLanguageStore.getState().setLanguage === "function") {\n      useLanguageStore.getState().setLanguage(nextLang);\n    }'
    )

with open(toggle_path, 'w', encoding='utf-8') as f:
    f.write(toggle_content)
print(f"Fixed language synchronization in {toggle_path}")

