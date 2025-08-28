# 🐦 Canary Feature Flag System

A production-ready feature flag and canary release system built with Node.js, TypeScript, PostgreSQL, and Redis.

## ✨ Features Overview

🚀 **Core Capabilities:**
- **Feature Flags**: Boolean, string, number, and JSON flag types
- **Canary Releases**: Gradual rollouts with percentage targeting
- **A/B Testing**: Multi-variant testing with weight distribution
- **User Targeting**: Rules based on user attributes and segments
- **Real-time Evaluation**: Sub-100ms flag evaluation with Redis caching
- **Kill Switch**: Instant rollback capability for emergency situations

🏗️ **Architecture:**
- **Control Plane**: RESTful API for flag management
- **Evaluation Service**: High-performance flag evaluation engine
- **SDK**: TypeScript/JavaScript client library
- **Rule Engine**: Sophisticated targeting and rollout logic
- **Observability**: Prometheus metrics, Grafana dashboards, structured logging

🔧 **Infrastructure:**
- **Database**: PostgreSQL with audit logging
- **Cache**: Redis for performance optimization
- **Monitoring**: Prometheus + Grafana stack
- **Containerization**: Docker Compose for local development

## 🚀 Quick Start

### Prerequisites
- **Node.js 16+**
- **Docker & Docker Compose**
- **Windows PowerShell** (recommended) or Git Bash
- **Git**

### 1. Setup Project

**PowerShell (Recommended):**
```powershell
# Clone and setup
git clone <your-repo>
cd canary-flags

# Install dependencies
npm install

# Start infrastructure (PostgreSQL, Redis, Prometheus, Grafana)
docker-compose up -d

# Wait for services to start
Start-Sleep 20
```

**Alternative - Automated Setup:**
```powershell
# Run the setup script (handles everything)
bash ./setup.sh
```

### 2. Initialize Database
```powershell
# Create database schema
npm run db:migrate

# Add sample data (creates 5 sample flags)
npm run db:seed
```

### 3. Start Services

#### Method A: Manual Start (Recommended)
Open **4 separate PowerShell terminals**:

**Terminal 1 - Evaluation Service:**
```powershell
cd canary-flags
npm run dev:eval
```

**Terminal 2 - Control Plane:**
```powershell
cd canary-flags
npm run dev:control
```

**Terminal 3 - Metrics Service:**
```powershell
cd canary-flags
npm run dev:metrics
```

**Terminal 4 - Test Everything:**
```powershell
cd canary-flags
# Wait for services to start
Start-Sleep 10

# Test health checks
curl.exe -s http://localhost:8081/health
curl.exe -s http://localhost:8080/health
curl.exe -s http://localhost:9091/health
```

#### Method B: Automated Test Scripts

**Option 1: PowerShell Script (Windows Native)**
```powershell
# Run native PowerShell test (fastest, most reliable)
.\test-powershell.ps1

# If you get execution policy error, run this first:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Option 2: Comprehensive Bash Test**
```powershell
# Run full setup and test suite (handles everything)
bash ./test-complete.sh
```

**Option 3: SDK Testing**
```powershell
# After services are running, test the SDK
node test-sdk.js
```

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Control Plane │    │ Evaluation API  │    │  Metrics API    │
│    (Port 8080)  │    │   (Port 8081)   │    │  (Port 9091)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
               ┌─────────────────┴─────────────────┐
               │                                   │
    ┌─────────────────┐                 ┌─────────────────┐
    │   PostgreSQL    │                 │      Redis      │
    │   (Port 5432)   │                 │   (Port 6379)   │
    └─────────────────┘                 └─────────────────┘
               │                                   │
               └─────────────┬─────────────────────┘
                             │
               ┌─────────────────────────────────┐
               │        Client SDKs              │
               │  ┌─────────┐  ┌─────────────┐   │
               │  │   Web   │  │  Mobile/API │   │
               │  │   App   │  │     Apps    │   │
               │  └─────────┘  └─────────────┘   │
               └─────────────────────────────────┘
```

### Core Components

**🎛️ Control Plane (Port 8080)**
- Flag CRUD operations
- User segment management
- Audit trail and change history
- Admin dashboard (future)
- RESTful API with OpenAPI docs

**⚡ Evaluation Service (Port 8081)**
- High-performance flag evaluation
- Redis caching for sub-100ms responses
- Batch evaluation support
- SDK configuration endpoint
- Circuit breaker and fallback handling

**📊 Metrics Service (Port 9091)**
- Prometheus metrics export
- Real-time evaluation statistics
- Performance monitoring
- Custom business metrics

**🧠 Rule Engine**
- Percentage-based rollouts
- User attribute targeting
- Segment-based rules
- A/B test variant selection
- Kill switch override

