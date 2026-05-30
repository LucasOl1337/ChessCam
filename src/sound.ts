/**
 * Chess sound feedback using Web Audio API.
 * No external assets. Classic move/capture/check/promote/game-over sounds.
 * Inspired by chess.com / lichess feel.
 */

type BrowserWindowWithLegacyAudio = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const AudioContextCtor =
  typeof window !== 'undefined'
    ? window.AudioContext || (window as BrowserWindowWithLegacyAudio).webkitAudioContext
    : undefined;

const audioCtx = AudioContextCtor ? new AudioContextCtor() : null;

export function playChessSound(
  type: 'move' | 'capture' | 'check' | 'gameover' | 'promote'
) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sine';
    filter.type = 'lowpass';
    filter.frequency.value = 1100;

    let freq = 440;
    let duration = 120;
    let vol = 0.22;

    switch (type) {
      case 'move':
        freq = 640;
        duration = 85;
        vol = 0.16;
        break;
      case 'capture':
        freq = 390;
        duration = 155;
        vol = 0.26;
        osc.type = 'sawtooth';
        break;
      case 'check':
        freq = 810;
        duration = 210;
        vol = 0.30;
        break;
      case 'promote':
        freq = 950;
        duration = 260;
        vol = 0.28;
        break;
      case 'gameover':
        freq = 540;
        duration = 380;
        vol = 0.32;
        break;
    }

    osc.frequency.value = freq;
    gain.gain.value = vol;
    gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + duration / 1000);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration / 1000 + 0.04);
  } catch {
    // Silent fail on restricted autoplay contexts
  }
}
