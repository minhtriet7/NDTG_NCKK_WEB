from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, unquote, urlparse


GOOGLE_HOST_KEYWORDS = (
    "google.",
    "gstatic.",
    "ggpht.",
    "googleusercontent.",
    "schema.org",
)


def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _clean_spaces(text: str) -> str:
    return " ".join(_safe_text(text).replace("\n", " ").replace("\t", " ").split())


def _unwrap_google_url(url: str) -> str:
    """
    Gỡ link redirect dạng /url?q=...
    """
    if not url:
        return ""

    url = url.strip()

    try:
        parsed = urlparse(url)

        if parsed.netloc and "google" in parsed.netloc:
            qs = parse_qs(parsed.query)
            for key in ["q", "url", "imgurl"]:
                if key in qs and qs[key]:
                    return unquote(qs[key][0])

        if url.startswith("/url?"):
            qs = parse_qs(urlparse(url).query)
            if "q" in qs and qs["q"]:
                return unquote(qs["q"][0])

    except Exception:
        pass

    return url


def _is_external_url(url: str) -> bool:
    if not url:
        return False

    lower = url.lower()

    if not lower.startswith(("http://", "https://")):
        return False

    host = urlparse(lower).netloc

    if not host:
        return False

    if any(keyword in host for keyword in GOOGLE_HOST_KEYWORDS):
        return False

    return True


def _get_attr(element, name: str) -> str:
    try:
        return element.get_attribute(name) or ""
    except Exception:
        return ""


def _element_text(driver, element) -> str:
    try:
        # Use JavaScript to get text regardless of CSS visibility
        txt = driver.execute_script("return arguments[0].innerText || arguments[0].textContent;", element)
        return _clean_spaces(txt or "")
    except Exception:
        return ""


def _parent_text(driver, element, depth: int = 3) -> str:
    """
    Lấy text vùng cha để làm snippet.
    """
    try:
        current = element
        best = _element_text(driver, current)

        for _ in range(depth):
            current = driver.execute_script("return arguments[0].parentElement;", current)
            if not current:
                break

            txt = _element_text(driver, current)
            if len(txt) > len(best):
                best = txt

            if len(best) > 500:
                break

        return best[:1000]
    except Exception:
        return _element_text(driver, element)[:1000]


def _classify_bucket(title: str, snippet: str, url: str) -> str:
    text = f"{title} {snippet} {url}".lower()

    if any(k in text for k in ["exact match", "exact matches", "trùng khớp chính xác"]):
        return "exact_match"

    if any(k in text for k in ["visual match", "visual matches", "kết quả hình ảnh", "hình ảnh tương tự"]):
        return "visual_match"

    if any(k in text for k in ["banknote", "currency", "money", "tiền giấy", "mệnh giá"]):
        return "visual_match"

    return "text_result"


def _dedupe(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    output = []

    for item in items:
        key = (
            _clean_spaces(item.get("title", "")).lower(),
            _clean_spaces(item.get("url", "")).lower(),
        )

        if key in seen:
            continue

        seen.add(key)
        output.append(item)

    return output


def extract_lens_evidence_from_driver(
    driver,
    max_visual_matches: int = 10,
    max_exact_matches: int = 5,
    max_text_results: int = 5,
) -> List[Dict[str, Any]]:
    """
    Trích xuất evidence từ trang Google Lens đang mở.

    Không phụ thuộc 1 selector duy nhất. Chiến lược:
    - lấy tất cả thẻ a có href external.
    - dùng text của thẻ + text vùng cha làm title/snippet.
    - lọc bỏ link Google nội bộ.
    - phân loại bucket nhẹ.
    """
    raw_items: List[Dict[str, Any]] = []

    try:
        anchors = driver.find_elements("css selector", "a[href]")
    except Exception:
        anchors = []

    for index, anchor in enumerate(anchors):
        href = _unwrap_google_url(_get_attr(anchor, "href"))

        if not _is_external_url(href):
            continue

        anchor_text = _element_text(driver, anchor)
        snippet = _parent_text(driver, anchor, depth=4)

        title = anchor_text

        if not title:
            title = snippet[:120]

        title = _clean_spaces(title)
        snippet = _clean_spaces(snippet)

        if not title and not snippet:
            continue

        bucket = _classify_bucket(title, snippet, href)
        source = urlparse(href).netloc.replace("www.", "")

        raw_items.append(
            {
                "bucket": bucket,
                "title": title[:250],
                "snippet": snippet[:800],
                "url": href,
                "source": source,
                "position": index + 1,
            }
        )

    items = _dedupe(raw_items)

    exact = [item for item in items if item["bucket"] == "exact_match"][:max_exact_matches]
    visual = [item for item in items if item["bucket"] == "visual_match"][:max_visual_matches]
    text = [item for item in items if item["bucket"] == "text_result"][:max_text_results]

    output = exact + visual + text

    if output:
        return output

    # Fallback: lấy text body nếu không có link external.
    try:
        body_text = _clean_spaces(driver.execute_script("return document.body.innerText || document.body.textContent;") or "")
    except Exception:
        body_text = ""

    if body_text:
        return [
            {
                "bucket": "page_text",
                "title": "Google Lens page text",
                "snippet": body_text[:1200],
                "url": "",
                "source": "lens.google.com",
                "position": 1,
            }
        ]

    return []
