"use strict";
// src/types/enums.ts
// Verbatim from ARCHITECTURE.md Section 6.1
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMING = exports.FAILURE_THRESHOLDS = exports.AlertSeverity = exports.SourceStatus = exports.LogLevel = void 0;
/** Log severity levels */
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
/** Health status of a data source within a snapshot */
var SourceStatus;
(function (SourceStatus) {
    SourceStatus["CURRENT"] = "current";
    SourceStatus["STALE"] = "stale";
    SourceStatus["UNKNOWN"] = "unknown";
})(SourceStatus || (exports.SourceStatus = SourceStatus = {}));
/** Alert severity derived from consecutive failure count */
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["NONE"] = "none";
    AlertSeverity["WARNING"] = "warning";
    AlertSeverity["CRITICAL"] = "critical";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
/** Failure thresholds — centralized, not magic numbers */
exports.FAILURE_THRESHOLDS = {
    WARN_AFTER: 3,
    ERROR_AFTER: 10,
};
/** Timing constants (milliseconds) */
exports.TIMING = {
    TICK_INTERVAL_MS: 10_000,
    SOURCE_TIMEOUT_MS: 5_000,
    RPC_RETRY_COUNT: 3,
    RPC_RETRY_BASE_MS: 500,
};
//# sourceMappingURL=enums.js.map