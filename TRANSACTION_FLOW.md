# Transaction Approval Flow - Complete Technical Breakdown

This document provides a detailed, step-by-step explanation of what happens when a transaction is attempted using the One Card system.

---

## Overview

The One Card system uses a **two-card architecture** with intelligent routing:

1. **Card 0005** (Virtual Stripe Issuing Card) - The card users swipe at merchants
2. **Funding Cards** (4 real credit cards) - The cards that actually get charged behind the scenes

**Key Principle**: When you use card 0005, the system analyzes the merchant category in real-time and automatically selects the best rewards card from your wallet to fund the transaction.

---

## The Cards in Play

### Virtual Interface Card
- **Card ID**: Stored in `STRIPE_ISSUING_CARD_ID` (ending in 0005)
- **Purpose**: Acts as a router/wrapper - intercepts all transactions
- **Has funds?**: No - this is just a virtual card that triggers webhooks

### Funding Cards (Payment Sources)
These are the real cards with actual funds that get charged:

1. **Visa** (ending in 4242) - `STRIPE_FOODIE_CARD_PM_ID`
   - Mapped to: `visa` card type
   - Best for: Categories where Visa cards excel

2. **Mastercard** (ending in 4444) - `STRIPE_TRAVEL_CARD_PM_ID`
   - Mapped to: `mastercard` card type
   - Best for: Categories where Mastercard cards excel

3. **Discover** (ending in 1117) - `STRIPE_GROCERY_CARD_PM_ID`
   - Mapped to: `discover` card type
   - Best for: Grocery stores, rotating categories

4. **American Express** (ending in 8431) - `STRIPE_TRANSIT_CARD_PM_ID`
   - Mapped to: `amex` card type
   - Best for: Dining, supermarkets

**Mapping Location**: `server.js:42-47`

---

## Complete Transaction Flow

### Phase 1: Setup (One-Time Configuration)

#### Step 1.1: User Builds Wallet
**User Actions**:
- Selects **4 cards** from 20+ available cards in `card_pool.json`
- Chooses a **backup card** (used as tiebreaker)
- Selects **optimization preference**:
  - **💵 Cash Back**: Prioritizes cash back; only uses points if they're 2x better
  - **🎁 Maximize Rewards**: Values points at 1.3x for travel redemption potential

**Backend Storage**:
- `currentWalletCards` - Array of user's selected cards
- `backupCard` - User's designated backup card
- `optimizationPreference` - 'cash' or 'rewards'

**Code Location**: `server.js:451-469` (`/optimize-cards` endpoint)

#### Step 1.2: System Creates MCC Rankings
**What happens**:
1. System generates cache key based on: `cardIDs + optimizationPreference`
2. Checks for cached rankings at: `cached_rankings_${cacheKey}.json`
3. If cache exists: Loads instantly
4. If no cache: Loads default rankings from `mcc_rankings.json`
5. Stores loaded rankings in: `mccRankings` global object

**MCC Rankings Structure**:
```json
{
  "5812": [  // MCC code for restaurants
    {
      "cardName": "American Express Gold Card",
      "cardKey": "amex",
      "rewardAmount": 4.0,
      "rewardType": "Points"
    },
    {
      "cardName": "Capital One SavorOne",
      "cardKey": "mastercard",
      "rewardAmount": 3.0,
      "rewardType": "Points"
    }
  ]
}
```

**Code Location**: `server.js:471-542`

---

### Phase 2: Transaction Initiation

#### Step 2.1: User Swipes Card 0005
**What happens**:
- User uses card 0005 at a merchant (e.g., restaurant for $75)
- Merchant's terminal sends authorization request to Stripe
- Stripe receives: Amount, Merchant Name, **MCC Code** (Merchant Category Code)

**Example MCC Codes**:
- `5812` - Restaurants
- `5411` - Grocery stores
- `4511` - Airlines
- `4121` - Taxi/Rideshare
- `5541` - Gas stations
- `5912` - Pharmacies

---

### Phase 3: Real-Time Authorization (The Critical Path)

#### Step 3.1: Stripe Fires Webhook
**Event**: `issuing_authorization.request`

**Stripe sends to your server**:
```json
{
  "type": "issuing_authorization.request",
  "data": {
    "object": {
      "id": "iauth_xxxxx",
      "amount": 7500,  // $75.00 in cents
      "merchant_data": {
        "category_code": "5812",  // Restaurant MCC
        "name": "Corner Bistro"
      },
      "pending_request": {
        "amount": 7500
      }
    }
  }
}
```

