import requests
import json
from typing import Dict, List, Optional
import time

class CustomRankingBuilder:
    """
    Builds custom rankings based on user's selected 4 cards using RewardsCC API.
    """
    def __init__(self, rapidapi_key: str):
        self.base_url = "https://rewards-credit-card-api.p.rapidapi.com"
        self.headers = {
            "X-RapidAPI-Key": rapidapi_key,
            "X-RapidAPI-Host": "rewards-credit-card-api.p.rapidapi.com"
        }

        # Map card names from our pool to API search terms
        self.card_name_mapping = {
            "The Platinum Card® from American Express": "The Platinum Card from American Express",
            "Chase Sapphire Reserve®": "Chase Sapphire Reserve",
            "Ink Business Preferred® Credit Card": "Chase Ink Business Preferred Credit Card",
            "American Express® Gold Card": "American Express Gold Card",
            "Capital One Venture X Rewards Credit Card": "Capital One Venture X Rewards Credit Card",
            "The Business Platinum Card® from American Express": "The Business Platinum Card from American Express",
            "Citi Premier® Card": "Citi Premier Card",
            "Bank of America® Premium Rewards® credit card": "Bank of America Premium Rewards credit card",
            "Delta SkyMiles® Reserve American Express Card": "Delta SkyMiles Reserve American Express Card",
            "Hilton Honors American Express Aspire Card": "Hilton Honors American Express Aspire Card",
            "Marriott Bonvoy Brilliant™ American Express® Card": "Marriott Bonvoy Brilliant American Express Card",
            "Chase Freedom Unlimited®": "Chase Freedom Unlimited",
            "Chase Freedom Flex℠": "Chase Freedom Flex",
            "Citi® Double Cash Card": "Citi Double Cash Card",
            "Capital One Quicksilver Cash Rewards Credit Card": "Capital One Quicksilver Cash Rewards Credit Card",
            "Discover it® Cash Back": "Discover it Cash Back",
            "Amazon Prime Rewards Visa Signature Card": "Amazon Prime Rewards Visa Signature Card",
            "Blue Cash Preferred® Card from American Express": "Blue Cash Preferred Card from American Express",
            "American Express® Business Cash Card": "American Express Business Cash Card",
            "Wells Fargo Autograph℠ Card": "Wells Fargo Autograph Card"
        }

        # Category to MCC mapping (same as original)
        self.category_to_mcc_map = {
            "Dining": "5812",
            "Restaurants": "5812",
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

        # Fallback bonuses for cards when API doesn't have data
        self.fallback_bonuses = {
            "The Platinum Card® from American Express": {
                "4511": 5.0,  # Flights
                "7011": 5.0,  # Hotels
                "4722": 5.0,  # Travel
            },
            "Chase Sapphire Reserve®": {
                "5812": 3.0,  # Dining
                "5814": 3.0,  # Fast Food
                "4511": 3.0,  # Airfare
                "7011": 3.0,  # Hotels
                "4722": 3.0,  # Travel
            },
            "American Express® Gold Card": {
                "5812": 4.0,  # Dining
                "5814": 4.0,  # Fast Food
                "5411": 4.0,  # Grocery Stores
            },
            "Chase Freedom Unlimited®": {
                "default": 1.5,  # All purchases
            },
            "Citi® Double Cash Card": {
                "default": 2.0,  # All purchases
            },
            "Discover it® Cash Back": {
                "5541": 5.0,  # Gas Stations (rotating)
                "5411": 5.0,  # Grocery Stores (rotating)
                "5399": 5.0,  # Online Shopping (rotating)
            },
        }

    def get_reward_categories(self) -> List[Dict]:
        """Fetch all reward categories from API"""
        url = f"{self.base_url}/creditcard-spendbonuscategory-categorylist"
        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"FATAL ERROR: Could not fetch reward categories: {e}")
            return []

    def search_cards_by_category(self, category_id: int) -> List[Dict]:
        """Search for cards in a specific category"""
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

    def normalize_card_name(self, card_name: str) -> str:
        """Normalize card name for API searching"""
        return self.card_name_mapping.get(card_name, card_name)

    def build_custom_rankings(self, selected_cards: List[Dict], progress_callback=None) -> Dict:
        """
        Build custom rankings for the user's selected 4 cards.

        Args:
            selected_cards: List of 4 selected card objects
            progress_callback: Function to call with progress updates

        Returns:
            Dictionary with MCC rankings for the user's specific cards
        """
        if progress_callback:
            progress_callback("🚀 Starting optimization process...")

        # Extract card names for easier processing
        user_card_names = [card['cardName'] for card in selected_cards]

        if progress_callback:
            progress_callback(f"📋 Building rankings for: {', '.join([card.split('®')[0] for card in user_card_names])}")

        # Fetch all categories from API
        if progress_callback:
            progress_callback("🔍 Fetching reward categories from API...")

        all_category_groups = self.get_reward_categories()
        if not all_category_groups:
            if progress_callback:
                progress_callback("❌ Could not fetch categories from API")
            return {}

        # Build category name to ID lookup
        category_name_to_id_lookup = {
            cat['spendBonusCategoryName']: cat['spendBonusCategoryId']
            for group in all_category_groups
            for sub_group in group.get('spendBonusSubcategoryGroup', [])
            for cat in sub_group.get('spendBonusCategory', [])
            if 'spendBonusCategoryName' in cat and 'spendBonusCategoryId' in cat
        }

        custom_rankings = {}
        total_categories = len(self.category_to_mcc_map)

        # Process each category
        for i, (category_name, mcc) in enumerate(self.category_to_mcc_map.items()):
            if progress_callback:
                progress_callback(f"⚡ Analyzing {category_name} ({i+1}/{total_categories})...")

            category_id = category_name_to_id_lookup.get(category_name)

            if not category_id:
                if progress_callback:
                    progress_callback(f"⚠️ No API data for {category_name}, using fallbacks...")
                # Use fallback data only
                custom_rankings[mcc] = self._build_fallback_ranking(mcc, user_card_names)
                continue

            # Get cards with bonuses in this category
            cards_with_bonus = self.search_cards_by_category(category_id)

            # Build ranking for this MCC using user's cards
            ranked_cards = []

            for card in selected_cards:
                card_name = card['cardName']
                normalized_name = self.normalize_card_name(card_name)

                # Look for this card in the API results
                bonus_info = None
                for api_card in cards_with_bonus:
                    if self._cards_match(api_card.get('cardName', ''), normalized_name):
                        bonus_info = api_card
                        break

                if bonus_info:
                    reward_amount = bonus_info.get('spendBonusRewardAmount', 1.0)
                    reward_type = bonus_info.get('spendBonusRewardType', 'Points')
                else:
                    # Use fallback bonus if available
                    fallback_bonus = self.fallback_bonuses.get(card_name, {}).get(mcc)
                    if fallback_bonus:
                        reward_amount = fallback_bonus
                        reward_type = "Points"
                    elif 'default' in self.fallback_bonuses.get(card_name, {}):
                        reward_amount = self.fallback_bonuses[card_name]['default']
                        reward_type = "Points"
                    else:
                        reward_amount = 1.0
                        reward_type = "Default"

                ranked_cards.append({
                    "cardName": card_name,
                    "cardKey": card.get('cardKey', f"custom_{len(ranked_cards)}"),
                    "cardType": card.get('cardType', 'Visa'),  # Preserve card type for Stripe mapping
                    "rewardAmount": float(reward_amount),
                    "rewardType": reward_type
                })

            # Sort by reward amount (highest first)
            ranked_cards.sort(key=lambda x: x['rewardAmount'], reverse=True)
            custom_rankings[mcc] = ranked_cards

            # Rate limiting
            time.sleep(1.2)

        if progress_callback:
            progress_callback("✅ Optimization complete! Your cards are now ranked for maximum rewards.")

        return custom_rankings

    def _cards_match(self, api_card_name: str, normalized_name: str) -> bool:
        """Check if API card name matches our normalized name"""
        # Simple matching - could be enhanced with fuzzy matching
        api_lower = api_card_name.lower().replace('®', '').replace('℠', '').replace('™', '')
        norm_lower = normalized_name.lower().replace('®', '').replace('℠', '').replace('™', '')

        # Check if core name is contained
        core_words = norm_lower.split()[:3]  # First 3 words usually identify the card
        return all(word in api_lower for word in core_words if len(word) > 2)

    def _build_fallback_ranking(self, mcc: str, card_names: List[str]) -> List[Dict]:
        """Build ranking using only fallback data"""
        ranked_cards = []

        for card_name in card_names:
            fallback_bonus = self.fallback_bonuses.get(card_name, {}).get(mcc)
            if fallback_bonus:
                reward_amount = fallback_bonus
                reward_type = "Points"
            elif 'default' in self.fallback_bonuses.get(card_name, {}):
                reward_amount = self.fallback_bonuses[card_name]['default']
                reward_type = "Points"
            else:
                reward_amount = 1.0
                reward_type = "Default"

            ranked_cards.append({
                "cardName": card_name,
                "cardKey": f"custom_{len(ranked_cards)}",
                "cardType": "Visa",  # Default fallback type
                "rewardAmount": float(reward_amount),
                "rewardType": reward_type
            })

        ranked_cards.sort(key=lambda x: x['rewardAmount'], reverse=True)
        return ranked_cards

    def save_custom_rankings(self, rankings: Dict, user_id: str = "default"):
        """Save custom rankings to a file"""
        import os
        filename = f'custom_rankings_{user_id}.json'

        # Save in project root directory
        project_root = os.path.dirname(os.path.abspath(__file__))
        full_path = os.path.join(project_root, filename)

        with open(full_path, 'w') as f:
            json.dump(rankings, f, indent=4)

        print(f"✅ Custom rankings saved to {full_path}")
        return filename


