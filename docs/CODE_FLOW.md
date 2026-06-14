# LUỒNG HOẠT ĐỘNG CỦA HỆ THỐNG BANKNOTEAI

## 1. Tổng quan kiến trúc
- **Backend:** Xây dựng bằng FastAPI (Python), sử dụng kiến trúc Controllers - Services - Routers và cung cấp các RESTful API.
- **Web:** Xây dựng bằng ReactJS kết hợp với Vite. Quản lý state bằng Zustand và gọi API thông qua Axios.
- **Mobile:** Xây dựng bằng Flutter (Dart). Sử dụng các package quản lý logic và routing tương thích chặt chẽ với backend.
- **Database:** Sử dụng Database bất đồng bộ (MongoDB thông qua các Model/ODM, như `user_model.py`, `recognition_model.py`).
- **AI/Recognition:** Tích hợp đa mô hình (Multi-agent) tại backend để nhận diện tiền giấy, bao gồm AI cục bộ (YOLO/ResNet), Google Lens và LLM.

## 2. Luồng đăng nhập email-password
### Web/App
Người dùng điền Email và Password tại màn hình đăng nhập. Hàm login trong frontend/mobile sẽ gọi đến service API (như `authService.login()`) để gửi request.

### API gọi tới
`POST /api/v1/auth/login`

### Backend xử lý
- Router (`auth_router.py`) nhận request và điều hướng sang `AuthController.login`.
- Controller sẽ truy vấn Database kiểm tra User qua Email. Nếu tồn tại, tiến hành verify mã hash của password.
- Nếu thành công, backend tạo một chuỗi `access_token` (JWT) để định danh.

### Kết quả
Backend trả về thông tin User kèm theo `access_token`. Web/App nhận được sẽ lưu token này vào bộ nhớ (như `localStorage` hoặc `authStore` trên web, `secure_storage` trên app) để tự động gắn vào Header cho các request API tiếp theo.

## 3. Luồng đăng nhập Google OAuth
### Web
Từ màn hình Login, người dùng nhấn nút "Đăng nhập với Google". Frontend gọi hàm để lấy URL chuyển hướng tới API khởi tạo luồng OAuth (`GET /api/v1/auth/google/login?platform=web`).

### App
Tương tự như Web, App gọi API với tham số `platform=mobile`.

### Backend callback
- API khởi tạo sẽ tạo link authorize và chuyển hướng người dùng sang trang cấp quyền của Google.
- Sau khi người dùng đồng ý, Google tự động redirect về hệ thống qua `GET /api/v1/auth/google/callback`.
- Tại đây, Backend trao đổi với Google để lấy thông tin `userinfo` (Email, Name, Avatar). Nếu là lần đầu tiên, Backend sẽ tạo User mới trong Database, ngược lại chỉ cập nhật thời gian đăng nhập.

### Lưu user/token
Backend tạo JWT `access_token` và tự động Redirect về màn hình xử lý của Web (`/auth/google/success?token=...`) hoặc App (`banknoteai://auth/google/success?token=...`). Frontend/App sẽ bắt sự kiện chuyển hướng này, trích xuất token trên thanh URL và lưu trữ lại tương tự như luồng password.

## 4. Luồng nhận diện tiền
### Chọn/chụp ảnh
Người dùng chọn ảnh từ thư viện hoặc chụp mới từ camera tại màn hình Recognition/Scan trên Web hoặc App.

### Gửi ảnh lên API
Ứng dụng đóng gói ảnh dưới dạng `multipart/form-data` và gọi lên API thông qua `POST /api/v1/recognition/scan` (xử lý trực tiếp) hoặc `POST /api/v1/recognition/tasks` (xử lý ngầm, polling).

### Backend xử lý ảnh/model
- Router (`recognition_router.py`) tiếp nhận file ảnh và chuyển tiếp cho `RecognitionController`.
- Bức ảnh sẽ được xử lý qua một đường ống AI (`app/agents/`):
  - `agent_1_ml.py`: Sử dụng model cục bộ (YOLO/ResNet) để tìm vị trí và dự đoán tờ tiền.
  - `agent_2_llm.py` / `agent_3_lens.py`: Bổ trợ tra cứu thông tin tờ tiền thông qua Google Lens hoặc LLM nếu mô hình đầu chưa đủ độ tin cậy.
  - `agent_aggregator.py`: Tổng hợp, đối chiếu các kết quả từ nhiều agent lại để đưa ra kết luận cuối cùng.

