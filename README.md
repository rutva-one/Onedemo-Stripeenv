# One Card Demo - Smart Payment Routing

A demo showcasing intelligent credit card optimization and payment routing based on MCC (Merchant Category Code) to maximize rewards.

## 🚀 Quick Start

### 1. Start the Backend
```bash
cd Backend
npm install
node server.js
```
The backend will start on `http://localhost:3000`

### 2. Start the Frontend
```bash
cd Frontend
python3 -m http.server 8080
```
The frontend will be available at `http://localhost:8080`

### 3. Open in Browser
Navigate to `http://localhost:8080` and start using the demo!

---

## 📖 How to Use the Demo

### Step 1: Build Your Wallet
1. Select **4 credit cards** from the available pool (20+ cards to choose from)
2. Choose a **backup card** (used as a tiebreaker when rewards are equal)
3. Select your **optimization preference**:
   - **💵 Cash Back**: Prioritizes cash back cards; only uses points cards if they're 2x better
   - **🎁 Maximize Rewards**: Values points/miles higher for potential travel redemptions

### Step 2: Optimize Your Wallet
Click "Confirm Wallet Selection" to build custom MCC rankings for your 4 cards.

### Step 3: Simulate Transactions
Test different purchase categories to see smart routing in action:
- ✈️ **Flight** - American Airlines ($350)
- 🍔 **Food** - The Corner Bistro ($75)
- 🛒 **Groceries** - Whole Foods ($120)
- 🚕 **Cab** - Yellow Cab ($25)
- ⛽ **Gas** - Shell Gas Station ($60)
- 💊 **Pharmacy** - CVS Pharmacy ($40)

### Step 4: Watch the Magic
The system will:
1. Identify the MCC code for your purchase
2. Calculate effective rewards based on your preference
3. Route to the optimal card
4. Show you which card was selected and why

---

## 🎯 Key Features

### Smart Card Selection Logic
- **Cash Preference**: Points cards valued at 0.5x (need to be 2x better to win)
- **Rewards Preference**: Points cards valued at 1.3x (optimistic redemption value)
- **Tie-Breaker**: Uses your designated backup card when cards are equal

### Three Selection Cases
1. **Cash + Cash Available**: Picks best cash card (unless points 2x better)
2. **Rewards + Tie**: Uses backup card to break ties
3. **Cash + No Cash Cards**: Falls back to backup card

### Real-Time Insights
- See which card was selected
- Understand the reward multiplier earned
- Track total annual fees across your wallet

---

## 🏗️ Architecture

### Backend (`/Backend`)
- **Node.js + Express** server
- **Stripe integration** for payment simulation
- **MCC-based routing logic** with cash/rewards optimization
- Real-time transaction logging

### Frontend (`/Frontend`)
- **Vanilla HTML/CSS/JS** - no frameworks needed
- **Interactive wallet builder**
- **Real-time transaction simulation**
- **Visual progress tracking**

### Data Files
- `mcc_rankings.json` - Default MCC category rankings for all cards
- `card_pool.json` - 20+ credit cards with benefits and fees

---

## 🔧 Configuration

### Environment Variables
Located in `Backend/.env`:
```
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_signing_secret
STRIPE_ISSUING_CARD_ID=ic_xxx  # Virtual card (ending in 0005)
STRIPE_CUSTOMER_ID=cus_xxx
STRIPE_FOODIE_CARD_PM_ID=pm_xxx  # Visa funding card
STRIPE_TRAVEL_CARD_PM_ID=pm_xxx  # Mastercard funding card
STRIPE_GROCERY_CARD_PM_ID=pm_xxx  # Discover funding card
STRIPE_TRANSIT_CARD_PM_ID=pm_xxx  # Amex funding card
```

---

## 🎴 How Stripe Integration Works

### The Two-Card System

This demo uses **Stripe Issuing** to create a smart routing layer between what the user sees and what actually gets charged:

#### 1. **Card 0005 (Virtual Issuing Card)** - The Interface
- This is the **single card** users interact with (ending in 0005)
- It's a **Stripe Issuing virtual card** - no real funds on it
- Users swipe/use this card at merchants
- **Purpose**: Acts as a "router" or "wrapper" - intercepts transactions