**Time Constraint**: Your server has **< 3 seconds** to respond or transaction is auto-declined

**Code Location**: `server.js:171-226` (`/stripe-webhook` endpoint)

---

#### Step 3.2: Backend Receives Webhook
**Location**: `server.js:171`

**What's extracted**:
```javascript
const incomingMCC = authorization.merchant_data.category_code;  // "5812"
const amountToCharge = authorization.pending_request.amount;    // 7500
```

**Live logging**:
```
⚡️ INCOMING TRANSACTION from Stripe...
🧠 Analyzing transaction... MCC is 5812.
```

---

#### Step 3.3: Optimal Card Selection Algorithm
**Function**: `selectOptimalCard(mcc)` - `server.js:256-413`

This is where the magic happens. Here's the exact logic:

##### Sub-Step A: Load MCC Rankings
```javascript
// Check if we have rankings for this MCC
if (!mccRankings[mcc] || !Array.isArray(mccRankings[mcc])) {
    return null;  // No rankings = decline transaction
}
```

**Example**: For MCC `5812` (restaurant), rankings might be:
```json
[
  {"cardName": "Amex Gold", "cardKey": "amex", "rewardAmount": 4.0, "rewardType": "Points"},
  {"cardName": "SavorOne", "cardKey": "mastercard", "rewardAmount": 3.0, "rewardType": "Points"},
  {"cardName": "Chase Reserve", "cardKey": "visa", "rewardAmount": 1.0, "rewardType": "Points"},
  {"cardName": "Discover", "cardKey": "discover", "rewardAmount": 1.0, "rewardType": "Default"}
]
```

**Code Location**: `server.js:262-265`

---

##### Sub-Step B: Filter to User's Wallet
```javascript
// Only consider cards the user has in their wallet
const walletCardsByType = {};
currentWalletCards.forEach(card => {
    const normalizedType = card.cardType === "American Express" ? "amex" : card.cardType.toLowerCase();
    walletCardsByType[normalizedType] = card;
});

let availableCards = mccRankings[mcc].filter(card => {
    const rankingCardType = card.cardKey || card.cardType?.toLowerCase();
    return rankingCardType && walletCardsByType[rankingCardType];
});
```

**Example Scenario**:
- **User's Wallet**: Amex Gold, Chase Reserve, Citi Double Cash, Discover
- **User's Wallet Types**: `amex`, `visa`, `mastercard`, `discover`
- **Rankings for MCC 5812**: All 4 cards above
- **Available Cards After Filter**: All 4 (all are in wallet)

**Code Location**: `server.js:268-292`

---

##### Sub-Step C: Calculate Effective Rewards
**Function**: `calculateEffectiveReward()` - `server.js:229-253`

This adjusts the raw reward amount based on the user's preference:

**Formula - Cash Preference** (`optimizationPreference === 'cash'`):
```javascript
if (rewardType.includes('cash')) {
    effectiveValue = rewardAmount × 1.0  // Cash is face value
} else {
    effectiveValue = rewardAmount × 0.5  // Points valued at worst-case (0.5 cpp)
}
```

**Formula - Rewards Preference** (`optimizationPreference === 'rewards'`):
```javascript
if (rewardType.includes('cash')) {
    effectiveValue = rewardAmount × 1.0  // Cash is face value
} else {
    effectiveValue = rewardAmount × 1.3  // Points valued optimistically (1.3 cpp)
}
```

**Example Calculation** (MCC 5812 - Restaurant):

**If user preference = Cash Back**:
| Card | Raw Reward | Type | Calculation | Effective Reward |
|------|------------|------|-------------|------------------|
| Amex Gold | 4x | Points | 4.0 × 0.5 | 2.0 |
| SavorOne | 3x | Points | 3.0 × 0.5 | 1.5 |
| Citi Double Cash | 2x | Cash | 2.0 × 1.0 | 2.0 |
| Discover | 1x | Default | 1.0 × 0.5 | 0.5 |

**If user preference = Maximize Rewards**:
| Card | Raw Reward | Type | Calculation | Effective Reward |
|------|------------|------|-------------|------------------|
| Amex Gold | 4x | Points | 4.0 × 1.3 | 5.2 |
| SavorOne | 3x | Points | 3.0 × 1.3 | 3.9 |
| Citi Double Cash | 2x | Cash | 2.0 × 1.0 | 2.0 |
| Discover | 1x | Default | 1.0 × 1.3 | 1.3 |

