"use strict";
// src/services/SystemAutoHealer.ts
// Executes operator-configured shell commands as a self-healing action when
// the AI sentinel detects a critical subnet condition.
// Uses Node's built-in child_process.exec — no external dependencies.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemAutoHealer = void 0;
const node_child_process_1 = require("node:child_process");
// ── Exec Options ─────────────────────────────────────────────────────────────
/** Abort the heal command if it has not exited within 30 seconds. */
const EXEC_TIMEOUT_MS = 30_000;
/** 1 MiB output buffer — sufficient for typical service-manager output (e.g. systemctl). */
const EXEC_MAX_BUFFER = 1_048_576;
/**
 * SystemAutoHealer — Runs a shell command and reports its outcome.
 *
 * Design principles:
 *   - Single Responsibility: only executes the command and logs its I/O.
 *   - Never throws: all error paths are handled and resolve to false.
 *   - stdout is logged at INFO level (normal operational output).
 *   - stderr is logged at WARN level (may contain warnings even on success).
 *   - A non-zero exit code or spawn failure is logged at ERROR level.
 *
 * Security note (shell injection):
 *   The command string is passed verbatim to the OS shell (/bin/sh -c on Unix).
 *   Operators are responsible for ensuring AUTO_HEAL_COMMAND is trusted and
 *   does not contain shell injection vectors. The sentinel should run under a
 *   dedicated system user with the minimum required permissions.
 *   execFile is not used because the heal command is a complete shell string,
 *   not a discrete executable + arguments pair.
 */
class SystemAutoHealer {
    logger;
    constructor(logger) {
        this.logger = logger.child({ component: 'auto-healer' });
    }
    /**
     * Execute `command` in the system shell and return whether it succeeded.
     *
     * Lifecycle:
     *   1. Log the command at WARN level (healing implies something is wrong).
     *   2. Spawn the process via child_process.exec with timeout + maxBuffer guards.
     *   3. On exit:
     *      a. Log non-empty stdout at INFO level.
     *      b. Log non-empty stderr at WARN level.
     *      c. If error (non-zero exit, spawn failure, or timeout): log at ERROR, return false.
     *      d. If success (exit 0): log confirmation at INFO, return true.
     *
     * @param command - Shell command to execute (e.g. "systemctl restart avalanchego")
     * @returns Promise<true>  — command exited with code 0
     *          Promise<false> — any failure (spawn, non-zero exit, timeout, unexpected error)
     */
    async attemptHeal(command) {
        this.logger.warn('auto_heal_executing', { command });
        return new Promise((resolve) => {
            (0, node_child_process_1.exec)(command, { timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER }, (error, stdout, stderr) => {
                // Log stdout and stderr regardless of exit status.
                // Trim to avoid logging empty lines.
                const trimmedOut = stdout.trim();
                const trimmedErr = stderr.trim();
                if (trimmedOut.length > 0) {
                    this.logger.info('auto_heal_stdout', { output: trimmedOut });
                }
                if (trimmedErr.length > 0) {
                    this.logger.warn('auto_heal_stderr', { output: trimmedErr });
                }
                if (error !== null) {
                    // error.code is the exit code (number | undefined) for exit failures,
                    // or undefined for spawn errors (e.g. command not found) and timeouts.
                    this.logger.error('auto_heal_failed', {
                        command,
                        exitCode: error.code ?? null,
                        error: error.message,
                    });
                    resolve(false);
                }
                else {
                    this.logger.info('auto_heal_succeeded', { command });
                    resolve(true);
                }
            });
        });
    }
}
exports.SystemAutoHealer = SystemAutoHealer;
//# sourceMappingURL=SystemAutoHealer.js.map