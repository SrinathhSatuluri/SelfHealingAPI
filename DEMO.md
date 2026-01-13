# Self-Healing API Demo

This demo shows how to automatically detect and handle API schema breaking changes using pattern recognition similar to Sentry SDK and OpenAPI-diff.

## 🎯 What This Demo Shows

**PROBLEM:** API breaks when backend changes schema (e.g., `phone` → `phoneNumber`) but clients still send old format.

**SOLUTION:** Real-time detection system that:
1. ✅ Tracks request/response patterns
2. ✅ Detects field rename mismatches with high confidence
3. ✅ Alerts when error rates spike
4. ✅ Identifies root cause (schema changes)

## 🏗️ Architecture

```
📦 Self-Healing API System
├── 🔍 Detection Middleware (Sentry-like instrumentation)
├── 📊 Event Collection (Datadog-like metrics pipeline)
├── 🧠 Schema Analysis (OpenAPI-diff-like comparison)
└── 🚨 Alert System (Smart error rate monitoring)
```

## 🚀 Quick Demo

### Terminal 1: Start API Simulator
```bash
npm install
npm run demo
```

### Terminal 2: Send Test Traffic
```bash
# Generate healthy V1 traffic
npm run traffic traffic 20 100

# Or run full breaking change simulation
npm run simulate
```

### Terminal 3: Monitor Results
```bash
# Check metrics
curl http://localhost:3001/api/metrics

# Check alerts
curl http://localhost:3001/api/alerts

# Check detected schema issues
curl http://localhost:3001/api/schema-issues
```

### Manual Breaking Change Test
```bash
# 1. Send V1 request (should work)
curl -X POST http://localhost:3001/api/signup \\
  -H "Content-Type: application/json" \\
  -d '{"name":"John","email":"john@test.com","phone":"555-1234","password":"secret"}'

# 2. Deploy breaking change
curl -X POST http://localhost:3001/admin/simulate-deploy

# 3. Send same V1 request (should fail)
curl -X POST http://localhost:3001/api/signup \\
  -H "Content-Type: application/json" \\
  -d '{"name":"John","email":"john@test.com","phone":"555-1234","password":"secret"}'

# 4. Check detection results
curl http://localhost:3001/api/alerts
curl http://localhost:3001/api/schema-issues
```

## 🔥 Key Features Demonstrated

### 1. Schema Mismatch Detection
- **Field Rename Detection**: Detects `phone` → `phoneNumber` with 95% confidence
- **String Similarity**: Uses Levenshtein + semantic analysis
- **Pattern Recognition**: Learns common API field patterns

### 2. Real-Time Monitoring
- **Error Rate Tracking**: Alerts when >10% error rate
- **Success Rate Monitoring**: Alerts when <90% success rate
- **Response Time**: Performance degradation detection

### 3. Smart Alerting
- **Context-Aware**: Links alerts to schema changes
- **Severity Levels**: Critical/High/Medium/Low
- **Actionable Suggestions**: "Check recent deployments and schema changes"

## 📁 Project Structure

```
src/
├── demo-app/backend/
│   ├── routes/
│   │   ├── signup-v1.ts      # V1 endpoint (phone)
│   │   └── signup-v2.ts      # V2 endpoint (phoneNumber)
│   └── types.ts              # Schema definitions
├── packages/sdk/node/
│   ├── middleware.ts         # Express middleware for tracking
│   ├── collector.ts          # Event collection pipeline
│   ├── detector.ts           # Schema diff logic
│   └── types.ts              # Type definitions
└── simulator/
    ├── break-api.ts          # API version switcher
    └── traffic-gen.ts        # Traffic generator
```

## 🧠 Detection Algorithm

### Field Rename Detection
```typescript
// Example: Detects "phone" → "phoneNumber"
{
  from: "phone",           // Client sent
  to: "phoneNumber",       // Server expected
  confidence: 0.95,        // 95% confidence
  reasoning: [
    "substring_match: 0.8", // "phone" is substring of "phoneNumber"
    "semantic_match: 0.95", // Known phone field pattern
    "levenshtein: 0.7"      // String similarity
  ]
}
```

### Alert Triggers
- **Error Rate Spike**: >10% errors in 2-minute window
- **Success Rate Drop**: <90% success rate with >10 requests
- **Schema Mismatch**: Field rename confidence >80%

## 📊 Demo Scenarios

### Scenario 1: Gradual Traffic Test
```bash
# Start with healthy traffic
npm run traffic traffic 15 100  # 15 req/min, 100% V1

# Deploy breaking change manually
curl -X POST http://localhost:3001/admin/switch-version -d '{"version":"v2"}'

# Watch alerts appear as V1 requests start failing
```

### Scenario 2: Full Breaking Change Simulation
```bash
# Automated end-to-end test
npm run simulate

# This will:
# 1. Generate 2min of healthy V1 traffic
# 2. Deploy V2 breaking change
# 3. Continue V1 traffic for 3min (causing errors)
# 4. Show detection results
```

## 🎯 Expected Results

After triggering breaking changes, you should see:

### 1. Alerts
```json
{
  "type": "error_spike",
  "severity": "critical",
  "message": "Error rate spike detected: 100.0%",
  "suggestedAction": "Check recent deployments and schema changes"
}
```

### 2. Schema Issues
```json
{
  "endpoint": "/api/signup",
  "missingFields": ["phoneNumber"],
  "extraFields": ["phone"],
  "possibleRenames": [{
    "from": "phone",
    "to": "phoneNumber",
    "confidence": 0.95
  }]
}
```

### 3. Metrics
```json
{
  "successRate": 0.0,
  "errorRate": 1.0,
  "totalRequests": 25,
  "errorRequests": 25
}
```

## 🛠️ Technical Implementation

### Middleware Pattern (Sentry-like)
- Wraps Express responses to capture events
- Non-blocking event collection
- Correlation IDs for request tracking

### Event Pipeline (Datadog-like)
- Collect → Aggregate → Alert pattern
- Time-windowed metrics (configurable)
- In-memory storage (Redis-ready for production)

### Schema Analysis (OpenAPI-diff-like)
- Multiple similarity algorithms
- Confidence scoring
- Known pattern recognition

## 🎬 Live Demo Flow

1. **Show Healthy State**: V1 traffic succeeds, 0% error rate
2. **Simulate Deploy**: Switch to V2, breaking change deployed
3. **Show Detection**: Error rate spikes, alerts fire
4. **Show Root Cause**: Schema analysis identifies field rename
5. **Show Fix Suggestion**: "phone field renamed to phoneNumber"

## 🔧 Configuration Options

```typescript
const config = {
  errorRateThreshold: 0.05,    // 5% error rate alert
  successRateThreshold: 0.95,  // 95% success rate alert
  responseTimeThreshold: 3000, // 3s response time alert
  windowSize: '2m',            // 2 minute metrics window
  schemaValidation: true,      // Enable schema detection
  enableAlerts: true           // Enable alerting
};
```

---

**🎯 This demo proves the concept of automated API schema mismatch detection and provides the foundation for building self-healing systems.**