**Code Location**: `server.js:294-305`

---

##### Sub-Step D: Sort by Effective Reward
```javascript
availableCards.sort((a, b) => b.effectiveReward - a.effectiveReward);
```

**Result after sort (Cash Preference)**:
1. Amex Gold - 2.0 effective
2. Citi Double Cash - 2.0 effective (TIE!)
3. SavorOne - 1.5 effective
4. Discover - 0.5 effective

**Result after sort (Rewards Preference)**:
1. Amex Gold - 5.2 effective
2. SavorOne - 3.9 effective
3. Citi Double Cash - 2.0 effective
4. Discover - 1.3 effective

**Code Location**: `server.js:301`

---

##### Sub-Step E: Apply Tiebreaker Logic

**CASE 1: Cash Preference + Cash Cards Available**
```javascript
if (optimizationPreference === 'cash') {
    const cashBackCards = availableCards.filter(card =>
        card.rewardType.toLowerCase().includes('cash')
    );

    if (cashBackCards.length > 0) {
        // Pick best card (already sorted by effective reward)
        // Points cards only win if they're 2x better (due to 0.5x multiplier)
        topCard = availableCards[0];
    }
}
```

**Example**: Restaurant purchase, cash preference
- Amex Gold: 4x points × 0.5 = 2.0 effective
- Citi Double Cash: 2x cash × 1.0 = 2.0 effective

**Result**: TIE at 2.0 effective

**Tiebreaker applied**:
- If backup card is Citi Double Cash → **Citi Double Cash wins**
- If backup card is something else → **First in list wins** (Amex Gold)

**Code Location**: `server.js:310-341`

---

**CASE 2: Maximize Rewards + Tie at Top**
```javascript
if (optimizationPreference === 'rewards') {
    const topEffectiveReward = availableCards[0].effectiveReward;
    const tiedCards = availableCards.filter(card =>
        Math.abs(card.effectiveReward - topEffectiveReward) < 0.01
    );

    if (tiedCards.length > 1 && backupCard) {
        // Use backup card as tiebreaker
        const backupCardInList = tiedCards.find(card =>
            card.cardKey === backupCard.cardType.toLowerCase()
        );

        if (backupCardInList) {
            topCard = backupCardInList;
        }
    }
}
```

**Example**: Gas station purchase, rewards preference
- Chase Reserve: 3x points × 1.3 = 3.9 effective
- Wells Fargo Autograph: 3x points × 1.3 = 3.9 effective

**Tiebreaker applied**:
- If backup card is Chase Reserve → **Chase Reserve wins**
- If backup card is Wells Fargo → **Wells Fargo wins**
- If backup card is neither → **First in list wins**

**Code Location**: `server.js:342-368`

---

**CASE 3: Cash Preference + No Cash Cards**
```javascript
if (optimizationPreference === 'cash' && cashBackCards.length === 0) {
    if (backupCard) {
        // Fall back to backup card
        const backupCardInList = availableCards.find(card =>
            card.cardKey === backupCard.cardType.toLowerCase()
        );

        if (backupCardInList) {
            topCard = backupCardInList;
        } else {
            topCard = availableCards[0]; // Best points card
        }
    }
}
```

**Example**: Airline purchase, cash preference, but user only has points cards
- Chase Reserve: 3x points × 0.5 = 1.5 effective
- Amex Platinum: 5x points × 0.5 = 2.5 effective

**Result**: Even with cash preference, points cards are used
- Amex Platinum has higher effective reward → **Amex Platinum wins**
- If tied → **Backup card used as tiebreaker**

**Code Location**: `server.js:323-340`

---

##### Sub-Step F: Map to Payment Method ID
```javascript
const cardMapping = {
    'visa': process.env.STRIPE_FOODIE_CARD_PM_ID,      // pm_xxxxx (Visa 4242)
    'mastercard': process.env.STRIPE_TRAVEL_CARD_PM_ID, // pm_xxxxx (MC 4444)
    'discover': process.env.STRIPE_GROCERY_CARD_PM_ID,  // pm_xxxxx (Disc 1117)
    'amex': process.env.STRIPE_TRANSIT_CARD_PM_ID       // pm_xxxxx (Amex 8431)
};

const paymentMethodId = cardMapping[topCard.cardKey];
```

