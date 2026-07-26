# Full Recognition Flow Audit Report

## 1. Git status:
Đã kiểm tra git status. Repository có sự thay đổi lớn ở nhánh `main`:
- Gần 50 file đang ở trạng thái **Modified**, bao gồm các file frontend quan trọng (`Result.jsx`, `AgentResultDetail.jsx`, các store) và backend (`recognition_controller.py`, `recognition_service.py`, `agent_aggregator.py`, v.v.).
- Một số file **Untracked** đang chờ được thêm vào như `crop_checker.py`, cấu hình test và backup file.

## 2. Files/components đã đọc:
**Backend**:
- `server/app/services/recognition_service.py`
- `server/app/controllers/recognition_controller.py`
- `server/app/routers/recognition_router.py`
- `server/app/agents/agent_1_openai.py`
- `server/app/agents/agent_2_llm.py`
- `server/app/agents/agent_3_lens.py`
- `server/app/agents/agent_3_selector.py`
- `server/app/agents/agent_aggregator.py`
- `server/app/utils/currency_normalizer.py`
- `server/app/services/token_billing_service.py`
- `server/app/utils/image_processing.py` (từ context đợt trước)
- `server/app/utils/crop_checker.py` (từ context đợt trước)
- `server/app/core/config.py` (từ context đợt trước)

**Frontend**:
- `client/src/pages/user/Result.jsx`
- `client/src/pages/user/AgentResultDetail.jsx`
- `client/src/store/recognitionStore.js`
- `client/src/services/recognitionService.js`
- `client/src/services/currencyService.js`

## 3. Tóm tắt luồng hiện tại:
- **Upload & Crop**: Ảnh được upload. Chạy hàm `detect_banknote_objects`. YOLO -> NMS -> AG0 Crop checker để lọc ra các bounding box có chứa tiền giấy hợp lệ.
- **Agents Pipeline**: Mỗi vùng crop hợp lệ được chạy độc lập và song song qua 3 Agent (1: OpenAI Vision, 2: Gemini, 3: Google Lens) với cơ chế timeout (ví dụ: Agent 3 timeout cứng ở 35s). 
- **Consensus / Aggregator**: Kết quả của 3 Agent được đưa vào `run_aggregator` để chốt `final_consensus`. Nếu kết quả xung đột hoặc bằng nhau (pattern "1-1-1", "conflict", "transient_error"), hệ thống tự động retry agent cụ thể dựa vào `MAX_CONFLICT_ATTEMPTS` (3 lần) và các max config khác.
- **Return & Billing**: Kết quả được lưu vào DB (bảng `RecognitionRequest` / `RecognitionTask`). Hệ thống tính toán chi phí token (Input, Output, AI model) và trừ token từ User, rồi trả API về Frontend. Frontend dùng `Result.jsx` và hàm `normalizeBackendResult` để parse, đồng nhất format và hiển thị giao diện báo cáo chi tiết cho user, hỗ trợ đa ngôn ngữ.

## 4. Crop/AG0 issues:
- **Tình trạng fallback an toàn**: Trong `recognition_service.py` có một khối try/except import `detect_banknote_objects`. Nếu ImportError thì sử dụng `legacy_cropper`. Điều này giúp hệ thống không chết hẳn, nhưng tiềm ẩn rủi ro tốc độ.
- **AG0 DROP**: Hàm `detect_banknote_objects` / `recognition_service.py` dòng 740 xử lý mượt object bị DROP.
- **no_banknote_detected**: Nếu không có crop hợp lệ, trả ra ngay status `"no_banknote_detected"`.
- Tuy nhiên, khi rơi vào nhánh `no_banknote_detected`, `run_pipeline` trả về kiểu `dict`. Trong khi `process_banknote` (hàm bọc ngoài) có thể trả về DB Model (`RecognitionRequest`). Điều này gây lỗi tại Controller. (xem mục 13).

## 5. Agent1 issues:
- Agent 1 OpenAI có xử lý timeout bằng `asyncio.wait_for`. Khi quá thời gian hoặc lỗi sẽ parse sang "Failed", không làm gãy pipeline. Chức năng ổn định.

## 6. Agent2 issues:
- Agent 2 LLM có xử lý fallback model bên trong. Nhận đúng `context_for_llm` để khoanh vùng logic cho chỉ tờ tiền đó. 
- Schema parse ổn. Có retry trong bản thân agent trước khi timeout.

## 7. Agent3 issues:
- Agent 3 Lens có SerpApi + selector. Timeout 35s. 
- Lỗi kỹ thuật tự tính vào agent fail/disabled -> Aggregator sẽ tính là 1 phiếu không hợp lệ (không làm thay đổi kết quả 2 ông kia).

## 8. Aggregator/retry issues:
- Pattern matching (`1-1-1`, `conflict`, `transient_error`, v.v.) quyết định số lần loop và số agent chạy lại. Code hoạt động ổn định.
- Zero evidence/no banknote sẽ tự dừng ở MAX_ZERO_EVIDENCE_ATTEMPTS (1 lần).
- `consensus_trace` đủ và đã pass ra ngoài UI thông qua JSON payload.

