# Hệ thống nhận diện tiền giấy đa tác tử

## 1. Giới thiệu
BanknoteAI là hệ thống nhận diện tiền giấy từ hình ảnh dựa trên kiến trúc đa tác tử (Multi-Agent Architecture). Dự án được phát triển phục vụ mục đích nghiên cứu và khóa luận học thuật.

**LƯU Ý QUAN TRỌNG:** Đây là hệ thống **nhận diện tiền giấy** (xác định mệnh giá, quốc gia, loại tiền), **KHÔNG PHẢI** là hệ thống phát hiện tiền giả hay xác thực tiền tệ chính thức.

## 2. Kiến trúc hệ thống
Hệ thống kết hợp nhiều tác tử AI độc lập để đảm bảo độ tin cậy của kết quả:

- **AG0 (Vision Gate)**: Sử dụng mô hình YOLO để phát hiện và cắt (crop) vùng chứa tiền giấy. Tác tử này đóng vai trò tiền xử lý và không tham gia bỏ phiếu.
- **AG1 (OpenAI Vision)**: Phân tích hình ảnh trực tiếp để trích xuất thông tin mệnh giá. (Tối đa 1 vote).
- **AG2 (Gemini LLM)**: Sử dụng Gemini với cơ chế native async và model fallback tuần tự (tự động chuyển đổi mô hình khi quá tải). Xử lý text/OCR và logic ngữ nghĩa. (Tối đa 1 vote).
- **AG3 (Visual Search & Evidence)**: Tích hợp Google Lens và SerpAPI để thu thập bằng chứng từ Internet. Lọc các nguồn thông tin độc lập và áp dụng cơ chế đa số (majority) nội bộ để đưa ra kết luận. (Tối đa 1 vote).
- **AG4 (Aggregator)**: Tác tử tổng hợp mang tính quyết định (deterministic/rule-based). Tổng hợp tối đa 3 phiếu bầu từ AG1, AG2, AG3 và quyết định đồng thuận (consensus) cuối cùng.

## 3. Luồng xử lý
Hệ thống có khả năng xử lý nhiều tờ tiền trong cùng một bức ảnh (multiple-banknote processing) thông qua luồng sau:
`Ảnh đầu vào` → `AG0` → `Crop từng tờ tiền` → `AG1 + AG2 + AG3 (chạy song song)` → `AG4` → `Selective retry/reuse (nếu cần)` → `Kết quả cuối cùng` → `Lưu DB/API` → `Hiển thị Workspace UI`.

## 4. Công nghệ
- **Backend**: Python, FastAPI, Beanie, Pydantic, Uvicorn
- **Frontend**: React, Vite, TailwindCSS, Zustand, React Router
- **Database**: MongoDB
- **AI/Vision**: YOLO, ResNet50, OpenAI Vision (GPT-4o), Gemini (Flash/Flash-Lite)
- **External Services**: SerpApi, ImgBB, Cloudinary, Google OAuth2

## 5. Cấu trúc thư mục
```
NDTG_NCKK_WEB/
├── client/
│   ├── public/
│   ├── src/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── app/
│   ├── tests/
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
├── .gitignore
└── README.md
```

## 6. Cài đặt Backend
Di chuyển vào thư mục backend, tạo môi trường ảo và cài đặt thư viện:
```bash
cd server
python -m venv venv
venv\Scripts\activate  # (Trên Windows)
pip install -r requirements.txt
copy .env.example .env
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 7. Cài đặt Frontend
Di chuyển vào thư mục frontend và khởi chạy:
```bash
cd client
npm install
npm run dev
```

## 8. Cấu hình môi trường
Cấu hình các biến môi trường thiết yếu trong file `.env` của hệ thống. **Không bao giờ commit file `.env` chứa khóa thật lên Git.**

- **Database**: `MONGODB_URL`, `DATABASE_NAME`
- **Security & Authentication**: `SECRET_KEY`, `ALGORITHM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **AI Models**: `OPENAI_EXPERIMENT_MODEL`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_MODEL`, `AG2_GEMINI_MODEL_CHAIN`
- **Search & Storage Services**: `SERPAPI_KEY`, `IMGBB_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

*Ví dụ định dạng: `VARIABLE_NAME="your_value"`*

## 9. Kiểm thử
Các kịch bản kiểm thử cốt lõi (core regression tests) được lưu tại thư mục: `server/tests/`

Các vùng kiểm thử bao gồm:
- Crop / Image processing.
- AG2 timeout, fallback và quản lý quota.
- AG3 evidence parsing, tính hợp lệ của nguồn và voting.
- AG4 consensus aggregator.
- Payload serializer và các bộ bảo vệ chống lỗi thoái lui (regression protections).

Lệnh chạy kiểm thử (Sử dụng module `unittest` tích hợp sẵn của Python):
```bash
cd server
python -m unittest discover tests -v
```

## 10. Cơ chế đồng thuận
- **AG1**: Tối đa 1 vote.
- **AG2**: Tối đa 1 vote.
- **AG3**: Tối đa 1 vote. Yêu cầu tập nguồn bỏ phiếu độc lập từ 3 đến 5 nguồn. Số lượng hỗ trợ chính xác tối thiểu (minimum exact support) phải đạt từ 3 nguồn trở lên thì AG3 mới tạo phiếu bầu hợp lệ.
- **AG4**: Nhận tối đa 3 phiếu đầu vào. Yêu cầu tối thiểu 2 phiếu hợp lệ và khớp nhau (valid matching votes) để hệ thống đạt được sự đồng thuận bình thường.

## 11. Kết quả đầu ra
Sau khi phân tích, hệ thống trả về kết quả cấu trúc bao gồm:
- Thông tin nhận diện cơ bản: Quốc gia (Country), Tiền tệ (Currency), Mệnh giá (Denomination).
- Kết quả chi tiết của từng tác tử độc lập.
- Trạng thái đồng thuận (Consensus status).
- Các bằng chứng/liên kết đã được kiểm chứng (đối với AG3).

## 12. Phạm vi
Dự án này là một **bản mẫu nghiên cứu học thuật (academic/research prototype)** phục vụ cho việc nhận dạng và phân tích hình ảnh tiền giấy bằng AI.

Hệ thống này **KHÔNG PHẢI LÀ**:
- Công cụ phát hiện tiền giả (counterfeit detection).
- Hệ thống xác thực tiền tệ chính thức (official currency authentication).
- Hệ thống xử lý giao dịch tài chính thương mại (financial transaction system).
