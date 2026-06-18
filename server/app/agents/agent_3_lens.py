import json
import requests
import asyncio
import re
import time
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


DENOMINATION_VALUES = [
    500000,
    100000,
    50000,
    20000,
    10000,
    5000,
    2000,
    1000,
    500,
]

COUNTRY_RULES = [
    {
        "country": "Myanmar",
        "currency": "MMK",
        "keywords": ["myanmar", "burma", "kyat", "kyats", "mmk"],
    },
    {
        "country": "Cambodia",
        "currency": "KHR",
        "keywords": ["cambodia", "khmer", "riel", "riels", "khr"],
    },
    {
        "country": "Laos",
        "currency": "LAK",
        "keywords": ["laos", "lao", "kip", "lak"],
    },
    {
        "country": "Thailand",
        "currency": "THB",
        "keywords": ["thailand", "thai", "baht", "thb"],
    },
    {
        "country": "Vietnam",
        "currency": "VND",
        "keywords": ["vietnam", "viet nam", "vnd", "dong", "đồng"],
    },
]


def _evidence_text(item: Dict[str, Any]) -> str:
    return " ".join(
        str(item.get(key) or "")
        for key in ("title", "snippet", "source", "url", "link", "text")
    )


def _detect_country_currency(text: str) -> tuple[Optional[str], Optional[str], List[str]]:
    lowered = text.lower()
    best_match = None
    best_score = 0
    matched_keywords: List[str] = []

    for rule in COUNTRY_RULES:
        keywords = [kw for kw in rule["keywords"] if kw in lowered]
        if len(keywords) > best_score:
            best_match = rule
            best_score = len(keywords)
            matched_keywords = keywords

    if not best_match:
        return None, None, []

    return best_match["country"], best_match["currency"], matched_keywords


def _detect_amount(text: str) -> Optional[int]:
    normalized = text.lower().replace(",", "").replace(".", "")

    for amount in DENOMINATION_VALUES:
        pattern = rf"(?<!\d){amount}(?!\d)"
        if re.search(pattern, normalized):
            return amount

    return None


