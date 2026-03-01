// src/interfaces/IMessenger.ts
// Narrow plain-text message delivery interface.
// Segregated from INotifier (structured AnalysisResult delivery) per ISP so
// that consumers needing only plain-text delivery (e.g. HealingCoordinator)
// do not depend on the wider notification interface.

/**
 * IMessenger — Plain-text and HTML message delivery contract.
 *
 * TelegramNotifier implements both INotifier and IMessenger via a shared
 * private post() helper. The composition root wires a single instance into
 * both roles.
 *
 * Segregation rationale:
 *   INotifier.sendAlert() takes a typed AnalysisResult and formats it.
 *   IMessenger.sendMessage() takes a pre-formatted string (e.g. heal status).
 *   These are distinct concerns; coupling them in one interface violates ISP.
 *
 * Contract:
 *   - Never throws — all errors are caught internally and resolved to false.
 *   - Returns true on successful delivery, false on any error.
 */
export interface IMessenger {
  /**
   * Send a pre-formatted plain-text or HTML string to the configured channel.
   *
   * @param text — Message body (plain text or HTML with channel-specific tags).
   * @returns true on successful delivery, false on any error.
   */
  sendMessage(text: string): Promise<boolean>;
}
