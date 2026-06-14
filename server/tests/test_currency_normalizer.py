import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

# Add the server directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.utils.currency_normalizer import normalize_agent_vote

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

    # Inference test
    print("\nRunning inference test...")
    case = {"quoc_gia": "Myanmar", "menh_gia": "500"}
    result = normalize_agent_vote(case)
    if result["vote_key"] == ("Myanmar", "MMK", 500):
        print(f"  [PASS] {case} -> {result['vote_key']}")
    else:
        print(f"  [FAIL] {case} -> {result['vote_key']} DOES NOT MATCH ('Myanmar', 'MMK', 500)")
        all_passed = False

    if all_passed:
        print("\nALL TESTS PASSED!")
    else:
        print("\nSOME TESTS FAILED.")
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
