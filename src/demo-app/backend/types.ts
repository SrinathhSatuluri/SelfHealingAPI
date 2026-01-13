/**
 * Type definitions for the self-healing API demo
 * 
 * V1: Original schema with "phone" field
 * V2: Breaking change - renamed to "phoneNumber"
 */

export interface SignupRequestV1 {
  email: string;
  password: string;
  phone: string;  // V1 uses "phone"
  name: string;
}

export interface SignupRequestV2 {
  email: string;
  password: string;
  phoneNumber: string;  // V2 uses "phoneNumber" - BREAKING CHANGE
  name: string;
}

export interface SignupResponse {
  success: boolean;
  userId?: string;
  message: string;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
  timestamp: string;
}

// Type for tracking which schema version is active
export type SchemaVersion = 'v1' | 'v2';
