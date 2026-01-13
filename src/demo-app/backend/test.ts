/**
 * Test script for the signup endpoint
 * Run with: npm test
 */

const API_URL = 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

async function testHealthCheck(): Promise<TestResult> {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json() as any;
    
    if (response.ok && data.status === 'healthy') {
      return {
        name: 'Health Check',
        passed: true,
        message: '✓ Server is healthy'
      };
    }
    
    return {
      name: 'Health Check',
      passed: false,
      message: `✗ Unexpected response: ${JSON.stringify(data)}`
    };
  } catch (error) {
    return {
      name: 'Health Check',
      passed: false,
      message: `✗ Error: ${error}`
    };
  }
}

async function testValidSignup(): Promise<TestResult> {
  try {
    const payload = {
      email: 'test@example.com',
      password: 'securePass123!',
      phone: '+1-555-0123',
      name: 'Test User'
    };

    const response = await fetch(`${API_URL}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;

    if (response.status === 201 && data.success && data.userId) {
      return {
        name: 'Valid Signup (V1 schema)',
        passed: true,
        message: `✓ User created: ${data.userId}`
      };
    }

    return {
      name: 'Valid Signup (V1 schema)',
      passed: false,
      message: `✗ Unexpected response: ${JSON.stringify(data)}`
    };
  } catch (error) {
    return {
      name: 'Valid Signup (V1 schema)',
      passed: false,
      message: `✗ Error: ${error}`
    };
  }
}

async function testMissingPhone(): Promise<TestResult> {
  try {
    const payload = {
      email: 'test@example.com',
      password: 'securePass123!',
      // Missing phone field
      name: 'Test User'
    };

    const response = await fetch(`${API_URL}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;

    if (response.status === 400 && !data.success) {
      return {
        name: 'Missing Phone Field',
        passed: true,
        message: '✓ Correctly rejected missing phone'
      };
    }

    return {
      name: 'Missing Phone Field',
      passed: false,
      message: `✗ Should have rejected: ${JSON.stringify(data)}`
    };
  } catch (error) {
    return {
      name: 'Missing Phone Field',
      passed: false,
      message: `✗ Error: ${error}`
    };
  }
}

async function testInvalidEmail(): Promise<TestResult> {
  try {
    const payload = {
      email: 'invalid-email',
      password: 'securePass123!',
      phone: '+1-555-0123',
      name: 'Test User'
    };

    const response = await fetch(`${API_URL}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;

    if (response.status === 400 && !data.success) {
      return {
        name: 'Invalid Email',
        passed: true,
        message: '✓ Correctly rejected invalid email'
      };
    }

    return {
      name: 'Invalid Email',
      passed: false,
      message: `✗ Should have rejected: ${JSON.stringify(data)}`
    };
  } catch (error) {
    return {
      name: 'Invalid Email',
      passed: false,
      message: `✗ Error: ${error}`
    };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 Running API Tests');
  console.log('='.repeat(60));
  console.log();

  const tests = [
    testHealthCheck,
    testValidSignup,
    testMissingPhone,
    testInvalidEmail
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await test();
    results.push(result);
    console.log(`${result.passed ? '✓' : '✗'} ${result.name}`);
    console.log(`  ${result.message}`);
    console.log();
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log('='.repeat(60));
  console.log(`Results: ${passed}/${total} tests passed`);
  console.log('='.repeat(60));

  if (passed === total) {
    console.log('✅ All tests passed! Phase 1 complete.');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed.');
    process.exit(1);
  }
}

// Run tests
console.log('Waiting 2 seconds for server to be ready...\n');
setTimeout(runTests, 2000);
