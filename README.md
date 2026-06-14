# BanknoteAI - Hệ thống nhận diện tiền giấy đa tác tử

## Giới thiệu
BanknoteAI là một hệ thống AI tiên tiến được thiết kế để nhận diện, phân tích và đánh giá tiền giấy thông qua kiến trúc đa tác tử (Multi-Agent Architecture). Hệ thống kết hợp sức mạnh của các mô hình học sâu chuyên dụng, ngôn ngữ tự nhiên lớn (LLM), và tìm kiếm hình ảnh trực quan để đưa ra kết quả đồng thuận với độ chính xác cao nhất.

## Mục tiêu
- Tự động hóa quá trình nhận diện mệnh giá, quốc gia, và tình trạng của tiền giấy.
- Cung cấp độ chính xác cao bằng cách áp dụng cơ chế đồng thuận (Consensus) từ nhiều mô hình AI khác nhau.
- Xử lý mượt mà cả các trường hợp quét một tờ tiền (Single-object) và nhiều tờ tiền cùng lúc (Multi-object).

## Chức năng chính
- **Quét và nhận diện**: Phân tích hình ảnh để xác định mệnh giá, quốc gia, vật liệu và tình trạng.
- **Hỗ trợ Multi-object**: Nhận diện nhiều tờ tiền trong cùng một bức ảnh, cắt (crop) và phân tích từng tờ.
- **Cơ chế đồng thuận (Consensus)**: Đánh giá độ tin cậy của kết quả dựa trên sự thống nhất giữa 3 tác tử độc lập.
- **Lịch sử phân tích**: Lưu trữ và tra cứu lịch sử quét với hệ thống lọc và thống kê chi tiết.
- **Payment & Token System**: Hệ thống quản lý token, tích hợp cổng thanh toán để nạp và sử dụng dịch vụ.

## Kiến trúc đa tác tử (Multi-Agent)
Hệ thống sử dụng 4 tác tử AI chính:
1. **Agent 1 (ML/DL Analysis)**: Sử dụng các mô hình học sâu như YOLOv8 để phát hiện/cắt ảnh và ResNet50 để phân loại hình ảnh tiền giấy với tốc độ cao.
2. **Agent 2 (LLM/API Analysis)**: Tích hợp Gemini API để hiểu ngữ cảnh, trích xuất văn bản từ hình ảnh và phân tích logic ngữ nghĩa của tờ tiền.
3. **Agent 3 (Visual Search)**: Ứng dụng Google Lens, Selenium, và SerpApi để tìm kiếm hình ảnh tương đồng trên Internet, mang lại kết quả đối chiếu thực tế.
4. **Agent 4 (Aggregator/Consensus)**: Tác tử tổng hợp, so sánh và đánh giá kết quả từ 3 tác tử trên. Đưa ra quyết định cuối cùng dựa trên luật đồng thuận (Consensus).

## Thành phần hệ thống
- **Frontend**: Giao diện người dùng Web trực quan, thân thiện (React, Vite, TailwindCSS).
- **Backend**: API server hiệu năng cao xử lý luồng AI và giao tiếp cơ sở dữ liệu (FastAPI).
- **Database**: Lưu trữ phi cấu trúc, phù hợp với dữ liệu phân tích phức tạp (MongoDB / Beanie).
- **Storage**: Lưu trữ hình ảnh phân tích trên nền tảng đám mây (Cloudinary).
- **Payment/Token System**: Quản lý gói cước và giới hạn truy cập thông qua tích hợp cổng thanh toán.
