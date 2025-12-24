#!/usr/bin/env node

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkCard() {
    try {
        const cardId = process.env.STRIPE_ISSUING_CARD_ID;
        const card = await stripe.issuing.cards.retrieve(cardId);

        console.log('\n💳 Card Details:');
        console.log(`   ID: ${card.id}`);
        console.log(`   Last 4: ${card.last4}`);
        console.log(`   Status: ${card.status}`);
        console.log(`   Type: ${card.type}`);

        console.log('\n🔒 Authorization Controls:');
        if (card.spending_controls && card.spending_controls.spending_limits) {
            console.log(`   Spending Limits: ${JSON.stringify(card.spending_controls.spending_limits, null, 2)}`);
        } else {
            console.log('   ⚠️  No spending limits configured');
        }

        // Check if the card has real-time authorization enabled
        // This is done via the cardholder or card settings
        console.log('\n🎯 Real-time Authorization:');
        console.log('   To enable webhooks, ensure:');
        console.log('   1. Webhook endpoint is registered in Dashboard');
        console.log('   2. Event "issuing_authorization.request" is selected');
        console.log('   3. Card is active and not expired');

        console.log('\n🔗 View in Dashboard:');
        console.log(`   https://dashboard.stripe.com/test/issuing/cards/${card.id}\n`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkCard();
