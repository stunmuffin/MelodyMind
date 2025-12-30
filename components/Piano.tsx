import React, { useEffect, useRef, useState } from 'react';
import { NoteName, InstrumentType } from '../types';
import { NOTES, isBlackKey } from '../utils/musicTheory';
import { playNote } from '../utils/sound';

interface PianoProps {
  activeNotes: number[]; // Theory highlighted notes (blue)
  midiPressedKeys?: Set<number>; // Keys pressed via MIDI (visual feedback)
  playbackKeys?: Set<number>; // Keys active during auto-playback (visual feedback)
  arpActiveNote?: number | null; // Single note currently triggered by Arpeggiator
  rootNoteIndex: number;
  instrument: InstrumentType;
  onKeyPress?: (noteIndex: number) => void;
  isPlaying?: boolean;
  highlightRoot?: boolean; // Toggle distinctive color for root note
  showLabels?: boolean; // Toggle note text labels
  showScale?: boolean; // Toggle visibility of the scale/chord intervals
  vibratoEnabled?: boolean; // Toggle vibrato effect
  vibratoDepth?: number; // Vibrato intensity (0-1)
}

const Piano: React.FC<PianoProps> = ({ 
  activeNotes, 
  rootNoteIndex, 
  instrument, 
  onKeyPress, 
  midiPressedKeys, 
  playbackKeys,
  arpActiveNote,
  isPlaying,
  highlightRoot = true,
  showLabels = true,
  showScale = true,
  vibratoEnabled = false,
  vibratoDepth = 0.5
}) => {
  // Expanded Range for MIDI support
  const START_OCTAVE = 1; 
  const OCTAVES_TO_SHOW = 7; // Covers approx 84 keys (up to Octave 8)
  const TOTAL_KEYS = 12 * OCTAVES_TO_SHOW;
  
  const whiteKeyWidth = 40;
  const whiteKeyHeight = 160;
  const blackKeyWidth = 24;
  const blackKeyHeight = 100;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const autoScrollEnabledRef = useRef(true);

  // Track physically pressed keys (Mouse/Keyboard) for visual feedback
  const [localPressedKeys, setLocalPressedKeys] = useState<Set<number>>(new Set());

  // Keyboard mapping (mapped to middle octaves for typing comfort)
  const KEY_MAP: Record<string, number> = {
    'a': 36, 'w': 37, 's': 38, 'e': 39, 'd': 40, 'f': 41, 't': 42, // C4 range (index 36 relative to start octave 1)
    'g': 43, 'y': 44, 'h': 45, 'u': 46, 'j': 47, 'k': 48, 'o': 49, 'l': 50
  };

  // 1. Initial Center Scroll (Middle C)
  useEffect(() => {
    if (scrollContainerRef.current && !hasScrolledRef.current) {
        // C4 is at index 36 relative to start
        const middleOffset = (36 / 12) * 7 * whiteKeyWidth;
        const containerWidth = scrollContainerRef.current.clientWidth;
        scrollContainerRef.current.scrollLeft = middleOffset - (containerWidth / 2) + (whiteKeyWidth / 2);
        hasScrolledRef.current = true;
    }
  }, []);

  // 2. Reset Auto-Scroll when playback starts
  useEffect(() => {
    if (isPlaying) {
      autoScrollEnabledRef.current = true;
    }
  }, [isPlaying]);

  // 3. Smart Auto-Scroll Logic during playback (Only if out of view)
  useEffect(() => {
    if (
        isPlaying && 
        autoScrollEnabledRef.current && 
        playbackKeys && 
        playbackKeys.size > 0 && 
        scrollContainerRef.current
    ) {
        const keys = Array.from(playbackKeys);
        const avgIndex = keys.reduce((a, b) => a + b, 0) / keys.length;
        
        // Approximation: 12 semitones = 7 white keys.
        // We calculate the pixel position of the average key index.
        const centerPixel = (avgIndex / 12) * 7 * whiteKeyWidth;
        
        const container = scrollContainerRef.current;
        const scrollLeft = container.scrollLeft;
        const visibleWidth = container.clientWidth;
        
        // Define a "safe zone" margin (approx 2 keys width) from the edges.
        // If the note is within this margin or off-screen, we scroll.
        const margin = whiteKeyWidth * 2; 

        const isOutOfViewLeft = centerPixel < (scrollLeft + margin);
        const isOutOfViewRight = centerPixel > (scrollLeft + visibleWidth - margin);

        if (isOutOfViewLeft || isOutOfViewRight) {
             const halfWidth = visibleWidth / 2;
             container.scrollTo({
                left: centerPixel - halfWidth + (whiteKeyWidth / 2),
                behavior: 'smooth'
            });
        }
    }
  }, [playbackKeys, isPlaying]);

  const handleManualScrollInteraction = () => {
      // If the user manually interacts with the scroll container (wheel or touch), disable auto-scroll
      if (isPlaying) {
          autoScrollEnabledRef.current = false;
      }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // Prevent spamming sound on hold
      const key = e.key.toLowerCase();
      if (KEY_MAP.hasOwnProperty(key)) {
        const noteIndex = KEY_MAP[key];
        // Only trigger if not already pressed locally
        if (!localPressedKeys.has(noteIndex)) {
          playNote(noteIndex, instrument, vibratoEnabled, vibratoDepth);
          setLocalPressedKeys(prev => {
              const newSet = new Set(prev);
              newSet.add(noteIndex);
              return newSet;
          });
          if (onKeyPress) onKeyPress(noteIndex);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (KEY_MAP.hasOwnProperty(key)) {
         const noteIndex = KEY_MAP[key];
         setLocalPressedKeys(prev => {
             const newSet = new Set(prev);
             newSet.delete(noteIndex);
             return newSet;
         });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [instrument, localPressedKeys, onKeyPress, vibratoEnabled, vibratoDepth]);

  const keys: React.ReactNode[] = [];
  let whiteKeyCounter = 0;

  const renderKey = (i: number, isBlack: boolean) => {
    const currentNoteIndex = i % 12;
    const noteName = NOTES[currentNoteIndex];
    
    // Check various states
    const isTheoryActive = activeNotes.includes(currentNoteIndex); // Part of scale/chord
    const isRoot = currentNoteIndex === rootNoteIndex;
    const isPressedLocal = localPressedKeys.has(i);
    const isPressedMidi = midiPressedKeys?.has(i);
    const isPlaybackActive = playbackKeys?.has(i);
    const isArpActive = arpActiveNote === i;
    
    const isPressed = isPressedLocal || isPressedMidi || isPlaybackActive || isArpActive;

    // Determine visual style
    let fill = isBlack ? 'url(#grad-black)' : 'url(#grad-white)';
    
    // Override fill if active/pressed
    // Priority: Pressed/Arp > Root (if enabled) > Scale (if enabled)
    if (isArpActive) {
      fill = '#f43f5e'; // Rose color for Arpeggiator
    } else if (isPressed) {
      fill = isBlack ? '#4f46e5' : '#818cf8'; // Indigo press
    } else if (isRoot && highlightRoot) {
      fill = isBlack ? '#7c3aed' : '#a78bfa'; // Violet root
    } else if (isTheoryActive && showScale) {
      fill = isBlack ? '#9333ea' : '#c084fc'; // Purple active
    }

    if (isBlack) {
      // Logic for Black Key positioning
      const offsetMap:Record<number, number> = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
      const relativeWhiteIndex = offsetMap[currentNoteIndex];
      const octaveOffset = Math.floor(i / 12) * 7; 
      const finalWhiteIndex = octaveOffset + relativeWhiteIndex;
      const x = (finalWhiteIndex * whiteKeyWidth) + (whiteKeyWidth - (blackKeyWidth / 2));

      return (
        <g key={`black-${i}`} className="z-10 filter drop-shadow-md">
           <rect
            x={x}
            y={0}
            width={blackKeyWidth}
            height={blackKeyHeight}
            fill={fill}
            stroke={isPressed ? '#312e81' : '#1f2937'}
            strokeWidth={1}
            onClick={() => { playNote(i, instrument, vibratoEnabled, vibratoDepth); if (onKeyPress) onKeyPress(i); }}
            className="cursor-pointer transition-all duration-75"
            rx={3} // Rounded corners
            ry={3}
          />
          {showLabels && (
            <text 
              x={x + blackKeyWidth / 2} 
              y={blackKeyHeight - 12} 
              textAnchor="middle" 
              className="text-[10px] font-bold fill-white pointer-events-none select-none drop-shadow-sm"
            >
              {noteName}
            </text>
          )}
        </g>
      );
    } else {
      // Logic for White Key positioning
      const x = whiteKeyCounter * whiteKeyWidth;
      whiteKeyCounter++;

      return (
        <g key={`white-${i}`}>
           <rect
            x={x}
            y={0}
            width={whiteKeyWidth}
            height={whiteKeyHeight}
            fill={fill}
            stroke={isPressed ? '#4338ca' : '#d1d5db'}
            strokeWidth={1}
            onClick={() => { playNote(i, instrument, vibratoEnabled, vibratoDepth); if (onKeyPress) onKeyPress(i); }}
            className="cursor-pointer transition-all duration-75"
            rx={4}
            ry={4}
          />
           {/* Visual "ledge" at bottom for 3D feel */}
           <rect 
             x={x + 2} 
             y={whiteKeyHeight - 8} 
             width={whiteKeyWidth - 4} 
             height={6} 
             rx={2}
             fill="black" 
             fillOpacity={0.1} 
             pointerEvents="none"
           />
           
           {showLabels && (
             <text 
                x={x + whiteKeyWidth / 2} 
                y={whiteKeyHeight - 20} 
                textAnchor="middle" 
                className={`text-[11px] font-bold pointer-events-none select-none ${isPressed || isTheoryActive && showScale ? 'fill-white' : 'fill-gray-600'}`}
              >
                  {noteName}{Math.floor(i/12) + START_OCTAVE}
              </text>
           )}
        </g>
      );
    }
  };

  // Build the array
  // 1. All White Keys
  for (let i = 0; i < TOTAL_KEYS; i++) {
    const currentNoteIndex = i % 12;
    if (!isBlackKey(NOTES[currentNoteIndex])) {
      keys.push(renderKey(i, false));
    }
  }
  // 2. All Black Keys (on top)
  for (let i = 0; i < TOTAL_KEYS; i++) {
    const currentNoteIndex = i % 12;
    if (isBlackKey(NOTES[currentNoteIndex])) {
      keys.push(renderKey(i, true));
    }
  }

  return (
    <div 
        ref={scrollContainerRef}
        onWheel={handleManualScrollInteraction}
        onTouchStart={handleManualScrollInteraction}
        className="flex justify-start p-6 bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl overflow-x-auto shadow-2xl select-none relative border-t-4 border-gray-700 custom-scrollbar"
    >
      {/* Felt strip visual */}
      <div className="absolute top-0 left-0 h-2 bg-red-900 shadow-inner z-0" style={{ width: whiteKeyCounter * whiteKeyWidth + 48 }}></div>
      
      <svg width={whiteKeyCounter * whiteKeyWidth} height={whiteKeyHeight} className="z-10 filter drop-shadow-xl flex-shrink-0">
        <defs>
          <linearGradient id="grad-white" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{stopColor:'white', stopOpacity:1}} />
            <stop offset="100%" style={{stopColor:'#f3f4f6', stopOpacity:1}} />
          </linearGradient>
           <linearGradient id="grad-black" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{stopColor:'#374151', stopOpacity:1}} />
            <stop offset="100%" style={{stopColor:'#111827', stopOpacity:1}} />
          </linearGradient>
        </defs>
        {keys}
      </svg>
    </div>
  );
};

export default Piano;