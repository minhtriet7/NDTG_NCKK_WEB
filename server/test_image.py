import cv2
import numpy as np
from app.utils.image_processing import detect_banknote_objects
import logging

logging.basicConfig(level=logging.DEBUG)

def main():
    # Test 1: Solid black image -> Fallback
    print("\n--- Test 1: Fallback (Solid Black) ---")
    img1 = np.zeros((500, 500, 3), dtype=np.uint8)
    _, buffer1 = cv2.imencode('.jpg', img1)
    objects1 = detect_banknote_objects(buffer1.tobytes(), 5)
    print("Detected:", len(objects1))
    for obj in objects1:
        print("Index:", obj["object_index"], "Source:", obj["source"], "Raw:", obj.get("raw_candidate_count"), "Fallback:", obj.get("fallback"))

    # Test 2: Random shapes -> Countour
    print("\n--- Test 2: Multiple objects ---")
    img2 = np.zeros((500, 500, 3), dtype=np.uint8)
    for i in range(10):
        cv2.rectangle(img2, (i*40, i*40), (i*40+30, i*40+30), (255, 255, 255), -1)
    _, buffer2 = cv2.imencode('.jpg', img2)
    objects2 = detect_banknote_objects(buffer2.tobytes(), 5)
    print("Detected:", len(objects2))
    for obj in objects2:
        print("Index:", obj["object_index"], "Source:", obj["source"], "Raw:", obj.get("raw_candidate_count"), "Fallback:", obj.get("fallback"))

if __name__ == "__main__":
    main()
