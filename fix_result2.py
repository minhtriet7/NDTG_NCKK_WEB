import re

with open('client/src/pages/user/Result.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove unused functions
content = re.sub(r'const getConsensusStatusLabel = .*?\n};', '', content, flags=re.DOTALL)
content = re.sub(r'const getConsensusBadgeClass = .*?\n};', '', content, flags=re.DOTALL)

# Fix optional chaining issue
old_line = "{imageSize && (currentItem?.multi_object ? currentItem?.detected_objects : [currentItem?.detected_objects?.[0]]).filter(Boolean).map((obj, i) => {"
new_line = "{imageSize && (currentItem?.multi_object ? currentItem?.detected_objects || [] : [currentItem?.detected_objects?.[0]]).filter(Boolean).map((obj, i) => {"
content = content.replace(old_line, new_line)

with open('client/src/pages/user/Result.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
