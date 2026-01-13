import { RequestEvent, ResponseEvent, SchemaFieldEvent, Alert } from './types';
import { EventCollector } from './collector';

/**
 * Schema detection and field rename analysis
 * Follows OpenAPI-diff pattern for schema comparison
 */
export class SchemaDetector {
  private fieldEvents: SchemaFieldEvent[] = [];
  private knownSchemas: Map<string, string[]> = new Map();
  private fieldSimilarityCache: Map<string, number> = new Map();

  constructor() {
    // Initialize known schemas for signup endpoints
    this.knownSchemas.set('/api/signup', ['email', 'password', 'phone', 'name']); // V1
    this.knownSchemas.set('/api/signup-v2', ['email', 'password', 'phoneNumber', 'name']); // V2
  }

  /**
   * Analyze incoming request for schema issues
   */
  analyzeRequest(requestEvent: RequestEvent): SchemaFieldEvent | null {
    if (!requestEvent.body || typeof requestEvent.body !== 'object') {
      return null;
    }

    const endpoint = this.normalizeEndpoint(requestEvent.url);
    const expectedFields = this.knownSchemas.get(endpoint);

    if (!expectedFields) {
      return null; // No known schema for this endpoint
    }

    const providedFields = Object.keys(requestEvent.body);
    const missingFields = expectedFields.filter(field => !providedFields.includes(field));
    const extraFields = providedFields.filter(field => !expectedFields.includes(field));

    // Only create event if there are schema issues
    if (missingFields.length === 0 && extraFields.length === 0) {
      return null;
    }

    const possibleRenames = this.detectFieldRenames(missingFields, extraFields);

    const fieldEvent: SchemaFieldEvent = {
      requestId: requestEvent.id,
      timestamp: requestEvent.timestamp,
      endpoint,
      expectedFields,
      providedFields,
      missingFields,
      extraFields,
      possibleRenames
    };

    this.fieldEvents.push(fieldEvent);

    // Keep only recent events (last 500)
    if (this.fieldEvents.length > 500) {
      this.fieldEvents = this.fieldEvents.slice(-500);
    }

    console.log(`🔍 Schema mismatch detected:`, {
      endpoint,
      missing: missingFields,
      extra: extraFields,
      renames: possibleRenames
    });

    return fieldEvent;
  }

  /**
   * Analyze response for additional context
   */
  analyzeResponse(requestEvent: RequestEvent, responseEvent: ResponseEvent): void {
    // Look for validation error patterns in response
    if (responseEvent.statusCode === 400 && responseEvent.body?.error) {
      const errorMessage = responseEvent.body.error.toLowerCase();

      // Check if error mentions missing fields
      if (errorMessage.includes('missing') || errorMessage.includes('required')) {
        console.log(`📋 Validation error suggests schema issue: ${responseEvent.body.error}`);

        // Try to extract field names from error message
        const fieldMatches = responseEvent.body.details?.match(/\b\w+\b/g) || [];
        this.updateSchemaFromError(requestEvent.url, fieldMatches);
      }
    }
  }

  /**
   * Detect possible field renames using string similarity
   */
  private detectFieldRenames(missingFields: string[], extraFields: string[]): Array<{from: string, to: string, confidence: number}> {
    const renames: Array<{from: string, to: string, confidence: number}> = [];

    for (const missing of missingFields) {
      for (const extra of extraFields) {
        const similarity = this.calculateFieldSimilarity(missing, extra);

        // High confidence threshold for field renames
        if (similarity > 0.6) {
          renames.push({
            from: extra, // Client sent this field
            to: missing, // Server expected this field
            confidence: similarity
          });
        }
      }
    }

    // Sort by confidence, highest first
    return renames.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate similarity between two field names
   * Uses multiple algorithms for better accuracy
   */
  private calculateFieldSimilarity(field1: string, field2: string): number {
    const cacheKey = `${field1}:${field2}`;
    if (this.fieldSimilarityCache.has(cacheKey)) {
      return this.fieldSimilarityCache.get(cacheKey)!;
    }

    // Levenshtein distance similarity
    const levenshteinSim = this.levenshteinSimilarity(field1, field2);

    // Substring similarity (common patterns like phone → phoneNumber)
    const substringSim = this.substringSimilarity(field1, field2);

    // Semantic similarity (known patterns)
    const semanticSim = this.semanticSimilarity(field1, field2);

    // Weighted combination
    const similarity = (levenshteinSim * 0.4) + (substringSim * 0.3) + (semanticSim * 0.3);

    this.fieldSimilarityCache.set(cacheKey, similarity);
    return similarity;
  }

  private levenshteinSimilarity(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    const distance = matrix[b.length][a.length];
    return 1 - distance / Math.max(a.length, b.length);
  }

  private substringSimilarity(a: string, b: string): number {
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;

    if (longer.includes(shorter)) return 0.9;
    if (shorter.includes(longer)) return 0.8;

    // Check for common prefixes/suffixes
    let commonPrefix = 0;
    let commonSuffix = 0;

    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) commonPrefix++;
      else break;
    }

    for (let i = 1; i <= Math.min(a.length, b.length); i++) {
      if (a[a.length - i] === b[b.length - i]) commonSuffix++;
      else break;
    }

    return (commonPrefix + commonSuffix) / Math.max(a.length, b.length);
  }

  private semanticSimilarity(a: string, b: string): number {
    // Known semantic patterns for API fields
    const patterns = [
      { pattern: ['phone', 'phoneNumber'], similarity: 0.95 },
      { pattern: ['email', 'emailAddress'], similarity: 0.9 },
      { pattern: ['name', 'fullName'], similarity: 0.8 },
      { pattern: ['id', 'identifier'], similarity: 0.85 },
      { pattern: ['pwd', 'password'], similarity: 0.8 },
      { pattern: ['user', 'username'], similarity: 0.8 }
    ];

    for (const { pattern, similarity } of patterns) {
      if ((pattern.includes(a.toLowerCase()) && pattern.includes(b.toLowerCase()))) {
        return similarity;
      }
    }

    return 0;
  }

  private normalizeEndpoint(url: string): string {
    // Remove query parameters and trailing slashes
    return url.split('?')[0].replace(/\/$/, '');
  }

  private updateSchemaFromError(endpoint: string, fieldHints: string[]): void {
    // Update known schema based on error messages
    // This could be used to dynamically learn schema changes
  }

  /**
   * Get detected schema issues for analysis
   */
  getDetectedIssues(limit: number = 50): SchemaFieldEvent[] {
    return this.fieldEvents.slice(-limit).reverse();
  }

  /**
   * Get high-confidence field rename suggestions
   */
  getFieldRenameSuggestions(): Array<{endpoint: string, renames: Array<{from: string, to: string, confidence: number}>}> {
    const suggestions: Map<string, Array<{from: string, to: string, confidence: number}>> = new Map();

    for (const event of this.fieldEvents.slice(-100)) { // Last 100 events
      const highConfidenceRenames = event.possibleRenames.filter(r => r.confidence > 0.8);

      if (highConfidenceRenames.length > 0) {
        if (!suggestions.has(event.endpoint)) {
          suggestions.set(event.endpoint, []);
        }
        suggestions.get(event.endpoint)!.push(...highConfidenceRenames);
      }
    }

    return Array.from(suggestions.entries()).map(([endpoint, renames]) => ({
      endpoint,
      renames: renames.slice(0, 5) // Top 5 suggestions per endpoint
    }));
  }
}