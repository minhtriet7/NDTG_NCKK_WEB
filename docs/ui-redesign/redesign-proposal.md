# Redesign Proposal - Banknote AI Platform

## Phong cách Thiết kế Mục tiêu
- **Modern Fintech**: Sạch sẽ, đáng tin cậy, sắc nét.
- **Professional AI Platform**: Thể hiện được sức mạnh xử lý ngầm, đa đặc vụ (multi-agent).
- **Minimalist**: Tối giản nội dung hiển thị, chỉ show ra khi cần (progressive disclosure).
- **Dark/Light Mode Ready**: Tương phản cao, sử dụng màu gradient neon nhẹ trên nền tối để tạo chiều sâu.
- **Responsive**: Mobile-first, desktop-optimized.

---

## 1. HOME REDESIGN
**Mục tiêu**: Tăng tính thuyết phục và "Wow factor" ngay khi vào trang.

- **Hero section mới**: Background với lưới grid mờ và glowing blobs ở các góc. Nút CTA bọc hiệu ứng glowing border (animated).
- **Feature cards (Agent System)**: Chuyển sang dạng Glassmorphism (Kính mờ) với bóng đổ (drop shadow) mềm mại. Khi hover, thẻ sẽ nổi lên (translate-y) và sáng viền.
- **Workflow section**: Biểu đồ mũi tên mô tả luồng hoạt động (Upload -> AI Analyze -> Consensus -> Result).
- **Statistics section**: Count-up animation khi cuộn đến, phông chữ to và sắc nét (font hiển thị số riêng biệt nếu có).

## 2. RECOGNITION (WORKSPACE) REDESIGN
**Mục tiêu**: Khuyến khích hành động tải ảnh, tạo cảm giác an toàn và mượt mà.

- **Upload area hiện đại**: Box drag & drop có hiệu ứng nhịp thở (breathing glow) quanh viền. Icon Upload to, sinh động.
- **Upload progress & Image preview**: Sau khi thả ảnh, hiển thị preview có khung bo góc mượt, có nút (X) nổi bật.
- **Processing (Tách từ Recognition)**: Chạy một animation quét (scanner line) qua ảnh. Các thẻ Agent sáng lên lần lượt khi hoàn thành. 

## 3. RESULT REDESIGN
**Mục tiêu**: Xử lý tình trạng quá tải thông tin, làm nổi bật kết luận.

- **Result summary card (Quyết định cuối)**: Thẻ lớn nhất ở trên cùng. Tách biệt màu sắc rõ ràng (Xanh = Đồng thuận cao, Vàng = Trung bình, Đỏ = Cần xem lại). Có biểu đồ Circular Progress nổi bật.
- **Currency information card & Confidence card**: Cấu trúc dạng lưới (bento grid) nhỏ gọn, hiển thị tỷ giá và thông tin mệnh giá.
- **Bounding box preview**: (Nếu có dữ liệu bbox) Hiển thị ảnh có vẽ khung bao quanh tờ tiền, viền nét đứt hoặc nét liền phát sáng nhẹ.
- **OCR / Agent Compare Display**: Các Agent Card xếp ngang hoặc dọc gọn gàng. Các nhận định chi tiết (reasoning) bị ẩn đi, chỉ hiện trạng thái "Khớp/Không khớp". Người dùng bấm "Read more" mới trượt xuống.
- **Debate Log / History**: Chuyển thành giao diện dạng Terminal Log mô phỏng hoặc Accordion mượt mà, mặc định đóng để giữ giao diện sạch.

---

## Kết luận
Bản redesign sẽ biến hệ thống từ một dự án "hiển thị đủ chức năng" thành một sản phẩm "thương mại cao cấp" (Premium SAAS), giúp người dùng tin tưởng hơn vào kết quả phân tích của AI.
