from fastapi import APIRouter, Query

from app.controllers.currency_controller import CurrencyController
from app.schemas.currency_schema import ConvertRequest


router = APIRouter()


@router.get("/rates")
async def get_rates():
    return await CurrencyController.get_rates()


@router.post("/convert")
async def convert_currency(data: ConvertRequest):
    return await CurrencyController.convert(data)


@router.get("/countries")
async def get_countries():
    return await CurrencyController.get_countries()


@router.get("/search")
async def search_currency(
    q: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=50),
):
    return await CurrencyController.search(q=q, limit=limit)
