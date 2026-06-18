from app.agents.agent_3_lens import parse_lens_evidence_without_llm


def test_parse_myanmar_500_kyats():
    result = parse_lens_evidence_without_llm(
        [
            {
                "title": "Myanmar 500 Kyats 2020 UNC",
                "snippet": "Central Bank of Myanmar banknote",
                "source": "example.org",
                "url": "https://example.org/myanmar-500-kyats",
            }
        ]
    )

    assert result["status"] == "Completed"
    assert result["quoc_gia"] == "Myanmar"
    assert result["ma_tien_te"] == "MMK"
    assert result["menh_gia"] == "500 MMK"
    assert result["formatter_fallback"] is True


def test_parse_cambodia_2000_riel():
    result = parse_lens_evidence_without_llm(
        [
            {
                "title": "Cambodia 2000 Riel banknote",
                "snippet": "Khmer riel paper money reference",
                "source": "example.org",
                "url": "https://example.org/cambodia-2000-riel",
            }
        ]
    )

    assert result["status"] == "Completed"
    assert result["quoc_gia"] == "Cambodia"
    assert result["ma_tien_te"] == "KHR"
    assert result["menh_gia"] == "2000 KHR"
