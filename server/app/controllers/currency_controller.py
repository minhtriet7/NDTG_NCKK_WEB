from app.schemas.currency_schema import ConvertRequest
from app.services.currency_service import CurrencyService


class CurrencyController:
    @staticmethod
    async def get_rates():
        return await CurrencyService.get_public_rates()

    @staticmethod
    async def convert(data: ConvertRequest):
        return await CurrencyService.convert_to_vnd(data)

    @staticmethod
    async def get_countries():
        return await CurrencyService.get_public_countries()

    @staticmethod
    async def search(q: str = "", limit: int = 20):
        return await CurrencyService.search_country_currencies(q=q, limit=limit)
