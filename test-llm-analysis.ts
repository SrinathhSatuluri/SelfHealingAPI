/**
 * Test script for LLM-powered analysis
 * Run with: npx ts-node test-llm-analysis.ts
 */

import { analyzeAPIFailure, createAnalysisInput } from './src/packages/analyzer';

async function testLLMAnalysis() {
  console.log('🧪 Testing LLM Analysis...\n');

  // Mock data simulating phone -> phoneNumber schema mismatch
  const mockErrorLogs = [
    {
      timestamp: '2024-01-15T10:30:00Z',
      statusCode: 400,
      method: 'POST',
      url: '/api/signup',
      requestBody: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1-555-0123',  // Client sends "phone"
        password: 'securepass123'
      },
      responseBody: {
        success: false,
        error: 'Missing required field: phoneNumber'  // Server expects "phoneNumber"
      },
      errorMessage: 'Validation failed: Missing required field: phoneNumber'
    },
    {
      timestamp: '2024-01-15T10:31:00Z',
      statusCode: 400,
      method: 'POST',
      url: '/api/signup',
      requestBody: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+1-555-0456',
        password: 'mypassword'
      },
      responseBody: {
        success: false,
        error: 'phoneNumber is required'
      },
      errorMessage: 'Validation failed: phoneNumber is required'
    }
  ];

  const mockSchemaDiff = {
    missingFields: ['phoneNumber'],
    extraFields: ['phone'],
    possibleRenames: [
      {
        from: 'phone',
        to: 'phoneNumber',
        confidence: 0.95
      }
    ]
  };

  try {
    // Create analysis input
    const analysisInput = createAnalysisInput(
      mockErrorLogs,
      mockSchemaDiff,
      '/api/signup',
      0.8  // 80% error rate
    );

    console.log('📊 Analysis Input:', JSON.stringify(analysisInput, null, 2));
    console.log('\n🤖 Running LLM Analysis...');

    // Run analysis (requires API key)
    const result = await analyzeAPIFailure(analysisInput, {
      llm: {
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        apiKey: process.env.ANTHROPIC_API_KEY || 'sk-test-key',
        temperature: 0.1
      }
    });

    console.log('\n🎯 Analysis Result:');
    console.log('='.repeat(60));
    console.log(`🔍 Root Cause: ${result.rootCause}`);
    console.log(`📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`🔧 Fix Type: ${result.suggestedFix.type}`);
    console.log(`📋 Description: ${result.suggestedFix.description}`);

    if (result.details.field && result.details.newFieldName) {
      console.log(`📝 Field Mapping: ${result.details.field} → ${result.details.newFieldName}`);
    }

    console.log('\n💡 Suggested Implementation:');
    result.suggestedFix.implementation.steps.forEach((step, i) => {
      console.log(`   ${i + 1}. ${step}`);
    });

    if (result.suggestedFix.implementation.codeExample) {
      console.log('\n📝 Code Example:');
      console.log(result.suggestedFix.implementation.codeExample);
    }

    console.log('='.repeat(60));
    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.message.includes('API key')) {
      console.log('\n💡 To test LLM analysis, set environment variable:');
      console.log('   export ANTHROPIC_API_KEY=your_api_key');
      console.log('   or');
      console.log('   export OPENAI_API_KEY=your_api_key');
    }
  }
}

// Run test
if (require.main === module) {
  testLLMAnalysis();
}