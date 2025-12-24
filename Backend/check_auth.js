#!/usr/bin/env node

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkAuthorization(authId) {
    try {
        const auth = await stripe.issuing.authorizations.retrieve(authId);

        console.log('\n📋 Authorization Details:');
        console.log(`   ID: ${auth.id}`);
        console.log(`   Status: ${auth.status}`);
        console.log(`   Approved: ${auth.approved}`);
        console.log(`   Amount: $${(auth.amount / 100).toFixed(2)}`);
        console.log(`   Card: ...${auth.card.last4}`);

        console.log('\n📜 Request History:');
        if (auth.request_history && auth.request_history.length > 0) {
            auth.request_history.forEach((req, idx) => {
                console.log(`   ${idx + 1}. Approved: ${req.approved}, Reason: ${req.reason || 'N/A'}`);
            });
        } else {
            console.log('   ❌ No request history (webhook likely not triggered)');
        }

        console.log('\n🔗 View in Dashboard:');
        console.log(`   https://dashboard.stripe.com/test/issuing/authorizations/${auth.id}\n`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

const authId = process.argv[2] || 'iauth_1SGWavQLFtcEJSwHgnAGzlXy';
checkAuthorization(authId);
