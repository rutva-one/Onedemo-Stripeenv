// =================================================================
// UPGRADED DEMO: server.js (CORRECTED VERSION)
// =================================================================

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
});
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
app.use(cors());

const port = 3000;
let liveLog = [];

// Optimization state
let optimizationInProgress = false;
let optimizationProgress = 0;
let optimizationStatus = "Waiting to start...";
let customRankingsFile = null;
let currentWalletCards = []; // Store the user's currently selected cards
let backupCard = null; // Store the user's designated backup card
let lastSelectedCard = null; // Store the last card selected for optimization display
let optimizationPreference = 'rewards'; // 'cash' or 'rewards'

// Load MCC rankings from JSON file
let mccRankings = {};
try {
    const rankingsPath = path.join(__dirname, '..', 'mcc_rankings.json');
    const rankingsData = fs.readFileSync(rankingsPath, 'utf8');
    mccRankings = JSON.parse(rankingsData);
    console.log('✅ MCC rankings loaded successfully');
} catch (error) {
    console.error('❌ Failed to load MCC rankings:', error.message);
}

// Card key to payment method ID mapping (verified via Stripe API)
const cardMapping = {
    'visa': process.env.STRIPE_FOODIE_CARD_PM_ID,      // Verified: VISA
    'mastercard': process.env.STRIPE_TRAVEL_CARD_PM_ID, // Verified: MASTERCARD
    'discover': process.env.STRIPE_GROCERY_CARD_PM_ID,  // Verified: DISCOVER
    'amex': process.env.STRIPE_TRANSIT_CARD_PM_ID       // Verified: AMEX
};

app.use((req, res, next) => {
    if (req.originalUrl === '/stripe-webhook') {
        next();
    } else {
        bodyParser.json()(req, res, next);
    }
});

// --- ENDPOINTS ---

// **MODIFICATION 1**: This endpoint now accepts transaction details from the frontend
// NEW ENDPOINT: Use actual card 0005 with real Stripe Issuing authorization
app.post('/create-authorization', async (req, res) => {
    const { amount, descriptor, category } = req.body;

    liveLog = ["🎴 Creating REAL authorization on card 0005..."];
    console.log("🎴 Real authorization requested for:", descriptor);

    try {
        // Map descriptor to Stripe category name (for test API)
        const categoryName = descriptor && descriptor.includes('Airlines') ? 'airlines_air_carriers' :
                            descriptor && descriptor.includes('Bistro') ? 'eating_places_restaurants' :
                            descriptor && descriptor.includes('Whole Foods') ? 'grocery_stores_supermarkets' :
                            descriptor && descriptor.includes('Cab') ? 'taxicabs_limousines' :
                            descriptor && descriptor.includes('Gas Station') ? 'service_stations' :
                            descriptor && descriptor.includes('Pharmacy') ? 'drug_stores_and_pharmacies' : 'eating_places_restaurants';

        liveLog.push(`💳 Creating $${(amount / 100).toFixed(2)} authorization at '${descriptor}'...`);
        liveLog.push(`📍 Category: ${categoryName}`);

        // Create REAL Stripe Issuing authorization on card 0005
        // This will trigger the webhook at /stripe-webhook
        const authorization = await stripe.testHelpers.issuing.authorizations.create({
            card: process.env.STRIPE_ISSUING_CARD_ID,  // Card 0005
            amount: amount,
            merchant_data: {
                category: categoryName,
                name: descriptor,
            },
        });

        liveLog.push(`✅ Authorization created: ${authorization.id}`);
        liveLog.push(`⚡ Webhook will be triggered automatically...`);
        liveLog.push(`🔗 View in Dashboard: https://dashboard.stripe.com/test/issuing/authorizations/${authorization.id}`);

        res.json({
            message: "Authorization created on card 0005!",
            authorizationId: authorization.id,
            status: authorization.status,
            log: liveLog
        });

    } catch (error) {
        liveLog.push(`❌ Failed to create authorization: ${error.message}`);
        console.error('Authorization creation failed:', error);
        res.status(500).json({ error: error.message, log: liveLog });
    }
});

