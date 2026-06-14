# Hướng dẫn Nộp dự án (Submission Guide)

## 1. Danh sách cần nộp (Bắt buộc)
Các thư mục và file sau đây cần được đóng gói trong bản nộp cuối cùng:
- `README.md`
- `INSTALL.md`
- `TECHNOLOGIES.md`
- `server/` (Toàn bộ mã nguồn Backend)
- `client/` (Toàn bộ mã nguồn Frontend)
- `server/requirements.txt`
- `client/package.json`
- `client/package-lock.json`
- `.env.example` (File mẫu cấu hình biến môi trường)
- `server/ml_models/` (Bao gồm model weights nếu cần chạy demo trực tiếp)

## 2. Các thành phần KHÔNG nộp
Tuyệt đối loại bỏ các file/thư mục sau để tránh làm phình dung lượng và bảo mật thông tin:
- `server/venv/` (hoặc `.venv/`, `venv/`)
- `client/node_modules/`
- `client/dist/` (hoặc `build/`)
- `.env` (Chứa API key, thông tin nhạy cảm thật)
- `.git/` (Thư mục cấu hình version control)
- `__pycache__/`
- `logs/`

## 3. Lệnh Zip dự án
Mở terminal/PowerShell tại thư mục root của dự án.

**Sử dụng Git Archive (Khuyên dùng - tự động bỏ qua file theo .gitignore):**
```powershell
git archive -o BanknoteAI_Submission.zip HEAD
```

**Sử dụng 7z (Cần cài đặt 7-Zip):**
```powershell
7z a -tzip BanknoteAI_Submission.zip .\* -xr!node_modules -xr!venv -xr!server\venv -xr!client\dist -xr!.git -xr!__pycache__ -xr!.env -xr!logs
```

**Sử dụng PowerShell (Cơ bản - lưu ý sẽ nén toàn bộ nếu bạn chưa xóa node_modules/venv):**
```powershell
Compress-Archive -Path ".\*" -DestinationPath "BanknoteAI_Submission.zip"
```

## 4. Checklist kiểm tra trước khi nộp
Vui lòng đánh dấu hoàn thành các mục sau trước khi gửi file zip:
- [ ] **Backend chạy thành công**: Không có lỗi cú pháp hoặc thiếu thư viện khi chạy backend.
- [ ] **Frontend build thành công**: Lệnh `npm run build` hoàn thành không văng lỗi.
- [ ] **MongoDB kết nối tốt**: Ứng dụng đã được kiểm thử với local MongoDB (port 27017).
- [ ] **Bảo mật tuyệt đối**: Không có bất kỳ API key, token hay secret nào bị hardcode trong source code hoặc file tài liệu (Tất cả phải dùng `.env`).
