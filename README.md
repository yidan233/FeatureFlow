# 🐦 FlagCraft - Feature Flag Platform

A feature flag and canary release system built with Node.js, TypeScript, PostgreSQL, and Redis.

## 🎯 What is FlagCraft?

**FlagCraft** is a  feature flag platform that lets you safely release features to users without risky deployments. Instead of releasing features to everyone at once, you can:

- **Control who sees what**: Show features to specific users or groups
- **Roll out gradually**: Start with 5% of users, then 25%, then 100%
- **A/B test everything**: Compare different versions to see what works best
- **Kill switch instantly**: Turn off problematic features in seconds, not hours

### 🚀 Simple Example

Imagine you built a new checkout flow but aren't sure if it's better than the old one:

```typescript
// Instead of this risky deployment:
if (true) {
  showNewCheckout();  // 😱 All users get untested feature
}

// Do this safe, gradual rollout:
const useNewCheckout = await flagcraft.evaluateFlag('new_checkout', {
  user_id: currentUser.id,
  country: currentUser.country
});

if (useNewCheckout) {
  showNewCheckout();    // ✅ Only some users, gradually increased
} else {
  showOldCheckout();    // ✅ Fallback to proven experience
}
```

**The Result:**
- 🛡️ **Reduced Risk**: Problems affect fewer users
- 📊 **Data-Driven**: Know which version performs better  
- ⚡ **Instant Control**: Turn features on/off without code deployment
- 🎯 **Targeted Rollouts**: VIP users get features first, etc.

### 💡 Perfect For:
- **New feature launches** (gradual rollout from 1% → 100%)
- **A/B testing** (red button vs blue button)
- **User targeting** (premium features for paid users only)
- **Emergency rollbacks** (kill switch when things go wrong)
- **Performance testing** (new algorithm vs old algorithm)

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
cd flagcraft

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
cd flagcraft
npm run dev:eval
```

**Terminal 2 - Control Plane:**
```powershell
cd flagcraft
npm run dev:control
```

**Terminal 3 - Metrics Service:**
```powershell
cd flagcraft
npm run dev:metrics
```

**Terminal 4 - Test Everything:**
```powershell
cd flagcraft
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

**Option 2: Comprehensive Test**
```powershell
# Run full setup and test suite
bash ./test-complete.sh
```

**Option 3: SDK Testing**
```powershell
# After services are running, test the SDK
node test-sdk.js
```

## 🧪 API Testing Examples

### 1. Health Checks

**PowerShell:**
```powershell
# Check all services
curl.exe -s http://localhost:8081/health  # Evaluation Service
curl.exe -s http://localhost:8080/health  # Control Plane  
curl.exe -s http://localhost:9091/health  # Metrics Service
```

### 2. Create a Flag

**PowerShell:**
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
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8080/api/flags" -Method POST -Headers $headers -Body $body
```

### 3. Evaluate a Flag

**PowerShell:**
```powershell
$evalBody = @{
    flag_key = "dark_mode"
    user_context = @{ 
        user_id = "user123"
        attributes = @{ country = "US"; tier = "premium" }
    }
    default_value = $false
} | ConvertTo-Json -Depth 3

$evalHeaders = @{ 'Content-Type' = 'application/json' }
Invoke-WebRequest -Uri "http://localhost:8081/evaluate" -Method POST -Headers $evalHeaders -Body $evalBody
```

## 🔧 SDK Usage

### Basic Usage
```typescript
import { createCanarySDK } from './dist/sdk/canary-sdk.js';

const sdk = createCanarySDK({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:8081',
  environment: 'production'
});

// Wait for SDK to initialize
sdk.on('ready', async () => {
  // Evaluate a flag
  const isDarkMode = await sdk.evaluateFlag('dark_mode', {
    user_id: 'user123',
    attributes: { country: 'US', tier: 'premium' }
  }, false);
  
  console.log('Dark mode enabled:', isDarkMode);
});
```

## 📊 Monitoring

### Dashboards
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Logs**: `./logs/` directory

### Key Metrics
- `flag_evaluations_total` - Total flag evaluations
- `flag_evaluation_duration_seconds` - Evaluation latency
- `flag_cache_hits_total` - Cache hit rate
- `active_flags_total` - Number of active flags

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

# Testing
node test-sdk.js          # Test SDK functionality
bash ./test-complete.sh   # Full integration test
.\test-powershell.ps1     # PowerShell native test
```

## 🔧 Configuration

### Service Ports
- **Control Plane**: `http://localhost:8080` - Flag management API
- **Evaluation Service**: `http://localhost:8081` - Flag evaluation API  
- **Metrics Service**: `http://localhost:9091` - Prometheus metrics
- **PostgreSQL**: `localhost:5432` - Database
- **Redis**: `localhost:6379` - Cache
- **Grafana**: `http://localhost:3000` (admin/admin) - Dashboards
- **Prometheus**: `http://localhost:9090` - Metrics collection

### Environment Variables
Create a `.env` file with:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=canary_flags
DB_USER=canary_user
DB_PASS=canary_pass

# Server Configuration
CONTROL_PLANE_PORT=8080
EVALUATION_SERVICE_PORT=8081
METRICS_PORT=9091

# Security
API_KEY=canary-12345-secret

# Environment
NODE_ENV=development
LOG_LEVEL=info
```

## ⚠️ Important Setup Notes

### Database Authentication Fix
This project includes a fix for PostgreSQL authentication issues:
- **Problem**: PostgreSQL 15+ defaults to `scram-sha-256` authentication
- **Solution**: Docker Compose configured to use `md5` authentication

If you see "password authentication failed":
```powershell
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

## 🎓 Why This Project?

This project demonstrates advanced software engineering concepts:

**🏗️ Distributed Systems**
- Service-oriented architecture
- Data consistency across services
- Caching strategies and circuit breakers

**⚡ Performance Engineering**
- Sub-millisecond evaluation latency
- Efficient Redis caching
- Connection pooling and optimization

**🔒 Reliability & Safety**
- Progressive rollouts minimize risk
- Kill switches for emergency situations
- Comprehensive error handling

**📊 Observability**
- Structured logging with correlation IDs
- Prometheus metrics and alerting
- Grafana dashboards for visualization

Perfect for demonstrating systems thinking, platform engineering skills, and production-ready software development! 🚀

---

**Built with ❤️ for production-scale feature flag management**