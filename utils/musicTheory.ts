import { NoteName, ScaleDefinition, ChordDefinition } from '../types';

export const NOTES: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const SCALES: ScaleDefinition[] = [
  { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
  { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] }, // Hexatonic
  { name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9] },
  { name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10] },
];

export const CHORDS: ChordDefinition[] = [
  { name: 'Major', intervals: [0, 4, 7] },
  { name: 'Minor', intervals: [0, 3, 7] },
  { name: 'Diminished', intervals: [0, 3, 6] },
  { name: 'Augmented', intervals: [0, 4, 8] },
  { name: 'Major 7', intervals: [0, 4, 7, 11] },
  { name: 'Minor 7', intervals: [0, 3, 7, 10] },
  { name: 'Dominant 7', intervals: [0, 4, 7, 10] },
  { name: 'Half Diminished 7', intervals: [0, 3, 6, 10] },
  { name: 'Diminished 7', intervals: [0, 3, 6, 9] },
];

export const getActiveNotes = (root: NoteName, intervals: number[]): number[] => {
  const rootIndex = NOTES.indexOf(root);
  return intervals.map(interval => (rootIndex + interval) % 12);
};

export const getNoteFromIndex = (index: number): NoteName => {
  return NOTES[index % 12];
};

export const isBlackKey = (note: NoteName): boolean => {
  return note.includes('#');
};
