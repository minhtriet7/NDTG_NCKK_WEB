from pydantic import BaseModel, Field, field_validator


class ExperimentRunInput(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=120)
    image_id: str = Field(min_length=1, max_length=120)
    ground_truth_country: str = Field(min_length=1, max_length=120)
    ground_truth_currency: str = Field(min_length=1, max_length=20)
    ground_truth_denomination: str = Field(min_length=1, max_length=80)
    repeat_count: int = Field(default=1, ge=1, le=3)
    delay_between_runs: int = Field(default=10, ge=0, le=60)
    stop_on_rate_limit: bool = True
    stop_on_provider_error: bool = True
    force_rerun: bool = False

    @field_validator(
        "dataset_id",
        "image_id",
        "ground_truth_country",
        "ground_truth_currency",
        "ground_truth_denomination",
    )
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("Field must not be empty.")
        return cleaned
