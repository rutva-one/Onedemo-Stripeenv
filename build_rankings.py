import requests
import json
from typing import Dict, List, Optional
import time # Import the time module

# =================================================================
# PART 1: The API Client Class (Unchanged)
# =================================================================

class RewardsCCAPI:
    """
    Client for the Rewards Credit Card API.
    This class handles all communication with the remote API.
    """
    def __init__(self, rapidapi_key: str):
        self.base_url = "https://rewards-credit-card-api.p.rapidapi.com"
        self.headers = {
            "X-RapidAPI-Key": rapidapi_key,
            "X-RapidAPI-Host": "rewards-credit-card-api.p.rapidapi.com"
        }

    def get_reward_categories(self) -> List[Dict]:
        url = f"{self.base_url}/creditcard-spendbonuscategory-categorylist"
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"FATAL ERROR: Could not fetch reward categories: {e}")
            return []

    def search_cards_by_category(self, category_id: int) -> List[Dict]:
        url = f"{self.base_url}/creditcard-spendbonuscategory-categorycard/{category_id}"
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            if e.response is not None and e.response.status_code == 404:
                return []
            print(f"  -> WARN: Error searching for cards in category ID {category_id}: {e}")
            return []


# =================================================================
# PART 2: Main Logic to Build the Ranking Database
# =================================================================

