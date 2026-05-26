from math import ceil
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel


T = TypeVar("T")


class PaginatedData(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class ApiSuccess(BaseModel, Generic[T]):
    success: bool = True
    message: str = "Thành công"
    data: Optional[T] = None


class ApiError(BaseModel):
    success: bool = False
    message: str
    error_code: str = "INTERNAL_SERVER_ERROR"


def success_response(data=None, message: str = "Thành công") -> dict:
    return ApiSuccess(data=data, message=message).model_dump()


def error_response(
    message: str,
    error_code: str = "INTERNAL_SERVER_ERROR",
) -> dict:
    return ApiError(message=message, error_code=error_code).model_dump()


def paginated_response(
    items: list,
    total: int,
    page: int,
    page_size: int,
    message: str = "Thành công",
) -> dict:
    total_pages = ceil(total / page_size) if page_size else 0

    return success_response(
        data=PaginatedData(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        ).model_dump(),
        message=message,
    )