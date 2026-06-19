# -*- coding: utf-8 -*-
import pathlib

file_path = "app/services/recognition_service.py"
content = pathlib.Path(file_path).read_text(encoding="utf-8")

bad_chunk = '''            elif final_consensus.get("require_rerun"):
                status_value = "Needs Review"
        )'''

good_chunk = '''            elif final_consensus.get("require_rerun"):
                status_value = "Needs Review"
            else:
                status_value = "Completed"
        else:
            # Multi-object: dùng counter thay vì any()
            if completed_count == len(detected_results):
                status_value = "Completed"
            elif completed_count == 0 and needs_image_count == len(detected_results):
                # Tất cả đều cần ảnh tốt hơn
                status_value = "needs_better_image"
            elif completed_count > 0:
                # Partial: có ít nhất 1 completed → Needs Review, không sập toàn bộ
                status_value = "Needs Review"
            else:
                status_value = "Needs Review"

        if overflow_objects:
            final_consensus["overflow_objects"] = sanitize_for_storage(overflow_objects, keep_crop_base64=False)
            final_consensus["limit_info"] = {
                "max_processed_objects": MAX_PROCESSED_BANKNOTE_OBJECTS,
                "detected_count": len(eligible_objects),
                "processed_count": len(processed_objects),
                "skipped_count": len(overflow_objects),
                "message_vi": f"Đã phát hiện {len(eligible_objects)} tờ tiền. Hệ thống chỉ xử lý {len(processed_objects)} tờ có độ tin cậy cao nhất, {len(overflow_objects)} tờ còn lại chưa được xử lý.",
                "message_en": f"Detected {len(eligible_objects)} banknotes. The system processed the {len(processed_objects)} most confident ones and skipped {len(overflow_objects)} due to the task limit."
            }
            if status_value == "Completed":
                status_value = "completed_with_limit"
                final_consensus["status"] = status_value

        logger.info(
            "[Recognition] final status=%s require_rerun=%s detected_count=%s",
            status_value, final_consensus.get("require_rerun"), len(detected_results)
        )

        agent_usages = await RecognitionService.build_agent_usages(
            agent_results=all_agent_results,
            final_consensus=final_consensus,
            context_for_llm="Multi-object banknote recognition pipeline",
        )

        record = RecognitionRequest(
            user_id=str(user.id),
            uploaded_image_url=image_url or "https://via.placeholder.com/400",
            status=status_value,
            final_result=final_consensus,
            agent_results=all_agent_results,
            task_id=str(task.id) if task else None,
            processing_time_ms=int((now_utc() - started_at).total_seconds() * 1000),
            created_at=now_utc(),
            updated_at=now_utc(),
        )'''

if bad_chunk in content:
    content = content.replace(bad_chunk, good_chunk)
    pathlib.Path(file_path).write_text(content, encoding="utf-8")
    print("Fixed!")
else:
    print("Could not find bad chunk!")
