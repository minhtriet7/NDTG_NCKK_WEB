import os
import re
import json
import asyncio
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

# Optional imports: code vẫn không chết nếu máy chưa cài model/lib
try:
    import torch
    import torch.nn as nn
    from torchvision import transforms, models
except Exception:
    torch = None
    nn = None
    transforms = None
    models = None

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None


# ============================================================
# Agent 1 — ML/DL Agent
# Nhiệm vụ:
# 1. YOLO: phát hiện/khoanh vùng tờ tiền giấy.
# 2. RES/EfficientNet/ResNet: phân loại crop thành quốc gia + mệnh giá.
# 3. Trả JSON cùng format với Agent 2/Agent 3/Aggregator.
#
# Dùng được ngay cả khi bạn chưa train xong:
# - Nếu thiếu YOLO: trả fallback.
# - Nếu thiếu RES: vẫn trả bbox YOLO + "Không xác định" mệnh giá.
# ============================================================


# ============================================================
# Config đường dẫn model
# ============================================================

YOLO_MODEL_PATH = os.getenv(
    "AGENT1_YOLO_MODEL_PATH",
    "ml_models/yolo/best.pt" 
)

RES_MODEL_PATH = os.getenv(
    "AGENT1_RES_MODEL_PATH",
    "ml_models/res/banknote_resnet50_stable_best.pth" 
)

RES_CLASSES_PATH = os.getenv(
    "AGENT1_RES_CLASSES_PATH",
    "ml_models/res/classes.txt"  
)

YOLO_CONF_THRES = float(os.getenv("AGENT1_YOLO_CONF", "0.25"))
YOLO_IMG_SIZE = int(os.getenv("AGENT1_YOLO_IMGSZ", "640"))
RES_IMG_SIZE = int(os.getenv("AGENT1_RES_IMGSZ", "224"))

# Ngưỡng confidence tối thiểu của ResNet.
# Nếu top1 confidence < threshold → Agent 1 trả status="Failed"
# để Aggregator không tính vote sai vào majority vote.
# Override qua env var: AGENT1_RES_CONF_MIN=0.60
RES_CONF_MIN_THRESHOLD = float(os.getenv("AGENT1_RES_CONF_MIN", "0.70"))


# ============================================================
# Southeast Asia class mapping
# Class train của bạn dạng:
# cambodia_khr_100
# vietnam_vnd_500000
# thailand_thb_100
# ============================================================

COUNTRY_NAME_VI = {
    "vietnam": "Việt Nam",
    "thailand": "Thái Lan",
    "laos": "Lào",
    "cambodia": "Campuchia",
    "myanmar": "Myanmar",
    "malaysia": "Malaysia",
    "singapore": "Singapore",
    "indonesia": "Indonesia",
    "philippines": "Philippines",
    "brunei": "Brunei",
    "timor": "Timor-Leste",
    "timor_leste": "Timor-Leste",
}

CURRENCY_CODE = {
    "vnd": "VND",
    "thb": "THB",
    "lak": "LAK",
    "khr": "KHR",
    "mmk": "MMK",
    "myr": "MYR",
    "sgd": "SGD",
    "idr": "IDR",
    "php": "PHP",
    "bnd": "BND",
    "usd": "USD",
}


INVALID_RESULT_JSON = {
    "quoc_gia": "Không xác định",
    "ma_tien_te": "Không xác định",
    "menh_gia": "Không xác định",
    "mat_tien": "Không xác định",
    "nam_phat_hanh": "Không xác định",
    "chat_lieu": "Không xác định",
    "mo_ta": "Agent 1 chưa đủ dữ liệu để kết luận.",
    "quan_diem": "Không có dự đoán hợp lệ từ mô hình ML/DL.",
    "phuong_phap": "Agent 1 ML/DL",
    "do_tin_cay": 0.0,
    "van_ban_nhin_thay": [],
    "dac_diem_chinh": [],
    "bbox": None,
    "status": "Failed",
}


# ============================================================
# Utility
# ============================================================

def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _clamp01(x: Any) -> float:
    v = _safe_float(x, 0.0)
    return max(0.0, min(1.0, v))


def _read_image(image_bytes: bytes) -> Image.Image:
    return Image.open(BytesIO(image_bytes)).convert("RGB")


def _to_json_list(items: List[Dict[str, Any]]) -> str:
    return json.dumps(items, ensure_ascii=False)


