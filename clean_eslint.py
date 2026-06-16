import os

files = [
    'client/src/components/home/AgentSystemSection.jsx',
    'client/src/components/home/HeroMockup.jsx',
    'client/src/components/home/HeroSection.jsx',
    'client/src/components/home/StatsSection.jsx',
    'client/src/components/layout/Header.jsx'
]

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove 'import React from 'react';'
    content = content.replace("import React from 'react';\n", '')
    content = content.replace("import React from \"react\";\n", '')
    
    # Remove 'import React, { ... }'
    content = content.replace('import React, {', 'import {')
    
    # Header.jsx fixes
    if 'Header.jsx' in file:
        content = content.replace('AlertCircle, X, BoxSelect', 'AlertCircle, BoxSelect')
    
    # HeroSection.jsx fixes
    if 'HeroSection.jsx' in file:
        content = content.replace('const { t } = useTranslation();\n', '')
        content = content.replace("import { useTranslation } from 'react-i18next';\n", '')
        
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