**What's happening**:
- The selected card's `cardKey` (e.g., "amex") is mapped to an actual Stripe payment method ID
- This payment method ID is attached to your Stripe customer account
- It represents the real credit card that will be charged

**Example**:
- Selected card: Amex Gold (`cardKey: "amex"`)
- Maps to: `STRIPE_TRANSIT_CARD_PM_ID` = `pm_1S6xxxxxxxxxxxxxAmex8431`
- This is the Amex card ending in 8431

**Code Location**: `server.js:372-390`

---

##### Sub-Step G: Return Selected Card Object
```javascript
const selectedCard = {
    name: `${displayName} (${topCard.rewardAmount}x ${topCard.rewardType})`,
    paymentMethodId: paymentMethodId,
    rewardAmount: topCard.rewardAmount,
    cardKey: topCard.cardKey,
    displayName: displayName,
    rewardType: topCard.rewardType,
    mcc: mcc
};

lastSelectedCard = selectedCard;  // Store for frontend display
return selectedCard;
```

**Example Return Value**:
```json
{
    "name": "American Express Gold Card (4x Points)",
    "paymentMethodId": "pm_1S6xxxxxxxxxxxxxAmex8431",
    "rewardAmount": 4.0,
    "cardKey": "amex",
    "displayName": "American Express Gold Card",
    "rewardType": "Points",
    "mcc": "5812"
}
```

**Code Location**: `server.js:396-412`

---

#### Step 3.4: Immediate Approval Response
**Critical Timing**: The webhook MUST respond within 3 seconds

```javascript
if (optimalCard) {
    liveLog.push(`🏆 Optimal card selected: ${optimalCard.name}`);
    liveLog.push(`💸 Attempting to charge the optimal card (Amount: ${amountToCharge} cents)...`);

    // RESPOND IMMEDIATELY (within 3 seconds)
    res.status(200).json({ approved: true });
    liveLog.push("👍 Sent 'APPROVED' response back to Stripe Issuing.");

    // Continue to step 3.5 asynchronously...
}
```

**What Stripe receives**:
```json
{
    "approved": true
}
```

**Result**:
- Transaction is APPROVED at the merchant
- Card 0005 authorization shows as "approved" in Stripe dashboard
- Merchant receives payment authorization

**Code Location**: `server.js:194-202`

---

#### Step 3.5: Asynchronous Funding Charge
**Important**: This happens AFTER the approval response (non-blocking)

```javascript
stripe.paymentIntents.create({
    amount: amountToCharge,           // 7500 cents = $75.00
    currency: 'usd',
    customer: process.env.STRIPE_CUSTOMER_ID,
    payment_method: optimalCard.paymentMethodId,  // e.g., pm_xxxxx (Amex 8431)
    confirm: true,                    // Charge immediately
    off_session: true,                // No user interaction needed
}).then(() => {
    liveLog.push("✅ Stripe charge successful.");
}).catch(error => {
    liveLog.push(`❌ Stripe charge failed: ${error.message}`);
    // CRITICAL: Transaction was already approved!
    // You may need reconciliation logic here
});
```

**What's happening**:
1. A PaymentIntent is created for $75.00
2. It's charged to the Amex card (ending in 8431)
3. Stripe processes the charge on the funding card
4. Money moves from your Amex account

**If charge fails**:
- Transaction was ALREADY approved to the merchant
- You now have a reconciliation problem (approved but not funded)
- Need manual intervention or refund logic

**Code Location**: `server.js:205-219`

---

### Phase 4: Settlement & Completion

#### Step 4.1: Stripe Settles Card 0005 Authorization
- Stripe marks the card 0005 authorization as "complete"
- The merchant receives funds
- Authorization appears in Stripe dashboard with status "closed"

#### Step 4.2: Funding Card Statement
- The selected funding card (e.g., Amex 8431) shows the charge on its statement
- Transaction appears as: "STRIPE*<merchant_name>"
- Rewards are earned on the funding card based on its benefits

#### Step 4.3: Rewards Tracking
**Benefits Applied**:
- If Amex Gold was selected for restaurant purchase:
  - Base charge: $75.00
  - Rewards earned: 4x points = 300 Membership Rewards points
  - Cash value: ~$3.00 - $6.00 (depending on redemption)

