# Công nghệ sử dụng trong BanknoteAI

Hệ thống BanknoteAI được xây dựng với một Stack công nghệ hiện đại, kết hợp chặt chẽ giữa Frontend Web, Backend API và các luồng xử lý AI sâu.

## 1. Frontend
Đóng vai trò là giao diện tương tác với người dùng, thu thập hình ảnh và hiển thị kết quả phân tích đa tác tử một cách trực quan.
- **React 18**: Thư viện UI cốt lõi để xây dựng các component tái sử dụng.
- **Vite**: Công cụ build siêu tốc, mang lại trải nghiệm phát triển mượt mà.
- **Zustand**: Quản lý state toàn cục gọn nhẹ cho lịch sử và session.
- **TailwindCSS**: Xây dựng giao diện UI hiện đại, responsive, và hỗ trợ Dark Mode tiện lợi.
- **Axios**: Giao tiếp HTTP với Backend API.
- **React Router Dom**: Điều hướng trang SPA.
- **Lucide React**: Cung cấp bộ icon đẹp mắt và nhất quán.

## 2. Backend
Trái tim của hệ thống, điều phối luồng dữ liệu, quản lý session và điều phối các AI Agent.
- **FastAPI**: Framework Python hiệu năng cực cao, hỗ trợ Async/Await chuẩn.
- **Uvicorn**: ASGI Server dùng để chạy FastAPI.
- **Pydantic**: Ràng buộc dữ liệu (Data Validation) mạnh mẽ, chuẩn hóa Schema.
- **Beanie / Motor**: ODM bất đồng bộ (Asynchronous Object-Document Mapper) để giao tiếp mượt mà với MongoDB.
- **Authlib / ItsDangerous**: Xử lý xác thực người dùng và mã hóa session an toàn.
- **Python-Multipart**: Hỗ trợ xử lý file upload qua form data.

## 3. AI & Machine Learning
Kiến trúc cốt lõi quyết định trí tuệ của hệ thống, dựa trên 3 trụ cột (Agent):
- **Ultralytics YOLOv8**: Mô hình Object Detection siêu tốc để phát hiện vùng tiền giấy (Bounding Box / Crop) từ hình ảnh có nền phức tạp.
- **ResNet50 / PyTorch**: Kiến trúc Deep Learning để phân loại mệnh giá.
- **Gemini API (Google GenAI)**: Mô hình LLM phân tích văn bản trên tờ tiền, suy luận mệnh giá từ hình khối.
- **Google Lens / SerpApi / Selenium**: Công cụ tìm kiếm hình ảnh thực tế trên Internet để đối chiếu.
- **OpenCV-Python / Pillow / Numpy**: Tiền xử lý hình ảnh (Cắt ảnh, resize, chuẩn hóa) trước khi đưa vào các mô hình.

## 4. Dịch vụ bên thứ ba (Third-party Services)
- **Database**: MongoDB (Local hoặc Atlas) cho lưu trữ linh hoạt NoSQL.
- **Storage**: Cloudinary để lưu trữ hình ảnh tải lên và hình ảnh crop an toàn trên Cloud.
- **Payment Gateway**: Tích hợp các hệ thống (như SePay / VNPay) để tự động hóa nạp token.
