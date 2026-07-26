# Benchmark Metrics Fix Report

Ngày chạy: 2026-07-22

## 1. Tóm tắt sửa lỗi

Đã sửa logic benchmark theo hướng verification-first:

- Không còn tin vào `exact_match`, `country_correct`, `currency_correct`, `field_correct_count`, `field_score_pct` từ file nguồn.
- Luôn tính lại correctness từ 6 cột Ground Truth và Prediction.
- Tách rõ Coverage, End-to-End Accuracy và Conditional Accuracy.
- Missing prediction giữ là `None` trong correctness, không bị biến thành `0`.
- Denomination được chuẩn hóa thành integer, không dùng substring/startswith/approximate match.
- Thêm audit workbook sheets để phát hiện mismatch, duplicate, missing/unexpected image ID, ground truth conflict và validation lỗi logic.

## 2. File đã sửa/thêm

| File | Thay đổi |
|---|---|
| `server/app/utils/benchmark_normalization.py` | Module normalize dùng chung: missing, country, currency, denomination, boolean, compare và `calculate_field_correctness`. |
| `server/app/utils/benchmark_metrics_math.py` | Tính classification metrics tương đương `classification_report(..., zero_division=0)` để không phụ thuộc binary `sklearn` khi runtime lệch version. |
| `server/app/services/experiment_service.py` | `_run_once` dùng `calculate_field_correctness`, lưu normalized values, export thêm normalized columns. |
| `server/app/models/experiment_run_model.py` | Thêm optional normalized GT/pred fields, backward-compatible với document cũ. |
| `server/app/services/benchmark_metrics_service.py` | Viết lại verifier/export workbook: verified columns, summary, per-dimension, per-run, stability, explainability và audit sheets. |
| `server/app/services/metrics_service.py` | Metrics calculator dùng normalization chung, missing sentinel và không import `sklearn`. |
| `server/tests/test_benchmark_normalization.py` | Test denomination normalization, missing handling, independent field correctness. |
| `server/tests/test_benchmark_metrics_service.py` | Test exact mismatch, missing prediction, duplicate key, GT conflict và consistency validation. |

Router/controller không đổi API contract. `BenchmarkMetricsService.calculate` có thêm optional `manifest_bytes` để script nội bộ verify với `benchmark_manifest_full.csv`; endpoint cũ vẫn gọi bằng `file_bytes` như trước.

## 3. Diff quan trọng

### Field correctness cuối cùng

```python
country_correct = normalized_gt_country is not None \
    and normalized_pred_country is not None \
    and normalized_gt_country == normalized_pred_country

currency_correct = normalized_gt_currency is not None \
    and normalized_pred_currency is not None \
    and normalized_gt_currency == normalized_pred_currency

denomination_correct = normalized_gt_denomination is not None \
    and normalized_pred_denomination is not None \
    and normalized_gt_denomination == normalized_pred_denomination

field_correct_count = int(country_correct) + int(currency_correct) + int(denomination_correct)
field_score_pct = round(field_correct_count / 3 * 100, 2)
exact_match = country_correct and currency_correct and denomination_correct
```

### Accuracy cuối cùng

```text
coverage = complete_prediction_count / total_samples
end_to_end_accuracy = exact_match_verified_count / total_samples
conditional_accuracy = exact_match_verified_count_on_complete_predictions / complete_prediction_count
accuracy_official = exact_match_original_true_count / total_samples
accuracy_verification = exact_match_verified_count / total_samples
overall_accuracy = accuracy_verification
```

Nếu `complete_prediction_count == 0`, `conditional_accuracy` để trống (`None`) để không ngụ ý mô hình có accuracy 0 trên tập prediction hợp lệ không tồn tại.

### Precision/Recall/F1

Mỗi dimension có hai scope:

- End-to-End: missing prediction được đưa vào label `__MISSING__`.
- Valid-Predictions-Only: chỉ tính trên dòng prediction hợp lệ của dimension đó.