## 9. Object filter issues:
- Pipeline filter qua AG0 từ đầu vào. Sau khi có kết quả object, nếu `is_object_resolved()` false thì có lưu status `failed`/`needs_review`. Không bị mất hay drop mất object đã được quét.

## 10. Currency/exchange issues:
- Frontend normalize USD/VND tốt. `VND Equiv` dùng `ratesData` từ API (`/currency/rates`). Nếu API lỗi có default check.
- Card Exchange có hiển thị quy đổi, xử lý được "N/A" hoặc khi không nhận diện được tiền. 
- Mệnh giá ở Frontend sử dụng `formatDenomination` có vẻ hiển thị đúng số 0, tuy nhiên format Backend -> Frontend thỉnh thoảng mix giữa string (`500000 VND`) và số.

## 11. Token billing issues:
- Nếu trạng thái là `no_banknote_detected`, vòng lặp Agent không chạy. `TokenBillingService` không trừ token AI, chỉ tốn request ban đầu.
- Nếu Agent chạy bị lỗi kỹ thuật, `system_tokens_charged` vẫn được cập nhật theo usage nội bộ trả về. 

## 12. Frontend Result.jsx issues:
- **normalizeBackendResult**: Có sự trùng lặp (ví dụ `denomination` được parse ở line 802 và 926). Nhưng không bị mất dữ liệu quan trọng.
- **AgentCard Confidence Bar**: Nếu kết quả Agent Match với Final (`isMatched=true`), khung card có màu Xanh (teal). Nhưng nếu confidence < 60, thanh bar là màu Đỏ. UI này hơi mâu thuẫn nhưng hiện tại vẫn hiển thị rõ ràng cho user.

## 13. Các lỗi P0 bắt buộc sửa:
- **Crash Attribute Error tại `recognition_controller.py`**:
  Ở `RecognitionController.recognize`, code xử lý:
  ```python
  record = await RecognitionService.process_banknote(user, image_bytes)
  return {
      "id": str(record.id),
      "status": record.status, ...
  }
  ```
  Nếu `process_banknote` rơi vào trường hợp AG0 không tìm thấy tiền (hoặc lỗi crop/fallback exception) -> trả về một Python `dict` (`{"status": "no_banknote_detected", ...}`). Dict này KHÔNG CÓ thuộc tính `record.id` hay `record.status` theo dạng Dot Notation -> Phát sinh `AttributeError: 'dict' object has no attribute 'id'`. Dẫn tới sập Server Request.

## 14. Các lỗi P1 nên sửa:
- **UI Card Agent Match**: Nâng cấp UI của AgentCard trong Frontend để nếu `confidence < 50` thì dù có khớp cũng hiển thị viền Vàng cảnh báo (warning) thay vì Xanh an toàn.
- **Result Type in Controller**: Cần chuẩn hoá `process_banknote` luôn trả về một dạng (dict hoặc Pydantic Schema). Nên map dict sang schema nếu trường hợp đặc biệt.
- **Mix Data Types**: `final_result.denomination` đôi khi là `"10000"` đôi khi `"10000 VND"`, dẫn tới logic cắt chuỗi currency ở frontend bị lặp lại ở nhiều component.

## 15. Các cải thiện P2 để sau:
- Xoá hàm mock `detect_banknote_objects` ở đầu file `recognition_service.py` để tránh rác code nếu codebase đã ổn định.
- Tối ưu CSS/hiệu ứng ở thẻ Exchange cho đẹp hơn.

## 16. Những phần KHÔNG nên đụng nữa:
- Logic tính điểm `TokenBillingService` (Đã check, hiện tại ổn định).
- Cấu trúc `Aggregator` và loop retry (Tránh gây bug mới trong luồng consensus).
- Hệ thống agent routing `agent_3_selector.py`.

## 17. Có cần sửa backend không:
**CÓ**. Lỗi P0 ở `recognition_controller.py` (AttributeError) là nguy cơ crash server cao và dễ xảy ra khi user upload hình rác/không phải tiền.

## 18. Có cần sửa frontend không:
**CÓ**. Chỉnh sửa nhỏ ở P1 để đồng bộ UI màu sắc, tuy nhiên nếu muốn an toàn có thể lùi sang đợt sau.

## 19. Kế hoạch sửa đề xuất theo từng đợt:
- **Đợt 1 (Hotfix P0)**: Sửa `recognition_controller.py` hàm `recognize` để kiểm tra kiểu dữ liệu trả về của `record`. Nếu là `dict`, dùng syntax `record.get("id")`. Nếu là object, dùng `getattr(record, "id")` (hoặc sửa thẳng trong `process_banknote` để luôn trả DB Model).
- **Đợt 2 (Cải thiện P1 Backend)**: Chuẩn hoá `detect_banknote_objects` import logic, xoá module stub không cần thiết.
- **Đợt 3 (Cải thiện P1/P2 Frontend)**: Chỉnh màu viền Agent Card. Thống nhất hàm parse JSON.
