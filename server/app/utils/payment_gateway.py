from urllib.parse import quote_plus

from app.core.config import settings


class SepayGateway:
    @staticmethod
    async def create_payment_qr(
        user_id: str,
        package_name: str,
        amount: int,
        tx_code: str,
        transfer_content: str = None,
    ) -> dict:
        if not settings.BANK_ACCOUNT_NUMBER or not settings.BANK_ID:
            return {
                "qr_url": "",
                "transaction_code": tx_code,
                "transfer_content": transfer_content or tx_code,
                "amount": amount,
                "bank_account": "Chưa cấu hình",
                "bank_name": "Chưa cấu hình",
                "account_name": settings.ACCOUNT_NAME,
            }

        final_content = transfer_content or tx_code
        encoded_content = quote_plus(final_content)
        encoded_account_name = quote_plus(settings.ACCOUNT_NAME or "")

        qr_url = (
            f"https://img.vietqr.io/image/"
            f"{settings.BANK_ID}-{settings.BANK_ACCOUNT_NUMBER}-compact2.png"
            f"?amount={amount}"
            f"&addInfo={encoded_content}"
            f"&accountName={encoded_account_name}"
        )

        return {
            "qr_url": qr_url,
            "transaction_code": tx_code,
            "transfer_content": final_content,
            "amount": amount,
            "bank_account": settings.BANK_ACCOUNT_NUMBER,
            "bank_name": settings.BANK_ID,
            "account_name": settings.ACCOUNT_NAME,
        }

    @staticmethod
    async def verify_transaction_from_webhook(webhook_data: dict) -> bool:
        amount = (
            webhook_data.get("amount")
            or webhook_data.get("transferAmount")
            or webhook_data.get("transfer_amount")
            or 0
        )

        try:
            return float(amount) > 0
        except Exception:
            return False