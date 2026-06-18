from beanie import Document
from pydantic import EmailStr, Field
from typing import Any, Dict, Optional
from datetime import datetime, timezone


class User(Document):
    email: EmailStr
    hashed_password: str = ""
    full_name: str

    role: str = "user"  # user, admin
    provider: str = "local"  # local, google

    phone: Optional[str] = None
    country: str = "Vietnam"

    token_balance: int = 5

    is_active: bool = True
    email_verified: bool = False
    email_verification_token_hash: Optional[str] = None
    email_verification_expires_at: Optional[datetime] = None
    email_verification_sent_at: Optional[datetime] = None
    avatar_url: Optional[str] = None
    preferences: Dict[str, Any] = Field(default_factory=dict)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login_at: Optional[datetime] = None

    class Settings:
        name = "users"