def _error_response(message: str) -> str:
    item = dict(INVALID_RESULT_JSON)
    item["quan_diem"] = message
    item["status"] = "Failed"
    return _to_json_list([item])


def _load_classes_from_txt(path: str) -> Optional[List[str]]:
    if not path or not os.path.exists(path):
        return None

    classes = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            c = line.strip()
            if c:
                classes.append(c)

    return classes or None


def _parse_checkpoint_classes(checkpoint: Dict[str, Any]) -> Optional[List[str]]:
    classes = checkpoint.get("classes")
    if isinstance(classes, list) and classes:
        return [str(c) for c in classes]
    return None


def _parse_class_name(class_name: str) -> Tuple[str, str, str]:
    """
    Input:
      vietnam_vnd_500000
      cambodia_khr_1000
      singapore_sgd_50

    Output:
      ("Việt Nam", "VND", "500000 VND", "vietnam_vnd_500000")
    """
    raw = str(class_name).strip()
    low = raw.lower()

    parts = low.split("_")

    country_key = None
    currency_key = None
    amount = None

    # Tìm currency
    for p in parts:
        if p in CURRENCY_CODE:
            currency_key = p
            break

    # Country thường là phần đầu
    if parts:
        if len(parts) >= 2 and parts[0] == "timor" and parts[1] == "leste":
            country_key = "timor_leste"
        else:
            country_key = parts[0]

    # Amount là số cuối
    for p in reversed(parts):
        if re.fullmatch(r"\d+", p):
            amount = p
            break

    country_vi = COUNTRY_NAME_VI.get(country_key or "", country_key or "Không xác định")
    currency = CURRENCY_CODE.get(currency_key or "", currency_key.upper() if currency_key else "")

    if amount and currency:
        denomination = f"{int(amount)} {currency}"
    elif amount:
        denomination = str(int(amount))
    else:
        denomination = "Không xác định"

    return country_vi, currency or "Không xác định", denomination, raw


def _guess_material(country: str, denomination: str) -> str:
    """
    Suy luận nhẹ chất liệu. Không chắc thì Không xác định.
    """
    text = f"{country} {denomination}".lower()

    if "việt nam" in text or "vnd" in text:
        # VND mệnh giá nhỏ cũ có giấy, nhưng đa số bộ demo hiện nay polymer với mệnh giá lớn.
        nums = re.findall(r"\d+", denomination)
        if nums:
            n = int(nums[0])
            if n >= 10000:
                return "Polymer"
        return "Không xác định"

    if "singapore" in text or "sgd" in text:
        return "Polymer / Giấy"

    if "malaysia" in text or "myr" in text:
        return "Polymer / Giấy"

    return "Không xác định"


def _bbox_to_dict(xyxy: Any, conf: float, cls_name: str = "banknote") -> Dict[str, Any]:
    x1, y1, x2, y2 = [float(v) for v in xyxy]
    return {
        "x1": round(x1, 2),
        "y1": round(y1, 2),
        "x2": round(x2, 2),
        "y2": round(y2, 2),
        "confidence": round(conf, 4),
        "class_name": cls_name,
    }


def _crop_with_padding(image: Image.Image, bbox: Dict[str, Any], pad_ratio: float = 0.10) -> Image.Image:
    w, h = image.size

    x1 = float(bbox["x1"])
    y1 = float(bbox["y1"])
    x2 = float(bbox["x2"])
    y2 = float(bbox["y2"])

    bw = x2 - x1
    bh = y2 - y1

    pad_w = bw * pad_ratio
    pad_h = bh * pad_ratio

    x1 = int(max(0, x1 - pad_w))
    y1 = int(max(0, y1 - pad_h))
    x2 = int(min(w, x2 + pad_w))
    y2 = int(min(h, y2 + pad_h))

    return image.crop((x1, y1, x2, y2)).convert("RGB")


# ============================================================
# Model loader cache
# ============================================================

_YOLO_MODEL = None
_RES_MODEL = None
_RES_CLASSES = None
_DEVICE = None


def _get_device() -> str:
    global _DEVICE

    if _DEVICE is not None:
        return _DEVICE

    if torch is not None and torch.cuda.is_available():
        _DEVICE = "cuda"
    else:
        _DEVICE = "cpu"

    return _DEVICE


