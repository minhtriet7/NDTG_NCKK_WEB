from fastapi import APIRouter

from app.controllers.currency_controller import CurrencyController
from app.schemas.currency_schema import ConvertRequest


router = APIRouter()


@router.get("/rates")
async def get_rates():
    return await CurrencyController.get_rates()


@router.post("/convert")
async def convert_currency(data: ConvertRequest):
    return await CurrencyController.convert(data)