**📚 SDK Library**
- Local and remote evaluation
- Automatic configuration polling
- Event-driven updates
- Analytics collection
- Fallback mechanisms

## 🧪 Complete API Testing Guide

### 1. Health Checks

**PowerShell:**
```powershell
# Check all services
curl.exe -s http://localhost:8081/health  # Evaluation Service
curl.exe -s http://localhost:8080/health  # Control Plane  
curl.exe -s http://localhost:9091/health  # Metrics Service
```

**Expected Response:**
```json
{"status":"healthy","service":"evaluation","timestamp":"2024-01-01T12:00:00.000Z"}
```

### 2. Flag Management (Control Plane API)

#### Create a Boolean Flag
```powershell
$headers = @{
    'X-API-Key' = 'canary-12345-secret'
    'Content-Type' = 'application/json'
}
$body = @{
    key = "new_dashboard"
    name = "New Dashboard"
    description = "Enable the redesigned dashboard"
    flag_type = "boolean"
    is_enabled = $true
    conditions = @()
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8080/api/flags" -Method POST -Headers $headers -Body $body
```

#### Create a String Flag (A/B Testing)
```powershell
$body = @{
    key = "checkout_algorithm"
    name = "Checkout Algorithm"
    description = "A/B test different checkout flows"
    flag_type = "string"
    is_enabled = $true
    default_value = "standard"
    variants = @(
        @{ key = "standard"; value = "standard_checkout"; weight = 50 },
        @{ key = "express"; value = "express_checkout"; weight = 50 }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "http://localhost:8080/api/flags" -Method POST -Headers $headers -Body $body
```

#### List All Flags
```powershell
$headers = @{ 'X-API-Key' = 'canary-12345-secret' }
Invoke-WebRequest -Uri "http://localhost:8080/api/flags" -Headers $headers
```

#### Get Flag by Key
```powershell
Invoke-WebRequest -Uri "http://localhost:8080/api/flags/new_dashboard" -Headers $headers
```

#### Update Flag
```powershell
$updateBody = @{
    name = "New Dashboard v2"
    description = "Updated dashboard with new features"
    is_enabled = $false
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8080/api/flags/new_dashboard" -Method PUT -Headers $headers -Body $updateBody
```

#### Delete Flag
```powershell
Invoke-WebRequest -Uri "http://localhost:8080/api/flags/new_dashboard" -Method DELETE -Headers $headers
```

### 3. Flag Evaluation (Evaluation API)

#### Single Flag Evaluation
```powershell
$evalBody = @{
    flag_key = "dark_mode"
    user_context = @{ 
        user_id = "user123"
        attributes = @{
            country = "US"
            subscription_tier = "premium"
            device_type = "mobile"
        }
    }
    environment = "production"
    default_value = $false
} | ConvertTo-Json -Depth 3

$evalHeaders = @{ 'Content-Type' = 'application/json' }
Invoke-WebRequest -Uri "http://localhost:8081/evaluate" -Method POST -Headers $evalHeaders -Body $evalBody
```

#### Batch Evaluation
```powershell
$batchBody = @{
    requests = @(
        @{
            flag_key = "dark_mode"
            user_context = @{ user_id = "user123"; attributes = @{ tier = "premium" } }
            default_value = $false
        },
        @{
            flag_key = "new_checkout_flow"
            user_context = @{ user_id = "user123"; attributes = @{ country = "US" } }
            default_value = $false
        },
        @{
            flag_key = "checkout_algorithm"
            user_context = @{ user_id = "user123" }
            default_value = "standard"
        }
    )
} | ConvertTo-Json -Depth 4

Invoke-WebRequest -Uri "http://localhost:8081/evaluate/batch" -Method POST -Headers $evalHeaders -Body $batchBody
```

### 4. User Segments

#### Create User Segment
```powershell
$segmentBody = @{
    key = "beta_users"
    name = "Beta Users"
    description = "Early adopters and beta testers"
    conditions = @(
        @{
            attribute = "user_type"
            operator = "equals"
            value = "beta"
        },
        @{
            attribute = "signup_date"
            operator = "greater_than"
            value = "2024-01-01"
        }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "http://localhost:8080/api/segments" -Method POST -Headers $headers -Body $segmentBody
```

### 5. Metrics and Analytics

#### Get Evaluation Stats
```powershell
curl.exe -s "http://localhost:8081/stats"
```

#### Get Prometheus Metrics
```powershell
curl.exe -s "http://localhost:9091/metrics"
```

#### Get Cached Flags
```powershell
curl.exe -s "http://localhost:8081/cache"
```

## 🔧 SDK Usage

### Installation
```bash
npm install ./dist/sdk/canary-sdk.js
```

