from beanie import Document
from pydantic import Field
from typing import Optional
from datetime import datetime, timezone

class Page(Document):
    slug: str = Field(unique=True, index=True)
    title_en: str
    title_vi: str
    content_en: str
    content_vi: str
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "pages"