### Trả kết quả
API trả về đối tượng JSON chứa loại tiền, mệnh giá, quốc gia, độ tin cậy và id của lịch sử quét. Nếu chạy ngầm qua `/tasks`, backend trả về `task_id` để frontend liên tục polling kiểm tra trạng thái (`GET /api/v1/recognition/tasks/{task_id}`).

### Lưu lịch sử
Đồng thời với việc phân tích, quá trình này sẽ tạo và lưu một bản ghi vào bảng History/Recognition trong Database gắn với `user_id` hiện tại để có thể xem lại về sau.

## 5. Luồng xem lịch sử
### Web/App gọi API
Người dùng điều hướng sang tab Lịch sử (History). Ứng dụng gọi `GET /api/v1/users/me/history` có đính kèm JWT token.

### Backend truy vấn database
- API đi vào `user_router.py` sau khi qua middleware kiểm tra token hợp lệ.
- Lấy `user_id` từ token, `UserController.get_history` truy vấn trong Database để lấy toàn bộ danh sách các lượt nhận diện tiền trong quá khứ của người dùng này.

### Trả danh sách lịch sử
Backend gửi trả mảng dữ liệu lịch sử về cho giao diện. Ứng dụng nhận được và ánh xạ hiển thị thành danh sách các thẻ kết quả cho người dùng.

## 6. Luồng chuyển đổi tiền tệ
### App/Web gọi API
Khi cần quy đổi mệnh giá tiền (như từ USD sang VND), App/Web sẽ gọi `GET /api/v1/currency/rates` để lấy bảng tỷ giá hoặc `POST /api/v1/currency/convert` để máy chủ tính toán trực tiếp.

### Backend xử lý
`CurrencyController` nhận yêu cầu. Nó sẽ tra cứu tỷ giá trong Database hoặc gọi sang API bên thứ 3 để lấy tỷ giá mới nhất nếu chưa có. Sau đó tính toán số lượng tiền tương ứng.

### Kết quả
Trả về JSON chứa chi tiết số tiền quy đổi hoặc danh sách tỷ giá đầy đủ để giao diện cập nhật lên màn hình ngay lập tức.

## 7. Bảng tổng hợp API endpoint

| Method | Endpoint | Chức năng | File xử lý backend | Màn hình gọi tới |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | Đăng nhập bằng Email & Password | `auth_router.py` | Login Screen |
| GET | `/api/v1/auth/google/login` | Bắt đầu quy trình Google Login | `auth_router.py` | Login Screen |
| GET | `/api/v1/auth/google/callback`| Nhận lại thông tin và token từ Google | `auth_router.py` | (Redirect từ Google) |
| POST | `/api/v1/recognition/scan` | Xử lý hình ảnh nhận diện tiền | `recognition_router.py` | Scan / Home Screen |
| GET | `/api/v1/recognition/tasks/{id}`| Xem trạng thái xử lý nhận diện ngầm | `recognition_router.py` | Scan / Processing |
| GET | `/api/v1/users/me/history` | Xem danh sách lịch sử nhận diện | `user_router.py` | History Screen |
| GET | `/api/v1/currency/rates` | Lấy danh sách tỷ giá tiền tệ | `currency_router.py` | Currency Converter |
| POST | `/api/v1/currency/convert` | Thực hiện quy đổi tiền tệ | `currency_router.py` | Currency Converter |

## 8. Bảng tổng hợp file quan trọng

| Khu vực | File | Vai trò |
|---|---|---|
| **Backend** | `server/main.py` | Điểm vào chính, khởi tạo ứng dụng FastAPI, đăng ký Router và CORS/Auth Middleware. |
| **Backend** | `routers/auth_router.py` | Định nghĩa các endpoint liên quan đến Authentication (Login, Register, OAuth). |
| **Backend** | `agents/agent_aggregator.py`| Nơi điều phối luồng nhận diện AI bằng cách gọi và tổng hợp từ nhiều mô hình con. |
| **Backend** | `models/user_model.py` | Định nghĩa schema cấu trúc lưu trữ của bảng người dùng trong Database. |
| **Web** | `client/src/services/api.js` | Cấu hình Axios, tự động đính kèm Token và xử lý mã lỗi global (401) cho Web. |
| **Web** | `client/src/store/authStore.js` | Quản lý trạng thái lưu trữ đăng nhập (State) của User trên Web bằng Zustand. |
| **Mobile** | `lib/routes/app_router.dart` | Cấu hình đường dẫn và quản lý chuyển trang (routing) của ứng dụng Flutter. |
| **Mobile** | `lib/core/network/` | Nơi chứa các class giao tiếp API, interceptor tự động truyền token cho App. |