def build_ranking_database():
    """
    Fetches data from the RewardsCC API to create a pre-computed ranking
    of our specific cards for every relevant MCC (Merchant Category Code).
    """
    # --- STEP 1: DEFINE OUR WALLET ---
    # **MODIFIED**: Swapped Capital One Platinum for a rewards card.
    OUR_CARDS = {
        "visa": "The New Chase Sapphire Reserve® Credit Card",
        "mastercard": "Capital One SavorOne Cash Rewards Credit Card", # This card has actual rewards
        "amex": "American Express® Gold Card",
        "discover": "Discover it® Cash Back"
    }

    # --- FALLBACK BONUS RATES ---
    # Known bonus rates for our cards when API doesn't have data
    FALLBACK_BONUSES = {
        "The New Chase Sapphire Reserve® Credit Card": {
            "5812": 3.0,  # Dining
            "5814": 3.0,  # Fast Food
            "4511": 3.0,  # Airfare
            "7011": 3.0,  # Hotels
            "4722": 3.0,  # Travel
        },
        "Capital One SavorOne Cash Rewards Credit Card": {
            "5812": 3.0,  # Dining
            "5814": 3.0,  # Fast Food
            "5815": 3.0,  # Streaming Services
        },
        "American Express® Gold Card": {
            "5812": 4.0,  # Dining
            "5814": 4.0,  # Fast Food
            "5411": 4.0,  # Grocery Stores (at US supermarkets)
        },
        "Discover it® Cash Back": {
            "5541": 5.0,  # Gas Stations (rotating quarterly)
            "5411": 5.0,  # Grocery Stores (rotating quarterly)
            "5399": 5.0,  # Online Shopping (rotating quarterly)
        }
    }

    # --- STEP 2: MAP CATEGORY NAMES TO MCC CODES ---
    CATEGORY_TO_MCC_MAP = {
        "Dining": "5812",
        "Restaurants": "5812", # Added this alias just in case
        "Fast Food": "5814",
        "Grocery Stores": "5411",
        "Airfare": "4511",
        "Hotels": "7011",
        "Car Rentals": "7512",
        "Gas Stations": "5541",
        "Ridesharing": "4121",
        "Transit": "4111",
        "Streaming Services": "5815",
        "Drugstores": "5912",
        "Fitness Clubs": "7997",
        "Online Shopping": "5399",
        "Travel": "4722",
    }
    
    # --- STEP 3: SETUP API CLIENT ---
    RAPIDAPI_KEY = "c2398fa7f4mshc07eead49e70ee9p16ecfdjsn2f1d737f7116"
    api = RewardsCCAPI(RAPIDAPI_KEY)
    
    mcc_rankings = {}

    # --- STEP 4: FETCH ALL CATEGORIES FROM API ---
    print("Fetching all available spending categories from the API...")
    all_category_groups = api.get_reward_categories()
    if not all_category_groups:
        print("Could not fetch categories. The script cannot continue.")
        return

    category_name_to_id_lookup = {
        cat['spendBonusCategoryName']: cat['spendBonusCategoryId']
        for group in all_category_groups
        for sub_group in group.get('spendBonusSubcategoryGroup', [])
        for cat in sub_group.get('spendBonusCategory', [])
        if 'spendBonusCategoryName' in cat and 'spendBonusCategoryId' in cat
    }

    print(f"Found {len(category_name_to_id_lookup)} total categories. Mapping to relevant MCCs...")
    print("-" * 40)

    # --- STEP 5: PROCESS EACH RELEVANT CATEGORY (BASED ON OUR MAP) ---
    for i, (category_name, mcc) in enumerate(CATEGORY_TO_MCC_MAP.items()):
        
        category_id = category_name_to_id_lookup.get(category_name)
        
        if not category_id:
            continue

        print(f"({i+1}/{len(CATEGORY_TO_MCC_MAP)}) Processing: '{category_name}' (MCC: {mcc})")

        cards_with_bonus_in_category = api.search_cards_by_category(category_id)

        # Debug: Show first few cards found for this category
        if cards_with_bonus_in_category:
            print(f"  -> Found {len(cards_with_bonus_in_category)} cards in this category")
            # Show just the first 3 card names for debugging
            for j, card in enumerate(cards_with_bonus_in_category[:3]):
                card_name = card.get('cardName', 'Unknown')
                reward_amt = card.get('spendBonusRewardAmount', '?')
                print(f"    Sample {j+1}: {card_name} ({reward_amt}x)")
        else:
            print("  -> No cards found in this category")
        
        ranked_cards_for_this_mcc = []

        for card_key, our_card_name in OUR_CARDS.items():
            bonus_info = next((c for c in cards_with_bonus_in_category if c.get('cardName') == our_card_name), None)

            if bonus_info:
                reward_amount = bonus_info.get('spendBonusRewardAmount', 1.0)
                reward_type = bonus_info.get('spendBonusRewardType', 'Points')
                print(f"  -> API Match! {our_card_name}: {reward_amount}x {reward_type}")
            else:
                # Check fallback bonuses for this card and MCC
                fallback_bonus = FALLBACK_BONUSES.get(our_card_name, {}).get(mcc)
                if fallback_bonus:
                    reward_amount = fallback_bonus
                    reward_type = "Points"
                    print(f"  -> Fallback! {our_card_name}: {reward_amount}x {reward_type}")
                else:
                    reward_amount = 1.0
                    reward_type = "Default"
                    print(f"  -> Default! {our_card_name}: {reward_amount}x {reward_type}")
            
            ranked_cards_for_this_mcc.append({
                "cardName": our_card_name,
                "cardKey": card_key,
                "rewardAmount": float(reward_amount),
                "rewardType": reward_type
            })

        ranked_cards_for_this_mcc.sort(key=lambda x: x['rewardAmount'], reverse=True)
        
        mcc_rankings[mcc] = ranked_cards_for_this_mcc

        # **MODIFIED**: Add a delay to respect API rate limits
        print("  -> Waiting to avoid rate limit...")
        time.sleep(1.2)

    # --- STEP 6: SAVE THE COMPLETED DATABASE TO A FILE ---
    output_filename = 'mcc_rankings.json'
    with open(output_filename, 'w') as f:
        json.dump(mcc_rankings, f, indent=4)
        
    print("-" * 40)
    print(f"✅ Successfully built and saved the ranking database to `{output_filename}`!")
    print("This file can now be used by your backend to make instantaneous routing decisions.")


# =================================================================
# PART 3: Script Execution
# =================================================================

if __name__ == "__main__":
    build_ranking_database()