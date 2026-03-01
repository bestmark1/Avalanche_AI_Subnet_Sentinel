import type { ITranscriber } from '../interfaces/ITranscriber.js';
import type { ILogger } from '../interfaces/ILogger.js';
/**
 * DeepgramTranscriber — Converts raw audio bytes to text via Deepgram's API.
 *
 * Implements ITranscriber using native fetch (Node.js >= 18, no SDK).
 * The audio buffer is streamed directly as the POST body; Deepgram accepts
 * binary audio payloads when Content-Type is set to the correct MIME type.
 *
 * Error contract:
 *   - HTTP errors (4xx / 5xx) are logged and resolve to null.
 *   - Network errors and timeouts are caught and resolve to null.
 *   - An empty or absent transcript from Deepgram resolves to null.
 *   - Never throws — callers can safely fire-and-forget or await without
 *     extra error handling.
 */
export declare class DeepgramTranscriber implements ITranscriber {
    private readonly apiKey;
    private readonly logger;
    /**
     * @param apiKey — Deepgram API key (from DEEPGRAM_API_KEY env variable).
     * @param logger — Parent logger; child is prefixed with component='deepgram-transcriber'.
     */
    constructor(apiKey: string, logger: ILogger);
    /**
     * POST `audio` to the Deepgram listen endpoint and return the transcript.
     *
     * Flow:
     *   1. POST binary audio with Authorization and Content-Type headers.
     *   2. Assert HTTP 200; log and return null on any non-2xx response.
     *   3. Extract transcript from results.channels[0].alternatives[0].transcript.
     *   4. Return null if the transcript is absent or empty (e.g. silent audio).
     *
     * @param audio       — Raw audio bytes (e.g. downloaded from Telegram's file API).
     * @param contentType — MIME type matching the audio format (e.g. 'audio/ogg').
     * @returns Transcript text, or null on any failure or empty result.
     */
    transcribe(audio: ArrayBuffer, contentType: string): Promise<string | null>;
}
//# sourceMappingURL=DeepgramTranscriber.d.ts.map