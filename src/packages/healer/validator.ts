import * as ts from 'typescript';
import { ValidationResult, ValidationError, SecurityIssue, ASTInfo, ValidationRule } from './types';

/**
 * TypeScript AST validator with security checks
 * Ensures generated code is safe and well-formed
 */
export class CodeValidator {
  private customRules: ValidationRule[];

  constructor(customRules: ValidationRule[] = []) {
    this.customRules = customRules;
  }

  /**
   * Validate generated code for safety and correctness
   */
  async validateCode(code: string, expectedType: 'middleware' | 'function' = 'middleware'): Promise<ValidationResult> {
    console.log('🔍 Validating generated code...');

    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
      astInfo: {
        isValidMiddleware: false,
        hasExpectedSignature: false,
        modifiesRequest: false,
        modifiesResponse: false,
        callsNext: false,
        imports: [],
        exports: [],
        functions: []
      }
    };

    try {
      // Step 1: Syntax validation with TypeScript compiler
      const syntaxValidation = this.validateSyntax(code);
      result.errors.push(...syntaxValidation.errors);

      // Step 2: AST analysis
      if (syntaxValidation.sourceFile) {
        result.astInfo = this.analyzeAST(syntaxValidation.sourceFile);
      }

      // Step 3: Security checks
      result.securityIssues = this.checkSecurity(code);

      // Step 4: Middleware-specific validation
      if (expectedType === 'middleware') {
        const middlewareValidation = this.validateMiddleware(result.astInfo, code);
        result.errors.push(...middlewareValidation);
      }

      // Step 5: Custom rules validation
      const customValidation = this.validateCustomRules(code);
      result.errors.push(...customValidation.errors);
      result.warnings.push(...customValidation.warnings);

      // Determine if code is valid
      result.isValid = result.errors.length === 0 &&
                      result.securityIssues.filter(s => s.severity === 'critical' || s.severity === 'high').length === 0;

      console.log(`${result.isValid ? '✅' : '❌'} Validation complete: ${result.errors.length} errors, ${result.securityIssues.length} security issues`);

      return result;

    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: 'syntax',
        message: `Validation failed: ${error.message}`,
        severity: 'error'
      });

      return result;
    }
  }

  /**
   * Validate TypeScript syntax using compiler
   */
  private validateSyntax(code: string): { errors: ValidationError[]; sourceFile?: ts.SourceFile } {
    const errors: ValidationError[] = [];

    try {
      const sourceFile = ts.createSourceFile(
        'generated.ts',
        code,
        ts.ScriptTarget.ES2020,
        true,
        ts.ScriptKind.TS
      );

      // Check for syntax errors
      const program = ts.createProgram(['generated.ts'], {
        noEmit: true,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        strict: true
      }, {
        getSourceFile: (fileName) => fileName === 'generated.ts' ? sourceFile : undefined,
        writeFile: () => {},
        getCurrentDirectory: () => '',
        getDirectories: () => [],
        fileExists: () => true,
        readFile: () => '',
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n'
      });

      const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);

      for (const diagnostic of diagnostics) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start || 0);
        errors.push({
          type: 'syntax',
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          line: line + 1,
          column: character + 1,
          severity: 'error'
        });
      }

      return { errors, sourceFile };

    } catch (error) {
      errors.push({
        type: 'syntax',
        message: `TypeScript compilation error: ${error.message}`,
        severity: 'error'
      });

      return { errors };
    }
  }

  /**
   * Analyze AST to understand code structure
   */
  private analyzeAST(sourceFile: ts.SourceFile): ASTInfo {
    const astInfo: ASTInfo = {
      isValidMiddleware: false,
      hasExpectedSignature: false,
      modifiesRequest: false,
      modifiesResponse: false,
      callsNext: false,
      imports: [],
      exports: [],
      functions: []
    };

    const visit = (node: ts.Node) => {
      // Track imports
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier as ts.StringLiteral;
        astInfo.imports.push(moduleSpecifier.text);
      }

      // Track function declarations/expressions
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
        if (node.name) {
          astInfo.functions.push(node.name.getText());
        }

        // Check middleware signature: (req, res, next)
        if (node.parameters.length === 3) {
          const params = node.parameters.map(p => p.name.getText());
          if (params.some(p => p.includes('req')) &&
              params.some(p => p.includes('res')) &&
              params.some(p => p.includes('next'))) {
            astInfo.hasExpectedSignature = true;
            astInfo.isValidMiddleware = true;
          }
        }
      }

      // Track exports
      if (ts.isExportDeclaration(node) || (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))) {
        if (node.name) {
          astInfo.exports.push(node.name.getText());
        }
      }

      // Track request/response modifications
      if (ts.isPropertyAccessExpression(node)) {
        const text = node.getText();
        if (text.includes('req.body')) {
          astInfo.modifiesRequest = true;
        }
        if (text.includes('res.')) {
          astInfo.modifiesResponse = true;
        }
      }

      // Track next() calls
      if (ts.isCallExpression(node)) {
        const expression = node.expression.getText();
        if (expression === 'next' || expression.endsWith('.next')) {
          astInfo.callsNext = true;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return astInfo;
  }

  /**
   * Check for security vulnerabilities
   */
  private checkSecurity(code: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    // Define security patterns to detect
    const securityPatterns = [
      {
        pattern: /eval\s*\(/gi,
        type: 'eval' as const,
        severity: 'critical' as const,
        message: 'Use of eval() is dangerous and prohibited'
      },
      {
        pattern: /Function\s*\(/gi,
        type: 'eval' as const,
        severity: 'critical' as const,
        message: 'Dynamic function creation is prohibited'
      },
      {
        pattern: /require\s*\(\s*[`'"]\s*\+/gi,
        type: 'injection' as const,
        severity: 'high' as const,
        message: 'Dynamic require with concatenation detected'
      },
      {
        pattern: /process\.env\[.*\]/gi,
        type: 'injection' as const,
        severity: 'medium' as const,
        message: 'Dynamic environment variable access'
      },
      {
        pattern: /__proto__|\.constructor\.prototype/gi,
        type: 'prototype-pollution' as const,
        severity: 'high' as const,
        message: 'Potential prototype pollution'
      },
      {
        pattern: /fs\.|path\.join\(/gi,
        type: 'path-traversal' as const,
        severity: 'high' as const,
        message: 'File system operations are not allowed'
      },
      {
        pattern: /child_process|exec|spawn/gi,
        type: 'injection' as const,
        severity: 'critical' as const,
        message: 'Process execution is prohibited'
      },
      {
        pattern: /setTimeout|setInterval/gi,
        type: 'injection' as const,
        severity: 'medium' as const,
        message: 'Timer functions can be dangerous if misused'
      }
    ];

    const lines = code.split('\n');

    securityPatterns.forEach(({ pattern, type, severity, message }) => {
      lines.forEach((line, index) => {
        const matches = line.match(pattern);
        if (matches) {
          matches.forEach(match => {
            issues.push({
              type,
              severity,
              message,
              line: index + 1,
              pattern: match
            });
          });
        }
      });
    });

    return issues;
  }

  /**
   * Validate middleware-specific requirements
   */
  private validateMiddleware(astInfo: ASTInfo, code: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Must be a valid middleware function
    if (!astInfo.hasExpectedSignature) {
      errors.push({
        type: 'structure',
        message: 'Function must have middleware signature: (req: Request, res: Response, next: NextFunction)',
        severity: 'error',
        suggestion: 'Ensure function takes exactly 3 parameters: req, res, next'
      });
    }

    // Must call next()
    if (!astInfo.callsNext) {
      errors.push({
        type: 'structure',
        message: 'Middleware must call next() to continue the chain',
        severity: 'error',
        suggestion: 'Add next() call at the end of your function'
      });
    }

    // Must export the function
    if (astInfo.exports.length === 0) {
      errors.push({
        type: 'structure',
        message: 'Function must be exported',
        severity: 'error',
        suggestion: 'Add "export" keyword before function declaration'
      });
    }

    // Should have error handling
    if (!code.includes('try') && !code.includes('catch')) {
      errors.push({
        type: 'structure',
        message: 'Middleware should include error handling (try/catch)',
        severity: 'warning' as any,
        suggestion: 'Wrap middleware logic in try/catch block'
      });
    }

    return errors;
  }

  /**
   * Validate against custom rules
   */
  private validateCustomRules(code: string): { errors: ValidationError[]; warnings: any[] } {
    const errors: ValidationError[] = [];
    const warnings: any[] = [];

    for (const rule of this.customRules) {
      const pattern = typeof rule.pattern === 'string' ? new RegExp(rule.pattern, 'gi') : rule.pattern;

      if (pattern.test(code)) {
        const validation: ValidationError = {
          type: 'structure',
          message: rule.message,
          severity: rule.severity,
          suggestion: rule.suggestion
        };

        if (rule.severity === 'error') {
          errors.push(validation);
        } else {
          warnings.push(validation);
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Quick validation check (syntax only)
   */
  async quickValidate(code: string): Promise<boolean> {
    try {
      const syntaxResult = this.validateSyntax(code);
      return syntaxResult.errors.length === 0;
    } catch {
      return false;
    }
  }
}

/**
 * Default security rules for generated middleware
 */
export const DEFAULT_SECURITY_RULES: ValidationRule[] = [
  {
    id: 'no-console-log',
    name: 'Limit console usage',
    pattern: /console\.log\(/gi,
    severity: 'warning',
    message: 'Consider using structured logging instead of console.log',
    suggestion: 'Use a proper logging library'
  },
  {
    id: 'require-error-handling',
    name: 'Error handling required',
    pattern: /^(?!.*try.*catch).*$/s,
    severity: 'warning',
    message: 'Middleware should include error handling',
    suggestion: 'Add try/catch block around middleware logic'
  }
];

/**
 * Factory function for creating validator with common configurations
 */
export function createValidator(strictMode: boolean = true): CodeValidator {
  const rules = strictMode ? DEFAULT_SECURITY_RULES : [];
  return new CodeValidator(rules);
}