# UI/UX Analysis - Banknote Recognition Platform

## PHASE 1 - PHÂN TÍCH

### 1. Trang Home (`client/src/pages/user/Home.jsx`)
- **File chính**: `client/src/pages/user/Home.jsx`
- **Components sử dụng**: 
  - `HeroSection`, `VideoDemoSection`, `AgentSystemSection`, `SupportedCurrencies`, `StatsSection` (từ `client/src/components/home/`).
- **API được gọi**: Không gọi API trực tiếp. Dựa vào global state (`useAppStore`, `useAuthStore`) để hiển thị theo ngôn ngữ và trạng thái đăng nhập.
- **Cấu trúc UI**: 
  Hero (Banner + CTA) -> Demo (Video/Image) -> Agent Intro (3 Agents) -> Supported Currencies Grid -> Stats.

### 2. Trang Recognition (`client/src/pages/user/Recognition.jsx`)
- **File chính**: `client/src/pages/user/Recognition.jsx`
- **Components sử dụng**: 
  - `UploadZone`, `RecentHistorySide` (từ `client/src/components/workspace/`).
- **API được gọi**: Không gọi trực tiếp tại file này. Khi tải ảnh và bấm "Analyze", luồng sẽ chuyển sang trang `/processing`.
- **Cấu trúc UI**: 
  Header (Title + Token Balance) -> Active Task Alert (nếu có) -> 2-Column Grid (Upload Zone [Trái 8] | Recent History [Phải 4]).

### 3. Trang Result (`client/src/pages/user/Result.jsx` & `Processing.jsx`)
- **File chính**: `client/src/pages/user/Result.jsx`
- **Components sử dụng**: 
  - Nội bộ: `EvidenceSourceCard`, `LensReferencesSection`, `CircularProgress`, `PipelineNode`.
- **API được gọi**: Đọc dữ liệu từ state của Router (truyền từ Processing sang). `Processing.jsx` gọi `startRecognitionTask` (POST `/recognition/tasks`), sau đó poll trạng thái từ GET `/recognition/tasks/{task_id}`.
- **Cấu trúc UI**: 
  Header (Quyết định cuối cùng - Circular Progress) -> Agent Comparison (Grid các thẻ kết quả Agent) -> Multi-object Debate Log -> Currency Exchange Rate -> Token Usage.

---
### MÔ TẢ LUỒNG ĐIỀU HƯỚNG (USER FLOW)
1. **Home** `/` -> Bấm CTA "Start Analysis" hoặc "Workspace" ->
2. **Recognition** `/workspace` hoặc `/recognize` -> Kéo thả/chọn ảnh, bấm Analyze ->
3. **Processing** `/processing` -> Hiển thị progress bar & agent animations, gọi API backend -> hoàn tất ->
4. **Result** `/result` -> Xem thông tin chi tiết. Có thể quay lại Workspace hoặc xem Lịch sử.

---

## PHASE 2 - ĐÁNH GIÁ UI/UX

### Tiêu chí đánh giá
- **Visual hierarchy (Phân cấp thị giác)**: Trang Result hiện tại hơi phẳng, các block thông tin quan trọng (Kết luận) chưa đủ nổi bật so với các log chi tiết.
- **Typography**: Đang dùng phông mặc định, chưa tạo được cảm giác công nghệ tài chính (Fintech).
- **Color system**: Đã có Light/Dark mode nhưng màu sắc (đặc biệt là gradient và đổ bóng) chưa đủ độ sâu.
- **Spacing**: Tốt ở Home, nhưng ở Result các thành phần hơi sát nhau khi có nhiều object (multi-object).
- **Consistency**: Tính đồng nhất khá tốt nhờ Tailwind, nhưng các Agent Card ở Processing và Result có thiết kế hơi khác biệt.
- **Empty states / Loading states**: Loading trạng thái Processing khá tốt, nhưng Upload Zone khi trống nhìn hơi đơn điệu.

### Điểm yếu & Mức độ ưu tiên
1. **[Critical] Result Presentation Overload**: Trang Result hiển thị quá nhiều text (Debate Log) khiến người dùng rối mắt. Cần bọc log trong accordion hoặc modal.
2. **[High] Visual Aesthetics (Tính thẩm mỹ)**: Giao diện chưa có "Wow factor". Cần thêm hiệu ứng Glassmorphism, Micro-interactions (hover lấp lánh, shadow rực rỡ).
3. **[Medium] Upload Zone**: Khu vực kéo thả chưa đủ tính tương tác (cần hiệu ứng khi drag enter).
4. **[Low] Home Page Transitions**: Cuộn trang chưa có hiệu ứng fade-in mượt mà.
