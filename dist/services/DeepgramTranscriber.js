"use strict";
// src/services/DeepgramTranscriber.ts
// Transcribes audio buffers using the Deepgram pre-recorded audio API.
// Native fetch only — no Deepgram SDK dependency. Node.js >= 18.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepgramTranscriber = void 0;
// ── Deepgram API constants ────────────────────────────────────────────────────
/**
 * Pre-recorded audio endpoint with recommended query parameters:
 *   model=nova-2      — Latest high-accuracy model as of 2025.
 *   smart_format=true — Auto-formats numbers, dates, currencies in the transcript.
 */
const DEEPGRAM_LISTEN_URL = 'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true';
/** Per-request timeout. Deepgram typically responds within 2–5s for short clips. */
const DEEPGRAM_TIMEOUT_MS = 20_000;
// ── DeepgramTranscriber ───────────────────────────────────────────────────────
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
class DeepgramTranscriber {
    apiKey;
    logger;
    /**
     * @param apiKey — Deepgram API key (from DEEPGRAM_API_KEY env variable).
     * @param logger — Parent logger; child is prefixed with component='deepgram-transcriber'.
     */
    constructor(apiKey, logger) {
        this.apiKey = apiKey;
        this.logger = logger.child({ component: 'deepgram-transcriber' });
    }
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
    async transcribe(audio, contentType) {
        try {
            const response = await fetch(DEEPGRAM_LISTEN_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${this.apiKey}`,
                    'Content-Type': contentType,
                },
                body: audio,
                signal: AbortSignal.timeout(DEEPGRAM_TIMEOUT_MS),
            });
            if (!response.ok) {
                this.logger.warn('deepgram_http_error', {
                    status: response.status,
                    statusText: response.statusText,
                });
                return null;
            }
            const data = await response.json();
            const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
            if (transcript.trim() === '') {
                this.logger.info('deepgram_empty_transcript', { bytes: audio.byteLength });
                return null;
            }
            this.logger.info('deepgram_transcription_complete', {
                bytes: audio.byteLength,
                transcriptLength: transcript.length,
            });
            return transcript;
        }
        catch (err) {
            this.logger.warn('deepgram_transcription_failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return null;
        }
    }
}
exports.DeepgramTranscriber = DeepgramTranscriber;
//# sourceMappingURL=DeepgramTranscriber.js.map