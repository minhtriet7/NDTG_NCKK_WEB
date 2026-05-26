from beanie import Document
from pydantic import Field
from typing import List, Optional
from datetime import datetime, timezone


class Banknote(Document):
    country: str
    denomination: str
    currency_code: str

    origin: str
    description: str
    features: List[str] = Field(default_factory=list)

    material: str = "Unknown"
    series_year: str = "Unknown"

    front_image_url: Optional[str] = None
    back_image_url: Optional[str] = None

    is_active: bool = True

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "banknotes"