def _load_yolo_model():
    global _YOLO_MODEL

    if _YOLO_MODEL is not None:
        return _YOLO_MODEL

    if YOLO is None:
        raise RuntimeError("Chưa cài ultralytics. Hãy cài: pip install ultralytics")

    if not os.path.exists(YOLO_MODEL_PATH):
        raise FileNotFoundError(f"Không tìm thấy YOLO model: {YOLO_MODEL_PATH}")

    _YOLO_MODEL = YOLO(YOLO_MODEL_PATH)
    return _YOLO_MODEL


def _build_efficientnet_b0(num_classes: int):
    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(0.4),
        nn.Linear(in_features, num_classes)
    )
    return model


def _build_resnet50(num_classes: int):
    model = models.resnet50(weights=None)
    model.fc = nn.Sequential(
        nn.Dropout(0.4),
        nn.Linear(model.fc.in_features, num_classes)
    )
    return model


def _load_res_model():
    """
    Load classifier từ .pth.
    Hỗ trợ checkpoint dạng:
    {
      "model_state_dict": ...,
      "classes": [...],
      "model_name": "efficientnet_b0" hoặc "resnet50",
      "img_size": 224
    }
    """
    global _RES_MODEL, _RES_CLASSES

    if _RES_MODEL is not None and _RES_CLASSES is not None:
        return _RES_MODEL, _RES_CLASSES

    if torch is None or models is None or transforms is None or nn is None:
        raise RuntimeError("Chưa cài torch/torchvision. Hãy cài: pip install torch torchvision")

    if not os.path.exists(RES_MODEL_PATH):
        raise FileNotFoundError(f"Không tìm thấy RES model: {RES_MODEL_PATH}")

    device = _get_device()

    checkpoint = torch.load(RES_MODEL_PATH, map_location=device)

    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
        classes = _parse_checkpoint_classes(checkpoint)
        model_name = str(checkpoint.get("model_name", "efficientnet_b0")).lower()
    else:
        # Phòng trường hợp chỉ lưu state_dict thuần
        state_dict = checkpoint
        classes = None
        model_name = "efficientnet_b0"

    if classes is None:
        classes = _load_classes_from_txt(RES_CLASSES_PATH)

    if not classes:
        raise RuntimeError(
            "Không tìm thấy danh sách classes. "
            "Cần checkpoint có key 'classes' hoặc file classes.txt."
        )

    num_classes = len(classes)

    if "resnet" in model_name:
        model = _build_resnet50(num_classes)
    else:
        model = _build_efficientnet_b0(num_classes)

    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    _RES_MODEL = model
    _RES_CLASSES = classes

    return _RES_MODEL, _RES_CLASSES