#### 2. **Funding Cards (4 Real Cards)** - The Payment Source
- **Visa** (ending in 4242) - Foodie Card
- **Mastercard** (ending in 4444) - Travel Card
- **Discover** (ending in 1117) - Grocery Card
- **Amex** (ending in 8431) - Transit Card
- These cards have **real funds** and are charged behind the scenes

### Transaction Flow

```
User uses card 0005 at restaurant for $75
         ↓
Stripe fires webhook: "issuing_authorization.request"
         ↓
Your server receives: MCC code 5812 (restaurant)
         ↓
Server responds immediately: { approved: true }
         ↓
Server selects optimal card: Foodie Card (5x on dining)
         ↓
Server charges Visa 4242 for $75 (real money moves)
         ↓
Stripe settles card 0005 authorization
         ↓
Merchant gets paid
```

### Why This Architecture?

- **User simplicity**: Only one card number to remember (0005)
- **Backend intelligence**: System picks the best rewards card automatically
- **Real-time routing**: Each transaction goes to the optimal funding source
- **Transparency**: Logs show exactly which card was selected and why

---

## 🔗 Webhook Setup (Required for Real Transactions)

The webhook is the **critical component** that enables real-time smart routing. Without it, card 0005 won't work.

### What the Webhook Does

When someone uses card 0005, Stripe needs to know: "Should I approve or decline this transaction?"

Your webhook endpoint (`/stripe-webhook`) receives this request and must:
1. **Respond within 3 seconds** with `{ approved: true }` or `{ approved: false }`
2. Select the optimal funding card based on MCC code
3. Charge that funding card in the background

**IMPORTANT**: The recent code fix ensures the webhook responds immediately (avoiding timeouts), then charges the funding card asynchronously.

### Setup Option 1: Using ngrok (Development)

**Step 1**: Install ngrok
```bash
brew install ngrok
# OR download from https://ngrok.com/download
```

**Step 2**: Start your backend server
```bash
cd Backend
node server.js
```

**Step 3**: In a new terminal, create a public tunnel
```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123-xyz.ngrok.io -> http://localhost:3000
```

**Step 4**: Register webhook in Stripe Dashboard
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **"+ Add endpoint"**
3. Enter endpoint URL: `https://abc123-xyz.ngrok.io/stripe-webhook`
4. Select events to listen to: **`issuing_authorization.request`**
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_`)

**Step 5**: Update your `.env` file
```bash
STRIPE_WEBHOOK_SECRET=whsec_your_new_signing_secret_here
```

**Step 6**: Restart your server
```bash
# Stop the old server (Ctrl+C) and restart
node server.js
```

✅ **Your webhook is now live!** Transactions on card 0005 will trigger your local server.

### Setup Option 2: Using Stripe CLI (Alternative)

The Stripe CLI can forward webhooks without ngrok:

**Step 1**: Install Stripe CLI
```bash
brew install stripe/stripe-cli/stripe
```

**Step 2**: Login to Stripe
```bash
stripe login
```

**Step 3**: Forward webhooks to your local server
```bash
stripe listen --forward-to localhost:3000/stripe-webhook
```

This will output a webhook signing secret. Update your `.env` with it.

**Step 4**: Keep this terminal running while testing

✅ **The Stripe CLI forwards all webhooks to your local server automatically!**

---

## 🧪 Testing Real Transactions

### Method 1: Stripe Dashboard Test Card

**Step 1**: Go to your Stripe Dashboard
- Navigate to https://dashboard.stripe.com/test/issuing/cards
- Click on your card ending in **0005**

**Step 2**: Create a test authorization
- Click **"Create test authorization"** button
- Fill in:
  - **Amount**: `5000` (= $50.00 in cents)
  - **Merchant Category**: Select "Restaurants" or enter MCC `5812`
  - **Merchant Name**: "Test Restaurant"
- Click **"Create authorization"**

**Step 3**: Watch the logs
- Check your backend terminal - you should see:
  ```
  ⚡️ INCOMING TRANSACTION from Stripe...
  🧠 Analyzing transaction... MCC is 5812.
  🏆 Optimal card selected: Foodie Card (5x Cash Back)
  👍 Sent 'APPROVED' response back to Stripe Issuing.
  ✅ Stripe charge successful.
  ```

**Step 4**: Verify in Stripe Dashboard
- Go to https://dashboard.stripe.com/test/payments
- You should see a successful PaymentIntent for $50
- Check the payment method - it will be one of your funding cards (4242/4444/1117/8431)

### Method 2: Quick Test Script (Easiest!)

We've included a helper script for quick webhook testing:

```bash
cd Backend