// ORIGINAL ENDPOINT: Simulation mode (no card 0005)
app.post('/simulate-transaction', async (req, res) => {
    const { amount, descriptor, category } = req.body; // Read the details from the request

    liveLog = ["🚀 Simulation requested from the frontend."];
    console.log("🚀 Simulation requested for:", descriptor);

    try {
        liveLog.push(`💳 Simulating a $${(amount / 100).toFixed(2)} transaction at '${descriptor}'...`);

        // Skip the actual Stripe API call for demo purposes to avoid category validation issues
        // In a real implementation, you would call Stripe with proper category codes
        liveLog.push("✅ Simulating transaction locally (Stripe API call skipped for demo).");
        liveLog.push("⚡ Processing transaction through demo payment flow...");

        // LOCAL TESTING: Simulate webhook response after delay
        setTimeout(async () => {
            // Map based on descriptor since we're using a generic category
            const mockMCC = descriptor && descriptor.includes('Airlines') ? '4511' :
                          descriptor && descriptor.includes('Bistro') ? '5812' :
                          descriptor && descriptor.includes('Whole Foods') ? '5411' :
                          descriptor && descriptor.includes('Cab') ? '4121' :
                          descriptor && descriptor.includes('Gas Station') ? '5541' :
                          descriptor && descriptor.includes('Pharmacy') ? '5912' : '4121';

            liveLog.push(`🧠 Analyzing transaction... MCC is ${mockMCC}.`);
            if (customRankingsFile) {
                liveLog.push(`🎯 Using your custom optimized rankings for best rewards!`);
            }
            const optimalCard = selectOptimalCard(mockMCC);

            if (optimalCard) {
                liveLog.push(`🏆 Optimal card selected: ${optimalCard.name}`);
                liveLog.push(`💸 Attempting to charge the optimal card (Amount: ${amount} cents)...`);

                try {
                    await stripe.paymentIntents.create({
                        amount: amount,
                        currency: 'usd',
                        customer: process.env.STRIPE_CUSTOMER_ID,
                        payment_method: optimalCard.paymentMethodId,
                        confirm: true,
                        off_session: true,
                    });

                    liveLog.push("✅ Stripe charge successful.");
                    liveLog.push("👍 Transaction completed successfully.");
                } catch (error) {
                    liveLog.push(`❌ Stripe charge failed: ${error.message}`);
                    liveLog.push("👎 Transaction declined.");
                }
            } else {
                liveLog.push("🤷 No optimal card found. Declining transaction.");
            }
        }, 2000);

    } catch (error) {
        liveLog.push(`❌ Stripe simulation failed: ${error.message}`);
    }

    res.json({ message: "Simulation started!", log: liveLog });
});

