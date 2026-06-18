from fastapi import APIRouter, HTTPException, Depends
from typing import List
from pydantic import BaseModel
from app.models.page_model import Page

router = APIRouter()

class PageResponse(BaseModel):
    slug: str
    title_en: str
    title_vi: str
    content_en: str
    content_vi: str

@router.get("/", response_model=List[PageResponse])
async def list_pages():
    pages = await Page.find_all().to_list()
    return [
        PageResponse(
            slug=p.slug,
            title_en=p.title_en,
            title_vi=p.title_vi,
            content_en=p.content_en,
            content_vi=p.content_vi
        )
        for p in pages
    ]

from app.utils.default_pages import DEFAULT_PAGES

# Trigger reload to pick up about page

@router.get("/{slug}", response_model=PageResponse)
async def get_page(slug: str):
    page = await Page.find_one(Page.slug == slug)
    if not page:
        default_page = DEFAULT_PAGES.get(slug)
        if default_page:
            return PageResponse(
                slug=slug,
                title_en=default_page["title_en"],
                title_vi=default_page["title_vi"],
                content_en=default_page["content_en"],
                content_vi=default_page["content_vi"]
            )
        
        # Hardcode About as a failsafe if module didn't reload
        if slug == "about":
            return PageResponse(
                slug="about",
                title_en="About BanknoteAI",
                title_vi="Về BanknoteAI",
                content_en="# About Us\n\nWe are a specialized technology platform focused on building the highest-grade AI models for the analysis and verification of banknotes worldwide.\n\n## Our Mission\nTo democratize enterprise-grade computer vision, making secure transactions accessible to everyone.",
                content_vi="# Về Chúng tôi\n\nChúng tôi là nền tảng công nghệ chuyên biệt, tập trung xây dựng các mô hình AI cao cấp nhất để phân tích và xác thực tiền giấy trên toàn thế giới.\n\n## Sứ mệnh\nĐưa công nghệ thị giác máy tính cấp doanh nghiệp đến với mọi người, giúp các giao dịch trở nên an toàn hơn."
            )
        
        return PageResponse(
            slug=slug,
            title_en=slug.replace("-", " ").title(),
            title_vi=slug.replace("-", " ").title() + " (Reloaded)",
            content_en="Content is being updated.",
            content_vi="Nội dung đang được cập nhật."
        )
    return PageResponse(
        slug=page.slug,
        title_en=page.title_en,
        title_vi=page.title_vi,
        content_en=page.content_en,
        content_vi=page.content_vi
    )

class PageUpdate(BaseModel):
    title_en: str
    title_vi: str
    content_en: str
    content_vi: str

from app.core.dependencies import require_admin

@router.put("/{slug}", response_model=PageResponse)
async def update_page(slug: str, page_in: PageUpdate, current_admin=Depends(require_admin)):
    page = await Page.find_one(Page.slug == slug)
    if not page:
        page = Page(slug=slug, **page_in.dict())
        await page.insert()
    else:
        page.title_en = page_in.title_en
        page.title_vi = page_in.title_vi
        page.content_en = page_in.content_en
        page.content_vi = page_in.content_vi
        from datetime import datetime, timezone
        page.updated_at = datetime.now(timezone.utc)
        await page.save()
        
    return PageResponse(
        slug=page.slug,
        title_en=page.title_en,
        title_vi=page.title_vi,
        content_en=page.content_en,
        content_vi=page.content_vi
    )
