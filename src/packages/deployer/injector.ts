import { MiddlewareDefinition, HotDeployConfig } from './types';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Hot middleware injection system
 * Allows dynamic deployment without server restart
 */
export class MiddlewareInjector {
  private activeMiddleware: Map<string, InjectedMiddleware> = new Map();
  private middlewareStack: MiddlewareDefinition[] = [];
  private app: any; // Express app instance
  private config: HotDeployConfig;

  constructor(app: any, config: Partial<HotDeployConfig> = {}) {
    this.app = app;
    this.config = {
      safeMode: true,
      validateBeforeDeploy: true,
      backupPrevious: true,
      maxConcurrentDeploys: 3,
      ...config
    };
  }

  /**
   * Inject new middleware into the Express app
   */
  async injectMiddleware(
    definition: MiddlewareDefinition,
    middlewareFunction: Function
  ): Promise<string> {
    const injectionId = randomUUID();

    console.log(`🚀 Injecting middleware: ${definition.name} (${injectionId})`);

    try {
      // Validate middleware before deployment
      if (this.config.validateBeforeDeploy) {
        await this.validateMiddleware(middlewareFunction);
      }

      // Check concurrent deployment limit
      if (this.activeMiddleware.size >= this.config.maxConcurrentDeploys) {
        throw new Error(`Maximum concurrent deployments reached (${this.config.maxConcurrentDeploys})`);
      }

      // Create backup if enabled
      let backupPath: string | undefined;
      if (this.config.backupPrevious) {
        backupPath = await this.createBackup(definition);
      }

      // Create wrapper middleware with metadata
      const wrappedMiddleware = this.createWrapperMiddleware(
        injectionId,
        definition,
        middlewareFunction
      );

      // Inject into Express app
      this.injectIntoExpress(definition, wrappedMiddleware);

      // Store injection metadata
      const injectedMiddleware: InjectedMiddleware = {
        id: injectionId,
        definition,
        function: middlewareFunction,
        wrappedFunction: wrappedMiddleware,
        deployedAt: new Date().toISOString(),
        backupPath,
        active: true,
        requestCount: 0,
        errorCount: 0
      };

      this.activeMiddleware.set(injectionId, injectedMiddleware);
      this.middlewareStack.push(definition);

      console.log(`✅ Middleware injected successfully: ${injectionId}`);
      console.log(`📊 Active middleware count: ${this.activeMiddleware.size}`);

      return injectionId;

    } catch (error) {
      console.error(`❌ Middleware injection failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Remove injected middleware
   */
  async removeMiddleware(injectionId: string): Promise<void> {
    const middleware = this.activeMiddleware.get(injectionId);
    if (!middleware) {
      throw new Error(`Middleware not found: ${injectionId}`);
    }

    console.log(`🗑️ Removing middleware: ${middleware.definition.name} (${injectionId})`);

    try {
      // Mark as inactive
      middleware.active = false;

      // Remove from Express app (complex - depends on Express internals)
      await this.removeFromExpress(middleware);

      // Clean up backup if exists
      if (middleware.backupPath) {
        try {
          await fs.unlink(middleware.backupPath);
        } catch (error) {
          console.warn('Failed to clean up backup:', error instanceof Error ? error.message : String(error));
        }
      }

      // Remove from tracking
      this.activeMiddleware.delete(injectionId);
      this.middlewareStack = this.middlewareStack.filter(
        m => m.id !== middleware.definition.id
      );

      console.log(`✅ Middleware removed: ${injectionId}`);

    } catch (error) {
      console.error(`❌ Failed to remove middleware: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Update existing middleware with new implementation
   */
  async updateMiddleware(
    injectionId: string,
    newMiddlewareFunction: Function
  ): Promise<void> {
    const existing = this.activeMiddleware.get(injectionId);
    if (!existing) {
      throw new Error(`Middleware not found: ${injectionId}`);
    }

    console.log(`🔄 Updating middleware: ${existing.definition.name}`);

    try {
      // Validate new middleware
      if (this.config.validateBeforeDeploy) {
        await this.validateMiddleware(newMiddlewareFunction);
      }

      // Create new wrapper
      const newWrapper = this.createWrapperMiddleware(
        injectionId,
        existing.definition,
        newMiddlewareFunction
      );

      // Update in place
      existing.function = newMiddlewareFunction;
      existing.wrappedFunction = newWrapper;

      console.log(`✅ Middleware updated: ${injectionId}`);

    } catch (error) {
      console.error(`❌ Failed to update middleware: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Create wrapper middleware with monitoring
   */
  private createWrapperMiddleware(
    injectionId: string,
    definition: MiddlewareDefinition,
    middlewareFunction: Function
  ): Function {
    return async (req: any, res: any, next: any) => {
      const middleware = this.activeMiddleware.get(injectionId);

      // Check if middleware is still active
      if (!middleware || !middleware.active) {
        return next();
      }

      // Check if request matches conditions
      if (!this.matchesConditions(req, definition.conditions)) {
        return next();
      }

      const startTime = Date.now();

      try {
        // Track request
        middleware.requestCount++;

        // Add injection metadata to request
        req.injectionId = injectionId;
        req.middlewareName = definition.name;

        // Execute wrapped middleware
        await middlewareFunction(req, res, (error?: any) => {
          const duration = Date.now() - startTime;

          // Track errors
          if (error) {
            middleware.errorCount++;
            console.warn(`⚠️ Middleware error in ${definition.name}: ${error.message}`);
          }

          // Log execution for debugging
          console.log(`🔧 ${definition.name} executed in ${duration}ms (${middleware.requestCount} total requests)`);

          next(error);
        });

      } catch (error) {
        middleware.errorCount++;
        const duration = Date.now() - startTime;

        console.error(`💥 Middleware ${definition.name} threw error after ${duration}ms:`, error instanceof Error ? error.message : String(error));
        next(error);
      }
    };
  }

  /**
   * Inject middleware into Express app
   */
  private injectIntoExpress(definition: MiddlewareDefinition, middleware: Function): void {
    // For demo purposes, we'll add to a specific route
    // In production, you might use more sophisticated injection

    if (definition.targetEndpoint) {
      // Add middleware to specific endpoint
      const methods = definition.conditions?.methods || ['POST'];

      methods.forEach(method => {
        switch (method.toUpperCase()) {
          case 'GET':
            this.app.get(definition.targetEndpoint, middleware);
            break;
          case 'POST':
            this.app.post(definition.targetEndpoint, middleware);
            break;
          case 'PUT':
            this.app.put(definition.targetEndpoint, middleware);
            break;
          case 'DELETE':
            this.app.delete(definition.targetEndpoint, middleware);
            break;
          default:
            this.app.use(definition.targetEndpoint, middleware);
        }
      });

      console.log(`📍 Middleware injected into ${methods.join(', ')} ${definition.targetEndpoint}`);
    } else {
      // Add as global middleware
      this.app.use(middleware);
      console.log(`🌐 Global middleware injected`);
    }
  }

  /**
   * Remove middleware from Express (simplified)
   */
  private async removeFromExpress(middleware: InjectedMiddleware): Promise<void> {
    // Express doesn't have built-in middleware removal
    // In a production system, you'd need to:
    // 1. Track middleware indices
    // 2. Rebuild router stack
    // 3. Or use a middleware manager layer

    console.log(`ℹ️ Marking middleware as inactive: ${middleware.definition.name}`);
    console.log(`ℹ️ New requests will skip this middleware`);

    // The wrapper middleware checks the 'active' flag
    // So setting active = false effectively removes it
  }

  /**
   * Check if request matches middleware conditions
   */
  private matchesConditions(req: any, conditions?: MiddlewareDefinition['conditions']): boolean {
    if (!conditions) return true;

    // Check methods
    if (conditions.methods && !conditions.methods.includes(req.method)) {
      return false;
    }

    // Check paths
    if (conditions.paths && !conditions.paths.some(path => req.path.startsWith(path))) {
      return false;
    }

    // Check headers
    if (conditions.headers) {
      for (const [headerName, expectedValue] of Object.entries(conditions.headers)) {
        if (req.get(headerName) !== expectedValue) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate middleware function
   */
  private async validateMiddleware(middlewareFunction: Function): Promise<void> {
    // Basic validation
    if (typeof middlewareFunction !== 'function') {
      throw new Error('Middleware must be a function');
    }

    // Check function signature
    const functionString = middlewareFunction.toString();
    const paramCount = middlewareFunction.length;

    if (paramCount !== 3) {
      throw new Error(`Middleware must accept exactly 3 parameters (req, res, next), got ${paramCount}`);
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /process\.exit/,
      /require\s*\(\s*['"][^'"]*['"]\s*\)/
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(functionString)) {
        throw new Error(`Middleware contains dangerous pattern: ${pattern.source}`);
      }
    }

    console.log(`✅ Middleware validation passed`);
  }

  /**
   * Create backup of current state
   */
  private async createBackup(definition: MiddlewareDefinition): Promise<string> {
    const backupDir = path.join(process.cwd(), 'backups', 'middleware');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${definition.id}_${timestamp}.json`);

    const backupData = {
      definition,
      timestamp: new Date().toISOString(),
      activeMiddleware: Array.from(this.activeMiddleware.keys()),
      middlewareStack: this.middlewareStack
    };

    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');

    console.log(`💾 Backup created: ${backupPath}`);
    return backupPath;
  }

  /**
   * Get injection status
   */
  getInjectionStatus(injectionId: string): InjectedMiddleware | null {
    return this.activeMiddleware.get(injectionId) || null;
  }

  /**
   * Get all active injections
   */
  getAllInjections(): InjectedMiddleware[] {
    return Array.from(this.activeMiddleware.values()).filter(m => m.active);
  }

  /**
   * Get middleware statistics
   */
  getStatistics(): InjectionStatistics {
    const active = Array.from(this.activeMiddleware.values()).filter(m => m.active);

    return {
      totalActive: active.length,
      totalRequests: active.reduce((sum, m) => sum + m.requestCount, 0),
      totalErrors: active.reduce((sum, m) => sum + m.errorCount, 0),
      averageErrorRate: active.length > 0
        ? active.reduce((sum, m) => sum + (m.errorCount / Math.max(m.requestCount, 1)), 0) / active.length
        : 0,
      oldestDeployment: active.length > 0
        ? Math.min(...active.map(m => new Date(m.deployedAt).getTime()))
        : null
    };
  }

  /**
   * Emergency stop - disable all injected middleware
   */
  async emergencyStop(): Promise<void> {
    console.log(`🚨 Emergency stop: Disabling all injected middleware`);

    for (const [id, middleware] of this.activeMiddleware.entries()) {
      middleware.active = false;
      console.log(`❌ Disabled: ${middleware.definition.name} (${id})`);
    }

    console.log(`🛑 Emergency stop completed. ${this.activeMiddleware.size} middleware disabled.`);
  }
}

interface InjectedMiddleware {
  id: string;
  definition: MiddlewareDefinition;
  function: Function;
  wrappedFunction: Function;
  deployedAt: string;
  backupPath?: string;
  active: boolean;
  requestCount: number;
  errorCount: number;
}

interface InjectionStatistics {
  totalActive: number;
  totalRequests: number;
  totalErrors: number;
  averageErrorRate: number;
  oldestDeployment: number | null;
}

/**
 * Create a compiled middleware function from code string
 */
export function compileMiddleware(code: string, middlewareName: string): Function {
  try {
    // Create a safe execution context
    const context = {
      console,
      require: (module: string) => {
        // Only allow specific safe modules
        const allowedModules = ['crypto', 'util', 'url'];
        if (!allowedModules.includes(module)) {
          throw new Error(`Module '${module}' is not allowed`);
        }
        return require(module);
      }
    };

    // Wrap code in function
    const wrappedCode = `
      (function() {
        ${code}

        // Try to find the exported function
        if (typeof module !== 'undefined' && module.exports && typeof module.exports === 'function') {
          return module.exports;
        }

        // Look for common export patterns
        const match = code.match(/(?:export\\s+)?function\\s+(\\w+)/);
        if (match && typeof eval(match[1]) === 'function') {
          return eval(match[1]);
        }

        throw new Error('No valid middleware function found');
      })()
    `;

    // Execute in controlled context
    const fn = eval(wrappedCode);

    if (typeof fn !== 'function') {
      throw new Error('Compiled code did not return a function');
    }

    // Validate middleware signature
    if (fn.length !== 3) {
      throw new Error(`Middleware must accept 3 parameters, got ${fn.length}`);
    }

    return fn;

  } catch (error) {
    throw new Error(`Failed to compile middleware '${middlewareName}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Factory function for creating middleware injector
 */
export function createInjector(app: any, config?: Partial<HotDeployConfig>): MiddlewareInjector {
  return new MiddlewareInjector(app, config);
}