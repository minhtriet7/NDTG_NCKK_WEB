from typing import List, Optional
from beanie import Document
from pydantic import Field
from datetime import datetime, timezone


class TokenPackage(Document):
    package_key: Optional[str] = None
    name: str

    price_usd: float = 0
    price_vnd: float = 0
    tokens_included: int

    description: str = ""
    features: List[str] = Field(default_factory=list)
    badge: Optional[str] = ""

    sort_order: int = 0
    is_active: bool = True

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "token_packages"