### Basic Usage
```typescript
import { createCanarySDK } from 'canary-sdk';

const sdk = createCanarySDK({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:8081',
  environment: 'production',
  pollInterval: 30000
});

// Wait for SDK to initialize
sdk.on('ready', async () => {
  console.log('SDK is ready');
  
  // Evaluate a boolean flag
  const isDarkMode = await sdk.evaluateFlag('dark_mode', {
    user_id: 'user123',
    attributes: { country: 'US', tier: 'premium' }
  }, false);
  
  console.log('Dark mode enabled:', isDarkMode);
  
  // Evaluate multiple flags at once
  const results = await sdk.evaluateFlags([
    { flagKey: 'dark_mode', userContext: { user_id: 'user123' } },
    { flagKey: 'new_checkout', userContext: { user_id: 'user123' }, defaultValue: false }
  ]);
  
  console.log('Batch results:', results);
});

sdk.on('error', (error) => {
  console.error('SDK error:', error);
});

// Clean up when done
process.on('SIGINT', () => {
  sdk.destroy();
});
```

### Advanced SDK Features
```typescript
// Local evaluation (when config is cached)
const isLocal = sdk.isLocalEvaluationEnabled();

// Force remote evaluation
const remoteResult = await sdk.evaluateRemotely('feature_x', userContext);

// Get cached configuration
const config = sdk.getCachedConfig();

// Listen for configuration updates
sdk.on('configUpdated', () => {
  console.log('Flag configuration updated');
});

// Flush analytics manually
sdk.flushAnalytics();
```

## 📊 Monitoring & Observability

### Dashboards
- **Grafana**: http://localhost:3000 (admin/admin)
  - Flag evaluation metrics
  - Performance dashboards
  - Error rates and health checks
  - Custom business metrics

- **Prometheus**: http://localhost:9090
  - Raw metrics and queries
  - Alert rule configuration
  - Target monitoring

### Key Metrics
- `flag_evaluations_total` - Total flag evaluations
- `flag_evaluation_duration_seconds` - Evaluation latency
- `flag_cache_hits_total` - Cache hit rate
- `active_flags_total` - Number of active flags
- `sdk_connections_total` - Connected SDK instances

### Logs
```powershell
# Service logs
docker-compose logs -f

# Application logs
tail -f logs/combined.log
tail -f logs/error.log
```

## 🛠️ Development

### Available Scripts
```powershell
# Build and Development
npm run build              # Compile TypeScript
npm run dev               # Watch mode (all services)

# Individual Services
npm run dev:eval          # Start evaluation service only
npm run dev:control       # Start control plane only  
npm run dev:metrics       # Start metrics service only

# Database Operations
npm run db:migrate        # Run database migrations
npm run db:seed          # Seed sample data
npm run health           # Check service health

# Docker Operations
npm run docker:up         # Start infrastructure
npm run docker:down       # Stop infrastructure
npm run docker:logs       # View container logs

# Testing
npm test                  # Run unit tests
npm run test:watch        # Watch mode testing
node test-sdk.js          # Test SDK functionality
bash ./test-complete.sh   # Full integration test

# Utilities
npm run cli              # Interactive CLI tool
npm run start            # Start all services (production)
npm run setup            # Run setup script
```

### Development Workflow
1. **Start infrastructure**: `docker-compose up -d`
2. **Initialize database**: `npm run db:migrate && npm run db:seed`
3. **Start services** in separate terminals:
   - `npm run dev:eval`
   - `npm run dev:control`
   - `npm run dev:metrics`
4. **Test**: Use `.\test-powershell.ps1` or `bash ./test-complete.sh`
5. **SDK Development**: `node test-sdk.js`

### Database Schema

**Core Tables:**
- `feature_flags` - Flag definitions and metadata
- `flag_configs` - Environment-specific configurations
- `flag_variants` - A/B test variants and weights
- `rollout_rules` - Targeting and rollout rules
- `user_segments` - User grouping definitions
- `audit_log` - Complete change history

**Relationships:**
```sql
feature_flags (1) → (many) flag_configs
feature_flags (1) → (many) flag_variants
feature_flags (1) → (many) rollout_rules
user_segments (1) → (many) rollout_rules
```

### Key Features Deep Dive

**🎯 Percentage Rollouts**
- Gradual releases: 1% → 5% → 25% → 50% → 100%
- Consistent user bucketing
- Rollback capability at any percentage

**👥 User Targeting**
- Attribute-based rules (country, tier, device, etc.)
- Segment-based targeting
- Complex boolean logic (AND/OR conditions)

**🧪 A/B Testing**
- Multiple variants with weight distribution
- Statistical significance tracking
- Winner selection and automatic promotion

