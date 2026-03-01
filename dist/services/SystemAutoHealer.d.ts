import type { IAutoHealer } from '../interfaces/IAutoHealer.js';
import type { ILogger } from '../interfaces/ILogger.js';
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
export declare class SystemAutoHealer implements IAutoHealer {
    private readonly logger;
    constructor(logger: ILogger);
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
    attemptHeal(command: string): Promise<boolean>;
}
//# sourceMappingURL=SystemAutoHealer.d.ts.map