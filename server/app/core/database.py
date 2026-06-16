from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.token_usage_model import TokenUsage
from app.core.config import settings
from app.core.logger import get_logger
from app.models.recognition_task_model import RecognitionTask
from app.models.user_model import User
from app.models.token_package_model import TokenPackage
from app.models.transaction_model import Transaction
from app.models.feedback_model import Feedback
from app.models.system_log_model import SystemLog
from app.models.currency_model import (
    ExchangeRate,
    CurrencyConversion,
    CurrencyRate,
    CurrencyRateSyncLog,
)
from app.models.config_model import SystemConfig
from app.models.banknote_model import Banknote
from app.models.recognition_model import RecognitionRequest
from app.models.email_log_model import EmailLog
from app.models.page_model import Page


logger = get_logger(__name__)


async def init_db():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]

    await init_beanie(
        database=db,
        document_models=[
            User,
            TokenPackage,
            Transaction,
            Feedback,
            SystemLog,
            ExchangeRate,
            CurrencyConversion,
            CurrencyRate,
            CurrencyRateSyncLog,
            SystemConfig,
            Banknote,
            RecognitionTask,
            RecognitionRequest,
            TokenUsage,
            EmailLog,
            Page,
        ],
    )

    logger.info("MongoDB connected successfully. Database: %s", settings.DATABASE_NAME)