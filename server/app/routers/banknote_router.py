from fastapi import APIRouter

from app.controllers.banknote_controller import BanknoteController


router = APIRouter()


@router.get("/")
async def get_all_banknotes():
    return await BanknoteController.get_all()


@router.get("/{banknote_id}")
async def get_banknote_detail(banknote_id: str):
    return await BanknoteController.get_one(banknote_id)