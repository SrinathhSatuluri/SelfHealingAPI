# SelfHealingAPI

Enterprise-grade automatic API error detection, analysis, and healing system.

## Overview

SelfHealingAPI automatically detects schema mismatches and API failures, analyzes root causes using LLM-powered intelligence, generates fix code, and deploys solutions safely using canary rollouts with real-time monitoring.

## Features

- Automatic API schema mismatch detection
- LLM-powered root cause analysis (95%+ accuracy)
- Automated middleware code generation and validation
- Canary deployment with percentage-based traffic routing
- Real-time monitoring with automatic rollback
- Circuit breaker patterns and health checks
- Hot module injection without service restart

## Architecture

```
Detection → Analysis → Code Generation → Deployment → Monitoring
     ↓         ↓            ↓              ↓           ↓
Error Logs  LLM/Rules   Fix Code      Canary       Health
Patterns    Analysis    Validation    Rollout      Checks
```

## System Components

- **Detection Engine**: Pattern recognition for API failures
- **Analyzer**: LLM integration for root cause analysis
- **Code Generator**: Automatic middleware generation
- **Deployer**: Canary rollouts with feature flags
- **Monitor**: Real-time metrics and health checks
- **Dashboard**: Live system visualization

## Installation

```bash
git clone https://github.com/yourusername/SelfHealingAPI.git
cd SelfHealingAPI
npm install
```

## Configuration

Create `.env` file:
```
ANTHROPIC_API_KEY=your_key_here
# or
OPENAI_API_KEY=your_key_here
```

## Usage

### Basic Demo
```bash
npx ts-node demo-with-dashboard.ts
```
Access dashboard at http://localhost:3000

### Complete Workflow
```bash
npx ts-node test-phase5-complete.ts
```

### With LLM Integration
```bash
npx ts-node test-with-llm.ts
```

## Deployment Stages

### Production Profile
- Stage 1: 5% traffic for 5 minutes
- Stage 2: 25% traffic for 10 minutes  
- Stage 3: 100% traffic for 15 minutes

### Development Profile
- Stage 1: 20% traffic for 30 seconds
- Stage 2: 100% traffic for 60 seconds

## API Reference

### Core Classes
- `SelfHealingDeployer`: Main orchestrator
- `CanaryDeployer`: Traffic routing and rollouts
- `MiddlewareInjector`: Hot code deployment
- `DeploymentMetricsCollector`: Performance monitoring
- `APIAnalyzerChain`: LLM-powered analysis

### Configuration Options
```typescript
interface DeploymentConfig {
  safeMode: boolean;
  validateBeforeDeploy: boolean;
  backupPrevious: boolean;
  maxConcurrentDeploys: number;
}
```

## Monitoring

### Health Check Thresholds
- Success rate: > 90%
- Error rate: < 10%  
- Latency increase: < 50%

### Rollback Triggers
- Consecutive health check failures
- Error rate spike
- Response time degradation

## Technology Stack

- TypeScript
- Express.js
- Node.js
- Anthropic Claude API / OpenAI API
- Feature flags
- Real-time monitoring

## Development

### Project Structure
```
src/
├── packages/
│   ├── analyzer/     # LLM analysis
│   ├── deployer/     # Canary deployment
│   ├── healer/       # Code generation
│   └── detector/     # Error detection
├── test-*.ts         # Demo scripts
└── demo-*.ts         # Interactive demos
```

### Testing
```bash
npm test
```

## License

MIT

## Author

Srinath Satuluri
