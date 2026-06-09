"""
Debug script: Kiểm tra ResNet checkpoint và classes.txt - CHỈ ĐỌC, KHÔNG SỬA GÌ
"""
import torch
import os

# =============================================
# 1. CHECK CLASSES.TXT
# =============================================
classes_path = 'ml_models/res/classes.txt'
with open(classes_path, 'r', encoding='utf-8') as f:
    classes = [line.strip() for line in f if line.strip()]

print("=== CLASSES.TXT ===")
print(f"Total classes: {len(classes)}")
print(f"First 5: {classes[:5]}")
print(f"Last 5 : {classes[-5:]}")

vietnam_classes = [c for c in classes if 'vietnam' in c]
cambodia_classes = [c for c in classes if 'cambodia' in c]
print(f"Vietnam classes ({len(vietnam_classes)}): {vietnam_classes}")
print(f"Cambodia classes ({len(cambodia_classes)}): {cambodia_classes}")

# Index quan trọng
for cls in ['vietnam_vnd_50000', 'cambodia_khr_5000']:
    if cls in classes:
        print(f"  idx({cls}) = {classes.index(cls)}")

# =============================================
# 2. CHECK CHECKPOINT
# =============================================
ckpt_path = 'ml_models/res/banknote_resnet50_stable_best.pth'
print("\n=== CHECKPOINT ===")
checkpoint = torch.load(ckpt_path, map_location='cpu')

if isinstance(checkpoint, dict):
    print(f"Keys: {list(checkpoint.keys())}")

    model_name = checkpoint.get('model_name', 'NOT FOUND')
    print(f"model_name: {model_name}")

    img_size = checkpoint.get('img_size', 'NOT FOUND')
    print(f"img_size: {img_size}")

    epoch = checkpoint.get('epoch', 'NOT FOUND')
    print(f"epoch: {epoch}")

    for acc_key in ['best_val_acc', 'val_acc', 'accuracy']:
        if acc_key in checkpoint:
            print(f"{acc_key}: {checkpoint[acc_key]}")

    ckpt_classes = checkpoint.get('classes', None)
    if ckpt_classes is not None:
        print(f"\nclasses in checkpoint: {len(ckpt_classes)} classes")
        print(f"First 5 ckpt_classes: {ckpt_classes[:5]}")
        print(f"Last 5 ckpt_classes : {ckpt_classes[-5:]}")

        # Compare
        if list(ckpt_classes) == classes:
            print("==> MATCH: checkpoint classes == classes.txt ORDER OK")
        else:
            print("==> MISMATCH! checkpoint classes != classes.txt")
            for i, (a, b) in enumerate(zip(list(ckpt_classes), classes)):
                if a != b:
                    print(f"   Diff at idx {i}: ckpt={a} | txt={b}")
    else:
        print("WARNING: No 'classes' key in checkpoint. Will fall back to classes.txt order.")

    # =============================================
    # 3. BUILD MODEL + CHECK OUTPUT DIM
    # =============================================
    print("\n=== MODEL OUTPUT DIM ===")
    try:
        from torchvision import models
        import torch.nn as nn

        num_classes = len(classes)
        model = models.resnet50(weights=None)
        model.fc = nn.Sequential(
            nn.Dropout(0.4),
            nn.Linear(model.fc.in_features, num_classes)
        )

        state_dict = checkpoint.get('model_state_dict', checkpoint)
        model.load_state_dict(state_dict)
        model.eval()

        # Check last layer
        fc = model.fc
        linear_layers = [m for m in fc.modules() if isinstance(m, nn.Linear)]
        if linear_layers:
            out_features = linear_layers[-1].out_features
            print(f"Model fc out_features: {out_features}")
            print(f"len(classes.txt): {num_classes}")
            if out_features == num_classes:
                print("==> OK: Model output dim matches classes count")
            else:
                print(f"==> MISMATCH! Model output={out_features} vs classes={num_classes}")
        else:
            print("Could not find Linear layer in fc.")

        # Quick dummy inference
        import torch
        dummy = torch.zeros(1, 3, 224, 224)
        with torch.no_grad():
            out = model(dummy)
        print(f"Dummy output shape: {out.shape}")
        print("==> Model loads and runs OK on dummy input")

    except Exception as e:
        print(f"ERROR loading model: {e}")

else:
    print("Checkpoint is NOT a dict — raw state_dict only.")
    print(f"Type: {type(checkpoint)}")

# =============================================
# 4. YOLO MODEL INFO
# =============================================
print("\n=== YOLO MODEL INFO ===")
try:
    from ultralytics import YOLO
    yolo = YOLO('ml_models/yolo/best.pt')
    names = yolo.names
    print(f"YOLO classes: {names}")
    print(f"Number of YOLO classes: {len(names)}")
except Exception as e:
    print(f"Could not load YOLO: {e}")

print("\n=== DONE ===")
