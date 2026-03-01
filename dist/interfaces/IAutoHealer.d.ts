/**
 * IAutoHealer — Auto-healing execution contract.
 *
 * Implementations run an operator-configured shell command (e.g. restarting the
 * validator node) and report whether it exited successfully.
 *
 * Contract:
 *   - attemptHeal() MUST NOT throw under any circumstance.
 *   - Returns true if the command exited with code 0.
 *   - Returns false on non-zero exit, spawn error, or any unexpected failure.
 *   - stdout/stderr are logged by the implementation; callers need not capture them.
 *   - The implementation is responsible for all internal error isolation.
 *
 * Usage:
 *   Injected into AiAnalysisService as an optional dependency.
 *   Invoked only when analysis.status === 'critical' AND
 *   IAiAnalysisConfig.autoHeal.enabled === true.
 */
export interface IAutoHealer {
    /**
     * Execute the given shell command and return its outcome.
     *
     * @param command - Shell command string passed verbatim to the OS shell.
     *                  e.g. "systemctl restart avalanchego"
     * @returns Promise<true>  — command exited with code 0 (success)
     *          Promise<false> — non-zero exit code, spawn error, or any other failure
     */
    attemptHeal(command: string): Promise<boolean>;
}
//# sourceMappingURL=IAutoHealer.d.ts.map