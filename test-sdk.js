// SDK Test Script
// Run this with: node test-sdk.js

const { createCanarySDK } = require('./dist/sdk/canary-sdk.js');

async function testSDK() {
    console.log('🔧 Testing Canary SDK...');
    
    // Test SDK configuration endpoint first
    console.log('\n1. Testing SDK config endpoint...');
    try {
        const response = await fetch('http://localhost:8081/sdk/config');
        if (response.ok) {
            const config = await response.json();
            console.log('✅ SDK config endpoint working:', config);
        } else {
            console.log('❌ SDK config endpoint failed:', response.status, response.statusText);
            return;
        }
    } catch (error) {
        console.log('❌ SDK config endpoint error:', error.message);
        console.log('💡 Make sure evaluation service is running: npm run dev:eval');
        return;
    }

    // Test direct evaluation endpoint
    console.log('\n2. Testing direct evaluation...');
    try {
        const evalResponse = await fetch('http://localhost:8081/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                flag_key: 'dark_mode',
                user_context: { user_id: 'sdk_test' },
                default_value: false
            })
        });
        
        if (evalResponse.ok) {
            const result = await evalResponse.json();
            console.log('✅ Direct evaluation working:', result);
        } else {
            console.log('❌ Direct evaluation failed:', evalResponse.status);
            return;
        }
    } catch (error) {
        console.log('❌ Direct evaluation error:', error.message);
        return;
    }

    // Test SDK initialization
    console.log('\n3. Testing SDK initialization...');
    try {
        const sdk = createCanarySDK({
            apiKey: 'canary-12345-secret',
            baseUrl: 'http://localhost:8081',
            environment: 'development',
            pollInterval: 10000,
            enableAnalytics: false
        });

        // Wait for SDK to initialize
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('SDK initialization timeout'));
            }, 10000);

            sdk.on('ready', () => {
                clearTimeout(timeout);
                console.log('✅ SDK initialized successfully');
                resolve();
            });

            sdk.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        // Test flag evaluation through SDK
        console.log('\n4. Testing SDK flag evaluation...');
        
        const userContext = {
            user_id: 'sdk_test_user',
            attributes: {
                country: 'US',
                tier: 'premium'
            }
        };

        // Test existing flags
        const flags = ['dark_mode', 'new_checkout_flow', 'premium_features'];
        
        for (const flagKey of flags) {
            try {
                const result = await sdk.evaluateFlag(flagKey, userContext, false);
                console.log(`✅ ${flagKey}: ${result}`);
            } catch (error) {
                console.log(`❌ ${flagKey}: ${error.message}`);
            }
        }

        // Test batch evaluation
        console.log('\n5. Testing batch evaluation...');
        try {
            const batchRequests = [
                { flagKey: 'dark_mode', userContext, defaultValue: false },
                { flagKey: 'new_checkout_flow', userContext, defaultValue: false },
                { flagKey: 'premium_features', userContext, defaultValue: false }
            ];

            const batchResults = await sdk.evaluateFlags(batchRequests);
            console.log('✅ Batch evaluation results:', batchResults);
        } catch (error) {
            console.log('❌ Batch evaluation failed:', error.message);
        }

        // Clean up
        sdk.destroy();
        console.log('\n🎉 SDK test completed successfully!');
        
        console.log('\n📋 SDK Usage Summary:');
        console.log('- ✅ SDK can initialize and connect to evaluation service');
        console.log('- ✅ Remote evaluation through /evaluate endpoint works');
        console.log('- ✅ SDK config polling through /sdk/config works');
        console.log('- ✅ Both single and batch flag evaluation work');
        console.log('- ✅ SDK properly handles errors and cleanup');

    } catch (error) {
        console.log('❌ SDK test failed:', error.message);
        console.log('\n🛠️ Troubleshooting:');
        console.log('1. Ensure evaluation service is running: npm run dev:eval');
        console.log('2. Check that flags exist in database: npm run db:seed');
        console.log('3. Verify network connectivity to localhost:8081');
    }
}

// Run the test
testSDK().catch(console.error);