**🚨 Kill Switch**
- Instant flag disable/enable
- Override all rules and percentages
- Emergency rollback capability

**⚡ Performance**
- Redis caching for <100ms evaluation
- Batch evaluation support
- Connection pooling and optimization

**🔍 Audit Trail**
- Complete change history
- User attribution
- Rollback to previous states

## ⚠️ Important Setup Notes

### Database Authentication Fix
This project includes a fix for PostgreSQL authentication issues:
- **Problem**: PostgreSQL 15+ defaults to `scram-sha-256` authentication
- **Solution**: Docker Compose configured to use `md5` authentication
- **If you see "password authentication failed"**: Restart Docker containers

```powershell
# Reset database if you get auth errors
docker-compose down
docker volume rm canary-flags_postgres_data
docker-compose up -d
Start-Sleep 20
npm run db:migrate
npm run db:seed
```

### Windows/WSL Considerations
- **PowerShell (Recommended)**: All services work perfectly
- **WSL/Git Bash**: May have networking issues with Docker containers
- **If bash scripts fail**: Use PowerShell commands instead

## 🔧 Configuration

### Environment Variables (.env file)
```env
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

# Security
JWT_SECRET=aNrZt5BS48i3E1ItIv40C/XnyjziE/6yuZgn6Q+X4KQ=
API_KEY=canary-12345-secret

# Feature Configuration
DEFAULT_CONFIG_POLL_INTERVAL_MS=30000
MAX_CACHE_SIZE=1000
EVALUATION_TIMEOUT_MS=100

# Environment
NODE_ENV=development
LOG_LEVEL=info

# Metrics
METRICS_ENABLED=true
PROMETHEUS_ENABLED=true
```

### Service Ports
- **Control Plane**: `http://localhost:8080` - Flag management API
- **Evaluation Service**: `http://localhost:8081` - Flag evaluation API  
- **Metrics Service**: `http://localhost:9091` - Prometheus metrics
- **PostgreSQL**: `localhost:5432` - Database
- **Redis**: `localhost:6379` - Cache
- **Grafana**: `http://localhost:3000` (admin/admin) - Dashboards
- **Prometheus**: `http://localhost:9090` - Metrics collection

### Sample Flag Configuration
```json
{
  "key": "new_checkout_flow",
  "name": "New Checkout Flow",
  "description": "Redesigned checkout process with improved UX",
  "flag_type": "boolean",
  "is_enabled": true,
  "environments": {
    "development": {
      "enabled": true,
      "rollout_percentage": 100,
      "rules": []
    },
    "staging": {
      "enabled": true,
      "rollout_percentage": 50,
      "rules": [
        {
          "type": "segment",
          "segment_key": "beta_users",
          "percentage": 100
        }
      ]
    },
    "production": {
      "enabled": true,
      "rollout_percentage": 10,
      "rules": [
        {
          "type": "attribute",
          "attribute": "user_type",
          "operator": "equals",
          "value": "premium",
          "percentage": 100
        },
        {
          "type": "percentage",
          "percentage": 5
        }
      ]
    }
  },
  "variants": [
    {
      "key": "enabled",
      "value": true,
      "weight": 100
    }
  ]
}
```

## 🎓 Why This Project?

This project demonstrates advanced software engineering concepts:

**🏗️ Distributed Systems**
- Service-oriented architecture
- Data consistency across services
- Caching strategies and invalidation
- Circuit breakers and fallback mechanisms

**⚡ Performance Engineering**
- Sub-millisecond evaluation latency
- Efficient caching with Redis
- Connection pooling and optimization
- Batch processing for efficiency

**🔒 Reliability & Safety**
- Progressive rollouts minimize risk
- Kill switches for emergency situations
- Comprehensive error handling
- Graceful degradation patterns

**📊 Observability**
- Structured logging with correlation IDs
- Prometheus metrics and alerting
- Grafana dashboards for visualization
- Distributed tracing (future enhancement)

**🛡️ Security**
- API key authentication
- Input validation and sanitization
- SQL injection prevention
- Rate limiting (future enhancement)

**🧪 Testing**
- Unit tests with Jest
- Integration tests with real services
- Load testing capabilities
- SDK testing framework

Perfect for demonstrating systems thinking, platform engineering skills, and production-ready software development! 🚀

## 📚 Additional Resources

- **API Documentation**: Available at `/docs` endpoint (future)
- **Architecture Decision Records**: See `/docs/adr/` (future)
- **Deployment Guide**: See `/docs/deployment.md` (future)
- **Contributing**: See `CONTRIBUTING.md` (future)
- **Changelog**: See `CHANGELOG.md` (future)

---

**Built with ❤️ for production-scale feature flag management**#   F l a g C r a f t  
 