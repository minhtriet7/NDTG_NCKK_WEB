import asyncio
import ipaddress
import socket
import httpx
from typing import List, Dict, Any
from urllib.parse import urlparse


LINK_CHECK_TIMEOUT_SECONDS = 2.5
DNS_LOOKUP_TIMEOUT_SECONDS = 1.5
MAX_LINKS_TO_CHECK = 3


async def _is_safe_public_http_url(url: str) -> bool:
    try:
        parsed = urlparse(str(url or "").strip())
    except Exception:
        return False

    if parsed.scheme.lower() not in {"http", "https"}:
        return False
    if not parsed.hostname or parsed.username or parsed.password:
        return False

    hostname = parsed.hostname.strip().lower().rstrip(".")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
        return False

    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        literal_ip = None
    if literal_ip is not None:
        return literal_ip.is_global

    try:
        addresses = await asyncio.wait_for(
            asyncio.to_thread(
                socket.getaddrinfo,
                hostname,
                parsed.port or (443 if parsed.scheme.lower() == "https" else 80),
                0,
                socket.SOCK_STREAM,
            ),
            timeout=DNS_LOOKUP_TIMEOUT_SECONDS,
        )
    except Exception:
        return False

    resolved_ips = set()
    for address in addresses:
        try:
            resolved_ips.add(ipaddress.ip_address(address[4][0].split("%")[0]))
        except (ValueError, IndexError, TypeError):
            return False
    return bool(resolved_ips) and all(address.is_global for address in resolved_ips)

async def check_url_alive(client: httpx.AsyncClient, url: str) -> bool:
    if not url or not await _is_safe_public_http_url(url):
        return False
    # Common headers to mimic a regular web browser
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    try:
        # Step 1: Try HEAD request first for speed (2.5s timeout)
        response = await client.head(
            url,
            headers=headers,
            timeout=LINK_CHECK_TIMEOUT_SECONDS,
            follow_redirects=False,
        )
        if response.status_code < 400:
            return True
        
        # Step 2: Fallback to GET stream if HEAD is blocked or forbidden
        if response.status_code in {403, 405, 501}:
            async with client.stream(
                "GET",
                url,
                headers=headers,
                timeout=LINK_CHECK_TIMEOUT_SECONDS,
                follow_redirects=False,
            ) as r:
                return r.status_code < 400
        return False
    except Exception:
        return False

async def filter_alive_links(evidence: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not evidence:
        return []

    async with httpx.AsyncClient(follow_redirects=False) as client:
        tasks = []
        checked_items = evidence[:MAX_LINKS_TO_CHECK]
        unchecked_items = [dict(item, link_checked=False) for item in evidence[MAX_LINKS_TO_CHECK:]]
        for item in checked_items:
            url = item.get("url") or item.get("link") or ""
            tasks.append(check_url_alive(client, url))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        alive_evidence = []
        for item, is_alive in zip(checked_items, results):
            if is_alive is True:
                alive_evidence.append(dict(item, link_checked=True, link_alive=True))

        # Safety fallback: If all links were filtered out, keep the original list
        # to avoid returning empty results in case of network outages on the server.
        if not alive_evidence and checked_items:
            print("[LinkValidator] Warning: All links detected as dead, falling back to original list for safety.")
            alive_evidence = [
                dict(item, link_checked=True, link_alive=False)
                for item in checked_items
            ]

        return alive_evidence + unchecked_items
