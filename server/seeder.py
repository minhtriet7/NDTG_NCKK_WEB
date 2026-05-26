import os
import json
import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.core.config import settings
from app.models.banknote_model import Banknote
from app.models.token_package_model import TokenPackage
from app.models.currency_model import CurrencyRate


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

BANKNOTES_JSON = os.path.join(BASE_DIR, "banknotes_data.json")
TOKEN_PACKAGES_JSON = os.path.join(BASE_DIR, "token_packages_data.json")
SUPPORTED_CURRENCIES_JSON = os.path.join(BASE_DIR, "supported_currencies_data.json")


def read_json_file(file_path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(file_path):
        print(f"[Database Seeder] Khong tim thay file: {file_path}")
        return []

    try:
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, list):
            print(f"[Database Seeder] File JSON khong phai dang list: {file_path}")
            return []

        return data

    except json.JSONDecodeError as error:
        print(f"[Database Seeder] JSON sai dinh dang: {file_path}")
        print(f"[Database Seeder] Chi tiet loi: {error}")
        return []

    except Exception as error:
        print(f"[Database Seeder] Khong the doc file: {file_path}")
        print(f"[Database Seeder] Chi tiet loi: {error}")
        return []


async def seed_banknotes(reset: bool = True) -> None:
    banknotes_list = read_json_file(BANKNOTES_JSON)

    if not banknotes_list:
        print("[Database Seeder] Khong co du lieu banknotes de seed.")
        return

    if reset:
        print("[Database Seeder] Dang xoa du lieu cu trong collection banknotes...")
        await Banknote.find_all().delete()
        print("[Database Seeder] Da lam sach collection banknotes.")
    else:
        existing_count = await Banknote.count()

        if existing_count > 0:
            print(
                f"[Database Seeder] Collection banknotes da co {existing_count} ban ghi, bo qua seed."
            )
            return

    documents_to_insert = []
    skipped_count = 0

    for index, item in enumerate(banknotes_list, start=1):
        try:
            payload = dict(item)
            documents_to_insert.append(Banknote(**payload))
        except Exception as error:
            skipped_count += 1
            print(f"[Database Seeder] Bo qua banknote #{index} vi loi: {error}")

    if documents_to_insert:
        await Banknote.insert_many(documents_to_insert)

    print(
        f"[Database Seeder] Da seed {len(documents_to_insert)} banknotes. "
        f"Bo qua {skipped_count} ban ghi loi."
    )


async def seed_token_packages(reset: bool = False) -> None:
    existing_count = await TokenPackage.count()

    if existing_count > 0 and not reset:
        print(
            f"[Database Seeder] Collection token_packages da co {existing_count} goi, bo qua seed."
        )
        return

    packages_list = read_json_file(TOKEN_PACKAGES_JSON)

    if not packages_list:
        print("[Database Seeder] Khong co du lieu token_packages de seed.")
        return

    if reset:
        print("[Database Seeder] Dang xoa du lieu cu trong collection token_packages...")
        await TokenPackage.find_all().delete()
        print("[Database Seeder] Da lam sach collection token_packages.")

    now = datetime.now(timezone.utc)
    documents_to_insert = []
    skipped_count = 0

    for index, item in enumerate(packages_list, start=1):
        try:
            payload = dict(item)

            payload["created_at"] = payload.get("created_at") or now
            payload["updated_at"] = payload.get("updated_at") or now

            if "tokens_included" not in payload and "tokens" in payload:
                payload["tokens_included"] = payload["tokens"]

            if "tokens_included" not in payload:
                raise ValueError("Missing required field: tokens_included")

            documents_to_insert.append(TokenPackage(**payload))

        except Exception as error:
            skipped_count += 1
            print(f"[Database Seeder] Bo qua token package #{index} vi loi: {error}")

    if documents_to_insert:
        await TokenPackage.insert_many(documents_to_insert)

    print(
        f"[Database Seeder] Da seed {len(documents_to_insert)} token packages. "
        f"Bo qua {skipped_count} ban ghi loi."
    )


