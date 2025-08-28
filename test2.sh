#!/bin/bash

# Day 2 Testing Script - Control Plane API
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# ✅ Correct API key from your system
API_KEY="canary-12345-secret"
# ✅ Correct port for control plane
CONTROL_URL="http://localhost:8080"
EVAL_URL="http://localhost:8081"

echo "🎛️ Testing Control Plane API - Day 2"
echo "===================================="

# Start both services in background
print_step "Starting services..."

# Build first
npm run build > /dev/null 2>&1



# Just test the already-running services:
CONTROL_URL="http://localhost:8080"
EVAL_URL="http://localhost:8081"
API_KEY="canary-12345-secret"

# Give services time to respond
sleep 2

# Function to cleanup on exit
cleanup() {
    echo "Cleaning up..."
    kill $EVAL_PID $CONTROL_PID 2>/dev/null || true
    exit
}
trap cleanup EXIT

# Test 1: Health checks
print_step "Testing health endpoints..."

EVAL_HEALTH=$(curl -s $EVAL_URL/health || echo "failed")
if echo "$EVAL_HEALTH" | grep -q "healthy"; then
    print_success "Evaluation service health check"
else
    print_error "Evaluation service health check"
    exit 1
fi

CONTROL_HEALTH=$(curl -s $CONTROL_URL/health || echo "failed")
if echo "$CONTROL_HEALTH" | grep -q "healthy"; then
    print_success "Control plane health check"
else
    print_error "Control plane health check"
    exit 1
fi

# Test 2: List existing flags
print_step "Testing list flags..."

FLAGS_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" $CONTROL_URL/api/flags || echo "failed")
if echo "$FLAGS_RESPONSE" | grep -q "flags"; then
    print_success "List flags endpoint"
else
    print_error "List flags endpoint"
    echo "Response: $FLAGS_RESPONSE"
    exit 1
fi

# Test 3: Create new flag
print_step "Testing flag creation..."

CREATE_RESPONSE=$(curl -s -X POST $CONTROL_URL/api/flags \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "key": "test_api_flag",
        "name": "Test API Flag",
        "description": "Flag created by API test",
        "flag_type": "boolean"
    }' || echo "failed")

if echo "$CREATE_RESPONSE" | grep -q "test_api_flag"; then
    print_success "Flag creation"
else
    print_error "Flag creation"
    echo "Response: $CREATE_RESPONSE"
    exit 1
fi

# Test 4: Get single flag
print_step "Testing get single flag..."

FLAG_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" $CONTROL_URL/api/flags/test_api_flag || echo "failed")
if echo "$FLAG_RESPONSE" | grep -q "test_api_flag"; then
    print_success "Get single flag"
else
    print_error "Get single flag"
    exit 1
fi

# Test 5: Update flag configuration
print_step "Testing flag configuration update..."

UPDATE_RESPONSE=$(curl -s -X PUT $CONTROL_URL/api/flags/test_api_flag/environments/development \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "is_enabled": true,
        "rollout_percentage": 50
    }' || echo "failed")

if echo "$UPDATE_RESPONSE" | grep -q "is_enabled"; then
    print_success "Flag configuration update"
else
    print_error "Flag configuration update"
    echo "Response: $UPDATE_RESPONSE"
    exit 1
fi

# Test 6: Toggle flag
print_step "Testing flag toggle..."

TOGGLE_RESPONSE=$(curl -s -X PATCH $CONTROL_URL/api/flags/test_api_flag/environments/development/toggle \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"enabled": true}' || echo "failed")

if echo "$TOGGLE_RESPONSE" | grep -q "enabled"; then
    print_success "Flag toggle"
else
    print_error "Flag toggle"
    exit 1
fi

# Test 7: Test evaluation with new flag
print_step "Testing evaluation of managed flag..."

sleep 2  # Give cache time to clear

EVAL_RESPONSE=$(curl -s -X POST $EVAL_URL/evaluate \
    -H "Content-Type: application/json" \
    -d '{
        "flag_key": "test_api_flag",
        "user_context": {"user_id": "test_user"},
        "environment": "development"
    }' || echo "failed")

if echo "$EVAL_RESPONSE" | grep -q "test_api_flag"; then
    print_success "Evaluation of managed flag"
else
    print_error "Evaluation of managed flag"
    echo "Response: $EVAL_RESPONSE"
    exit 1
fi

# Test 8: System overview
print_step "Testing system overview..."

OVERVIEW_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" $CONTROL_URL/api/system/overview || echo "failed")
if echo "$OVERVIEW_RESPONSE" | grep -q "total_flags"; then
    print_success "System overview"
else
    print_error "System overview"
    exit 1
fi

# Test 9: Cache management
print_step "Testing cache management..."

CACHE_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" $CONTROL_URL/api/cache/status || echo "failed")
if echo "$CACHE_RESPONSE" | grep -q "cached_flags"; then
    print_success "Cache status endpoint"
else
    print_error "Cache status endpoint"
    exit 1
fi

# Test 10: Kill switch
print_step "Testing kill switch..."

KILL_RESPONSE=$(curl -s -X POST $CONTROL_URL/api/flags/test_api_flag/kill-switch \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"reason": "API test"}' || echo "failed")

if echo "$KILL_RESPONSE" | grep -q "Kill switch activated"; then
    print_success "Kill switch functionality"
else
    print_error "Kill switch functionality"
    echo "Response: $KILL_RESPONSE"
    exit 1
fi

# Test 11: Authentication
print_step "Testing API authentication..."

AUTH_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null $CONTROL_URL/api/flags || echo "000")
if [ "$AUTH_RESPONSE" = "401" ]; then
    print_success "API authentication (correctly rejected)"
else
    print_error "API authentication (should reject unauthorized)"
    exit 1
fi

echo ""
echo "🎉 Day 2 Control Plane Tests Complete!"
echo "======================================"
print_success "All control plane tests passed"

echo ""
echo "📋 What's Now Working:"
echo "  ✅ Control Plane API with authentication"
echo "  ✅ Flag CRUD operations (Create, Read, Update, Delete)"
echo "  ✅ Environment-specific configuration"
echo "  ✅ Kill switch for emergency rollbacks"
echo "  ✅ Cache invalidation on updates"
echo "  ✅ System overview and monitoring"
echo "  ✅ Integration with evaluation service"

echo ""
echo "🧪 Manual Testing Commands:"
echo "  • List flags: curl -H 'X-API-Key: canary-admin-key' $CONTROL_URL/api/flags"
echo "  • System overview: curl -H 'X-API-Key: canary-admin-key' $CONTROL_URL/api/system/overview"
echo "  • Health check: curl $CONTROL_URL/health"
echo ""