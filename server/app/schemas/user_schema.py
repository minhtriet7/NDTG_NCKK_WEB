from pydantic import BaseModel, EmailStr, Field
from pydantic.functional_validators import BeforeValidator
from typing import Any, Dict, Optional, Annotated
from datetime import datetime


PyObjectId = Annotated[str, BeforeValidator(str)]


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    email: EmailStr
    full_name: str

    role: str = "user"
    provider: str = "local"

    token_balance: int = 0
    has_password: bool = True
    is_active: bool = True
    email_verified: bool = False

    phone: Optional[str] = None
    country: Optional[str] = None
    avatar_url: Optional[str] = None
    preferences: Dict[str, Any] = Field(default_factory=dict)

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }


class TokenSchema(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(..., min_length=6)


class UserPreferencesUpdate(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None
    default_country: Optional[str] = None
    default_currency: Optional[str] = None