app.post('/stripe-webhook', bodyParser.raw({type: 'application/json'}), async (req, res) => {
    const webhookStartTime = Date.now();
    liveLog.push("⚡️ INCOMING TRANSACTION from Stripe...");
    console.log(`[Webhook] Received event at ${new Date().toISOString()}`);

    let event;
    try {
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log(`[Webhook] Event type: ${event.type}, ID: ${event.id}`);
    } catch (err) {
        liveLog.push(`❌ Webhook signature verification failed: ${err.message}`);
        console.error('[Webhook] Signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'issuing_authorization.request') {
        const authorization = event.data.object;
        const incomingMCC = authorization.merchant_data.category_code;
        const amountToCharge = authorization.pending_request.amount;

        liveLog.push(`🧠 Analyzing transaction... MCC is ${incomingMCC}.`);
        console.log(`[Webhook] Authorization ${authorization.id}: $${amountToCharge/100} at MCC ${incomingMCC}`);

        if (customRankingsFile) {
            liveLog.push(`🎯 Using your custom optimized rankings for best rewards!`);
        }

        const optimalCard = selectOptimalCard(incomingMCC);

        if (optimalCard) {
            liveLog.push(`🏆 Optimal card selected: ${optimalCard.name}`);
            liveLog.push(`💸 Attempting to charge the optimal card (Amount: ${amountToCharge} cents)...`);

            const responseTime = Date.now() - webhookStartTime;
            console.log(`[Webhook] Responding with APPROVED after ${responseTime}ms`);

            // IMPORTANT: Respond to Stripe IMMEDIATELY to avoid timeout
            // Must include Stripe-Version header as per Stripe docs
            // Then charge the funding card asynchronously in the background
            res.setHeader('Stripe-Version', '2024-06-20');
            res.status(200).json({ approved: true });
            liveLog.push(`👍 Sent 'APPROVED' response back to Stripe Issuing (${responseTime}ms).`);

            // Charge the funding card asynchronously (doesn't block the webhook response)
            stripe.paymentIntents.create({
                amount: amountToCharge,
                currency: 'usd',
                customer: process.env.STRIPE_CUSTOMER_ID,
                payment_method: optimalCard.paymentMethodId,
                confirm: true,
                off_session: true,
            }).then((paymentIntent) => {
                liveLog.push(`✅ Stripe charge successful: ${paymentIntent.id}`);
                console.log(`[Webhook] Funding card charged: ${paymentIntent.id}, status: ${paymentIntent.status}`);
            }).catch(error => {
                liveLog.push(`❌ Stripe charge failed: ${error.message}`);
                console.error('[Webhook] CRITICAL: Authorization approved but funding charge failed:', error.message);
            });

            return; // Exit after sending response

        } else {
            liveLog.push("🤷 No optimal card found. Declining transaction.");
            console.log('[Webhook] Responding with DECLINED - no optimal card found');
            res.setHeader('Stripe-Version', '2024-06-20');
            return res.status(200).json({ approved: false });
        }
    } else {
        // Handle other event types gracefully
        console.log(`[Webhook] Received non-authorization event: ${event.type}, acknowledging`);
        return res.status(200).json({ received: true });
    }
});

// Helper function to calculate effective reward value based on optimization preference
function calculateEffectiveReward(rewardAmount, rewardType, preference) {
    // Base reward amount
    let effectiveValue = rewardAmount;

    if (preference === 'cash') {
        // Cash preference: Strongly prioritize cash back
        // Only use points/miles if they're SIGNIFICANTLY better (like 2x+ better)
        if (rewardType && rewardType.toLowerCase().includes('cash')) {
            effectiveValue = rewardAmount * 1.0; // Cash is worth face value
        } else {
            // Value points at their worst-case redemption (statement credit: ~0.5 cents per point)
            // This means a points card needs to be 2x better to beat cash back
            effectiveValue = rewardAmount * 0.5;
        }
    } else {
        // Rewards preference: Value points/miles higher due to potential redemption value
        if (rewardType && rewardType.toLowerCase().includes('cash')) {
            effectiveValue = rewardAmount * 1.0; // Cash is still worth face value
        } else {
            effectiveValue = rewardAmount * 1.3; // Points/miles potentially worth more (1.3-2.0 cpp)
        }
    }

    return effectiveValue;
}

// **MODIFICATION 2**: Use JSON rankings to select optimal card
function selectOptimalCard(mcc) {
    const rankingType = customRankingsFile ? "custom" : "default";
    console.log(`🔍 Looking for optimal card for MCC: ${mcc} (using ${rankingType} rankings)`);
    console.log(`${optimizationPreference === 'cash' ? '💵' : '🎁'} Optimization strategy: ${optimizationPreference}`);

    // Check if we have rankings for this MCC
    if (!mccRankings[mcc] || !Array.isArray(mccRankings[mcc]) || mccRankings[mcc].length === 0) {
        console.log(`❌ No rankings found for MCC: ${mcc}`);
        return null;
    }

    // Create a map of card types from user's wallet for quick lookup
    const walletCardsByType = {};
    currentWalletCards.forEach(card => {
        const normalizedType = card.cardType === "American Express" ? "amex" : card.cardType.toLowerCase();
        if (!walletCardsByType[normalizedType]) {
            walletCardsByType[normalizedType] = [];
        }
        walletCardsByType[normalizedType].push(card);
    });

    console.log(`🎯 Current wallet cards by type:`, Object.keys(walletCardsByType).map(type =>
        `${type}: [${walletCardsByType[type].map(c => c.cardName).join(', ')}]`
    ).join('; '));

    // Filter rankings to only include card types that are in the user's wallet
    let availableCards = mccRankings[mcc].filter(card => {
        const rankingCardType = card.cardKey || (card.cardType === "American Express" ? "amex" : card.cardType?.toLowerCase());
        return rankingCardType && walletCardsByType[rankingCardType];
    });

    console.log(`🔍 Available cards for MCC ${mcc}: [${availableCards.map(c => `${c.cardName} (${c.cardKey || c.cardType})`).join(', ')}]`);

    if (availableCards.length === 0) {
        console.log(`❌ No wallet card types found in rankings for MCC: ${mcc}`);
        return null;
    }

    // Calculate effective rewards for each card based on optimization preference
    availableCards = availableCards.map(card => ({
        ...card,
        effectiveReward: calculateEffectiveReward(card.rewardAmount, card.rewardType, optimizationPreference)
    }));

    // Sort by effective reward (highest first)
    availableCards.sort((a, b) => b.effectiveReward - a.effectiveReward);

    console.log(`📊 Effective rewards (${optimizationPreference} preference):`, availableCards.map(c =>
        `${c.cardName}: ${c.rewardAmount}x ${c.rewardType} → ${c.effectiveReward.toFixed(2)} effective`
    ).join('; '));

    // Get the top-ranked card from available wallet cards after applying preference
    let topCard = availableCards[0];

    if (optimizationPreference === 'cash') {
        // CASE 1 & 3: Cash Preference
        // Check if any cash back cards exist in the available cards
        const cashBackCards = availableCards.filter(card =>
            card.rewardType && card.rewardType.toLowerCase().includes('cash')
        );

        if (cashBackCards.length > 0) {
            // CASE 1: Cash cards exist - pick the best one
            // (Already sorted by effective reward, so best cash card or points card 2x better is already first)
            topCard = availableCards[0];
            console.log(`💵 Cash preference: Selected ${topCard.cardName} (${topCard.rewardAmount}x ${topCard.rewardType}, ${topCard.effectiveReward.toFixed(2)} effective)`);
        } else {
            // CASE 3: No cash back cards in wallet - use backup card as fallback
            if (backupCard) {
                const backupCardType = backupCard.cardType === "American Express" ? "amex" : backupCard.cardType.toLowerCase();
                const backupCardInList = availableCards.find(card => {
                    const rankingCardType = card.cardKey || (card.cardType === "American Express" ? "amex" : card.cardType?.toLowerCase());
                    return rankingCardType === backupCardType;
                });

                if (backupCardInList) {
                    topCard = backupCardInList;
                    console.log(`🛡️ Cash preference but no cash cards available - using backup card: ${topCard.cardName}`);
                } else {
                    console.log(`💵 Cash preference but no cash cards available - using best points card: ${topCard.cardName}`);
                }
            } else {
                console.log(`💵 Cash preference but no cash cards available - using best points card: ${topCard.cardName}`);
            }
        }
    } else {
        // CASE 2: Maximize Rewards Preference
        // Check if there's a tie at the top
        const topEffectiveReward = availableCards[0].effectiveReward;
        const tiedCards = availableCards.filter(card =>
            Math.abs(card.effectiveReward - topEffectiveReward) < 0.01
        );

        if (tiedCards.length > 1 && backupCard) {
            // Tie situation - use backup card as tiebreaker
            const backupCardType = backupCard.cardType === "American Express" ? "amex" : backupCard.cardType.toLowerCase();
            const backupCardInList = tiedCards.find(card => {
                const rankingCardType = card.cardKey || (card.cardType === "American Express" ? "amex" : card.cardType?.toLowerCase());
                return rankingCardType === backupCardType;
            });

            if (backupCardInList) {
                topCard = backupCardInList;
                console.log(`🛡️ Maximize rewards tie (${tiedCards.length} cards at ${topEffectiveReward.toFixed(2)}) - using backup card: ${topCard.cardName}`);
            } else {
                topCard = availableCards[0];
                console.log(`🎁 Maximize rewards: ${topCard.cardName} (${topCard.rewardAmount}x ${topCard.rewardType}, ${topCard.effectiveReward.toFixed(2)} effective)`);
            }
        } else {
            topCard = availableCards[0];
            console.log(`🎁 Maximize rewards: ${topCard.cardName} (${topCard.rewardAmount}x ${topCard.rewardType}, ${topCard.effectiveReward.toFixed(2)} effective)`);
        }
    }

    // Get the payment method ID for this card based on card type (network)
    let cardTypeKey;
    if (topCard.cardKey && cardMapping[topCard.cardKey]) {
        cardTypeKey = topCard.cardKey;
        console.log(`💳 Using cardKey: ${cardTypeKey}`);
    } else if (topCard.cardType) {
        const cardType = topCard.cardType;
        cardTypeKey = cardType === "American Express" ? "amex" : cardType.toLowerCase();
        console.log(`💳 Using cardType: ${cardType} → ${cardTypeKey}`);
    } else {
        console.log(`❌ No cardKey or cardType found for top card`);
        return null;
    }

    const paymentMethodId = cardMapping[cardTypeKey];
    console.log(`💳 Payment method ID: ${paymentMethodId}`);

    if (!paymentMethodId) {
        console.log(`❌ No payment method ID found for card type: ${cardTypeKey}`);
        return null;
    }

    // Get the actual wallet card for this type to show the correct name
    const walletCard = walletCardsByType[cardTypeKey] ? walletCardsByType[cardTypeKey][0] : null;
    const displayName = walletCard ? walletCard.cardName : topCard.cardName;

    const selectedCard = {
        name: `${displayName} (${topCard.rewardAmount}x ${topCard.rewardType})`,
        paymentMethodId: paymentMethodId,
        rewardAmount: topCard.rewardAmount,
        cardKey: cardTypeKey,
        cardType: cardTypeKey,
        displayName: displayName,
        rewardType: topCard.rewardType,
        mcc: mcc
    };

    console.log(`✅ Selected card:`, selectedCard);

    // Store for frontend display
    lastSelectedCard = selectedCard;

    return selectedCard;
}

app.get('/get-log', (req, res) => {
    res.json({ log: liveLog });
});

// Get last selected card for optimization display
app.get('/get-last-selected-card', (req, res) => {
    if (lastSelectedCard) {
        res.json({ selectedCard: lastSelectedCard });
    } else {
        res.json({ selectedCard: null });
    }
});

// Card Pool endpoints
app.get('/get-card-pool', (req, res) => {
    try {
        const cardPoolPath = path.join(__dirname, '..', 'Frontend', 'card_pool.json');
        const cardPoolData = fs.readFileSync(cardPoolPath, 'utf8');
        const cardPool = JSON.parse(cardPoolData);
        res.json({ cards: cardPool });
    } catch (error) {
        console.error('Failed to load card pool:', error);
        res.status(500).json({ error: 'Failed to load card pool' });
    }
});

// Save user wallet selection (optional - for future use)
app.post('/save-wallet', (req, res) => {
    const { selectedCards } = req.body;
    console.log('User selected wallet:', selectedCards.map(card => card.cardName));
    // Here you could save the user's wallet selection to a database
    // For now, we'll just log it and return success
    res.json({ message: 'Wallet saved successfully', count: selectedCards.length });
});

// Start card optimization process
app.post('/optimize-cards', (req, res) => {
    const { selectedCards, backupCard: userBackupCard, optimizationPreference: userOptimizationPreference } = req.body;

    if (optimizationInProgress) {
        return res.status(409).json({ error: 'Optimization already in progress' });
    }

    if (!selectedCards || !Array.isArray(selectedCards)) {
        return res.status(400).json({ error: 'Invalid selectedCards data' });
    }

    console.log('🎯 Starting card optimization for:', selectedCards.map(card => card.cardName));
    console.log('🛡️ Backup card:', userBackupCard ? userBackupCard.cardName : 'None');
    console.log(`${userOptimizationPreference === 'cash' ? '💵' : '🎁'} Optimization preference:`, userOptimizationPreference || 'rewards (default)');

    // Store the current wallet cards, backup card, and optimization preference globally
    currentWalletCards = selectedCards;
    backupCard = userBackupCard;
    optimizationPreference = userOptimizationPreference || 'rewards';

    // Create a cache key based on selected card IDs and optimization preference
    const preferenceKey = optimizationPreference || 'rewards';
    const cacheKey = selectedCards.map(card => card.id).sort().join('-') + '_' + preferenceKey;
    const cacheFile = path.join(__dirname, '..', `cached_rankings_${cacheKey}.json`);

    // Check if we have cached results for this card combination
    if (fs.existsSync(cacheFile)) {
        console.log('📦 Using cached optimization results for card combination:', cacheKey);

        // Load cached rankings immediately
        try {
            const cachedData = fs.readFileSync(cacheFile, 'utf8');
            mccRankings = JSON.parse(cachedData);
            customRankingsFile = `cached_rankings_${cacheKey}.json`;

            console.log('✅ Cached rankings loaded successfully');

            // Simulate quick processing for demo
            optimizationInProgress = true;
            optimizationProgress = 0;
            optimizationStatus = "Using cached optimization...";

            setTimeout(() => {
                optimizationInProgress = false;
                optimizationProgress = 100;
                optimizationStatus = "Optimization complete (cached)!";
            }, 1000); // Quick 1-second "processing" for demo

            return res.json({ message: 'Optimization started (using cache)', status: 'cached' });
        } catch (error) {
            console.error('❌ Failed to load cached rankings:', error.message);
            // Fall through to normal optimization
        }
    }

    // No cache found or cache failed - proceed with normal optimization
    optimizationInProgress = true;
    optimizationProgress = 0;
    optimizationStatus = "Initializing optimization...";
    customRankingsFile = null;

    // For demo purposes, use default rankings without expensive API calls
    console.log('🔄 Using default rankings for demo (skipping expensive API calls)');

    // Simulate processing and use the default rankings file
    setTimeout(() => {
        try {
            // Load default rankings
            const defaultRankingsPath = path.join(__dirname, '..', 'custom_rankings_default.json');
            if (fs.existsSync(defaultRankingsPath)) {
                const defaultData = fs.readFileSync(defaultRankingsPath, 'utf8');
                mccRankings = JSON.parse(defaultData);

                // Save as cache for this card combination
                fs.writeFileSync(cacheFile, defaultData);
                customRankingsFile = `cached_rankings_${cacheKey}.json`;

                console.log('✅ Default rankings applied and cached');
            }

            optimizationInProgress = false;
            optimizationProgress = 100;
            optimizationStatus = "Optimization complete (default)!";
        } catch (error) {
            console.error('❌ Failed to apply default rankings:', error.message);
            optimizationInProgress = false;
            optimizationStatus = "Optimization failed";
        }
    }, 2000); // 2-second simulation

    res.json({ message: 'Optimization started (demo mode)', status: 'in_progress' });
});

// Get optimization progress
app.get('/optimization-progress', (req, res) => {
    res.json({
        inProgress: optimizationInProgress,
        progress: optimizationProgress,
        status: optimizationStatus,
        completed: !optimizationInProgress && optimizationProgress === 100
    });
});

// Cache management endpoints for demo
app.get('/cache-status', (req, res) => {
    const cacheFiles = fs.readdirSync(path.join(__dirname, '..'))
        .filter(file => file.startsWith('cached_rankings_'))
        .map(file => ({
            file: file,
            size: fs.statSync(path.join(__dirname, '..', file)).size,
            created: fs.statSync(path.join(__dirname, '..', file)).birthtime
        }));

    res.json({
        cacheCount: cacheFiles.length,
        cacheFiles: cacheFiles,
        message: `Found ${cacheFiles.length} cached optimization files`
    });
});

app.delete('/clear-cache', (req, res) => {
    try {
        const cacheFiles = fs.readdirSync(path.join(__dirname, '..'))
            .filter(file => file.startsWith('cached_rankings_'));

        cacheFiles.forEach(file => {
            fs.unlinkSync(path.join(__dirname, '..', file));
        });

        res.json({
            message: `Cleared ${cacheFiles.length} cache files`,
            clearedFiles: cacheFiles
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear cache: ' + error.message });
    }
});

function startOptimizationProcess(selectedCards) {
    // Create a temporary file with selected cards
    const tempCardsFile = path.join(__dirname, 'temp_selected_cards.json');
    fs.writeFileSync(tempCardsFile, JSON.stringify(selectedCards, null, 2));

    // Start the Python optimization script using the virtual environment
    const pythonPath = path.join(__dirname, '..', 'venv', 'bin', 'python');
    const pythonProcess = spawn(pythonPath, [
        path.join(__dirname, '..', 'optimization_worker.py'),
        tempCardsFile
    ]);

    let outputBuffer = '';

    pythonProcess.stdout.on('data', (data) => {
        outputBuffer += data.toString();
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop(); // Keep the incomplete line

        lines.forEach(line => {
            if (line.trim()) {
                try {
                    const progressData = JSON.parse(line);
                    optimizationProgress = progressData.progress || optimizationProgress;
                    optimizationStatus = progressData.status || optimizationStatus;

                    if (progressData.complete && progressData.filename) {
                        customRankingsFile = progressData.filename;
                        loadCustomRankings(customRankingsFile);
                    }
                } catch (e) {
                    // Not JSON, treat as regular log
                    console.log('[Optimization]', line);
                }
            }
        });
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error('[Optimization Error]', data.toString());
    });

    pythonProcess.on('close', (code) => {
        optimizationInProgress = false;
        if (code === 0) {
            optimizationProgress = 100;
            optimizationStatus = "Optimization complete!";
            console.log('✅ Optimization completed successfully');
        } else {
            optimizationStatus = "Optimization failed";
            console.error('❌ Optimization failed with code:', code);
        }

        // Clean up temp file
        try {
            fs.unlinkSync(tempCardsFile);
        } catch (e) {
            console.log('Could not delete temp file:', e.message);
        }
    });
}

function loadCustomRankings(filename) {
    try {
        // Try multiple possible paths for the rankings file
        let rankingsPath;
        let rankingsData;

        // First try the project root directory
        rankingsPath = path.join(__dirname, '..', filename);
        try {
            rankingsData = fs.readFileSync(rankingsPath, 'utf8');
        } catch (e) {
            // If not found, try the Backend directory
            rankingsPath = path.join(__dirname, filename);
            rankingsData = fs.readFileSync(rankingsPath, 'utf8');
        }

        mccRankings = JSON.parse(rankingsData);
        console.log('✅ Custom rankings loaded successfully from', rankingsPath);
    } catch (error) {
        console.error('❌ Failed to load custom rankings:', error.message);
        console.log('Searched paths:',
            path.join(__dirname, '..', filename),
            path.join(__dirname, filename)
        );
    }
}

app.listen(port, () => {
    console.log(`Demo backend listening at http://localhost:${port}`);
});