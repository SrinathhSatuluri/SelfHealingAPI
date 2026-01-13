import { Request, Response } from 'express';
import { SignupRequestV1, SignupResponse, ErrorResponse } from '../types';

/**
 * Signup route handler (V1 - expects "phone" field)
 * 
 * This will break when we deploy V2 which expects "phoneNumber"
 * The demo will show the system automatically detecting and fixing this mismatch
 */
export const handleSignupV1 = (req: Request, res: Response<SignupResponse | ErrorResponse>) => {
  try {
    const body = req.body as SignupRequestV1;

    // Validate required fields for V1
    if (!body.email || !body.password || !body.phone || !body.name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        details: 'Required: email, password, phone, name',
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
    if (!phoneRegex.test(body.phone)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone format',
        timestamp: new Date().toISOString()
      });
    }

    // Simulate successful signup
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    console.log(`✓ Signup successful - User ID: ${userId}, Phone: ${body.phone}`);

    return res.status(201).json({
      success: true,
      userId,
      message: 'User created successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
};
