import json
import base64
import os
import asyncio
from typing import Any, Dict, Optional, Tuple

from openai import AsyncOpenAI
import openai

from app.agents.agent_2_llm import JSON_TEMPLATE, validate_agent2_result, build_agent2_prompt

_openai_client = None

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client

def _build_error_json(message: str) -> str:
    return json.dumps([
        {
            "quoc_gia": "Không xác định",
            "ma_tien_te": "Không xác định",
            "menh_gia": "Không xác định",
            "mat_tien": "Không xác định",
            "nam_phat_hanh": "Không xác định",
            "chat_lieu": "Không xác định",
            "mo_ta": message,
            "quan_diem": message,
            "phuong_phap": "LLM OpenAI",
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed",
        }
    ], ensure_ascii=False)

def _image_to_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")

async def _call_openai(base64_image: str, prompt: str) -> str:
    client = get_openai_client()
    if not client:
        raise ValueError("OpenAI client not initialized")
    response = await client.chat.completions.create(
        model="gpt-4o",
        response_format={ "type": "json_object" },
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        temperature=0.0
    )
    return response.choices[0].message.content

async def run_agent1_openai(
    image_bytes: bytes,
    debug_log: Optional[Dict] = None
) -> str:
    """
    Agent 1 dùng OpenAI GPT-4o Vision để nhận diện tiền giấy.
    Trả về chuỗi JSON chuẩn.
    """
    client = get_openai_client()
    if not client:
        return '[{"quoc_gia": "Không xác định", "ma_tien_te": "Không xác định", "menh_gia": "Không xác định", "mat_tien": "Không xác định", "nam_phat_hanh": "Không xác định", "chat_lieu": "Không xác định", "mo_ta": "OpenAI API Key is missing or disabled", "quan_diem": "OpenAI API Key is missing or disabled", "phuong_phap": "LLM OpenAI", "do_tin_cay": 0.0, "van_ban_nhin_thay": [], "dac_diem_chinh": [], "status": "Failed"}]'

    try:
        base64_img = _image_to_base64(image_bytes)
    except Exception as e:
        return _build_error_json(f"Lỗi xử lý ảnh: {e}")

    # Tái sử dụng prompt của Agent 2 nhưng thêm yêu cầu bọc trong object "results" nếu cần cho JSON object format
    base_prompt = build_agent2_prompt()
    prompt = base_prompt + "\n\nQUAN TRỌNG: Bạn BẮT BUỘC phải trả về một JSON Object chứa một mảng với key là 'results' chứa cấu trúc như sau:\n" + JSON_TEMPLATE

    if debug_log is not None:
        debug_log["prompt"] = prompt
        debug_log["model"] = "gpt-4o"

    try:
        raw_response = await _call_openai(base64_img, prompt)
        
        if debug_log is not None:
            debug_log["raw_response"] = raw_response
            
        # Parse JSON vì OpenAI trả về {"results": [...]}
        try:
            parsed = json.loads(raw_response)
            if "results" in parsed:
                json_text = json.dumps(parsed["results"])
            else:
                json_text = raw_response
        except Exception:
            json_text = raw_response
            
        is_valid, msg, normalized = validate_agent2_result(json_text)
        
        if is_valid and normalized:
            # Override phuong_phap thành LLM OpenAI
            try:
                data = json.loads(normalized)
                data[0]["phuong_phap"] = "LLM OpenAI"
                return json.dumps(data, ensure_ascii=False)
            except Exception:
                return normalized
        else:
            return _build_error_json(f"Lỗi parse JSON: {msg}")

    except openai.AuthenticationError:
        return _build_error_json("Lỗi xác thực OpenAI API (Sai API Key).")
    except Exception as e:
        return _build_error_json(f"Lỗi gọi OpenAI: {e}")
