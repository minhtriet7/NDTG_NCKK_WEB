from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class BanknoteBase(BaseModel):
    country: str
    denomination: str
    currency_code: str

    origin: str
    description: str
    material: str = "Unknown"
    series_year: str = "Unknown"

    features: List[str] = Field(default_factory=list)

    front_image_url: Optional[str] = None
    back_image_url: Optional[str] = None
    is_active: bool = True


class BanknoteCreate(BanknoteBase):
    pass


class BanknoteUpdate(BaseModel):
    country: Optional[str] = None
    denomination: Optional[str] = None
    currency_code: Optional[str] = None

    origin: Optional[str] = None
    description: Optional[str] = None
    material: Optional[str] = None
    series_year: Optional[str] = None

    features: Optional[List[str]] = None

    front_image_url: Optional[str] = None
    back_image_url: Optional[str] = None
    is_active: Optional[bool] = None


class BanknoteResponse(BanknoteBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True