def build_rankings_for_user(selected_cards: List[Dict], progress_callback=None) -> str:
    """
    Main function to build custom rankings for a user's selected cards.

    Args:
        selected_cards: List of 4 selected card objects
        progress_callback: Function to call with progress updates

    Returns:
        Filename of the saved rankings file
    """
    rapidapi_key = "c2398fa7f4mshc07eead49e70ee9p16ecfdjsn2f1d737f7116"
    builder = CustomRankingBuilder(rapidapi_key)

    if progress_callback:
        progress_callback("🎯 Initializing custom optimization engine...")

    custom_rankings = builder.build_custom_rankings(selected_cards, progress_callback)

    if custom_rankings:
        filename = builder.save_custom_rankings(custom_rankings)
        return filename
    else:
        if progress_callback:
            progress_callback("❌ Failed to build custom rankings")
        return None


if __name__ == "__main__":
    # Test with sample cards
    sample_cards = [
        {"cardName": "Chase Sapphire Reserve®", "cardKey": "chase_sapphire_reserve", "id": 2},
        {"cardName": "American Express® Gold Card", "cardKey": "amex_gold", "id": 4},
        {"cardName": "Chase Freedom Unlimited®", "cardKey": "chase_freedom_unlimited", "id": 12},
        {"cardName": "Discover it® Cash Back", "cardKey": "discover_it_cash_back", "id": 16}
    ]

    def print_progress(message):
        print(f"[PROGRESS] {message}")

    result = build_rankings_for_user(sample_cards, print_progress)
    print(f"Result: {result}")