def parse_lens_evidence_without_llm(
    evidence_items: List[Dict[str, Any]],
    raw_lens_text: str = "",
) -> Dict[str, Any]:
    """
    Deterministic fallback parser for Google Lens evidence.
    It avoids calling any LLM when the formatter is unavailable.
    """
    evidence_items = [item for item in evidence_items or [] if isinstance(item, dict)]
    combined_text = " ".join(_evidence_text(item) for item in evidence_items)
    country, currency, country_keywords = _detect_country_currency(combined_text)
    amount = _detect_amount(combined_text)

    visible_text = []
    for item in evidence_items[:5]:
        title = str(item.get("title") or item.get("text") or "").strip()
        if title and title not in visible_text:
            visible_text.append(title[:160])

    features = []
    if country_keywords:
        features.append(f"country_keywords:{','.join(country_keywords[:4])}")
    if amount:
        features.append(f"amount:{amount}")
    if evidence_items:
        features.append(f"evidence_count:{len(evidence_items)}")

    has_clear_identity = bool(country and currency and amount)
    has_partial_identity = bool((country or currency) and evidence_items)
    confidence = 0.58 if has_clear_identity else 0.32 if has_partial_identity else 0.2
    status = "Completed" if has_clear_identity else "Partial"

    if has_clear_identity:
        denomination = f"{amount} {currency}"
        description = (
            f"Google Lens evidence mentions {country} / {currency} and amount {amount}. "
            "Result was parsed without LLM formatter."
        )
    else:
        denomination = "Không xác định"
        description = (
            "Google Lens returned raw evidence, but deterministic parser could not "
            "identify both country/currency and denomination confidently."
        )

    return {
        "quoc_gia": country or "Không xác định",
        "ma_tien_te": currency or "Không xác định",
        "menh_gia": denomination,
        "mat_tien": "Không xác định",
        "nam_phat_hanh": "Không xác định",
        "chat_lieu": "Không xác định",
        "mo_ta": description,
        "quan_diem": description,
        "phuong_phap": "Google Lens SerpApi parser fallback",
        "do_tin_cay": confidence,
        "van_ban_nhin_thay": visible_text,
        "dac_diem_chinh": features,
        "status": status,
        "provider": "serpapi",
        "raw_text": raw_lens_text,
        "evidence": evidence_items[:5],
        "formatter_fallback": True,
    }

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
            timeout=int(getattr(settings, "AGENT3_SERPAPI_TIMEOUT_SECONDS", 20) or 20),
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
        evidence: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        if formatted_result:
            formatted_result["status"] = formatted_result.get("status", "Completed")
            formatted_result["raw_text"] = raw_lens_text
            if evidence is not None:
                formatted_result["evidence"] = evidence
            return json.dumps([formatted_result], ensure_ascii=False)

        if raw_lens_text:
            fallback_data = {
                "quoc_gia": "Không xác định",
                "ma_tien_te": "Không xác định",
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
            if evidence is not None:
                fallback_data["evidence"] = evidence
            return json.dumps([fallback_data], ensure_ascii=False)

        failed_data = {
            "quoc_gia": "Lỗi",
            "ma_tien_te": "Lỗi",
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
            "error_type": "technical_error",
            "technical_error": True,
        }
        if evidence is not None:
            failed_data["evidence"] = evidence
        return json.dumps([failed_data], ensure_ascii=False)

    def parse_formatted_result(self, formatted_json_text: str, raw_lens_data: str, evidence: Optional[List[Dict[str, Any]]] = None) -> str:
        try:
            parsed = json.loads(formatted_json_text)
            item = parsed[0] if isinstance(parsed, list) and parsed else parsed

            if not isinstance(item, dict):
                return self.build_visual_search_result(raw_lens_text=raw_lens_data, evidence=evidence)

            item.setdefault("quoc_gia", "Không xác định")
            item.setdefault("ma_tien_te", "Không xác định")
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
            if evidence is not None:
                item["evidence"] = evidence

            return json.dumps([item], ensure_ascii=False)

        except Exception as e:
            print(f"[{self.agent_name}] Lỗi parse formatted Lens result: {e}")
            return self.build_visual_search_result(raw_lens_text=raw_lens_data, error=e, evidence=evidence)

    async def _format_lens_results_with_llm(
        self,
        compact_lens_data: Dict[str, Any],
        context: str = "",
        debug_log: Optional[Dict] = None,
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
        if debug_log is not None:
            debug_log["prompt_sent"] = prompt_format
        # 🌟 CẬP NHẬT 1: Chuyển sang model lite để né Quota và phản hồi nhanh hơn
        # 🌟 CẬP NHẬT 2: Sử dụng GenerateContentConfig để ép trả về JSON cấu trúc sạch
        formatter_timeout = int(getattr(settings, "AGENT3_FORMATTER_TIMEOUT_SECONDS", 10) or 10)

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
                timeout=formatter_timeout,
            )
        except asyncio.TimeoutError:
            raise RuntimeError(f"Gemini Lens format call timeout after {formatter_timeout}s.")

        raw_response = response.text or ""
        if debug_log is not None:
            debug_log["raw_response"] = raw_response

        return clean_json(raw_response)

    async def run(self, image_bytes: bytes, context: str = "", debug_log: Optional[Dict] = None) -> str:
        if not settings.IMGBB_API_KEY:
            return self.build_visual_search_result(error=Exception("Thiếu IMGBB_API_KEY"))

        if not settings.SERPAPI_KEY:
            return self.build_visual_search_result(error=Exception("Thiếu SERPAPI_KEY"))

        try:
            print(f"[{self.agent_name}] Upload ảnh lên ImgBB...")
            upload_started = time.perf_counter()
            image_url = await asyncio.to_thread(self.upload_to_imgbb, image_bytes)
            upload_ms = int((time.perf_counter() - upload_started) * 1000)
            print(f"[Agent3Timing] upload_ms={upload_ms}")

            if not image_url:
                return self.build_visual_search_result(error=Exception("Upload ImgBB thất bại, không có image_url."))

            print(f"[{self.agent_name}] Gọi SerpApi Google Lens...")
            serpapi_started = time.perf_counter()
            serpapi_data = None
            serpapi_last_error = None
            serpapi_attempts = max(1, int(getattr(settings, "AGENT3_SERPAPI_MAX_RETRIES", 1) or 1))

            for serpapi_attempt in range(serpapi_attempts):
                try:
                    serpapi_data = await asyncio.to_thread(self._call_serpapi_google_lens, image_url)
                    break
                except Exception as exc:
                    serpapi_last_error = exc
                    if serpapi_attempt + 1 >= serpapi_attempts:
                        raise
                    await asyncio.sleep(0.5)

            serpapi_ms = int((time.perf_counter() - serpapi_started) * 1000)
            print(f"[Agent3Timing] serpapi_ms={serpapi_ms}")
            compact_data = self._compact_serpapi_result(serpapi_data)

            if not self._has_useful_lens_data(compact_data):
                return self.build_visual_search_result(error=Exception("SerpApi Google Lens không trả dữ liệu hữu ích."))

            # Combine matches into a list of evidence
            raw_evidence = []
            for item in compact_data.get("exact_matches") or []:
                raw_evidence.append({
                    "bucket": "exact_match",
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "url": item.get("link", ""),
                    "source": item.get("source", ""),
                })
            for item in compact_data.get("visual_matches") or []:
                raw_evidence.append({
                    "bucket": "visual_match",
                    "title": item.get("title", ""),
                    "snippet": item.get("snippet", ""),
                    "url": item.get("link", ""),
                    "source": item.get("source", ""),
                })
            for item in compact_data.get("text_results") or []:
                raw_evidence.append({
                    "bucket": "text_result",
                    "title": item.get("text") or item.get("title", ""),
                    "snippet": "",
                    "url": item.get("link", ""),
                    "source": "",
                })

            # Validate links asynchronously
            from app.utils.link_validator import filter_alive_links
            try:
                alive_evidence = await asyncio.wait_for(
                    filter_alive_links(raw_evidence),
                    timeout=5.0,
                )
            except Exception as exc:
                print(f"[{self.agent_name}] Link validation skipped: {exc}")
                alive_evidence = raw_evidence

            if not alive_evidence and raw_evidence:
                alive_evidence = raw_evidence

            # Reconstruct compact_data with alive links
            compact_data["exact_matches"] = [
                {
                    "title": item["title"],
                    "source": item["source"],
                    "link": item["url"],
                    "snippet": item["snippet"],
                }
                for item in alive_evidence if item["bucket"] == "exact_match"
            ]
            compact_data["visual_matches"] = [
                {
                    "title": item["title"],
                    "source": item["source"],
                    "link": item["url"],
                    "snippet": item["snippet"],
                }
                for item in alive_evidence if item["bucket"] == "visual_match"
            ]
            compact_data["text_results"] = [
                {
                    "text": item["title"],
                    "link": item["url"],
                }
                for item in alive_evidence if item["bucket"] == "text_result"
            ]

            # Rank alive evidence
            from app.services.evidence_ranker_service import rank_lens_evidence
            ranked_evidence = rank_lens_evidence(alive_evidence, context=context)
            top_evidence = ranked_evidence[:5]

            raw_lens_data = json.dumps(compact_data, ensure_ascii=False)
            print(f"[{self.agent_name}] Đã có dữ liệu Lens, đang format bằng LLM...")

            last_error = None
            formatter_attempts = max(1, int(getattr(settings, "AGENT3_FORMATTER_MAX_RETRIES", 1) or 1))
            for attempt in range(formatter_attempts):
                try:
                    formatter_started = time.perf_counter()
                    formatted_text = await self._format_lens_results_with_llm(compact_data, context=context, debug_log=debug_log)
                    formatter_ms = int((time.perf_counter() - formatter_started) * 1000)
                    print(f"[Agent3Timing] formatter_ms={formatter_ms}")
                    print(f"[{self.agent_name}] Hoàn tất format Lens!")
                    return self.parse_formatted_result(formatted_text, raw_lens_data, evidence=top_evidence)
                except Exception as e:
                    last_error = e
                    error_text = str(e)
                    print(f"[{self.agent_name}] Lens formatter failed attempt {attempt + 1}/{formatter_attempts}: {error_text}")

                    if attempt + 1 < formatter_attempts and (
                        "503" in error_text
                        or "429" in error_text
                        or "RESOURCE_EXHAUSTED" in error_text
                        or "quota" in error_text.lower()
                        or "timeout" in error_text.lower()
                    ):
                        await asyncio.sleep(2)
                        continue

                    break

            parser_started = time.perf_counter()
            fallback_result = parse_lens_evidence_without_llm(
                top_evidence or alive_evidence or raw_evidence,
                raw_lens_text=raw_lens_data,
            )
            fallback_result["formatter_error"] = str(last_error)[:300] if last_error else None
            parser_fallback_ms = int((time.perf_counter() - parser_started) * 1000)
            print(f"[Agent3Timing] parser_fallback_ms={parser_fallback_ms}")
            return json.dumps([fallback_result], ensure_ascii=False)

        except Exception as e:
            print(f"[{self.agent_name}] Lỗi tổng: {e}")
            return self.build_visual_search_result(error=e)


async def run_agent3_lens(image_bytes: bytes, context: str = "", debug_log: Optional[Dict] = None) -> str:
    agent = Agent3Lens()
    return await agent.run(image_bytes, context, debug_log=debug_log)
