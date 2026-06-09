content = open('app/agents/agent_1_ml.py', encoding='utf-8').read()
checks = [
    'RES_CONF_MIN_THRESHOLD',
    'AGENT1_RES_CONF_MIN',
    'LOW CONFIDENCE',
    'top_predictions',
    'top3_summary',
    'status = "Failed"',
    'res_conf < RES_CONF_MIN_THRESHOLD',
    'p.get(',
]
for kw in checks:
    found = kw in content
    print(f'[{"OK" if found else "MISSING"}] {kw}')
