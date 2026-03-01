// src/api/ExpressServer.ts
// Express.js API server — /health and /status endpoints.
// Accepts IStateStore, ILogger, and ServerConfig via constructor (DI).

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import type { IStateStore } from '../interfaces/IStateStore.js';
import type { ILogger } from '../interfaces/ILogger.js';

/**
 * ServerConfig — Narrow configuration contract for ExpressServer.
 *
 * Decoupled from AppConfig to satisfy Interface Segregation (Architect
 * critique #2). ExpressServer depends only on what it needs — not on
 * the entire application config tree.
 *
 * The `version` field is injected here instead of being hardcoded
 * in the /health endpoint, making it testable and configurable.
 */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly version: string;
}

/**
 * ExpressServer — Lightweight API Surface
 *
 * Exposes two GET-only endpoints for operational visibility:
 *
 *   GET /health  → 200 { status: "ok", uptime, version }
 *   GET /status  → 200 { snapshot, analysis } | 503 { error: "no_snapshot_available" }
 *
 * Design:
 *   - All dependencies injected via constructor (IStateStore, ILogger, ServerConfig)
 *   - Request logging at debug level (quiet by default for production)
 *   - Global error handler that never leaks stack traces
 *   - getApp() exposed for supertest integration testing
 *   - start()/stop() for lifecycle management during graceful shutdown
 *
 * SOLID:
 *   - Single Responsibility: Only HTTP request handling
 *   - Interface Segregation: Depends on ServerConfig, not AppConfig
 *   - Dependency Inversion: Depends on IStateStore/ILogger, not concrete classes
 *   - Open/Closed: New routes can be added without modifying existing ones
 */
export class ExpressServer {
  private readonly app: express.Application;
  private readonly store: IStateStore;
  private readonly logger: ILogger;
  private readonly config: ServerConfig;
  private server: Server | null = null;

  constructor(
    store: IStateStore,
    logger: ILogger,
    config: ServerConfig
  ) {
    this.store = store;
    this.logger = logger.child({ component: 'api-server' });
    this.config = config;

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandler();
  }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Starts the HTTP server on the configured host:port.
   * Resolves once the server is listening and ready to accept requests.
   */
  public start(): Promise<Server> {
    return new Promise<Server>((resolve) => {
      this.server = this.app.listen(
        this.config.port,
        this.config.host,
        () => {
          this.logger.info('api_listening', {
            port: this.config.port,
            host: this.config.host,
            version: this.config.version,
          });
          resolve(this.server!);
        }
      );
    });
  }

  /**
   * Gracefully closes the HTTP server.
   * In-flight requests are allowed to complete before shutdown.
   */
  public stop(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.logger.info('api_stopped');
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Returns the raw Express Application for supertest integration testing.
   * Does NOT start the server — supertest manages its own listener.
   */
  public getApp(): express.Application {
    return this.app;
  }

  // ── Middleware Setup ──────────────────────────────────────────

  private setupMiddleware(): void {
    // JSON body parser — good practice even for GET-only APIs
    // (prepares for future POST endpoints)
    this.app.use(express.json());

    // Request logging — fires after the response is sent
    this.app.use((req: Request, res: Response, next: NextFunction): void => {
      const startMs = Date.now();

      res.on('finish', () => {
        this.logger.debug('api_request', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - startMs,
        });
      });

      next();
    });
  }

  // ── Routes ───────────────────────────────────────────────────

  private setupRoutes(): void {
    // ── GET /health ──
    // Simple liveness probe. Always returns 200 if the process is running.
    // Suitable for Kubernetes liveness probes and load balancer health checks.
    // Version is injected via ServerConfig — not hardcoded.
    this.app.get('/health', (_req: Request, res: Response): void => {
      res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        version: this.config.version,
      });
    });

    // ── GET /status ──
    // Returns the latest SubnetSnapshot and most recent AnalysisResult.
    // 503 fires only when no snapshot has been collected yet (process still
    // initializing). analysis may be null independently if no LLM call has
    // completed — this is normal and not an error condition.
    this.app.get('/status', (_req: Request, res: Response): void => {
      const state = this.store.getLatestState();

      if (state.snapshot === null) {
        res.status(503).json({
          error: 'no_snapshot_available',
          message: 'Service is initializing. No snapshot has been collected yet.',
        });
        return;
      }

      res.status(200).json({
        snapshot: state.snapshot,
        analysis: state.analysis,
      });
    });
  }

  // ── Error Handler ────────────────────────────────────────────

  private setupErrorHandler(): void {
    // Express identifies error handlers by the 4-parameter signature.
    // _next is required for Express to recognize this as an error handler.
    this.app.use(
      (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
        this.logger.error('api_unhandled_error', {
          error: err.message,
        });
        res.status(500).json({
          error: 'internal_server_error',
        });
      }
    );
  }
}
