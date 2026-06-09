"""
Debug script: Inference ResNet trên ảnh thực, in top5 predictions.
CHI DOC - KHONG SUA GI
Usage:
    python debug_resnet_inference.py <path_to_image>
    python debug_resnet_inference.py  (sẽ dùng dummy white image nếu không có ảnh)
"""
import sys
import os
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

# =============================================
# Config
# =============================================
CLASSES_PATH = 'ml_models/res/classes.txt'
MODEL_PATH   = 'ml_models/res/banknote_resnet50_stable_best.pth'
IMG_SIZE     = 224

# =============================================
# Load classes
# =============================================
with open(CLASSES_PATH, 'r', encoding='utf-8') as f:
    classes = [line.strip() for line in f if line.strip()]

print(f"Classes loaded: {len(classes)}")

# =============================================
# Load model
# =============================================
device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Device: {device}")

checkpoint = torch.load(MODEL_PATH, map_location=device)
state_dict = checkpoint['model_state_dict']
ckpt_classes = checkpoint.get('classes', classes)

print(f"Checkpoint val_acc: {checkpoint.get('val_acc', 'N/A'):.4f}")
print(f"Checkpoint epoch: {checkpoint.get('epoch', 'N/A')}")

num_classes = len(ckpt_classes)
model = models.resnet50(weights=None)
model.fc = nn.Sequential(
    nn.Dropout(0.4),
    nn.Linear(model.fc.in_features, num_classes)
)
model.load_state_dict(state_dict)
model.to(device)
model.eval()

# =============================================
# Transform (phải giống y hệt agent_1_ml.py)
# =============================================
tfm = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
    )
])

# =============================================
# Load image
# =============================================
if len(sys.argv) > 1:
    img_path = sys.argv[1]
    print(f"\nLoading image: {img_path}")
    img = Image.open(img_path).convert('RGB')
else:
    print("\nNo image provided - using white dummy 224x224 image (all zeros = black after normalize)")
    img = Image.new('RGB', (224, 224), color=(200, 200, 200))

print(f"Image size: {img.size}, mode: {img.mode}")

# =============================================
# Inference
# =============================================
x = tfm(img).unsqueeze(0).to(device)

with torch.no_grad():
    logits = model(x)
    probs = torch.softmax(logits, dim=1)[0]

# Top-10
topk = min(10, len(classes))
top_probs, top_idxs = torch.topk(probs, k=topk)

print(f"\n=== TOP-{topk} PREDICTIONS ===")
for rank, (p, i) in enumerate(zip(top_probs, top_idxs), start=1):
    idx = int(i.item())
    prob = float(p.item())
    cls = ckpt_classes[idx]
    bar = '#' * int(prob * 40)
    flag = ' <-- TOP1' if rank == 1 else ''
    print(f"  #{rank:2d} [{idx:2d}] {cls:<35s} {prob:.4f} {bar}{flag}")

top1_conf = float(top_probs[0].item())
top1_cls  = ckpt_classes[int(top_idxs[0].item())]
top2_cls  = ckpt_classes[int(top_idxs[1].item())] if len(top_idxs) > 1 else 'N/A'
top2_conf = float(top_probs[1].item()) if len(top_probs) > 1 else 0.0

print(f"\n=== SUMMARY ===")
print(f"  Top1: {top1_cls} | confidence={top1_conf:.4f}")
print(f"  Top2: {top2_cls} | confidence={top2_conf:.4f}")

# =============================================
# Flag suspicious cases
# =============================================
print(f"\n=== DIAGNOSIS ===")

CONF_HIGH   = 0.70
CONF_MEDIUM = 0.40

if top1_conf >= CONF_HIGH:
    verdict = "HIGH confidence - likely correct"
elif top1_conf >= CONF_MEDIUM:
    verdict = "MEDIUM confidence - uncertain, aggregator may override"
else:
    verdict = "LOW confidence - ResNet not sure, likely should be Needs Review"

print(f"  Verdict: {verdict}")

if top1_cls != top2_cls:
    print(f"  Top1 vs Top2 gap: {top1_conf - top2_conf:.4f}")
    if top1_conf - top2_conf < 0.15:
        print("  WARNING: Very small gap between top1 and top2 - model is UNCERTAIN")

if top1_conf < 0.50:
    print(f"  WARNING: confidence {top1_conf:.4f} < 0.50 threshold")
    print(f"  Agent1 current code will still return status='Completed' with this low confidence!")
    print(f"  => Recommended fix: set status='Low Confidence' or 'Needs Review' when res_conf < 0.50")

# Check if top1 looks wrong but top2/3 might be the real answer
vnd_preds = [(ckpt_classes[int(i)], float(p)) for p, i in zip(top_probs, top_idxs) if 'vietnam' in ckpt_classes[int(i)]]
if vnd_preds:
    print(f"\n  Vietnam VND predictions in top-{topk}:")
    for cls, conf in vnd_preds:
        print(f"    {cls}: {conf:.4f}")
