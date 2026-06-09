"""
Test logic hotfix Agent 1 confidence threshold — KHÔNG gọi model thật.
"""
import sys, os
sys.path.insert(0, '.')

# Patch torch/YOLO trước khi import để tránh load model thật
import types
fake_torch = types.ModuleType('torch')
fake_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
sys.modules.setdefault('torch', fake_torch)
sys.modules.setdefault('torchvision', types.ModuleType('torchvision'))
sys.modules.setdefault('torchvision.transforms', types.ModuleType('torchvision.transforms'))
sys.modules.setdefault('torchvision.models', types.ModuleType('torchvision.models'))
sys.modules.setdefault('ultralytics', types.ModuleType('ultralytics'))

# Import hàm cần test
from app.agents.agent_1_ml import _build_completed_item, RES_CONF_MIN_THRESHOLD

print(f"RES_CONF_MIN_THRESHOLD = {RES_CONF_MIN_THRESHOLD}")
print()

# Helper
def make_classification(conf, class_name="cambodia_khr_5000", country="Campuchia", denom="5000 KHR"):
    return {
        "class_name": class_name,
        "quoc_gia": country,
        "menh_gia": denom,
        "confidence": conf,
        "top_predictions": [
            {"class_name": "cambodia_khr_5000",  "menh_gia": "5000 KHR",   "confidence": conf},
            {"class_name": "vietnam_vnd_50000",   "menh_gia": "50000 VND",  "confidence": 0.18},
            {"class_name": "vietnam_vnd_200000",  "menh_gia": "200000 VND", "confidence": 0.12},
        ]
    }

def make_detection(yolo_conf=0.85):
    return {"x1":0,"y1":0,"x2":100,"y2":50,"confidence":yolo_conf,"class_name":"banknote"}

PASS = 0
FAIL = 0

def check(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        print(f"  [PASS] {name}")
        PASS += 1
    else:
        print(f"  [FAIL] {name} | {detail}")
        FAIL += 1

# =============================================
# TEST 1 — Low confidence → status=Failed
# =============================================
print("=== TEST 1: conf=0.22 (< 0.50) → Expected: Failed ===")
result = _build_completed_item(make_detection(), make_classification(0.22), index=1)
check("status == 'Failed'",            result["status"] == "Failed",            result["status"])
check("menh_gia == 'Không xác định'",  "xác định" in result["menh_gia"],        result["menh_gia"])
check("quoc_gia == 'Không xác định'",  "xác định" in result["quoc_gia"],        result["quoc_gia"])
check("top_predictions is list",       isinstance(result["top_predictions"], list))
check("top_predictions len >= 1",      len(result["top_predictions"]) >= 1)
check("quan_diem has Top1",            "Top1=" in result["quan_diem"],          result["quan_diem"][:80])
check("quan_diem has Top3",            "Top3:" in result["quan_diem"],          result["quan_diem"][:80])
check("quan_diem has threshold",       "threshold=" in result["quan_diem"],     result["quan_diem"][:80])
check("phuong_phap has rejected",      "rejected" in result["phuong_phap"],     result["phuong_phap"])
print()

# =============================================
# TEST 2 — High confidence → status=Completed
# =============================================
print("=== TEST 2: conf=0.80 (>= 0.50) → Expected: Completed ===")
result2 = _build_completed_item(make_detection(), make_classification(0.80, "vietnam_vnd_50000", "Việt Nam", "50000 VND"), index=1)
check("status == 'Completed'",         result2["status"] == "Completed",        result2["status"])
check("menh_gia == '50000 VND'",       result2["menh_gia"] == "50000 VND",      result2["menh_gia"])
check("quoc_gia == 'Việt Nam'",        result2["quoc_gia"] == "Việt Nam",       result2["quoc_gia"])
check("top_predictions is list",       isinstance(result2["top_predictions"], list))
check("quan_diem has Top3",            "Top3:" in result2["quan_diem"],         result2["quan_diem"][:80])
check("phuong_phap no rejected",       "rejected" not in result2["phuong_phap"],result2["phuong_phap"])
print()

# =============================================
# TEST 3 — classification=None (YOLO only)
# =============================================
print("=== TEST 3: classification=None → Expected: Partial ===")
result3 = _build_completed_item(make_detection(), None, index=1)
check("status == 'Partial'",           result3["status"] == "Partial",         result3["status"])
check("menh_gia == 'Không xác định'",  "xác định" in result3["menh_gia"],      result3["menh_gia"])
print()

# =============================================
# TEST 4 — Aggregator logic simulation
# =============================================
print("=== TEST 4: Aggregator sẽ loại Failed agent? ===")
INVALID_VALUES = {"", "không xác định", "khong xac dinh", "none", "null", "failed", "fail", "n/a", "na", "unknown", "error", "lỗi", "loi"}

def normalize_text(v):
    return str(v).strip().lower() if v else ""

def is_valid_agent(agent):
    if not agent:
        return False
    status = normalize_text(agent.get("status"))
    if status == "failed":
        return False
    menh_gia = normalize_text(agent.get("menh_gia", ""))
    if menh_gia in INVALID_VALUES:
        return False
    return True

check("conf=0.22 agent is INVALID (aggregator loại)", not is_valid_agent(result),  "should be excluded")
check("conf=0.80 agent is VALID (aggregator tính)",   is_valid_agent(result2),     "should be included")
check("Partial agent is INVALID (aggregator loại)",   not is_valid_agent(result3), "should be excluded")
print()

# =============================================
# SUMMARY
# =============================================
total = PASS + FAIL
print(f"=== RESULT: {PASS}/{total} PASSED, {FAIL} FAILED ===")
if FAIL == 0:
    print("ALL TESTS PASSED OK")
else:
    print("SOME TESTS FAILED - review above")
    sys.exit(1)