async def seed_currency_rates(reset: bool = False) -> None:
    existing_count = await CurrencyRate.count()

    if existing_count > 0 and not reset:
        print(
            f"[Database Seeder] Collection currency_rates da co {existing_count} ty gia, bo qua seed."
        )
        return

    rates_list = read_json_file(SUPPORTED_CURRENCIES_JSON)

    if not rates_list:
        print("[Database Seeder] Khong co du lieu currency_rates de seed.")
        return

    if reset:
        print("[Database Seeder] Dang xoa du lieu cu trong collection currency_rates...")
        await CurrencyRate.find_all().delete()
        print("[Database Seeder] Da lam sach collection currency_rates.")

    now = datetime.now(timezone.utc)
    documents_to_insert = []
    skipped_count = 0

    for index, item in enumerate(rates_list, start=1):
        try:
            payload = dict(item)

            # Cho phép JSON dùng code thay vì target_currency
            if "target_currency" not in payload and "code" in payload:
                payload["target_currency"] = payload["code"]

            if "currency_name" not in payload:
                payload["currency_name"] = (
                    payload.get("name_en")
                    or payload.get("name")
                    or payload.get("target_currency")
                    or payload.get("code")
                )

            if not payload.get("target_currency"):
                raise ValueError("Missing required field: target_currency")

            payload["target_currency"] = str(payload["target_currency"]).upper().strip()

            # VND là base, luôn có rate = 1
            if payload["target_currency"] == "VND":
                payload["rate_to_vnd"] = 1
                payload["market_rate_to_vnd"] = payload.get("market_rate_to_vnd") or 1
                payload["manual_rate_to_vnd"] = payload.get("manual_rate_to_vnd")
                payload["manual_override"] = bool(payload.get("manual_override", False))
                payload["source"] = payload.get("source") or "base"
                payload["provider"] = payload.get("provider") or "system"
                payload["is_stale"] = bool(payload.get("is_stale", False))
            else:
                if "rate_to_vnd" not in payload or payload.get("rate_to_vnd") is None:
                    payload["rate_to_vnd"] = (
                        payload.get("market_rate_to_vnd")
                        or payload.get("manual_rate_to_vnd")
                        or 0
                    )

                if payload["rate_to_vnd"] is None:
                    payload["rate_to_vnd"] = 0

                if "market_rate_to_vnd" not in payload:
                    payload["market_rate_to_vnd"] = payload.get("rate_to_vnd") or 0

                if "manual_rate_to_vnd" not in payload:
                    payload["manual_rate_to_vnd"] = None

                payload["manual_override"] = bool(payload.get("manual_override", False))
                payload["source"] = payload.get("source") or "seed"
                payload["provider"] = payload.get("provider") or "initial_seed"

                # Dữ liệu seed tỷ giá nên đánh dấu stale để admin biết cần sync thị trường
                payload["is_stale"] = bool(payload.get("is_stale", True))

            payload["is_active"] = bool(payload.get("is_active", True))
            payload["last_updated"] = payload.get("last_updated") or now
            payload["created_at"] = payload.get("created_at") or now
            payload["updated_at"] = payload.get("updated_at") or now

            # Nếu model CurrencyRate hiện tại chưa có field created_at/updated_at/provider...
            # Beanie/Pydantic có thể bỏ qua hoặc báo lỗi tùy config model.
            # Khi báo lỗi extra field, hãy bổ sung các field này vào model CurrencyRate.
            documents_to_insert.append(CurrencyRate(**payload))

        except Exception as error:
            skipped_count += 1
            print(f"[Database Seeder] Bo qua currency rate #{index} vi loi: {error}")

    if documents_to_insert:
        await CurrencyRate.insert_many(documents_to_insert)

    print(
        f"[Database Seeder] Da seed {len(documents_to_insert)} currency rates. "
        f"Bo qua {skipped_count} ban ghi loi."
    )


async def run_database_seeder() -> None:
    print("[Database Seeder] Dang ket noi toi MongoDB Atlas...")

    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db_name = settings.DATABASE_NAME

    try:
        await init_beanie(
            database=client[db_name],
            document_models=[
                Banknote,
                TokenPackage,
                CurrencyRate,
            ],
        )

        print(f"[Database Seeder] Da ket noi database: {db_name}")

        # Banknotes là dữ liệu danh mục, thường có thể reset từ JSON.
        await seed_banknotes(reset=True)

        # Token packages không nên reset nếu admin đã chỉnh gói trên web.
        await seed_token_packages(reset=False)

        # Currency rates không nên reset nếu admin đã sync/sửa tỷ giá trên web.
        await seed_currency_rates(reset=False)
        #await seed_currency_rates(reset=True)
        print("[Database Seeder] Hoan tat seed du lieu.")

    finally:
        client.close()
        print("[Database Seeder] Da dong ket noi MongoDB.")


if __name__ == "__main__":
    asyncio.run(run_database_seeder())