Các cột `Average Dimension Macro Precision/Recall/F1` là trung bình cộng macro metric của Country, Currency và Denomination; các cột `Overall Precision/Recall/F1 (Deprecated)` chỉ giữ để tương thích, không còn được mô tả là composite-label precision/F1.

## 4. Excel output

Đã tạo:

- `D:\LuanVanTotNghiep\A_NDTG_BCNCKH\PM\AI_95_benchmark_runs_1_2_3_verified_metrics.xlsx`
- `D:\LuanVanTotNghiep\A_NDTG_BCNCKH\PM\REAL_100_benchmark_runs_1_2_3_verified_metrics.xlsx`

Workbook output gồm:

1. `HeThong_Raw`
2. `GPT_Gemini_Raw`
3. `Metrics_Summary`
4. `Metrics_Per_Dimension`
5. `Metrics_Per_Run`
6. `Run_Stability`
7. `Explainability`
8. `Data_Integrity`
9. `Ground_Truth_Conflicts`
10. `Duplicate_Rows`
11. `Missing_Image_IDs`
12. `Unexpected_Image_IDs`
13. `File_Name_ID_Mismatches`
14. `Logic_Validation_Errors`

## 5. Chỉ số verified từ benchmark hiện có

### AI_95 / AI_100

| Model | Total | Complete | Coverage | Exact verified | End-to-End Accuracy | Conditional Accuracy | Accuracy Official | Exact mismatch | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BanknoteAI | 285 | 16 | 0.05614 | 10 | 0.03509 | 0.62500 | 0.05614 | 6 | INVALID |

Điều kiện bắt buộc đã đúng:

- Các dòng mệnh giá 100000/200000 bị predict `10000 VND` không còn `exact_match_verified = TRUE`.
- Coverage = 16/285.
- End-to-End Accuracy = 10/285.
- Conditional Accuracy = 10/16.

### REAL_100

| Model | Total | Complete | Coverage | Exact verified | End-to-End Accuracy | Conditional Accuracy | Accuracy Official | Exact mismatch | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| BanknoteAI | 300 | 80 | 0.26667 | 77 | 0.25667 | 0.96250 | 0.93667 | 204 | INVALID |
| GPT | 300 | 233 | 0.77667 | 231 | 0.77000 | 0.99142 | 0.77000 | 0 | INVALID |
| Gemini | 300 | 184 | 0.61333 | 180 | 0.60000 | 0.97826 | 0.60000 | 0 | INVALID |

`GPT` và `Gemini` bị `INVALID` không phải vì exact mismatch, mà vì dataset REAL có ground-truth conflict ở `R099`; metrics được tạo nhưng là dữ liệu cần kiểm chứng lại.

## 6. Lỗi dữ liệu tool phát hiện

### AI_100

| Sheet | Count | Ghi chú |
|---|---:|---|
| `Data_Integrity` | 24 | Gồm exact/field mismatch và lỗi master manifest. |
| `Ground_Truth_Conflicts` | 5 | `A092` có hai ground truth khác nhau trong master/result group. |
| `Duplicate_Rows` | 2 | `A092` bị duplicate trong `benchmark_manifest_full.csv`. |
| `Missing_Image_IDs` | 2 | Sequence gap phát hiện `A070` và `A093` thiếu trong master. |
| `Unexpected_Image_IDs` | 2 | Result có `A070` và `A093` nhưng master không có image_id tương ứng. |
| `File_Name_ID_Mismatches` | 1 | Một image ID map tới nhiều `file_name`. |

### REAL_100

| Sheet | Count | Ghi chú |
|---|---:|---|
| `Data_Integrity` | 431 | Nhiều source correctness cũ không khớp verified correctness. |
| `Ground_Truth_Conflicts` | 11 | `R099` có denomination conflict `10000` vs `100000`. |
| `Duplicate_Rows` | 2 | `R099` duplicate trong master. |
| `Missing_Image_IDs` | 0 | Không phát hiện gap sequence trong REAL master. |
| `Unexpected_Image_IDs` | 0 | Không phát hiện result ID ngoài REAL master. |
| `File_Name_ID_Mismatches` | 1 | `R099` map tới hai `file_name`. |