**Live Log Display**:
```
⚡️ INCOMING TRANSACTION from Stripe...
🧠 Analyzing transaction... MCC is 5812.
🎯 Using your custom optimized rankings for best rewards!
🏆 Optimal card selected: American Express Gold Card (4x Points)
💸 Attempting to charge the optimal card (Amount: 7500 cents)...
👍 Sent 'APPROVED' response back to Stripe Issuing.
✅ Stripe charge successful.
```

**Code Location**: Frontend polls `/get-log` endpoint every 500ms

---

## Benefits Triggered by MCC Category

### MCC 5812 - Restaurants
**Best Cards (Default Rankings)**:
1. **Amex Gold** - 4x Points
   - Benefit: "4x points on dining"
   - Value: $75 × 4 = 300 points (~$3-6 value)

2. **Capital One SavorOne** - 3x Points
   - Benefit: "3x points on dining"
   - Value: $75 × 3 = 225 points (~$2.25-4.50)

3. **Chase Sapphire Reserve** - 3x Points (if using custom rankings)
   - Benefit: "3x points on dining"
   - Redeemable at 1.5x through travel portal

---

### MCC 5411 - Grocery Stores
**Best Cards**:
1. **Discover it** - 5x Points (if in quarterly rotation)
   - Benefit: "5% cash back on rotating categories"
   - Value: $120 × 5% = $6.00 cash back

2. **Amex Gold** - 4x Points
   - Benefit: "4x points on U.S. supermarkets (up to $25k/year)"
   - Value: $120 × 4 = 480 points (~$4.80-9.60)

3. **Blue Cash Preferred** - 6x Cash (if in wallet)
   - Benefit: "6% cash back on U.S. supermarkets (up to $6k/year)"
   - Value: $120 × 6% = $7.20 cash back

---

### MCC 4511 - Airlines
**Best Cards**:
1. **Chase Sapphire Reserve** - 3x Points
   - Benefit: "3x points on travel"
   - Value: $350 × 3 = 1,050 points (~$15.75-21.00)

2. **Amex Platinum** - 5x Points (if in wallet)
   - Benefit: "5x points on flights booked directly"
   - Value: $350 × 5 = 1,750 points (~$17.50-35.00)

---

### MCC 4121 - Taxi/Rideshare
**Best Cards**:
1. **Chase Sapphire Reserve** - 3x Points
   - Benefit: "3x points on travel"
   - Value: $25 × 3 = 75 points (~$1.12-1.50)

2. **Wells Fargo Autograph** - 3x Points (if in wallet)
   - Benefit: "3x points on transit"
   - Value: $25 × 3 = 75 points (~$0.75)

---

### MCC 5541 - Gas Stations
**Best Cards**:
1. **Blue Cash Preferred** - 3x Cash (if in wallet)
   - Benefit: "3% cash back on gas stations"
   - Value: $60 × 3% = $1.80 cash back

2. **Discover it** - 5x Points (if in quarterly rotation)
   - Benefit: "5% cash back on gas (rotating)"
   - Value: $60 × 5% = $3.00 cash back

---

### MCC 5912 - Pharmacies
**Best Cards**:
1. **Chase Freedom Flex** - 3x Cash (if in wallet)
   - Benefit: "3% cash back on drugstores"
   - Value: $40 × 3% = $1.20 cash back

2. **Citi Double Cash** - 2x Cash
   - Benefit: "2% cash back on everything"
   - Value: $40 × 2% = $0.80 cash back

---

## Edge Cases & Error Handling

### Error Case 1: No MCC Rankings Found
**Trigger**: Transaction at merchant with unmapped MCC code

**Code**:
```javascript
if (!mccRankings[mcc] || mccRankings[mcc].length === 0) {
    console.log(`❌ No rankings found for MCC: ${mcc}`);
    return null;
}
```

**Result**:
```javascript
liveLog.push("🤷 No optimal card found. Declining transaction.");
return res.status(200).json({ approved: false });
```

**User sees**: Transaction declined at merchant

**Code Location**: `server.js:262-265`

---

### Error Case 2: No Wallet Cards Match Rankings
**Trigger**: User's wallet doesn't include any cards that have rewards for this MCC

**Code**:
```javascript
if (availableCards.length === 0) {
    console.log(`❌ No wallet card types found in rankings for MCC: ${mcc}`);
    return null;
}
```

**Result**: Transaction declined

**Example**:
- User only has: Citi Double Cash, Wells Fargo Autograph
- Transaction at: Costco (only accepts Visa)
- Wells Fargo is Visa, but MCC rankings favor Discover for warehouse stores
- No match → Declined

