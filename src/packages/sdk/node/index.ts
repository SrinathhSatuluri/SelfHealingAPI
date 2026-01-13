/**
 * Self-Healing API SDK for Node.js
 *
 * Main exports for the detection and monitoring system
 */

export { SelfHealingMiddleware } from './middleware';
export { EventCollector } from './collector';
export { SchemaDetector } from './detector';

export * from './types';

// Re-export for convenience
export { SelfHealingMiddleware as SelfHealingAPI } from './middleware';