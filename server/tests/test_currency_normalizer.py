import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

# Add the server directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.utils.currency_normalizer import (
    normalize_agent_vote,
    normalize_currency_identity,
    normalize_currency_no_infer,
)


def test_eur_aliases_share_canonical_vote_key():
    baseline = normalize_agent_vote(
        {"quoc_gia": "European Union", "menh_gia": "500 EUR"}
    )["vote_key"]
    cases = [
        {"quoc_gia": "EU", "menh_gia": "500", "ma_tien_te": "EUR"},
        {"quoc_gia": "Euro Zone", "menh_gia": "500 EURO"},
        {"quoc_gia": "Eurozone", "menh_gia": "€500"},
        {"quoc_gia": "Lien minh Chau Au", "menh_gia": 500, "currency_code": "EUR"},
    ]
    for case in cases:
        assert normalize_agent_vote(case)["vote_key"] == baseline


def test_eur_unicode_aliases_share_canonical_vote_key_for_common_amounts():
    aliases = [
        "Li\u00ean Minh Ch\u00e2u \u00c2u",
        "European Union",
        "Euro Zone",
        "Ch\u00e2u \u00c2u",
    ]
    for amount in (5, 500):
        baseline = normalize_currency_identity("European Union", "EUR", amount)["vote_key"]
        for alias in aliases:
            assert normalize_currency_identity(alias, "EUR", amount)["vote_key"] == baseline


def test_germany_eur_uses_euro_zone_vote_key_without_losing_raw_country():
    result = normalize_agent_vote(
        {"quoc_gia": "Germany", "menh_gia": "500 EURO", "ma_tien_te": "EUR"}
    )

    assert result["raw_country"] == "Germany"
    assert result["reported_country"] == "Germany"
    assert result["canonical_country"] == "Euro Zone"
    assert result["vote_key"] == ("euro zone", "EUR", "500")


def test_germany_non_eur_stays_germany():
    result = normalize_agent_vote(
        {"quoc_gia": "Germany", "menh_gia": 500, "ma_tien_te": "DEM"}
    )

    assert result["canonical_country"] == "Germany"
    assert result["vote_key"] == ("germany", "DEM", "500")


def test_eur_denomination_formats_parse_currency():
    assert normalize_currency_no_infer("500 EUR") == "EUR"
    assert normalize_currency_no_infer("500 EURO") == "EUR"
    assert normalize_currency_no_infer("€500") == "EUR"