**Code Location**: `server.js:289-292`

---

### Error Case 3: Funding Charge Fails
**Trigger**: Optimal card selected, approval sent, but funding card charge fails

**Scenario**:
```javascript
stripe.paymentIntents.create({...})
    .catch(error => {
        liveLog.push(`❌ Stripe charge failed: ${error.message}`);
        console.error('CRITICAL: Authorization approved but funding charge failed:', error.message);
    });
```

**Critical Problem**:
- Merchant was ALREADY told "approved"
- Money hasn't actually moved
- Need reconciliation logic

**Possible Reasons**:
- Funding card declined (insufficient funds, fraud detection)
- Funding card expired
- Network error with Stripe API

**Mitigation Needed**:
- Real-time balance checks before approval
- Retry logic with backup card
- Alert system for reconciliation

**Code Location**: `server.js:214-219`

---

### Error Case 4: Webhook Timeout
**Trigger**: Backend takes >3 seconds to respond

**Stripe behavior**:
- Auto-declines transaction
- Sets `decline_reason: webhook_timeout`

**Fix Applied**:
```javascript
// OLD (bad) - charging synchronously before response
await stripe.paymentIntents.create({...});
res.status(200).json({ approved: true });

// NEW (good) - respond immediately, charge async
res.status(200).json({ approved: true });
stripe.paymentIntents.create({...}).then(...).catch(...);
```

**Code Location**: `server.js:199-219`

---

## Testing the Flow

### Method 1: Using the Frontend
1. Navigate to `http://localhost:8080`
2. Build wallet: Select 4 cards, backup card, optimization preference
3. Click "Confirm Wallet Selection"
4. Click a transaction button (e.g., "✈️ Flight - $350")
5. Watch the live log to see card selection in real-time

**What you'll see**:
```
🎴 Creating REAL authorization on card 0005...
💳 Creating $350.00 authorization at 'American Airlines'...
📍 Category: airlines_air_carriers
✅ Authorization created: iauth_xxxxx
⚡ Webhook will be triggered automatically...
```

Then the webhook fires and logs continue:
```
⚡️ INCOMING TRANSACTION from Stripe...
🧠 Analyzing transaction... MCC is 4511.
🏆 Optimal card selected: Chase Sapphire Reserve (3x Points)
👍 Sent 'APPROVED' response back to Stripe Issuing.
✅ Stripe charge successful.
```

---

### Method 2: Using test_webhook.js
```bash
cd Backend
node test_webhook.js restaurant 7500
```

**Output**:
```
🎴 Real authorization requested for: Test Restaurant
⚡️ INCOMING TRANSACTION from Stripe...
🧠 Analyzing transaction... MCC is 5812.
🏆 Optimal card selected: American Express Gold Card (4x Points)
💸 Attempting to charge the optimal card...
👍 Sent 'APPROVED' response back to Stripe Issuing.
✅ Stripe charge successful.
```

---

### Method 3: Stripe CLI
```bash
stripe issuing authorizations create \
  --card=ic_1S769SQLFtcEJSwHLTAnsvQe \
  --amount=12000 \
  --merchant-data[category]=grocery_store \
  --merchant-data[name]="Whole Foods"
```

**Expected MCC**: 5411 (grocery)
**Expected Winner**: Discover it (5x) or Amex Gold (4x)

---

## Key Files Reference

| File | Purpose | Key Contents |
|------|---------|--------------|
| `Backend/server.js` | Main backend logic | Webhook handler, card selection algorithm, optimization |
| `mcc_rankings.json` | Default MCC rankings | Maps MCC codes to ranked card lists |
| `Frontend/card_pool.json` | Available cards | 20+ cards with benefits and annual fees |
| `cached_rankings_*.json` | User-specific rankings | Optimized rankings per wallet configuration |
| `Backend/.env` | Credentials | Stripe API keys, card IDs, payment method IDs |

---

## Summary: What Gets Triggered

When you approve a transaction for **$75 at a restaurant**:

1. **Stripe Event**: `issuing_authorization.request` webhook fired
2. **MCC Code**: `5812` extracted
3. **Wallet Filter**: Only your 4 selected cards considered
4. **Effective Rewards Calculated**:
   - Cash preference: Points × 0.5, Cash × 1.0
   - Rewards preference: Points × 1.3, Cash × 1.0
