import hashlib
import hmac
from datetime import datetime
from typing import Dict, Optional
from urllib.parse import quote_plus, urlencode

from app.core.config import settings


class SepayGateway:
    @staticmethod
    async def create_payment_qr(
        user_id: str,
        package_name: str,
        amount: int,
        tx_code: str,
        transfer_content: Optional[str] = None,
        bank_account_number: Optional[str] = None,
        bank_id: Optional[str] = None,
        account_name: Optional[str] = None,
    ) -> dict:
        account_number = bank_account_number or getattr(settings, "BANK_ACCOUNT_NUMBER", None)
        bank_code = bank_id or getattr(settings, "BANK_ID", None)
        final_account_name = account_name or getattr(settings, "ACCOUNT_NAME", None)

        if not account_number or not bank_code:
            return {
                "qr_url": "",
                "transaction_code": tx_code,
                "transfer_content": transfer_content or tx_code,
                "amount": amount,
                "bank_account": "Chưa cấu hình",
                "bank_name": "Chưa cấu hình",
                "account_name": final_account_name,
            }

        final_content = transfer_content or tx_code
        encoded_content = quote_plus(final_content)
        encoded_account_name = quote_plus(final_account_name or "")

        qr_url = (
            f"https://img.vietqr.io/image/"
            f"{bank_code}-{account_number}-compact2.png"
            f"?amount={amount}"
            f"&addInfo={encoded_content}"
            f"&accountName={encoded_account_name}"
        )

        return {
            "qr_url": qr_url,
            "transaction_code": tx_code,
            "transfer_content": final_content,
            "amount": amount,
            "bank_account": account_number,
            "bank_name": bank_code,
            "account_name": final_account_name,
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


class VnpayGateway:
    @staticmethod
    def _get_setting(config, name: str, fallback=None):
        if config is not None and hasattr(config, name):
            value = getattr(config, name)
            if value not in [None, ""]:
                return value
        return getattr(settings, name.upper(), fallback)

    @staticmethod
    def _build_secure_hash(params: Dict[str, str], secret_key: str) -> str:
        filtered = {
            key: value
            for key, value in params.items()
            if value is not None and value != "" and key not in ["vnp_SecureHash", "vnp_SecureHashType"]
        }

        sorted_items = sorted(filtered.items())
        hash_data = "&".join(
            f"{quote_plus(str(key))}={quote_plus(str(value))}"
            for key, value in sorted_items
        )

        return hmac.new(
            secret_key.encode("utf-8"),
            hash_data.encode("utf-8"),
            hashlib.sha512,
        ).hexdigest()

    @staticmethod
    async def create_payment_url(
        transaction_id: str,
        transaction_code: str,
        amount_vnd: int,
        order_info: str,
        client_ip: str = "127.0.0.1",
        config=None,
    ) -> str:
        tmn_code = VnpayGateway._get_setting(config, "vnpay_tmn_code", getattr(settings, "VNP_TMNCODE", None))
        hash_secret = VnpayGateway._get_setting(config, "vnpay_hash_secret", getattr(settings, "VNP_HASHSECRET", None))
        return_url = VnpayGateway._get_setting(config, "vnpay_return_url", getattr(settings, "VNP_RETURNURL", None))
        pay_url = VnpayGateway._get_setting(
            config,
            "vnpay_pay_url",
            getattr(settings, "VNP_URL", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),
        )

        if not tmn_code or not hash_secret or not return_url:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=500,
                detail="Cổng VNPay chưa được cấu hình hệ thống (Missing TMN_CODE or HASH_SECRET).",
            )

        now = datetime.now()

        params = {
            "vnp_Version": "2.1.0",
            "vnp_Command": "pay",
            "vnp_TmnCode": str(tmn_code),
            "vnp_Amount": str(int(amount_vnd) * 100),
            "vnp_CurrCode": "VND",
            "vnp_TxnRef": transaction_code,
            "vnp_OrderInfo": order_info,
            "vnp_OrderType": "billpayment",
            "vnp_Locale": "vn",
            "vnp_ReturnUrl": str(return_url),
            "vnp_IpAddr": client_ip,
            "vnp_CreateDate": now.strftime("%Y%m%d%H%M%S"),
        }

        secure_hash = VnpayGateway._build_secure_hash(params, str(hash_secret))
        params["vnp_SecureHash"] = secure_hash

        generated_url = f"{pay_url}?{urlencode(params)}"

        print("\n--- VNPAY DEBUG INFO ---")
        print(f"vnp_TmnCode: {tmn_code}")
        print(f"vnp_ReturnUrl: {return_url}")
        print(f"vnp_Amount: {params['vnp_Amount']}")
        print(f"vnp_TxnRef: {params['vnp_TxnRef']}")
        print(f"vnp_OrderInfo: {params['vnp_OrderInfo']}")
        print(f"vnp_IpAddr: {params['vnp_IpAddr']}")
        print(f"vnp_CreateDate: {params['vnp_CreateDate']}")
        print(f"vnp_SecureHash EXISTS: {bool(secure_hash)}")
        print(f"FULL URL: {generated_url}")
        print("------------------------\n")

        return generated_url

    @staticmethod
    def verify_return_params(params: Dict[str, str], config=None) -> bool:
        hash_secret = VnpayGateway._get_setting(config, "vnpay_hash_secret", getattr(settings, "VNP_HASHSECRET", None))

        if not hash_secret:
            return False

        received_hash = params.get("vnp_SecureHash")

        if not received_hash:
            return False

        expected_hash = VnpayGateway._build_secure_hash(params, str(hash_secret))

        return expected_hash.lower() == str(received_hash).lower()