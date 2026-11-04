/**
 * Narration is stored in one of three shapes:
 *  - a remote URL (Firebase Storage download URL)
 *  - a data URL ("data:...;base64,<payload>")
 *  - bare base64 (Gemini TTS: raw 16-bit PCM, 24 kHz mono, or an encoded WAV/MP3)
 */
export function isRemoteAudio(audio: string): boolean {
  return /^https?:\/\//.test(audio);
}

const PCM_SAMPLE_RATE = 24000;

/** Turn stored base64 narration into a playable Blob, wrapping raw PCM in a WAV header. */
export function audioBlobFromBase64(base64: string): Blob {
  const payload = base64.startsWith('data:') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binaryString = window.atob(payload);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  if (binaryString.startsWith('RIFF')) {
    return new Blob([bytes], { type: 'audio/wav' });
  }
  if (binaryString.startsWith('ID3') || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) {
    return new Blob([bytes], { type: 'audio/mpeg' });
  }

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + len, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, PCM_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, len, true);
  const wavBytes = new Uint8Array(44 + len);
  wavBytes.set(new Uint8Array(header), 0);
  wavBytes.set(bytes, 44);
  return new Blob([wavBytes], { type: 'audio/wav' });
}
