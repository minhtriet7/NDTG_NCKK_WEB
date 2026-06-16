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

@router.get("/{slug}", response_model=PageResponse)
async def get_page(slug: str):
    page = await Page.find_one(Page.slug == slug)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
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
