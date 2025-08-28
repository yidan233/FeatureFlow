#!/bin/bash
set -e

echo "🐦 Setting up Canary Feature Flag System..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
print_step "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16+"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js version must be 16 or higher. Current: $(node --version)"
    exit 1
fi

print_success "Prerequisites check passed"

# Install dependencies
print_step "Installing npm dependencies..."
npm install
print_success "Dependencies installed"

# Setup environment
print_step "Setting up environment configuration..."
if [ ! -f .env ]; then
    cat > .env << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://canary_user:canary_pass@localhost:5432/canary_flags
DB_HOST=localhost
DB_PORT=5432
DB_NAME=canary_flags
DB_USER=canary_user
DB_PASS=canary_pass
DB_SSL=false
DB_MAX_CONNECTIONS=20

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PREFIX=canary:

# Server Configuration
CONTROL_PLANE_PORT=8080
EVALUATION_SERVICE_PORT=8081
METRICS_PORT=9091
CORS_ENABLED=true
REQUEST_LOGGING=true

# Environment
NODE_ENV=development
LOG_LEVEL=info

# Security
JWT_SECRET=aNrZt5BS48i3E1ItIv40C/XnyjziE/6yuZgn6Q+X4KQ=
API_KEY=canary-12345-secret

# Feature Configuration
DEFAULT_CONFIG_POLL_INTERVAL_MS=30000
MAX_CACHE_SIZE=1000
EVALUATION_TIMEOUT_MS=100

# Metrics
METRICS_ENABLED=true
PROMETHEUS_ENABLED=true
EOF
    print_success "Environment file created (.env)"
else
    print_warning "Environment file already exists"
fi

# Create logs directory
mkdir -p logs
print_success "Logs directory created"

# Start Docker services
print_step "Starting infrastructure services..."
docker-compose up -d

# Wait for services to be ready
print_step "Waiting for services to be ready..."
sleep 10

# Check PostgreSQL
print_step "Checking PostgreSQL connection..."
timeout=30
counter=0
until docker-compose exec -T postgres pg_isready -U canary_user -d canary_flags; do
    sleep 1
    counter=$((counter + 1))
    if [ $counter -eq $timeout ]; then
        print_error "PostgreSQL failed to start within $timeout seconds"
        exit 1
    fi
done
print_success "PostgreSQL is ready"

# Check Redis
print_step "Checking Redis connection..."
timeout=30
counter=0
until docker-compose exec -T redis redis-cli ping; do
    sleep 1
    counter=$((counter + 1))
    if [ $counter -eq $timeout ]; then
        print_error "Redis failed to start within $timeout seconds"
        exit 1
    fi
done
print_success "Redis is ready"

# Build the project
print_step "Building TypeScript project..."
npm run build
print_success "Project built successfully"

# Database schema is automatically created by Docker initialization
print_step "Verifying database schema..."
if docker-compose exec -T postgres psql -U canary_user -d canary_flags -c "\dt" | grep -q "feature_flags"; then
    print_success "Database schema is ready"
else
    print_error "Database schema not found. Please check Docker initialization."
    exit 1
fi

# Seed database
print_step "Seeding database with sample data..."
npm run db:seed
print_success "Sample data inserted"

# Test the setup
print_step "Testing the setup..."

# Start evaluation service in background
npm run dev:eval &
EVAL_PID=$!

# Give it time to start
sleep 5

# Test health check
if curl -s http://localhost:8081/health > /dev/null; then
    print_success "Evaluation service is responding"
else
    print_error "Evaluation service is not responding"
    kill $EVAL_PID 2>/dev/null || true
    exit 1
fi

# Test flag evaluation
TEST_RESPONSE=$(curl -s -X POST http://localhost:8081/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "flag_key": "new_checkout_flow",
    "user_context": {"user_id": "test_user"},
    "environment": "development"
  }')

if echo "$TEST_RESPONSE" | grep -q "flag_key"; then
    print_success "Flag evaluation test passed"
else
    print_error "Flag evaluation test failed"
    kill $EVAL_PID 2>/dev/null || true
    exit 1
fi

# Stop test server
kill $EVAL_PID 2>/dev/null || true

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "  1. Start the evaluation service: npm run dev:eval"
echo "  2. In another terminal, test with: npm run cli"
echo "  3. Or use curl to test the API directly"
echo ""
echo "🔗 Available services:"
echo "  • Evaluation API: http://localhost:8081"
echo "  • Grafana: http://localhost:3000 (admin/admin)"
echo "  • Prometheus: http://localhost:9090"
echo ""
echo "📖 View README.md for detailed usage instructions"
echo ""
echo "🧪 Quick test command:"
echo "curl -X POST http://localhost:8081/evaluate \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"flag_key\":\"new_checkout_flow\",\"user_context\":{\"user_id\":\"user123\"},\"environment\":\"development\"}'"
echo ""