// A short "answered correctly" chime, exported as a playable audio source
// (a WAV data-URI) so it works with the useSound hook exactly like a real
// sound file would — no binary asset to ship, fully offline.
//
// The waveform is a bright three-note arpeggio (C6–E6–G6), synthesized into
// 16-bit PCM and base64-encoded once at module load.

function buildChimeDataURI() {
  const sampleRate = 44100;
  const duration = 0.55;                 // seconds
  const frameCount = Math.floor(sampleRate * duration);
  const samples = new Float32Array(frameCount);
  const notes = [1046.5, 1318.5, 1568.0]; // C6, E6, G6

  notes.forEach((freq, i) => {
    const start = Math.floor(i * 0.09 * sampleRate);
    for (let s = start; s < frameCount; s++) {
      const t = (s - start) / sampleRate;
      const env = Math.exp(-t * 6.5);     // quick exponential decay
      samples[s] += Math.sin(2 * Math.PI * freq * t) * env * 0.32;
    }
  });

  // 16-bit PCM, mono → WAV (44-byte header + samples).
  const bytesPerSample = 2;
  const dataSize = frameCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);              // block align
  view.setUint16(34, 16, true);          // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < frameCount; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, clamped * 0x7fff, true);
    off += bytesPerSample;
  }

  // ArrayBuffer → binary string → base64 (chunked to avoid call-stack limits).
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return 'data:audio/wav;base64,' + btoa(bin);
}

export const successChimeSound = buildChimeDataURI();
