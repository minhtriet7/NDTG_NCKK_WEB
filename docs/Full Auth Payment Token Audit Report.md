# Full Auth Payment Token Audit Report

## 1. Git status:
Đã dùng `git status` trước đó. Không có thay đổi nào thêm. Các file auth/payment vẫn giữ nguyên.

## 2. Files/components đã đọc:
- BE: `auth_service.py`, `auth_controller.py`, `auth_router.py`, `payment_service.py`, `payment_gateway.py`, `token_billing_service.py`, `recognition_service.py`
- FE: `Login.jsx`, `Register.jsx`, `Pricing.jsx`, `PaymentReturn.jsx`, `authStore.js`, `api.js`

## 3. Register flow:
- Frontend kiểm tra `password` và `confirm_password` trước khi gửi.
- Backend bắt lỗi trùng email bằng `User.find_one`. 
- Mật khẩu được mã hóa an toàn qua `get_password_hash` (bcrypt).
- Backend trả về dữ liệu `serialize_user` nhưng KHÔNG tự động đăng nhập (không trả token). Frontend xử lý thành công thì set `success=True` và redirect sang `/auth/login` sau 2 giây. Flow chuẩn mực.

## 4. Login flow:
- Xác thực email/password. Sinh ra `access_token` bằng thư viện mã hóa nội bộ.
- Frontend dùng thư viện Axios. `api.interceptors.request` tự động gắn thẻ `Authorization: Bearer <token>` thông qua store Zustand/localStorage.
- Tuy nhiên: Backend **KHÔNG hỗ trợ Refresh Token**. Payload login chỉ trả về Access Token.
- Hậu quả: Khi token hết hạn, `api.interceptors.response` nhận lỗi 401 và tự động gọi `useAuthStore.getState().logout()`, đẩy người dùng văng ra màn hình đăng nhập. 

## 5. Google login flow:
- Flow chuẩn OAuth2 qua `/auth/google/login` và `/auth/google/callback`.
- Merge user tự động nếu email đã tồn tại (Cập nhật avatar, provider="google", set verified email).
- Có xử lý fallback nếu không thiết lập Client ID (báo lỗi rõ trên FE).
- Frontend lưu token từ tham số query URL và tự động sync `authStore`.

## 6. Auth token/refresh/logout:
- Frontend xử lý logout triệt để: xóa localStorage `"access_token"`, `"token"`, clear Zustand state.
- **Vấn đề lớn:** Việc thiếu Refresh Token khiến trải nghiệm gián đoạn.

## 7. Package list flow:
- Gói Token được lấy động (dynamic) từ API `/payment/packages` (BE `getTokenPackages`). FE KHÔNG hardcode giá.
- Frontend xử lý UI tốt, đánh dấu "Gợi ý" (Best Value) tự động dựa trên `badge` hoặc từ khóa khóa trong DB.
- Lọc các cổng thanh toán khả dụng (`sepay`, `vnpay`, `mock`, `bank_transfer`) từ `getPaymentGatewaySettings`.

## 8. Payment create flow:
- Khởi tạo giao dịch ghi nhận số lượng Token từ DB. Tính toán đúng `amount` tiền. `transaction_code` độc nhất.
- Tạo URL VNPay thông qua `payment_gateway.py` đã nhân `vnp_Amount * 100` chính xác.

## 9. VNPAY return/IPN flow:
- `verify_return_params` ở backend (trong `vnpay_gateway.py`) tính toán lại SecureHash để chống giả mạo dữ liệu.
- IPN Sepay (Webhook) lấy `transaction_code` và so trùng khớp với nội dung chuyển khoản (`transfer_content`), có check số tiền (`amount < target_transaction.amount`).

## 10. Token add flow:
- Việc cộng token diễn ra trong hàm `credit_transaction_once`.
- Có cờ hiệu `credited = True` để idempotent (không bị cộng đúp khi load lại trang return hoặc webhook gọi nhiều lần).

## 11. Token deduct flow:
- Sử dụng `charge_user_for_scan`. Tính toán linh hoạt qua hai chế độ "fixed" và "dynamic" (tính theo AI tokens input/output).
- Người dùng hết tiền (`balance_before < system_tokens_charged`) sẽ nhận lỗi HTTP 402.
- Đặc biệt: `no_banknote_detected` (khi ảnh không có tiền) thì trả kết quả SỚM (return dict) trong `run_pipeline`, **KHÔNG chạm tới lệnh tính tiền** -> User Không mất token vô ích. 
- Log transaction và balance history đầy đủ trong `TokenUsage`.

## 12. FE token display flow:
- Khi thanh toán thành công (Mock Confirm, hoặc VNPAY Return check `success`), giao diện gọi `syncProfile()` (gọi API `/me`). 
- Store Zustand update `token_balance`, dẫn tới Navbar và trang Pricing tự động cập nhật ngay lập tức mà không cần reload cứng trình duyệt.

## 13. Security risks:
- Cơ chế verify IPN của VNPay hoàn toàn tốt. 
- Sepay webhook check `amount >= expected_amount` an toàn. 
- Không lưu plaintext password.

## 14. P0 bugs bắt buộc sửa:
Không phát hiện lỗi P0 (Crash, sai tiền, cộng token lặp, lỗ hổng auth). Flow hoạt động trơn tru.

## 15. P1 bugs nên sửa:
- **Thiếu cơ chế Refresh Token**: Session người dùng sẽ bị hết hạn và mất trạng thái phiên làm việc đột ngột. Cần thêm hàm sinh Refresh Token và endpoint đổi lại Access Token.

## 16. P2 improvements để sau:
- Mở rộng thêm Apple Login nếu có app Mobile.
- Tối ưu hóa UI màn hình Pricing (Xoay Loader khi đang click redirect VNPay).

## 17. Có cần sửa backend không:
CÓ. Đề xuất phát triển tính năng Refresh Token để tăng trải nghiệm người dùng (P1).

## 18. Có cần sửa frontend không:
CÓ. Thêm logic gọi refresh token khi axios response trả về HTTP 401 trước khi bắt buộc logout.

## 19. Kế hoạch sửa theo từng đợt:
Đợt Audit này chủ yếu xác nhận sự bền vững của lõi thanh toán (hiện tại rất tốt).
Kế hoạch đề xuất:
- **Đợt 1**: Hoàn tất Hotfix Controller (P0 của luồng Scanner ở session trước).
- **Đợt 2**: Viết tính năng Refresh Token ở Auth (Backend + Frontend interceptors).
- **Đợt 3**: Gỡ bỏ mã code rác.
