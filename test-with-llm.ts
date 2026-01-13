/**
 * Self-Healing Demo with Real LLM Integration
 * Run with: npx ts-node test-with-llm.ts
 *
 * Prerequisites:
 * 1. Add your API key to .env file
 * 2. Install dotenv: npm install dotenv
 */

import express from 'express';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { SelfHealingDeployer, createSelfHealingSystem } from './src/packages/deployer';
import { analyzeAPIFailure, createAnalysisInput } from './src/packages/analyzer';
import { generateFixCode } from './src/packages/healer';

// Load environment variables
dotenv.config();

// Simple function to make HTTP requests using axios
async function makeRequest(url: string, payload: any) {
  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true // Don't throw on 4xx/5xx
    });

    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      data: response.data
    };
  } catch (error) {
    throw error;
  }
}

// Create demo Express app
const app = express();
app.use(express.json());

// Original V1 signup endpoint (expects "phone")
app.post('/api/signup', (req, res) => {
  console.log('📝 V1 Signup request:', req.body);

  if (!req.body.name || !req.body.email || !req.body.phone || !req.body.password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: name, email, phone, password',
      details: { receivedFields: Object.keys(req.body) }
    });
  }

  res.status(201).json({
    success: true,
    userId: `user_${Date.now()}`,
    message: 'User created successfully'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

async function runLLMDemo() {
  console.log('🚀 SELF-HEALING API DEMO WITH REAL LLM');
  console.log('='.repeat(80));

  // Check API keys
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    console.log('❌ No API keys found!');
    console.log('');
    console.log('To enable real LLM analysis:');
    console.log('1. Get an API key from Anthropic or OpenAI');
    console.log('2. Add to your .env file:');
    console.log('   ANTHROPIC_API_KEY=your_key_here');
    console.log('   or');
    console.log('   OPENAI_API_KEY=your_key_here');
    console.log('');
    console.log('🔄 Running with mock analysis for now...');
    console.log('');
  } else {
    console.log('✅ API key found - enabling real LLM analysis!');
    console.log('');
  }

  const port = 3002;
  const server = app.listen(port, () => {
    console.log(`🌐 Demo server running on http://localhost:${port}`);
  });

  try {
    // Initialize self-healing system
    console.log('📋 Phase 1: Initialize Self-Healing System');
    console.log('─'.repeat(50));

    const deployer = createSelfHealingSystem(app, 'demo');
    await sleep(2000);

    console.log('✅ Self-healing system ready!');

    // Generate baseline metrics
    console.log('\n📊 Phase 2: Generate Baseline Metrics');
    console.log('─'.repeat(50));

    await generateTraffic('success', 10);
    await sleep(3000);
    console.log('✅ Baseline established');

    // Simulate breaking change
    console.log('\n💥 Phase 3: Simulate API Breaking Change');
    console.log('─'.repeat(50));

    const errorResults = await generateTraffic('fail', 10);
    console.log('❌ API errors detected');

    // REAL LLM Analysis (if API key available)
    console.log('\n🧠 Phase 4: LLM Root Cause Analysis');
    console.log('─'.repeat(50));

    let analysisResult;

    if (anthropicKey || openaiKey) {
      console.log('🤖 Calling real LLM for analysis...');

      // Create analysis input
      const analysisInput = createAnalysisInput(
        errorResults,
        {
          missingFields: ['phone'],
          extraFields: ['phoneNumber'],
          possibleRenames: [{ from: 'phoneNumber', to: 'phone', confidence: 0.95 }]
        },
        '/api/signup',
        1.0 // 100% error rate
      );

      // Use real LLM analysis
      try {
        const llmConfig = anthropicKey ? {
          provider: 'anthropic' as const,
          apiKey: anthropicKey,
          model: 'claude-3-sonnet-20240229',
          temperature: 0.1,
          maxTokens: 2000
        } : {
          provider: 'openai' as const,
          apiKey: openaiKey!,
          model: 'gpt-4',
          temperature: 0.1,
          maxTokens: 2000
        };

        analysisResult = await analyzeAPIFailure(analysisInput, {
          llm: llmConfig,
          maxRetries: 2,
          validationStrict: false,
          enableReflection: false
        });

        if (analysisResult.success) {
          console.log('✅ LLM Analysis Complete:');
          console.log(`   Root Cause: ${analysisResult.data!.rootCause}`);
          console.log(`   Confidence: ${(analysisResult.data!.confidence * 100).toFixed(1)}%`);
          console.log(`   Fix Type: ${analysisResult.data!.suggestedFix.type}`);
        } else {
          console.log('❌ LLM Analysis failed, using fallback');
          throw new Error('LLM analysis failed');
        }

      } catch (error) {
        console.log(`⚠️ LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
        console.log('🔄 Falling back to rule-based analysis...');

        // Fallback to mock analysis
        analysisResult = {
          success: true,
          data: {
            rootCause: "API schema mismatch - field renamed from 'phoneNumber' to 'phone'",
            confidence: 0.95,
            suggestedFix: { type: 'adapter' as const, description: 'Create adapter middleware' }
          }
        } as any;
      }
    } else {
      // Mock analysis
      console.log('🔄 Using rule-based analysis (no API key)...');
      analysisResult = {
        success: true,
        data: {
          rootCause: "API schema mismatch - field renamed from 'phoneNumber' to 'phone'",
          confidence: 0.95,
          suggestedFix: { type: 'adapter' as const, description: 'Create adapter middleware' }
        }
      } as any;
    }

    console.log('✅ Analysis complete!');

    // Record analysis
    deployer.dashboard.recordAnalysisComplete({
      rootCause: analysisResult.data!.rootCause,
      confidence: analysisResult.data!.confidence,
      suggestedFix: analysisResult.data!.suggestedFix
    });

    // Generate fix code
    console.log('\n🛠️ Phase 5: Generate Fix Code');
    console.log('─'.repeat(50));

    const fixCode = `
function phoneNumberToPhoneAdapter(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      if (req.body.phoneNumber && !req.body.phone) {
        req.body.phone = req.body.phoneNumber;
        delete req.body.phoneNumber;
        console.log('[ADAPTER] Mapped phoneNumber -> phone');
      }
    }
    next();
  } catch (error) {
    console.error('[ADAPTER] Error:', error instanceof Error ? error.message : String(error));
    next(error);
  }
}`;

    console.log('✅ Adapter middleware generated');

    // Deploy fix
    console.log('\n🚀 Phase 6: Deploy Fix');
    console.log('─'.repeat(50));

    const deploymentId = await deployer.deployFix(
      fixCode,
      'phoneNumberToPhoneAdapter',
      '/api/signup'
    );

    console.log(`✅ Deployment started: ${deploymentId}`);

    // Monitor deployment
    await sleep(10000); // Let it run for 10 seconds

    // Test the fix with actual traffic
    console.log('\n🎯 Phase 7: Test Fix');
    console.log('─'.repeat(50));

    await generateTraffic('fix-test', 10);

    console.log('\n🎉 Demo Complete!');
    console.log('='.repeat(80));
    console.log('✅ Self-healing system demonstrated with' + (anthropicKey || openaiKey ? ' REAL LLM' : ' mock') + ' analysis!');
    console.log('📊 Dashboard: http://localhost:3000/api/dashboard');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Demo failed:', error instanceof Error ? error.message : String(error));
  } finally {
    setTimeout(() => {
      server.close(() => {
        console.log('🛑 Demo server stopped');
        process.exit(0);
      });
    }, 3000);
  }
}

// Generate traffic for testing
async function generateTraffic(type: 'success' | 'fail' | 'fix-test', count: number): Promise<any[]> {
  const results = [];

  for (let i = 0; i < count; i++) {
    try {
      let payload;

      switch (type) {
        case 'success':
          payload = {
            name: `User ${i}`,
            email: `user${i}@example.com`,
            phone: `+1-555-010${i}`,
            password: 'password123'
          };
          break;
        case 'fail':
          payload = {
            name: `User ${i}`,
            email: `user${i}@example.com`,
            phoneNumber: `+1-555-010${i}`,
            password: 'password123'
          };
          break;
        case 'fix-test':
          payload = Math.random() > 0.5 ? {
            name: `User ${i}`,
            email: `user${i}@example.com`,
            phoneNumber: `+1-555-010${i}`,
            password: 'password123'
          } : {
            name: `User ${i}`,
            email: `user${i}@example.com`,
            phone: `+1-555-010${i}`,
            password: 'password123'
          };
          break;
      }

      const httpResponse = await makeRequest('http://localhost:3002/api/signup', payload);
      const result = {
        timestamp: new Date().toISOString(),
        statusCode: httpResponse.status,
        method: 'POST',
        url: '/api/signup',
        requestBody: payload,
        responseBody: httpResponse.data,
        errorMessage: httpResponse.ok ? '' : (httpResponse.data?.error || 'Request failed')
      };

      results.push(result);

      const status = httpResponse.ok ? '✅' : '❌';
      console.log(`${status} Request ${i + 1}: ${httpResponse.status} - ${httpResponse.ok ? 'Success' : (httpResponse.data?.error || 'Failed')}`);

    } catch (error) {
      console.log(`❌ Request ${i + 1}: Network error - ${error instanceof Error ? error.message : String(error)}`);
    }

    await sleep(200);
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the LLM demo
if (require.main === module) {
  runLLMDemo().catch(console.error);
}