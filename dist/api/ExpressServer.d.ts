import express from 'express';
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
export declare class ExpressServer {
    private readonly app;
    private readonly store;
    private readonly logger;
    private readonly config;
    private server;
    constructor(store: IStateStore, logger: ILogger, config: ServerConfig);
    /**
     * Starts the HTTP server on the configured host:port.
     * Resolves once the server is listening and ready to accept requests.
     */
    start(): Promise<Server>;
    /**
     * Gracefully closes the HTTP server.
     * In-flight requests are allowed to complete before shutdown.
     */
    stop(): Promise<void>;
    /**
     * Returns the raw Express Application for supertest integration testing.
     * Does NOT start the server — supertest manages its own listener.
     */
    getApp(): express.Application;
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandler;
}
//# sourceMappingURL=ExpressServer.d.ts.map