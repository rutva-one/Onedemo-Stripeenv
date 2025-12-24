require('dotenv').config({ path: './.env' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

console.log('API Key loaded:', process.env.STRIPE_SECRET_KEY ? 'Yes' : 'No');

async function checkPaymentMethods() {
    const pmIds = {
        'FOODIE_CARD': process.env.STRIPE_FOODIE_CARD_PM_ID,
        'TRAVEL_CARD': process.env.STRIPE_TRAVEL_CARD_PM_ID,
        'GROCERY_CARD': process.env.STRIPE_GROCERY_CARD_PM_ID,
        'TRANSIT_CARD': process.env.STRIPE_TRANSIT_CARD_PM_ID
    };

    console.log('\n🔍 Checking Payment Method Card Brands:\n');

    for (const [name, pmId] of Object.entries(pmIds)) {
        try {
            const pm = await stripe.paymentMethods.retrieve(pmId);
            const brand = pm.card?.brand || 'Unknown';
            console.log(`${name}: ${pmId}`);
            console.log(`   → Card Brand: ${brand.toUpperCase()}\n`);
        } catch (error) {
            console.log(`${name}: ERROR - ${error.message}\n`);
        }
    }
}

checkPaymentMethods();