def run_tests():
    test_cases = [
        # Myanmar
        [
            {"quoc_gia": "Myanmar", "menh_gia": "500 MMK"},
            {"quoc_gia": "Myanmar", "menh_gia": "500 Kyat"},
            {"quoc_gia": "Myanmar", "menh_gia": "500 Kyats"},
            {"quoc_gia": "Myanmar", "menh_gia": "500 ကျပ်"}
        ],
        # Thailand
        [
            {"quoc_gia": "Thailand", "menh_gia": "20 THB"},
            {"quoc_gia": "Thailand", "menh_gia": "20 Baht"},
            {"quoc_gia": "Thailand", "menh_gia": "฿20"}
        ],
        # Cambodia
        [
            {"quoc_gia": "Cambodia", "menh_gia": "5000 KHR"},
            {"quoc_gia": "Cambodia", "menh_gia": "5000 Riel"},
            {"quoc_gia": "Cambodia", "menh_gia": "៛5000"}
        ],
        # Laos
        [
            {"quoc_gia": "Laos", "menh_gia": "10000 LAK"},
            {"quoc_gia": "Laos", "menh_gia": "10000 Kip"}
        ],
        # Indonesia
        [
            {"quoc_gia": "Indonesia", "menh_gia": "100000 IDR"},
            {"quoc_gia": "Indonesia", "menh_gia": "Rp100000"},
            {"quoc_gia": "Indonesia", "menh_gia": "100,000 Rupiah"}
        ],
        # Malaysia
        [
            {"quoc_gia": "Malaysia", "menh_gia": "50 MYR"},
            {"quoc_gia": "Malaysia", "menh_gia": "RM50"},
            {"quoc_gia": "Malaysia", "menh_gia": "50 Ringgit"}
        ],
        # Singapore
        [
            {"quoc_gia": "Singapore", "menh_gia": "2 SGD"},
            {"quoc_gia": "Singapore", "menh_gia": "S$2"},
            {"quoc_gia": "Singapore", "menh_gia": "2 Singapore Dollar"}
        ],
        # Vietnam
        [
            {"quoc_gia": "Vietnam", "menh_gia": "500000 VND"},
            {"quoc_gia": "Vietnam", "menh_gia": "500.000 đồng"},
            {"quoc_gia": "Vietnam", "menh_gia": "₫500000"}
        ]
    ]

    print("Running tests for currency_normalizer...")
    all_passed = True
    
    for group in test_cases:
        expected_key = None
        for i, case in enumerate(group):
            result = normalize_agent_vote(case)
            vote_key = result["vote_key"]
            
            if i == 0:
                expected_key = vote_key
                print(f"Group baseline: {case} -> {vote_key}")
            else:
                if vote_key == expected_key:
                    print(f"  [PASS] {case} -> {vote_key} matches baseline")
                else:
                    print(f"  [FAIL] {case} -> {vote_key} DOES NOT MATCH {expected_key}")
                    all_passed = False

    print("\nRunning safe country-infer test...")
    case = {"quoc_gia": "Myanmar", "menh_gia": "500"}
    result = normalize_agent_vote(case)
    if result["vote_key"] == ("myanmar", "MMK", "500") and result["currency_code"] == "MMK":
        print(f"  [PASS] {case} -> safely inferred MMK")
    else:
        print(
            f"  [FAIL] {case} -> vote_key={result['vote_key']}, "
            f"currency_code={result['currency_code']} "
            "(expected safe MMK inference)"
        )
        all_passed = False

    # ------------------------------------------------------------------
    # Explicit currency field test
    # ------------------------------------------------------------------
    # Policy: ma_tien_te / currency / currency_code duoc uu tien cao nhat.
    print("\nRunning explicit currency field tests...")
    explicit_cases = [
        # ma_tien_te field
        ({"quoc_gia": "Indonesia", "menh_gia": "100000", "ma_tien_te": "IDR"},
         "IDR", "(ma_tien_te=IDR, bare denom)"),
        ({"quoc_gia": "Vietnam",   "menh_gia": "500000", "ma_tien_te": "VND"},
         "VND", "(ma_tien_te=VND, bare denom)"),
        # currency field
        ({"quoc_gia": "Thailand",  "menh_gia": "20",     "currency": "THB"},
         "THB", "(currency=THB, bare denom)"),
        # currency_code field
        ({"quoc_gia": "Myanmar",   "menh_gia": "500",    "currency_code": "MMK"},
         "MMK", "(currency_code=MMK, bare denom)"),
        # Denomination contains currency keyword -- still parsed correctly
        ({"quoc_gia": "Indonesia", "menh_gia": "100000 IDR"},
         "IDR", "(denom text IDR)"),
        ({"quoc_gia": "Vietnam",   "menh_gia": "500000 VND"},
         "VND", "(denom text VND)"),
        ({"quoc_gia": "Europe",    "menh_gia": "100 USD"},
         "USD", "(denom text USD)"),
        ({"quoc_gia": "Europe",    "menh_gia": "50 EUR"},
         "EUR", "(denom text EUR)"),
    ]
    for ex_case, expected_currency, label in explicit_cases:
        ex_result = normalize_agent_vote(ex_case)
        if ex_result["currency_code"] == expected_currency:
            print(f"  [PASS] {label} -> currency_code={ex_result['currency_code']}")
        else:
            print(
                f"  [FAIL] {label} -> currency_code={ex_result['currency_code']} "
                f"(expected {expected_currency})"
            )
            all_passed = False

    # ------------------------------------------------------------------
    print("\nRunning guarded infer tests...")
    infer_cases = [
        ({"quoc_gia": "Vietnam",   "menh_gia": "500000"}, "VND"),
        ({"quoc_gia": "Myanmar",   "menh_gia": "500"}, "MMK"),
        ({"quoc_gia": "Indonesia", "menh_gia": "100000"}, "IDR"),
    ]
    for ni_case, expected_currency in infer_cases:
        ni_result = normalize_agent_vote(ni_case)
        if ni_result["currency_code"] == expected_currency and ni_result["vote_key"] is not None:
            print(f"  [PASS] {ni_case} -> inferred {expected_currency}")
        else:
            print(
                f"  [FAIL] {ni_case} -> unexpected "
                f"currency_code={ni_result['currency_code']}, "
                f"vote_key={ni_result['vote_key']}"
            )
            all_passed = False

    guarded_no_infer = {"quoc_gia": "Germany", "menh_gia": "500"}
    guarded_result = normalize_agent_vote(guarded_no_infer)
    if guarded_result["currency_code"] is None and guarded_result["vote_key"] is None:
        print(f"  [PASS] {guarded_no_infer} -> no non-EUR Germany inference")
    else:
        print(f"  [FAIL] {guarded_no_infer} -> unexpected {guarded_result}")
        all_passed = False

    if all_passed:
        print("\nALL TESTS PASSED!")
    else:
        print("\nSOME TESTS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
