import asyncio
import httpx
from typing import List, Dict, Any

async def check_url_alive(client: httpx.AsyncClient, url: str) -> bool:
    if not url:
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
        response = await client.head(url, headers=headers, timeout=2.5, follow_redirects=True)
        if response.status_code < 400:
            return True
        
        # Step 2: Fallback to GET stream if HEAD is blocked or forbidden
        if response.status_code in {403, 404, 405, 501}:
            async with client.stream("GET", url, headers=headers, timeout=2.5, follow_redirects=True) as r:
                return r.status_code < 400
        return False
    except Exception:
        return False

async def filter_alive_links(evidence: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not evidence:
        return []

    # Disable SSL verification for niche or local sites that might have self-signed certificates
    async with httpx.AsyncClient(verify=False, follow_redirects=True) as client:
        tasks = []
        for item in evidence:
            url = item.get("url") or item.get("link") or ""
            tasks.append(check_url_alive(client, url))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        alive_evidence = []
        for item, is_alive in zip(evidence, results):
            if is_alive is True:
                alive_evidence.append(item)
        
        # Safety fallback: If all links were filtered out, keep the original list 
        # to avoid returning empty results in case of network outages on the server.
        if not alive_evidence and evidence:
            print("[LinkValidator] Warning: All links detected as dead, falling back to original list for safety.")
            return evidence
            
        return alive_evidence
