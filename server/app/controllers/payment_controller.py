from app.models.user_model import User
from app.schemas.payment_schema import CreateTransactionRequest
from app.services.payment_service import PaymentService


class PaymentController:
    @staticmethod
    async def buy_tokens(user: User, data: CreateTransactionRequest):
        return await PaymentService.create_transaction(
            user=user,
            package_id=data.package_id,
            gateway=data.gateway,
        )

    @staticmethod
    async def handle_webhook(transaction_content: str):
        return await PaymentService.process_webhook(
            {
                "content": transaction_content,
            }
        )

    @staticmethod
    async def handle_webhook_payload(payload: dict):
        return await PaymentService.process_webhook(payload)

    @staticmethod
    async def get_payment_status(user: User, transaction_id: str):
        return await PaymentService.get_payment_status(user, transaction_id)

    @staticmethod
    async def get_my_transactions(user: User, limit: int = 20):
        return await PaymentService.get_user_transactions(user, limit)