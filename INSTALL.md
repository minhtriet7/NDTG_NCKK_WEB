# Hướng dẫn cài đặt BanknoteAI

## 1. Yêu cầu hệ thống
- Python 3.9+
- Node.js 18+
- MongoDB 6.0+
- Git

## 2. Cài đặt Backend
Di chuyển vào thư mục `server`:
```bash
cd server
```

Tạo và kích hoạt môi trường ảo (Virtual Environment):
```bash
python -m venv venv
.\venv\Scripts\activate  # Trên Windows
# source venv/bin/activate # Trên Linux/Mac
```

Cài đặt các gói phụ thuộc:
```bash
pip install -r requirements.txt
```

Khởi chạy server FastAPI:
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Server sẽ chạy tại `http://localhost:8000`.

## 3. Cài đặt Frontend
Mở một terminal mới, di chuyển vào thư mục `client`:
```bash
cd client
```

Cài đặt thư viện:
```bash
npm install
```

Khởi chạy ứng dụng:
```bash
npm run dev
```
Frontend sẽ chạy tại `http://localhost:5173` (hoặc cổng hiển thị trên terminal).

## 4. Cơ sở dữ liệu MongoDB
Hệ thống sử dụng MongoDB làm cơ sở dữ liệu chính.
Bạn có thể khởi động service MongoDB trên máy local:
```bash
Start-Service MongoDB
```
Hoặc kết nối thông qua MongoDB Compass với URI mặc định: `mongodb://localhost:27017`

## 5. Cấu hình biến môi trường
Trong cả thư mục `server` và `client`, bạn cần sao chép file `.env.example` thành file `.env` và điền các cấu hình thực tế.

```bash
# Ví dụ tại server
cp .env.example .env
```
*Lưu ý: Tuyệt đối không commit file `.env` chứa các API Key, Token, hoặc Secret lên hệ thống quản lý mã nguồn.*
