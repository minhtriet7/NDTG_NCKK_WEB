import re

with open("client/src/pages/user/Result.old.jsx", "r", encoding="utf-16") as f:
    content = f.read()

replacements = [
    # Backgrounds
    (r"bg-white dark:bg-slate-900", "bg-surface"),
    (r"bg-slate-900 dark:bg-slate-950", "bg-surface"),
    (r"bg-white dark:bg-slate-[0-9]+", "bg-surface"),
    (r"bg-slate-50 dark:bg-slate-[0-9]+/?[0-9]*", "bg-black/5 dark:bg-white/5"),
    (r"bg-slate-100 dark:bg-slate-[0-9]+/?[0-9]*", "bg-black/10 dark:bg-white/10"),
    (r"bg-slate-950", "bg-black/90 dark:bg-black/40"),

    # Borders
    (r"border-slate-[0-9]+ dark:border-slate-[0-9]+/?[0-9]*", "border-border"),
    (r"border-slate-[0-9]+", "border-border"),
    
    # Text colors
    (r"text-slate-900 dark:text-slate-100", "text-foreground"),
    (r"text-slate-[87]00 dark:text-slate-[23]00", "text-foreground"),
    (r"text-slate-[45]00 dark:text-slate-[45]00", "text-muted-foreground"),
    (r"text-slate-[45]00", "text-muted-foreground"),

    # Primary colors
    (r"bg-slate-900 dark:bg-teal-600", "bg-primary"),
    (r"bg-teal-600", "bg-primary"),
    (r"text-teal-[67]00 dark:text-teal-[34]00", "text-primary"),
    (r"text-teal-[67]00", "text-primary"),
    (r"bg-teal-50 dark:bg-teal-[0-9]+/?[0-9]*", "bg-primary/10"),
    (r"border-teal-[0-9]+ dark:border-teal-[0-9]+/?[0-9]*", "border-primary/30"),
    (r"hover:bg-teal-500", "hover:opacity-90"),

    # Amber colors
    (r"bg-amber-50 dark:bg-amber-[0-9]+/?[0-9]*", "bg-amber-500/10"),
    (r"text-amber-[0-9]+ dark:text-amber-[0-9]+", "text-amber-600 dark:text-amber-400"),
    (r"border-amber-[0-9]+ dark:border-amber-[0-9]+/?[0-9]*", "border-amber-500/30"),
    
    # Hover states
    (r"hover:bg-slate-800 dark:hover:bg-teal-500", "hover:opacity-90"),
    (r"hover:bg-slate-50 dark:hover:bg-slate-800/?\d*", "hover:bg-black/5 dark:hover:bg-white/5"),
    
    # Rounded corners (optional tweak to match SaaS rounded-xl instead of 2xl/3xl)
    (r"rounded-3xl", "rounded-xl"),
    (r"rounded-2xl", "rounded-xl"),
    
    # Specific elements
    (r"max-w-3xl mx-auto font-sans py-12", "min-h-screen flex items-center justify-center bg-background text-foreground p-6"),
    (r"max-w-6xl mx-auto font-sans space-y-8 pb-12", "min-h-screen bg-background text-foreground py-10 px-4\n    <div className=\"max-w-6xl mx-auto space-y-6\">\n      {/* Wrapper to match SaaS layout */}"),
]

for p, r in replacements:
    content = re.sub(p, r, content)

# Fix the closing div for the wrapper
content = content.replace("export default function Result", "/* INJECTED BY CONVERT.PY */\nexport default function Result")
# Let's just output it
with open("client/src/pages/user/Result.jsx", "w", encoding="utf-16") as f:
    f.write(content)

print("Conversion complete!")
