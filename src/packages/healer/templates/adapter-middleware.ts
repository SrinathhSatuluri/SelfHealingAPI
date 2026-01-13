/**
 * Template for field mapping adapter middleware
 * Variables: {{sourceField}}, {{targetField}}, {{endpoint}}, {{description}}
 */

export const ADAPTER_MIDDLEWARE_TEMPLATE = `
import { Request, Response, NextFunction } from 'express';

/**
 * Auto-generated adapter middleware
 * {{description}}
 * Generated: {{timestamp}}
 */
export function {{functionName}}(req: Request, res: Response, next: NextFunction) {
  try {
    // Field mapping: {{sourceField}} -> {{targetField}}
    if (req.body && typeof req.body === 'object') {
      if (req.body.{{sourceField}} !== undefined && req.body.{{targetField}} === undefined) {
        req.body.{{targetField}} = req.body.{{sourceField}};
        delete req.body.{{sourceField}};

        // Log the transformation for debugging
        console.log(\`[ADAPTER] Mapped {{sourceField}} -> {{targetField}} for request \${req.requestId || 'unknown'}\`);
      }
    }

    next();
  } catch (error) {
    console.error('[ADAPTER] Error in field mapping middleware:', error);
    next(error);
  }
}
`.trim();

export const VALIDATION_MIDDLEWARE_TEMPLATE = `
import { Request, Response, NextFunction } from 'express';

/**
 * Auto-generated validation middleware
 * {{description}}
 * Generated: {{timestamp}}
 */
export function {{functionName}}(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Request body must be a valid object'
      });
    }

    const requiredFields = [{{#requiredFields}}'{{.}}'{{#unless @last}}, {{/unless}}{{/requiredFields}}];
    const missingFields = requiredFields.filter(field => req.body[field] === undefined);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: \`Missing required fields: \${missingFields.join(', ')}\`,
        details: { missingFields }
      });
    }

    {{#fieldValidations}}
    // Validate {{field}}
    if (req.body.{{field}} !== undefined && {{validation}}) {
      return res.status(400).json({
        success: false,
        error: '{{errorMessage}}',
        field: '{{field}}'
      });
    }
    {{/fieldValidations}}

    next();
  } catch (error) {
    console.error('[VALIDATION] Error in validation middleware:', error);
    next(error);
  }
}
`.trim();

export const TRANSFORMATION_MIDDLEWARE_TEMPLATE = `
import { Request, Response, NextFunction } from 'express';

/**
 * Auto-generated transformation middleware
 * {{description}}
 * Generated: {{timestamp}}
 */
export function {{functionName}}(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body && typeof req.body === 'object') {
      {{#transformations}}
      // Transform {{sourceField}} to {{targetField}}
      if (req.body.{{sourceField}} !== undefined) {
        {{#if converter}}
        req.body.{{targetField}} = {{converter}}(req.body.{{sourceField}});
        {{else}}
        req.body.{{targetField}} = req.body.{{sourceField}};
        {{/if}}
        {{#if removeSource}}
        delete req.body.{{sourceField}};
        {{/if}}
      }
      {{/transformations}}

      console.log(\`[TRANSFORM] Applied transformations for request \${req.requestId || 'unknown'}\`);
    }

    next();
  } catch (error) {
    console.error('[TRANSFORM] Error in transformation middleware:', error);
    next(error);
  }
}
`.trim();

export const ROLLBACK_MIDDLEWARE_TEMPLATE = `
import { Request, Response, NextFunction } from 'express';

/**
 * Auto-generated rollback middleware
 * Restores previous behavior before fix was applied
 * {{description}}
 * Generated: {{timestamp}}
 */
export function {{functionName}}(req: Request, res: Response, next: NextFunction) {
  try {
    // Rollback transformation: {{targetField}} -> {{sourceField}}
    if (req.body && typeof req.body === 'object') {
      if (req.body.{{targetField}} !== undefined && req.body.{{sourceField}} === undefined) {
        req.body.{{sourceField}} = req.body.{{targetField}};
        delete req.body.{{targetField}};

        console.log(\`[ROLLBACK] Restored {{targetField}} -> {{sourceField}} for request \${req.requestId || 'unknown'}\`);
      }
    }

    next();
  } catch (error) {
    console.error('[ROLLBACK] Error in rollback middleware:', error);
    next(error);
  }
}
`.trim();

/**
 * Template registry for easy access
 */
export const TEMPLATES = {
  'adapter': ADAPTER_MIDDLEWARE_TEMPLATE,
  'validation': VALIDATION_MIDDLEWARE_TEMPLATE,
  'transformation': TRANSFORMATION_MIDDLEWARE_TEMPLATE,
  'rollback': ROLLBACK_MIDDLEWARE_TEMPLATE
};

/**
 * Template metadata for validation and usage
 */
export const TEMPLATE_METADATA = {
  'adapter': {
    requiredVariables: ['functionName', 'sourceField', 'targetField', 'description', 'timestamp'],
    optionalVariables: [],
    description: 'Maps one field to another (e.g., phone -> phoneNumber)',
    useCase: 'Field rename compatibility'
  },
  'validation': {
    requiredVariables: ['functionName', 'requiredFields', 'description', 'timestamp'],
    optionalVariables: ['fieldValidations'],
    description: 'Validates request body structure and field requirements',
    useCase: 'Schema validation enforcement'
  },
  'transformation': {
    requiredVariables: ['functionName', 'transformations', 'description', 'timestamp'],
    optionalVariables: [],
    description: 'Applies complex field transformations with optional converters',
    useCase: 'Data format changes'
  },
  'rollback': {
    requiredVariables: ['functionName', 'sourceField', 'targetField', 'description', 'timestamp'],
    optionalVariables: [],
    description: 'Reverts changes made by adapter middleware',
    useCase: 'Emergency rollback to previous schema'
  }
};