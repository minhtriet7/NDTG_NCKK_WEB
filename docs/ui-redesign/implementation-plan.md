# Implementation Plan - UI Redesign

## 1. Danh sách file cần sửa
1. `client/src/pages/user/Home.jsx`
2. `client/src/components/home/HeroSection.jsx`
3. `client/src/components/home/AgentSystemSection.jsx`
4. `client/src/pages/user/Recognition.jsx`
5. `client/src/components/workspace/UploadZone.jsx`
6. `client/src/pages/user/Result.jsx`
7. `client/index.css` (Cập nhật design tokens, animation keyframes)

## 2. Component mới cần tạo
1. `client/src/components/ui/GlassCard.jsx` - Wrapper component cho hiệu ứng Glassmorphism.
2. `client/src/components/ui/GlowingButton.jsx` - Button với hiệu ứng glow hover.
3. `client/src/components/result/ResultSummaryCard.jsx` - Tách component Card tóm tắt quyết định ra khỏi Result.jsx.
4. `client/src/components/result/AgentCompareBento.jsx` - Tách component so sánh Agent ra dạng Bento grid.
5. `client/src/components/result/TerminalLogView.jsx` - Component hiển thị log giả lập terminal.

## 3. Component cần refactor
1. `UploadZone.jsx`: Cập nhật logic hiển thị preview mượt hơn, làm lại viền drag & drop.
2. `Result.jsx`: Code hiện tại dài > 1800 dòng. CẦN THIẾT PHẢI TÁCH FILE. Chia nhỏ thành các component con đặt trong `client/src/components/result/`.

## 4. Thứ tự thực hiện
- **Bước 1**: Cập nhật `index.css` thêm biến màu (color variables) cho gradient, các class animation (pulse, float, shine). Tạo các base UI components (`GlassCard`, `GlowingButton`).
- **Bước 2**: Thiết kế lại trang Home (Hero, Feature Cards) để kiểm chứng phong cách hình ảnh tổng thể.
- **Bước 3**: Cập nhật trang Recognition và UploadZone. Thêm hiệu ứng drag & drop.
- **Bước 4**: Tái cấu trúc (Refactor) khổng lồ cho `Result.jsx`. Tách các phần ra file riêng biệt, áp dụng layout Bento Grid và Terminal log.
- **Bước 5**: Kiểm thử (Testing) tính Responsive trên các kích thước màn hình.

## 5. Ước lượng độ phức tạp
- **Home**: Low - Chủ yếu là đổi class Tailwind và bọc thêm CSS.
- **Recognition**: Low/Medium - Tinh chỉnh logic kéo thả và thêm animation.
- **Result**: High - File quá lớn, chứa nhiều logic bóc tách JSON, cần tách file cẩn thận để không làm hỏng logic hiển thị của Agent và multi-object. Cần khoảng 2-3 lượt refactor.
