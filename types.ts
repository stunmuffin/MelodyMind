
export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type InstrumentType = 'piano' | 'guitar' | 'synth' | '8-bit' | 'violin' | 'cello' | 'flute' | 'harp' | 'marimba' | 'organ';

export type ArpeggioPattern = 'up' | 'down' | 'up-down' | 'random';

export interface ScaleDefinition {
  name: string;
  intervals: number[];
}

export interface ChordDefinition {
  name: string;
  intervals: number[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface KeyState {
  note: NoteName;
  octave: number;
  isActive: boolean;
  isRoot: boolean;
  intervalName?: string;
}

export interface MelodyNote {
  noteName: string; // e.g., "C4", "F#3"
  duration: number; // in seconds
  startTime?: number; // Absolute start time in seconds (for MIDI/Polyphony)
  velocity?: number;
}

export interface UserPreset {
  id: string;
  name: string;
  rootNote: NoteName;
  mode: 'scale' | 'chord';
  selectedIndex: number;
  instrument: InstrumentType;
  melody?: MelodyNote[];
  timestamp: number;
  tempo?: number;
  transpose?: number;
}

export interface AppConfig {
    rootNote: NoteName;
    mode: 'scale' | 'chord';
    selectedIndex: number;
    instrument: InstrumentType;
    tempo: number;
    transpose: number;
    // Arp
    arpEnabled: boolean;
    arpRate: number;
    arpPattern: ArpeggioPattern;
    arpOctaves: number;
    // Effects
    vibratoEnabled: boolean;
    vibratoDepth: number;
    // Visuals
    showLabels: boolean;
    highlightRoot: boolean;
    showScale: boolean;
}

export interface SettingsProfile {
    id: string;
    name: string;
    config: AppConfig;
}