Các lỗi dữ liệu cần con người đối chiếu ảnh gốc: `A070`, `A092`, `A093`, `R099` và các dòng source correctness cũ bị mismatch trong `Data_Integrity`.

## 7. Kiểm chứng dòng bắt buộc

| ID | Kết quả verified |
|---|---|
| `A026` | GT 100000, pred `10000 VND`: country TRUE, currency TRUE, denomination FALSE, field count 2, score 66.67, exact FALSE, exact mismatch TRUE. |
| `A031` | GT 200000, pred `10000 VND`: country TRUE, currency TRUE, denomination FALSE, field count 2, score 66.67, exact FALSE, exact mismatch TRUE. |
| `R004` | GT Vietnam/VND/500000, pred Vietnam/VND/100000: country TRUE, currency TRUE, denomination FALSE, field count 2, score 66.67, exact FALSE. |
| `R099` | Xuất hiện trong `Ground_Truth_Conflicts` vì denomination 10000 và 100000 cùng dùng dataset/image. |
| `A092` | Xuất hiện trong `Duplicate_Rows`, `Ground_Truth_Conflicts`, `File_Name_ID_Mismatches`. |
| `A093` | Xuất hiện trong `Missing_Image_IDs` và `Unexpected_Image_IDs`. |

## 8. Test đã chạy

Runtime ghi nhận: `pytest` không có trong Python bundled, và venv dự án trỏ về Python 3.9 đã mất nên các binary package cũ (`pydantic_core`, `sklearn`) không import được bằng Python 3.12. Vì vậy các test mới được chạy bằng direct assert runner trên Python bundled.

Kết quả:

```text
PASS test_benchmark_normalization.py::test_field_correctness_keeps_independent_fields
PASS test_benchmark_normalization.py::test_missing_prediction_does_not_become_zero
PASS test_benchmark_normalization.py::test_normalize_denomination_required_examples
PASS test_benchmark_metrics_service.py::test_consistency_validation_catches_impossible_exact_match
PASS test_benchmark_metrics_service.py::test_duplicate_key_goes_to_duplicate_rows
PASS test_benchmark_metrics_service.py::test_exact_match_mismatch_and_missing_prediction_are_audited
PASS test_benchmark_metrics_service.py::test_ground_truth_conflict_from_manifest_marks_metrics_non_valid
PASS_COUNT=7
```

Compile checks:

```text
py_compile benchmark_normalization.py benchmark_metrics_math.py benchmark_metrics_service.py metrics_service.py experiment_service.py experiment_run_model.py: PASS
```

Manual smoke:

- `BenchmarkMetricsService.calculate(...)` chạy thành công với AI workbook + manifest.
- `BenchmarkMetricsService.calculate(...)` chạy thành công với REAL workbook + manifest.
- `MetricsService.calculate_from_excel(...)` chạy thành công trên workbook mẫu có missing prediction.

Lint/type check:

- Không tìm thấy cấu hình `pyproject.toml`, `ruff`, `mypy`, `tox`, `setup.cfg` hoặc pytest config trong `NDTG_BCNCKH_WEB/server`; chỉ thấy `requirements.txt`, nên không có lệnh lint/type-check chuẩn của dự án để chạy trong workspace hiện tại.

## 9. Trạng thái còn lại

Code benchmark đã được sửa theo logic tổng quát, không hard-code các ID cụ thể. Dữ liệu vẫn cần xác minh thủ công ở các image ID bị tool báo lỗi, đặc biệt `A070`, `A092`, `A093`, `R099`, trước khi công bố metric chính thức là `VALID`.
