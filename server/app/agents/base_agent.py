from abc import ABC, abstractmethod
import json


class BaseAgent(ABC):
    def __init__(self, agent_name: str):
        self.agent_name = agent_name

    @abstractmethod
    async def run(self, image_bytes: bytes, context: str = "") -> str:
        pass

    def get_error_response(self, error_message: str) -> str:
        error_data = [
            {
                "quoc_gia": "Không xác định",
                "ma_tien_te": "Không xác định",
                "menh_gia": "Không xác định",
                "mat_tien": "Không xác định",
                "nam_phat_hanh": "Không xác định",
                "chat_lieu": "Không xác định",
                "mo_ta": f"{self.agent_name} không tạo được kết quả hợp lệ.",
                "quan_diem": f"{self.agent_name} gặp sự cố: {error_message}",
                "phuong_phap": self.agent_name,
                "do_tin_cay": 0.0,
                "van_ban_nhin_thay": [],
                "dac_diem_chinh": [],
                "status": "Failed",
            }
        ]
        return json.dumps(error_data, ensure_ascii=False)