5. **Best Card Selected**: Based on highest effective reward + tiebreaker logic
6. **Approval Sent**: `{ approved: true }` within 3 seconds
7. **Funding Card Charged**: Async PaymentIntent for $75
8. **Benefits Earned**:
   - Amex Gold: 300 points (~$3-6 value)
   - Annual fee: $250 (amortized across all purchases)
9. **Transaction Complete**: Merchant paid, rewards earned, user sees live log

---

## Optimization Strategies

### Strategy 1: Cash Back Maximizer
- **Preference**: Cash Back
- **Best Cards**: Citi Double Cash, Discover it, Blue Cash Preferred, Freedom Flex
- **Logic**: Only use points cards if 2x better than cash options
- **Example**: 2% cash beats 3x points (3 × 0.5 = 1.5)

### Strategy 2: Premium Travel Rewards
- **Preference**: Maximize Rewards
- **Best Cards**: Chase Sapphire Reserve, Amex Platinum, Amex Gold, Capital One Venture X
- **Logic**: Value points at 1.3x, prioritize high multipliers
- **Example**: 4x points valued at 5.2 effective (4 × 1.3)

### Strategy 3: Rotating Category Mastery
- **Cards**: Discover it, Chase Freedom Flex
- **Benefit**: 5% on rotating categories
- **Strategy**: Always include one rotating card in wallet
- **Q1**: Grocery stores - Discover wins
- **Q2**: Gas stations - Discover wins
- **Q3**: Restaurants - Discover wins
- **Q4**: Amazon/PayPal - Discover wins

### Strategy 4: Backup Card Selection
**Best Backup Cards**:
1. **Citi Double Cash** - 2% everywhere (great for cash preference ties)
2. **Capital One Venture X** - 2x miles everywhere (great for rewards ties)
3. **Amex Gold** - Strong in dining/groceries (covers common categories)

---

## End-to-End Example: Restaurant Purchase

**Scenario**: $75 dinner at Corner Bistro

**User Wallet**:
- Amex Gold (Amex)
- Chase Sapphire Reserve (Visa)
- Citi Double Cash (Mastercard)
- Discover it (Discover)

**User Settings**:
- Backup Card: Citi Double Cash
- Preference: Cash Back

---

**Step-by-Step Execution**:

1. User swipes card 0005 at restaurant terminal
2. Stripe receives: $75.00, MCC 5812, "Corner Bistro"
3. Webhook fires: `issuing_authorization.request`
4. Backend extracts: `mcc = "5812"`, `amount = 7500`
5. Load rankings for MCC 5812:
   ```
   Amex Gold: 4x Points
   SavorOne: 3x Points (not in wallet - skip)
   Chase Reserve: 3x Points
   Discover: 1x Default
   ```
6. Filter to wallet cards:
   ```
   Amex Gold: 4x Points
   Chase Reserve: 3x Points
   Discover: 1x Default
   ```
7. Calculate effective rewards (cash preference):
   ```
   Amex Gold: 4.0 × 0.5 = 2.0
   Chase Reserve: 3.0 × 0.5 = 1.5
   Citi Double Cash: 2.0 × 1.0 = 2.0
   Discover: 1.0 × 0.5 = 0.5
   ```
8. Sort by effective reward:
   ```
   1. Amex Gold: 2.0
   2. Citi Double Cash: 2.0 (TIE!)
   3. Chase Reserve: 1.5
   4. Discover: 0.5
   ```
9. Apply tiebreaker (backup card = Citi Double Cash):
   ```
   Winner: Citi Double Cash
   ```
10. Map to payment method: `pm_1S6xxxxxxxxxxxxxMC4444`
11. Respond to Stripe: `{ approved: true }` (within 1.2 seconds)
12. Charge Citi Double Cash async: $75.00
13. Transaction completes: Merchant paid, 2% cash back earned ($1.50)

**Total Value**:
- Rewards earned: $1.50 cash back
- Annual fee: $0
- Net benefit: $1.50

---

## Conclusion

The One Card system creates an intelligent payment routing layer that:

1. **Simplifies user experience** - One card to carry (card 0005)
2. **Maximizes rewards automatically** - Selects best card per transaction
3. **Respects user preferences** - Cash vs rewards optimization
4. **Operates in real-time** - <3 second decisioning
5. **Transparent operation** - Live logs show every decision

**Key Innovation**: MCC-based routing with preference-aware effective reward calculation, backed by real-time Stripe Issuing webhooks and async funding card charges.
