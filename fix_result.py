import re

with open('client/src/pages/user/Result.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove 'React, '
content = content.replace('import React, { useEffect', 'import { useEffect')

# 2. Add missing icons and remove unused ones
content = content.replace('  MessageSquare,\n  RotateCcw,\n  Wallet,', '  Wallet,\n  Scan,\n  CheckCircle,\n  Search,')
content = content.replace('  MessageSquare,', '')
content = content.replace('  RotateCcw,', '')

# 3. Fix optional chaining
content = content.replace('(!obj.bbox)', '(!obj?.bbox)')

# 4. Remove SummaryCard (since it's unused)
content = re.sub(r'function SummaryCard\(\{[^}]+\}\) \{[^}]+\}', '', content, flags=re.DOTALL)
content = re.sub(r'function getConsensusStatusLabel.*?\n};', '', content, flags=re.DOTALL)
content = re.sub(r'function getConsensusBadgeClass.*?\n};', '', content, flags=re.DOTALL)

# 5. Fix useMemo hook position (move early return below useMemo)
early_return = """  if (!currentItem) {
    return (
      <div className="min-h-screen bg-[#0B1020] font-sans flex items-center justify-center p-6">
        <div className="bg-[#141B34] border border-[#3157F6]/30 rounded-[24px] p-8 text-center max-w-lg shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{t.noResult}</h2>
          <p className="text-slate-400 mb-8">{t.noResultDesc}</p>
          <button onClick={() => navigate("/recognize")} className="px-6 py-3 rounded-xl bg-[#3157F6] text-white font-bold hover:bg-[#3157F6]/80 transition w-full">
            {t.backWorkspace}
          </button>
        </div>
      </div>
    );
  }"""

content = content.replace(early_return, "")

# We need to compute exchangeResults safely and put early return right before the main return statement.
# Let's insert the early return before the first `<div className="min-h-screen bg-[#0B1020]` of the main return

# Actually, the safest way is to just wrap the useMemo content:
# `const finalDenomination = currentItem ? normalizeText(currentItem.data?.denomination) : "N/A";`
# and move the early return right before the `return (` of the component.

# Let's do it manually with regex.
# Replace the old finalDenomination logic
old_data_extract = """  const finalData = currentItem?.data || {};
  const agents = currentItem?.agents || {};
  const consensus = currentItem?.consensus || {};

  const finalDenomination = normalizeText(finalData.denomination);
  const finalCountry = normalizeText(finalData.country);
  const finalCurrency = normalizeText(finalData.currency);
  const finalMaterial = normalizeText(finalData.material);
  const matchedAgents = Number(consensus?.matched_agents || 0);"""

new_data_extract = """  const finalData = currentItem?.data || {};
  const agents = currentItem?.agents || {};
  const consensus = currentItem?.consensus || {};

  const finalDenomination = normalizeText(finalData?.denomination);
  const finalCountry = normalizeText(finalData?.country);
  const finalCurrency = normalizeText(finalData?.currency);
  const finalMaterial = normalizeText(finalData?.material);
  const matchedAgents = Number(consensus?.matched_agents || 0);"""

content = content.replace(old_data_extract, new_data_extract)

# Now, we insert the early return back, right before `return (`
content = content.replace('  return (\n    <div className="min-h-screen bg-[#0B1020] text-[#F8FAFC]', f'{early_return}\n\n  return (\n    <div className="min-h-screen bg-[#0B1020] text-[#F8FAFC]')

with open('client/src/pages/user/Result.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

