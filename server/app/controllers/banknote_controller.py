from app.services.banknote_service import BanknoteService


class BanknoteController:
    @staticmethod
    async def get_all():
        return await BanknoteService.get_all_banknotes()

    @staticmethod
    async def get_one(banknote_id: str):
        return await BanknoteService.get_banknote_by_id(banknote_id)

    @staticmethod
    async def create(data: dict):
        return await BanknoteService.create_banknote(data)

    @staticmethod
    async def update(banknote_id: str, data: dict):
        return await BanknoteService.update_banknote(banknote_id, data)

    @staticmethod
    async def delete(banknote_id: str):
        return await BanknoteService.delete_banknote(banknote_id)