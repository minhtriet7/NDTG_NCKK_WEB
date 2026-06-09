import json
import requests
import asyncio
from typing import Optional, List, Dict, Any

from app.core.config import settings
from app.agents.agent_2_llm import (
    JSON_TEMPLATE,
    get_gemini_client,
    clean_json,
    MODEL_LLM_MAIN,
)
from app.agents.base_agent import BaseAgent
from google.genai import types # 🌟 THÊM IMPORT NÀY ĐỂ ÉP KIỂU JSON

class Agent3Lens(BaseAgent):
    def __init__(self):
        super().__init__(agent_name="Agent 3 (Google Lens SerpApi)")

    def upload_to_imgbb(self, image_bytes: bytes) -> Optional[str]:
        try:
            if not settings.IMGBB_API_KEY:
                print(f"[{self.agent_name}] Thiếu IMGBB_API_KEY")
                return None

            upload_url = "https://api.imgbb.com/1/upload"
            res = requests.post(
                upload_url,
                data={"key": settings.IMGBB_API_KEY},
                files={"image": image_bytes},
                timeout=10,
            )
            data = res.json()
            if "data" in data and "url" in data["data"]:
                return data["data"]["url"]

            print(f"[{self.agent_name}] Lỗi ImgBB Response: {data}")
            return None
        except Exception as e:
            print(f"[{self.agent_name}] Lỗi ImgBB Network: {e}")
            return None

    def _call_serpapi_google_lens(self, image_url: str) -> Dict[str, Any]:
        if not settings.SERPAPI_KEY:
            raise RuntimeError("Thiếu SERPAPI_KEY trong settings.")

        params = {
            "engine": "google_lens",
            "url": image_url,
            "api_key": settings.SERPAPI_KEY,
            "hl": "vi",
            "country": "vn",
            "type": "all",
            "no_cache": "true",
        }

        response = requests.get(
            "https://serpapi.com/search.json",
            params=params,
            timeout=15,
        )

        try:
            data = response.json()
        except Exception:
            raise RuntimeError(f"SerpApi không trả JSON hợp lệ: {response.text[:500]}")

        if response.status_code != 200:
            raise RuntimeError(f"SerpApi HTTP {response.status_code}: {data}")
        if "error" in data:
            raise RuntimeError(f"SerpApi error: {data.get('error')}")

        return data

    def _compact_serpapi_result(self, data: Dict[str, Any]) -> Dict[str, Any]:
        compact = {
            "knowledge_graph": None,
            "text_results": [],
            "visual_matches": [],
            "exact_matches": [],
            "reverse_image_search": [],
        }

        kg = data.get("knowledge_graph")
        if isinstance(kg, dict):
            compact["knowledge_graph"] = {
                "title": kg.get("title"),
                "subtitle": kg.get("subtitle"),
                "description": kg.get("description"),
                "source": kg.get("source"),
                "link": kg.get("link"),
            }

        text_results = data.get("text_results") or data.get("text") or []
        if isinstance(text_results, list):
            for item in text_results[:10]:
                if isinstance(item, dict):
                    compact["text_results"].append({
                        "text": item.get("text") or item.get("title"),
                        "link": item.get("link"),
                    })

        visual_matches = data.get("visual_matches") or []
        if isinstance(visual_matches, list):
            for item in visual_matches[:12]:
                if isinstance(item, dict):
                    compact["visual_matches"].append({
                        "title": item.get("title"),
                        "source": item.get("source"),
                        "link": item.get("link"),
                        "snippet": item.get("snippet"),
                    })

        exact_matches = data.get("exact_matches") or []
        if isinstance(exact_matches, list):
            for item in exact_matches[:12]:
                if isinstance(item, dict):
                    compact["exact_matches"].append({
                        "title": item.get("title"),
                        "source": item.get("source"),
                        "link": item.get("link"),
                        "snippet": item.get("snippet"),
                    })

        image_sources = data.get("image_sources") or data.get("reverse_image_search") or []
        if isinstance(image_sources, list):
            for item in image_sources[:10]:
                if isinstance(item, dict):
                    compact["reverse_image_search"].append({
                        "title": item.get("title"),
                        "source": item.get("source"),
                        "link": item.get("link"),
                    })

        return compact

    def _has_useful_lens_data(self, compact: Dict[str, Any]) -> bool:
        if compact.get("knowledge_graph"):
            return True
        for key in ["text_results", "visual_matches", "exact_matches", "reverse_image_search"]:
            items = compact.get(key)
            if isinstance(items, list) and len(items) > 0:
                return True
        return False

    def build_visual_search_result(
        self,
        raw_lens_text: Optional[str] = None,
        formatted_result: Optional[dict] = None,
        error: Optional[Exception] = None,
    ) -> str:
        if formatted_result:
            formatted_result["status"] = formatted_result.get("status", "Completed")
            formatted_result["raw_text"] = raw_lens_text
            return json.dumps([formatted_result], ensure_ascii=False)

        if raw_lens_text:
            fallback_data = {
                "quoc_gia": "Không xác định",
                "menh_gia": "Không xác định",
                "mat_tien": "Không xác định",
                "nam_phat_hanh": "Không xác định",
                "chat_lieu": "Không xác định",
                "mo_ta": raw_lens_text[:500],
                "quan_diem": "Google Lens/SerpApi đã trả về dữ liệu thô, nhưng bước format bằng LLM không chốt được. Hệ thống giữ raw_text để hỗ trợ đối chiếu thủ công.",
                "phuong_phap": "Google Lens SerpApi raw fallback",
                "do_tin_cay": 0.25,
                "van_ban_nhin_thay": [],
                "dac_diem_chinh": [],
                "status": "Partial",
                "raw_text": raw_lens_text,
            }
            return json.dumps([fallback_data], ensure_ascii=False)

        failed_data = {
            "quoc_gia": "Lỗi",
            "menh_gia": "Lỗi",
            "mat_tien": "Lỗi",
            "nam_phat_hanh": "Lỗi",
            "chat_lieu": "Lỗi",
            "mo_ta": "Lỗi",
            "quan_diem": f"{self.agent_name} gặp sự cố: {error or 'Không lấy được dữ liệu Google Lens.'}",
            "phuong_phap": self.agent_name,
            "do_tin_cay": 0.0,
            "van_ban_nhin_thay": [],
            "dac_diem_chinh": [],
            "status": "Failed",
        }
        return json.dumps([failed_data], ensure_ascii=False)

    def parse_formatted_result(self, formatted_json_text: str, raw_lens_data: str) -> str:
        try:
            parsed = json.loads(formatted_json_text)
            item = parsed[0] if isinstance(parsed, list) and parsed else parsed

            if not isinstance(item, dict):
                return self.build_visual_search_result(raw_lens_text=raw_lens_data)

            item.setdefault("quoc_gia", "Không xác định")
            item.setdefault("menh_gia", "Không xác định")
            item.setdefault("mat_tien", "Không xác định")
            item.setdefault("nam_phat_hanh", "Không xác định")
            item.setdefault("chat_lieu", "Không xác định")
            item.setdefault("mo_ta", "Không có mô tả.")
            item.setdefault("quan_diem", "Không có lập luận.")
            item.setdefault("phuong_phap", "Google Lens SerpApi")
            item.setdefault("do_tin_cay", 0.5)
            item.setdefault("van_ban_nhin_thay", [])
            item.setdefault("dac_diem_chinh", [])
            item.setdefault("status", "Completed")
            item["raw_text"] = raw_lens_data

            return json.dumps([item], ensure_ascii=False)

        except Exception as e:
            print(f"[{self.agent_name}] Lỗi parse formatted Lens result: {e}")
            return self.build_visual_search_result(raw_lens_text=raw_lens_data, error=e)

    async def _format_lens_results_with_llm(
        self,
        compact_lens_data: Dict[str, Any],
        context: str = "",
    ) -> str:
        raw_lens_data = json.dumps(compact_lens_data, ensure_ascii=False, indent=2)

        prompt_format = f"""
Bạn là Agent 3 trong hệ thống nhận diện tiền giấy.

Dữ liệu dưới đây là kết quả Google Lens lấy qua SerpApi:
{raw_lens_data}

Nhiệm vụ:
- Dựa trên tiêu đề, nguồn, link, snippet, exact matches, visual matches, knowledge graph nếu có.
- Suy luận xem ảnh là tờ tiền nào.
- Chỉ nhận định khi dữ liệu Lens thật sự liên quan đến tiền giấy.
- Nếu dữ liệu không đủ liên quan đến tiền giấy, trả "Không xác định".
- Không được bịa mệnh giá nếu Lens không có bằng chứng.
- Ưu tiên các nguồn có tiêu đề/link/snippet nhắc đến banknote, currency, VND, Vietnam, money, tiền, đồng, mệnh giá.
- Nếu có nhiều kết quả mâu thuẫn, nêu rõ trong "quan_diem".

Context từ vòng tranh biện trước nếu có:
{context}

Format bắt buộc:
{JSON_TEMPLATE}

Quy tắc:
- Chỉ trả JSON hợp lệ.
- Không markdown.
- Field "phuong_phap" ghi: "Google Lens SerpApi".
- Field "do_tin_cay" từ 0.0 đến 1.0.
"""
        # 🌟 CẬP NHẬT 1: Chuyển sang model lite để né Quota và phản hồi nhanh hơn
        # 🌟 CẬP NHẬT 2: Sử dụng GenerateContentConfig để ép trả về JSON cấu trúc sạch
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    get_gemini_client().models.generate_content,
                    model="gemini-2.5-flash-lite",
                    contents=[prompt_format],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                ),
                timeout=20.0
            )
        except asyncio.TimeoutError:
            raise RuntimeError("Gemini Lens format call timeout after 20s.")

        return clean_json(response.text or "")

    async def run(self, image_bytes: bytes, context: str = "") -> str:
        if not settings.IMGBB_API_KEY:
            return self.build_visual_search_result(error=Exception("Thiếu IMGBB_API_KEY"))

        if not settings.SERPAPI_KEY:
            return self.build_visual_search_result(error=Exception("Thiếu SERPAPI_KEY"))

        try:
            print(f"[{self.agent_name}] Upload ảnh lên ImgBB...")
            image_url = await asyncio.to_thread(self.upload_to_imgbb, image_bytes)

            if not image_url:
                return self.build_visual_search_result(error=Exception("Upload ImgBB thất bại, không có image_url."))

            print(f"[{self.agent_name}] Gọi SerpApi Google Lens...")
            serpapi_data = await asyncio.to_thread(self._call_serpapi_google_lens, image_url)
            compact_data = self._compact_serpapi_result(serpapi_data)

            if not self._has_useful_lens_data(compact_data):
                return self.build_visual_search_result(error=Exception("SerpApi Google Lens không trả dữ liệu hữu ích."))

            raw_lens_data = json.dumps(compact_data, ensure_ascii=False)
            print(f"[{self.agent_name}] Đã có dữ liệu Lens, đang format bằng LLM...")

            last_error = None
            for attempt in range(2):
                try:
                    formatted_text = await self._format_lens_results_with_llm(compact_data, context=context)
                    print(f"[{self.agent_name}] Hoàn tất format Lens!")
                    return self.parse_formatted_result(formatted_text, raw_lens_data)

                except Exception as e:
                    last_error = e
                    error_text = str(e)
                    print(f"[{self.agent_name}] Lens formatter failed attempt {attempt + 1}/2: {error_text}")

                    if "503" in error_text or "429" in error_text or "RESOURCE_EXHAUSTED" in error_text or "quota" in error_text.lower():
                        await asyncio.sleep(2)
                        continue

                    return self.build_visual_search_result(raw_lens_text=raw_lens_data, error=e)

            return self.build_visual_search_result(raw_lens_text=raw_lens_data, error=last_error)

        except Exception as e:
            print(f"[{self.agent_name}] Lỗi tổng: {e}")
            return self.build_visual_search_result(error=e)


async def run_agent3_lens(image_bytes: bytes, context: str = "") -> str:
    agent = Agent3Lens()
    return await agent.run(image_bytes, context)