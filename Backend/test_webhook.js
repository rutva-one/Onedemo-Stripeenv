#!/usr/bin/env node

/**
 * Quick test script for Stripe Issuing webhooks
 *
 * Usage:
 *   node test_webhook.js restaurant 7500
 *   node test_webhook.js airline 35000
 *   node test_webhook.js grocery 12000
 */

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// MCC category mappings with Stripe category names
const CATEGORIES = {
    restaurant: { mcc: '5812', name: 'Test Restaurant', stripeCategory: 'eating_places_restaurants' },
    airline: { mcc: '4511', name: 'Test Airlines', stripeCategory: 'airlines_air_carriers' },
    grocery: { mcc: '5411', name: 'Test Grocery', stripeCategory: 'grocery_stores_supermarkets' },
    gas: { mcc: '5541', name: 'Test Gas Station', stripeCategory: 'service_stations' },
    pharmacy: { mcc: '5912', name: 'Test Pharmacy', stripeCategory: 'drug_stores_and_pharmacies' },
    taxi: { mcc: '4121', name: 'Test Cab', stripeCategory: 'taxicabs_limousines' },
};

async function testWebhook(category, amount) {
    if (!CATEGORIES[category]) {
        console.error(`❌ Unknown category: ${category}`);
        console.log(`Available categories: ${Object.keys(CATEGORIES).join(', ')}`);
        process.exit(1);
    }

    if (!amount || isNaN(amount)) {
        console.error('❌ Invalid amount. Provide amount in cents (e.g., 5000 for $50)');
        process.exit(1);
    }

    const { mcc, name, stripeCategory } = CATEGORIES[category];
    const cardId = process.env.STRIPE_ISSUING_CARD_ID;

    if (!cardId) {
        console.error('❌ STRIPE_ISSUING_CARD_ID not found in .env');
        process.exit(1);
    }

    console.log(`\n🎴 Creating test authorization on card ending in 0005...`);
    console.log(`   Category: ${category} (MCC ${mcc})`);
    console.log(`   Merchant: ${name}`);
    console.log(`   Amount: $${(amount / 100).toFixed(2)}\n`);

    try {
        // Use the test helpers API instead
        const authorization = await stripe.testHelpers.issuing.authorizations.create({
            card: cardId,
            amount: parseInt(amount),
            merchant_data: {
                category: stripeCategory,
                name: name,
            },
        });

        console.log(`✅ Authorization created!`);
        console.log(`   Status: ${authorization.status}`);
        console.log(`   Amount: $${(authorization.amount / 100).toFixed(2)}`);
        console.log(`   Card: ...${authorization.card.last4}`);

        if (authorization.approved) {
            console.log(`   ✅ APPROVED`);
        } else {
            console.log(`   ❌ DECLINED`);
        }

        // Check request history
        if (authorization.request_history && authorization.request_history.length > 0) {
            const lastRequest = authorization.request_history[authorization.request_history.length - 1];
            console.log(`\n📋 Webhook Response:`);
            console.log(`   Approved: ${lastRequest.approved ? '✅ Yes' : '❌ No'}`);
            if (lastRequest.reason) {
                console.log(`   Reason: ${lastRequest.reason}`);
            }
        }

        console.log(`\n🔗 View in Dashboard:`);
        console.log(`   https://dashboard.stripe.com/test/issuing/authorizations/${authorization.id}\n`);

    } catch (error) {
        console.error(`❌ Error creating authorization:`, error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const category = process.argv[2];
const amount = process.argv[3];

if (!category || !amount) {
    console.log(`
Usage: node test_webhook.js <category> <amount_in_cents>

Examples:
  node test_webhook.js restaurant 7500    # $75 at restaurant
  node test_webhook.js airline 35000      # $350 for flight
  node test_webhook.js grocery 12000      # $120 at grocery store
  node test_webhook.js gas 6000           # $60 at gas station
  node test_webhook.js pharmacy 4000      # $40 at pharmacy
  node test_webhook.js taxi 2500          # $25 taxi ride

Available categories: ${Object.keys(CATEGORIES).join(', ')}
`);
    process.exit(0);
}

testWebhook(category, amount);
