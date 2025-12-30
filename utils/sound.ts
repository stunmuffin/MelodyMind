import { InstrumentType } from '../types';

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let destNode: MediaStreamAudioDestinationNode | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5; // Master volume
    
    // Create destination for recording
    destNode = audioCtx.createMediaStreamDestination();
    
    // Route Master -> Speakers AND Recorder
    masterGain.connect(audioCtx.destination);
    masterGain.connect(destNode);
  }
  return { ctx: audioCtx, master: masterGain! };
};

export const startRecording = () => {
  const { ctx } = initAudio();
  if (ctx.state === 'suspended') ctx.resume();
  
  if (destNode) {
    audioChunks = [];
    // Try to use a standard mime type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'; 
    mediaRecorder = new MediaRecorder(destNode.stream, { mimeType });
    
    mediaRecorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) {
        audioChunks.push(evt.data);
      }
    };
    
    mediaRecorder.start();
    return true;
  }
  return false;
};

export const stopRecording = async (): Promise<string | null> => {
  return new Promise((resolve) => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        resolve(url);
      };
      mediaRecorder.stop();
    } else {
      resolve(null);
    }
  });
};

export const playNote = (
  semitoneIndex: number, 
  instrument: InstrumentType = 'piano', 
  vibrato: boolean = false,
  vibratoDepth: number = 0.5
) => {
  try {
    const { ctx, master } = initAudio();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const now = ctx.currentTime;

    // C3 is MIDI 48. 
    const midiNote = 48 + semitoneIndex;
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);

    oscillator.frequency.setValueAtTime(frequency, now);

    // --- Vibrato Logic ---
    if (vibrato) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 6; // 6 Hz LFO
      
      const lfoGain = ctx.createGain();
      // Map 0-1 depth to 0-20Hz deviation
      lfoGain.gain.value = vibratoDepth * 20; 
      
      lfo.connect(lfoGain);
      lfoGain.connect(oscillator.frequency);
      
      lfo.start(now);
      lfo.stop(now + 2.0);
    }

    if (instrument === 'guitar') {
      oscillator.type = 'sawtooth';
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, now); 
      filter.frequency.exponentialRampToValueAtTime(500, now + 0.2); 
      
      oscillator.connect(filter);
      filter.connect(gainNode);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    } else if (instrument === 'synth') {
      oscillator.type = 'square';
      oscillator.connect(gainNode);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    } else if (instrument === '8-bit') {
      oscillator.type = 'square';
      oscillator.connect(gainNode);
      
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.setValueAtTime(0.1, now + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.3); 
    } else if (instrument === 'violin' || instrument === 'cello') {
      oscillator.type = 'sawtooth';
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1;
      filter.frequency.value = instrument === 'violin' ? 2000 : 800;

      oscillator.connect(filter);
      filter.connect(gainNode);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.3); // Slower attack
      gainNode.gain.linearRampToValueAtTime(0, now + 1.0);
    } else if (instrument === 'flute') {
      oscillator.type = 'triangle'; 
      
      oscillator.connect(gainNode);
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1); 
      gainNode.gain.linearRampToValueAtTime(0, now + 0.8);
    } else if (instrument === 'harp') {
      oscillator.type = 'triangle';
      oscillator.connect(gainNode);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02); 
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.0); 
    } else if (instrument === 'marimba') {
      oscillator.type = 'sine';
      oscillator.connect(gainNode);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.5, now + 0.01); 
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4); 
    } else if (instrument === 'organ') {
      oscillator.type = 'sawtooth';
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1500, now);

      oscillator.connect(filter);
      filter.connect(gainNode);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gainNode.gain.setValueAtTime(0.2, now + 0.8); // Sustain
      gainNode.gain.linearRampToValueAtTime(0, now + 1.0); // Quick release
    } else {
      // Piano (Default)
      oscillator.type = 'triangle';
      oscillator.connect(gainNode);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    }

    gainNode.connect(master);

    oscillator.start();
    oscillator.stop(now + (instrument === 'violin' || instrument === 'cello' ? 1.5 : 2.0));
  } catch (e) {
    console.error("Audio playback failed", e);
  }
};

export const playUiClick = () => {
  try {
    const { ctx, master } = initAudio();
    if (ctx.state === 'suspended') ctx.resume();

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);

    oscillator.connect(gainNode);
    gainNode.connect(master);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.05);
  } catch (e) {
     // Ignore audio errors silently
  }
};