def _res_transform():
    return transforms.Compose([
        transforms.Resize((RES_IMG_SIZE, RES_IMG_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(
            [0.485, 0.456, 0.406],
            [0.229, 0.224, 0.225]
        )
    ])


# ============================================================
# Inference functions
# ============================================================

def _detect_banknotes_sync(image: Image.Image) -> List[Dict[str, Any]]:
    yolo_model = _load_yolo_model()

    results = yolo_model.predict(
        source=image,
        imgsz=YOLO_IMG_SIZE,
        conf=YOLO_CONF_THRES,
        verbose=False
    )

    detections = []

    if not results:
        return detections

    result = results[0]

    if result.boxes is None:
        return detections

    names = getattr(result, "names", None) or getattr(yolo_model, "names", {}) or {}

    for box in result.boxes:
        xyxy = box.xyxy[0].detach().cpu().numpy().tolist()
        conf = float(box.conf[0].detach().cpu().item())

        cls_id = int(box.cls[0].detach().cpu().item()) if box.cls is not None else 0
        cls_name = names.get(cls_id, "banknote") if isinstance(names, dict) else "banknote"

        detections.append(_bbox_to_dict(xyxy, conf, cls_name))

    detections.sort(key=lambda d: d["confidence"], reverse=True)
    return detections


def _classify_crop_sync(crop: Image.Image) -> Dict[str, Any]:
    res_model, classes = _load_res_model()
    device = _get_device()

    tfm = _res_transform()

    x = tfm(crop).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = res_model(x)
        probs = torch.softmax(logits, dim=1)[0]

    conf, idx = torch.max(probs, dim=0)
    conf_float = float(conf.detach().cpu().item())
    idx_int = int(idx.detach().cpu().item())

    class_name = classes[idx_int]
    country, currency, denomination, raw_class = _parse_class_name(class_name)

    # Top 5 để debug
    topk = min(5, len(classes))
    top_probs, top_idxs = torch.topk(probs, k=topk)

    top_predictions = []
    for p, i in zip(top_probs, top_idxs):
        ci = int(i.detach().cpu().item())
        cp = float(p.detach().cpu().item())
        c_name = classes[ci]
        c_country, c_currency, c_denom, c_raw = _parse_class_name(c_name)

        top_predictions.append({
            "class_name": c_raw,
            "quoc_gia": c_country,
            "ma_tien_te": c_currency,
            "menh_gia": c_denom,
            "confidence": round(cp, 4),
        })

    return {
        "class_name": raw_class,
        "quoc_gia": country,
        "ma_tien_te": currency,
        "menh_gia": denomination,
        "confidence": conf_float,
        "top_predictions": top_predictions,
    }


def _build_completed_item(
    detection: Dict[str, Any],
    classification: Optional[Dict[str, Any]],
    index: int,
) -> Dict[str, Any]:
    yolo_conf = _clamp01(detection.get("confidence", 0.0))

    if classification:
        country = classification["quoc_gia"]
        currency = classification.get("ma_tien_te", "Không xác định")
        denomination = classification["menh_gia"]
        res_conf = _clamp01(classification["confidence"])
        final_conf = round((yolo_conf * 0.45) + (res_conf * 0.55), 4)
        class_name = classification.get("class_name", "Không xác định")
        top_predictions = classification.get("top_predictions", [])

        # Top3 summary — dùng .get() an toàn tránh KeyError
        top3_summary = ", ".join(
            f"{p.get('menh_gia') or p.get('class_name') or 'Unknown'}"
            f"({float(p.get('confidence') or 0.0):.2f})"
            for p in top_predictions[:3]
        ) if top_predictions else "N/A"

        if res_conf < RES_CONF_MIN_THRESHOLD:
            # ── Confidence thấp ──────────────────────────────────────────────
            # Trả Failed để Aggregator không tính vote sai vào majority.
            # Vẫn giữ top_predictions trong JSON để debug.
            country = "Không xác định"
            currency = "Không xác định"
            denomination = "Không xác định"
            final_conf = round(yolo_conf * 0.45, 4)  # chỉ tính YOLO portion
            status = "Failed"

            mo_ta = (
                f"YOLO phát hiện vùng tiền giấy nhưng ResNet không đủ tự tin "
                f"để xác định mệnh giá (confidence={res_conf:.4f} < "
                f"threshold={RES_CONF_MIN_THRESHOLD})."
            )

            quan_diem = (
                f"ResNet confidence thấp, không đủ tin cậy để vote. "
                f"Top1='{class_name}', confidence={res_conf:.4f}, "
                f"threshold={RES_CONF_MIN_THRESHOLD}. "
                f"Top3: [{top3_summary}]. "
                f"Agent 1 từ chối bỏ phiếu để tránh kéo sai đồng thuận."
            )

            method = "YOLO detector + RES classifier (low confidence — rejected)"

            print(
                f"[Agent 1 ML/DL] LOW CONFIDENCE: top1='{class_name}' "
                f"conf={res_conf:.4f} < threshold={RES_CONF_MIN_THRESHOLD}. "
                f"Top3: {top3_summary}. Returning Failed."
            )

        else:
            # ── Confidence đủ cao ────────────────────────────────────────────
            status = "Completed"

            mo_ta = (
                f"YOLO phát hiện một vùng tiền giấy. "
                f"Mô hình phân loại nhận dạng class '{class_name}'."
            )

            quan_diem = (
                f"YOLO khoanh vùng tờ tiền với độ tin cậy {yolo_conf:.2f}. "
                f"Bộ phân loại RES nhận dạng {denomination} thuộc {country} "
                f"với độ tin cậy {res_conf:.2f}. "
                f"Điểm tin cậy tổng hợp: {final_conf:.2f}. "
                f"Top3: [{top3_summary}]."
            )

            method = "YOLO detector + RES/EfficientNet classifier"

    else:
        country = "Không xác định"
        currency = "Không xác định"
        denomination = "Không xác định"
        res_conf = 0.0
        final_conf = round(yolo_conf * 0.45, 4)
        top_predictions = []
        status = "Partial"

        mo_ta = (
            "YOLO phát hiện được vùng nghi là tiền giấy, "
            "nhưng chưa chạy được mô hình phân loại quốc gia/mệnh giá."
        )

        quan_diem = (
            f"YOLO khoanh vùng tờ tiền với độ tin cậy {yolo_conf:.2f}. "
            "Thiếu hoặc lỗi model RES nên Agent 1 chưa xác định được quốc gia và mệnh giá."
        )

        method = "YOLO detector only"

    item = {
        "quoc_gia": country,
        "ma_tien_te": currency,
        "menh_gia": denomination,
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": _guess_material(country, denomination),
        "mo_ta": mo_ta,
        "quan_diem": quan_diem,
        "phuong_phap": method,
        "do_tin_cay": final_conf,
        "van_ban_nhin_thay": [],
        "dac_diem_chinh": [
            "Phát hiện bằng bounding box YOLO",
            (
                "Phân loại dựa trên ảnh crop của tờ tiền"
                if (classification and status == "Completed")
                else (
                    "ResNet confidence thấp, Agent 1 từ chối vote"
                    if classification
                    else "Chưa phân loại được mệnh giá"
                )
            ),
        ],
        "bbox": detection,
        "res_confidence": round(res_conf, 4),
        "yolo_confidence": round(yolo_conf, 4),
        "top_predictions": top_predictions,
        "object_index": index,
        "status": status,
    }

    return item


def _run_agent1_sync(image_bytes: bytes) -> str:
    try:
        image = _read_image(image_bytes)
    except Exception as e:
        return _error_response(f"Agent 1 không đọc được ảnh đầu vào: {e}")

    # 1. YOLO detect
    try:
        detections = _detect_banknotes_sync(image)
    except Exception as e:
        return _error_response(
            f"Agent 1 không chạy được YOLO. "
            f"Kiểm tra AGENT1_YOLO_MODEL_PATH='{YOLO_MODEL_PATH}'. Lỗi: {e}"
        )

    if not detections:
        item = dict(INVALID_RESULT_JSON)
        item["mo_ta"] = "YOLO không phát hiện được tờ tiền giấy trong ảnh."
        item["quan_diem"] = (
            "Không có bounding box nào vượt ngưỡng confidence. "
            f"Ngưỡng hiện tại: {YOLO_CONF_THRES}."
        )
        item["phuong_phap"] = "YOLO detector"
        item["status"] = "Failed"
        return _to_json_list([item])

    outputs = []

    # 2. Với mỗi bbox, crop rồi classify
    for idx, det in enumerate(detections, start=1):
        classification = None

        try:
            crop = _crop_with_padding(image, det, pad_ratio=0.10)
            classification = _classify_crop_sync(crop)
        except Exception as e:
            # Không chết toàn agent. Vẫn trả YOLO partial.
            print(f"[Agent 1 ML/DL] RES classifier failed for object {idx}: {e}")

        outputs.append(
            _build_completed_item(
                detection=det,
                classification=classification,
                index=idx,
            )
        )

    return _to_json_list(outputs)


# ============================================================
# Public async API — giữ tên cũ để code hiện tại không vỡ
# ============================================================

async def run_agent1_yolo(image_bytes: bytes) -> str:
    """
    API cũ của hệ thống.
    Trả về JSON string list.
    """
    print("[Agent 1 ML/DL] Đang chạy YOLO + RES classifier...")

    result = await asyncio.to_thread(_run_agent1_sync, image_bytes)

    print("[Agent 1 ML/DL] Hoàn tất phân tích.")
    return result


# ============================================================
# Optional class OOP nếu sau này muốn dùng BaseAgent
# ============================================================

class Agent1ML:
    def __init__(
        self,
        yolo_model_path: Optional[str] = None,
        res_model_path: Optional[str] = None,
        res_classes_path: Optional[str] = None,
    ):
        global YOLO_MODEL_PATH, RES_MODEL_PATH, RES_CLASSES_PATH

        if yolo_model_path:
            YOLO_MODEL_PATH = yolo_model_path

        if res_model_path:
            RES_MODEL_PATH = res_model_path

        if res_classes_path:
            RES_CLASSES_PATH = res_classes_path

    async def run(self, image_bytes: bytes, context: str = "") -> str:
        return await run_agent1_yolo(image_bytes)