# Test different transaction types
node test_webhook.js restaurant 7500    # $75 at restaurant
node test_webhook.js airline 35000      # $350 for flight
node test_webhook.js grocery 12000      # $120 at grocery store
node test_webhook.js gas 6000           # $60 at gas station
node test_webhook.js pharmacy 4000      # $40 at pharmacy
node test_webhook.js taxi 2500          # $25 taxi ride
```

This script:
- ✅ Automatically uses your card 0005 from `.env`
- ✅ Maps categories to correct MCC codes
- ✅ Shows approval/decline status
- ✅ Provides direct links to Stripe Dashboard

### Method 3: Stripe CLI Test

Trigger test authorizations manually with full control:

```bash
# Restaurant purchase ($75)
stripe issuing authorizations create \
  --card=ic_1S769SQLFtcEJSwHLTAnsvQe \
  --amount=7500 \
  --merchant-data[category]=restaurant \
  --merchant-data[name]="Test Bistro"

# Airline purchase ($350)
stripe issuing authorizations create \
  --card=ic_1S769SQLFtcEJSwHLTAnsvQe \
  --amount=35000 \
  --merchant-data[category]=airline \
  --merchant-data[name]="Test Airlines"

# Grocery purchase ($120)
stripe issuing authorizations create \
  --card=ic_1S769SQLFtcEJSwHLTAnsvQe \
  --amount=12000 \
  --merchant-data[category]=grocery_store \
  --merchant-data[name]="Test Grocery"
```

### Method 4: Demo Simulation Endpoint (No Webhook)

For quick testing without real Stripe Issuing webhooks:

```bash
curl -X POST http://localhost:3000/simulate-transaction \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "descriptor": "Delta Airlines",
    "category": "travel"
  }'
```

**Note**: This bypasses the webhook and card 0005, charging funding cards directly for demo purposes.

---

## 🐛 Troubleshooting

### Card 0005 Transactions Keep Getting Declined

**Problem**: Stripe Dashboard shows `webhook_timeout` as decline reason

**Cause**: Your webhook isn't responding fast enough (Stripe requires response in <3 seconds)

**Solution**:
✅ The code has been fixed to respond immediately (line 152 in server.js)
- Make sure you're running the **latest version** of server.js
- The webhook now responds with `{ approved: true }` first, then charges funding cards async

### Webhook Not Receiving Events

**Problem**: No logs appear when using card 0005

**Possible causes**:
1. **Webhook URL not registered**: Check Stripe Dashboard → Webhooks
2. **ngrok tunnel expired**: Free ngrok tunnels reset - run `ngrok http 3000` again
3. **Wrong signing secret**: Update `STRIPE_WEBHOOK_SECRET` in `.env`
4. **Server not running**: Make sure `node server.js` is active

### Wrong Card Selected

**Problem**: System picks unexpected funding card

**Check**:
1. MCC code mapping - see `selectOptimalCard()` function
2. Your wallet selection - only selected cards are considered
3. Optimization preference - cash vs rewards affects valuation
4. Custom rankings file - check if cached rankings are stale

---

## 🎓 Demo Flow Example

**Scenario**: You want to maximize cash back

1. **Select 4 Cards**:
   - Citi Double Cash (2% cash back)
   - Discover it (5% rotating)
   - Chase Sapphire Reserve (3x points travel/dining)
   - Amex Gold (4x points dining)

2. **Choose Backup**: Citi Double Cash

3. **Set Preference**: 💵 Cash Back

4. **Purchase**: Restaurant ($75)

5. **Result**:
   - Amex Gold: 4x × 0.5 = 2.0 effective
   - Chase: 3x × 0.5 = 1.5 effective
   - Citi: 2x × 1.0 = 2.0 effective
   - **Winner**: Citi Double Cash (cash preference wins ties)

---

## 📝 Notes

- Transaction simulation uses mock MCCs - no real charges are made
- The optimization runs client-side for instant results
- Wallet configurations are cached to speed up repeated demos
- All card data is for demonstration purposes only

---

## 🤝 Support

For questions or issues, contact the team or check the code comments for detailed explanations of the routing logic.