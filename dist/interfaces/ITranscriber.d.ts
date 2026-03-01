/**
 * ITranscriber — Audio transcription contract.
 *
 * Implemented by any service that converts a raw audio buffer into text
 * (Deepgram, Whisper, AssemblyAI, etc.).
 *
 * TelegramListener depends on this interface rather than the concrete
 * DeepgramTranscriber so that the transcription provider can be swapped
 * or mocked in tests without touching the listener.
 *
 * Contract:
 *   - Never throws — all errors are caught internally and resolved to null.
 *   - Returns the transcript string on success.
 *   - Returns null when transcription fails or produces empty output.
 *
 * @param audio       — Raw audio bytes as an ArrayBuffer.
 * @param contentType — MIME type of the audio (e.g. 'audio/ogg', 'audio/webm').
 */
export interface ITranscriber {
    transcribe(audio: ArrayBuffer, contentType: string): Promise<string | null>;
}
//# sourceMappingURL=ITranscriber.d.ts.map