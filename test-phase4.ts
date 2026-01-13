/**
 * Test script for Phase 4: Code Generation and Validation
 * Run with: npx ts-node test-phase4.ts
 */

import { generateFixCode, HealerConfigurations, HealerUtils } from './src/packages/healer';
import { AnalysisResult } from './src/packages/healer/types';

async function testPhase4() {
  console.log('🧪 Testing Phase 4: Code Generation & Validation\n');

  // Mock analysis result from Phase 3 (phone -> phoneNumber)
  const mockAnalysis: AnalysisResult = {
    rootCause: "API schema mismatch - field renamed from 'phone' to 'phoneNumber'",
    confidence: 0.95,
    details: {
      field: "phone",
      newFieldName: "phoneNumber",
      expectedBy: "backend",
      breakingChange: true,
      affectedEndpoints: ["/api/signup"]
    },
    suggestedFix: {
      type: "adapter",
      description: "Create adapter middleware to map 'phone' field to 'phoneNumber'",
      implementation: {
        strategy: "Create middleware to transform request body",
        steps: [
          "Generate adapter middleware function",
          "Deploy middleware before existing route handler",
          "Monitor success/error rates",
          "Rollback if issues detected"
        ]
      }
    }
  };

  try {
    console.log('📊 Analysis Input:');
    console.log('='.repeat(60));
    console.log(`🔍 Root Cause: ${mockAnalysis.rootCause}`);
    console.log(`📊 Confidence: ${(mockAnalysis.confidence * 100).toFixed(1)}%`);
    console.log(`🔧 Fix Type: ${mockAnalysis.suggestedFix.type}`);
    console.log(`📋 Field Mapping: ${mockAnalysis.details.field} → ${mockAnalysis.details.newFieldName}`);
    console.log();

    // Test 1: Template-based generation (fast)
    console.log('🚀 Test 1: Template-based Quick Fix');
    console.log('-'.repeat(40));

    const quickFix = HealerUtils.generateQuickFix(
      mockAnalysis.details.field!,
      mockAnalysis.details.newFieldName!
    );

    console.log('Generated Code:');
    console.log(quickFix);
    console.log();

    // Test 2: Full generation with validation
    console.log('🚀 Test 2: Full Generation with Validation');
    console.log('-'.repeat(40));

    const result = await generateFixCode(mockAnalysis, HealerConfigurations.testing);

    console.log('✅ Code Generation Results:');
    console.log(`📝 Generated ID: ${result.code.id}`);
    console.log(`📊 Confidence: ${(result.code.metadata.confidence * 100).toFixed(1)}%`);
    console.log(`🔧 Fix Type: ${result.code.metadata.fixType}`);
    console.log();

    console.log('Generated Middleware Code:');
    console.log('```typescript');
    console.log(result.code.content);
    console.log('```');
    console.log();

    console.log('🔍 Validation Results:');
    console.log(`✅ Valid: ${result.validation.isValid}`);
    console.log(`⚠️ Errors: ${result.validation.errors.length}`);
    console.log(`🛡️ Security Issues: ${result.validation.securityIssues.length}`);

    if (result.validation.errors.length > 0) {
      console.log('\nValidation Errors:');
      result.validation.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.message} (${error.type})`);
        if (error.suggestion) {
          console.log(`     Suggestion: ${error.suggestion}`);
        }
      });
    }

    if (result.validation.securityIssues.length > 0) {
      console.log('\nSecurity Issues:');
      result.validation.securityIssues.forEach((issue, i) => {
        console.log(`  ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.message}`);
        console.log(`     Pattern: ${issue.pattern}`);
      });
    }

    // Test 3: AST Analysis
    console.log('\n🔍 AST Analysis:');
    console.log('-'.repeat(40));
    console.log(`📋 Valid Middleware: ${result.validation.astInfo.isValidMiddleware}`);
    console.log(`✅ Expected Signature: ${result.validation.astInfo.hasExpectedSignature}`);
    console.log(`🔄 Calls next(): ${result.validation.astInfo.callsNext}`);
    console.log(`📝 Modifies Request: ${result.validation.astInfo.modifiesRequest}`);
    console.log(`📤 Exports: ${result.validation.astInfo.exports.join(', ') || 'None'}`);
    console.log(`📦 Imports: ${result.validation.astInfo.imports.join(', ') || 'None'}`);

    // Test 4: Utility Functions
    console.log('\n🛠️ Utility Functions:');
    console.log('-'.repeat(40));
    console.log(`🏗️ Complexity: ${HealerUtils.estimateComplexity(mockAnalysis)}`);
    console.log(`🚀 Safe for Auto-deploy: ${HealerUtils.isSafeForAutoDeploy(mockAnalysis)}`);

    const fieldMappings = HealerUtils.extractFieldMappings(mockAnalysis);
    console.log(`📋 Field Mappings:`);
    fieldMappings.forEach(mapping => {
      console.log(`  ${mapping.from} → ${mapping.to}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Phase 4 Testing Complete!');
    console.log('🎯 Next: Deploy this middleware in your Express app');
    console.log('💡 Example usage:');
    console.log('   app.use(\'/api/signup\', generatedMiddleware);');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error.message);

    if (error.message.includes('API key')) {
      console.log('\n💡 For LLM-powered generation, set:');
      console.log('   export ANTHROPIC_API_KEY=your_key');
      console.log('   or');
      console.log('   export OPENAI_API_KEY=your_key');
      console.log('\n🔄 Template-based generation works without API keys');
    }

    console.log('\n🛠️ Debug info:');
    console.log('Analysis:', JSON.stringify(mockAnalysis, null, 2));
  }
}

// Additional utility test
async function testCodeValidation() {
  console.log('\n🔬 Testing Code Validation...\n');

  const testCases = [
    {
      name: 'Valid Middleware',
      code: `
export function testMiddleware(req, res, next) {
  try {
    if (req.body.phone) {
      req.body.phoneNumber = req.body.phone;
      delete req.body.phone;
    }
    next();
  } catch (error) {
    next(error);
  }
}`,
      expectedValid: true
    },
    {
      name: 'Missing next() call',
      code: `
export function badMiddleware(req, res, next) {
  req.body.phoneNumber = req.body.phone;
}`,
      expectedValid: false
    },
    {
      name: 'Security Issue (eval)',
      code: `
export function dangerousMiddleware(req, res, next) {
  eval(req.body.code);
  next();
}`,
      expectedValid: false
    }
  ];

  const { CodeValidator } = await import('./src/packages/healer');
  const validator = new CodeValidator();

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);

    try {
      const result = await validator.validateCode(testCase.code);
      console.log(`  ✅ Valid: ${result.isValid}`);
      console.log(`  ⚠️ Errors: ${result.errors.length}`);
      console.log(`  🛡️ Security: ${result.securityIssues.length} issues`);

      if (result.isValid !== testCase.expectedValid) {
        console.log(`  ❌ Expected: ${testCase.expectedValid}, Got: ${result.isValid}`);
      } else {
        console.log(`  ✅ Validation result as expected`);
      }

    } catch (error) {
      console.log(`  ❌ Validation failed: ${error.message}`);
    }

    console.log();
  }
}

// Run tests
if (require.main === module) {
  testPhase4()
    .then(() => testCodeValidation())
    .catch(console.error);
}