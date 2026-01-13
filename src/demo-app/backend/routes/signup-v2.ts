import { Request, Response } from 'express';
import { SignupRequestV2, SignupResponse, ErrorResponse } from '../types';

/**
 * Signup route handler (V2 - expects "phoneNumber" field)
 *
 * This introduces a BREAKING CHANGE from V1 which expected "phone"
 * The demo will show the system detecting this field rename mismatch
 */
export const handleSignupV2 = (req: Request, res: Response<SignupResponse | ErrorResponse>) => {
  try {
    const body = req.body as SignupRequestV2;

    // Validate required fields for V2 - NOTE: phoneNumber instead of phone
    if (!body.email || !body.password || !body.phoneNumber || !body.name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: 'Required: email, password, phoneNumber, name',
        timestamp: new Date().toISOString()
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        timestamp: new Date().toISOString()
      });
    }

    // Validate phone format (simple check)
    const phoneRegex = /^\+?[\d\s-()]+$/;
    if (!phoneRegex.test(body.phoneNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone format',
        timestamp: new Date().toISOString()
      });
    }

    // Simulate successful signup
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    console.log(`✓ Signup V2 successful - User ID: ${userId}, PhoneNumber: ${body.phoneNumber}`);

    return res.status(201).json({
      success: true,
      userId,
      message: 'User created successfully (V2)',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Signup V2 error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};