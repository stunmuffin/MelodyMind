import React, { useState, useRef, useEffect } from 'react';
import { 
  Music, Settings, MessageSquare, Mic, 
  Send, Loader2, Sparkles, Download, Volume2, 
  Save, Play, FolderOpen, StopCircle, Disc, 
  FileMusic, Scan, Trash2, Cable, Pause, Upload,
  Gauge, Plus, Minus, FileAudio, ChevronDown, ChevronUp, Eye, EyeOff, Waves, Type, Grid3x3,
  Activity, ArrowUp, ArrowDown, ArrowUpDown, Shuffle, AlertCircle, RotateCcw, Check, UserCog
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';
import { Midi } from '@tonejs/midi';

import Piano from './Piano';
import { NOTES, SCALES, CHORDS, getActiveNotes } from '../utils/musicTheory';
import { streamChatResponse, transcribeSheetMusic } from '../services/geminiService';
import { playUiClick, startRecording, stopRecording, playNote } from '../utils/sound';
import { initMidi } from '../utils/midi';
import { NoteName, ChatMessage, InstrumentType, UserPreset, MelodyNote, ArpeggioPattern, SettingsProfile, AppConfig } from '../types';

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const App = () => {
  // --- Theory State ---
  const [rootNote, setRootNote] = useState<NoteName>('C');
  const [mode, setMode] = useState<'scale' | 'chord'>('scale');
  const [selectedIndex, setSelectedIndex] = useState<number>(0); 
  const [instrument, setInstrument] = useState<InstrumentType>('piano');
  const [isRootSelectorOpen, setIsRootSelectorOpen] = useState(false);
  
  // Visual Settings (Now located above Piano)
  const [highlightRoot, setHighlightRoot] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showScale, setShowScale] = useState(true);
  const [vibratoEnabled, setVibratoEnabled] = useState(false);
  const [vibratoDepth, setVibratoDepth] = useState(0.5);

  // --- Arpeggiator State ---
  const [arpEnabled, setArpEnabled] = useState(false);
  const [arpRate, setArpRate] = useState<number>(150); // ms per step
  const [arpPattern, setArpPattern] = useState<ArpeggioPattern>('up');
  const [arpOctaves, setArpOctaves] = useState<number>(1);
  const [arpActiveNote, setArpActiveNote] = useState<number | null>(null); // For visualization
  const [showArpControls, setShowArpControls] = useState(false);

  // --- Chat State ---
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // --- Studio State (Recording, AI Melody, Saves) ---
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  
  // --- Settings State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [restoreOnStartup, setRestoreOnStartup] = useState(true);
  const [settingsProfiles, setSettingsProfiles] = useState<SettingsProfile[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  
  // Melody / Sheet Music / MIDI Player States
  const [transcribingSheet, setTranscribingSheet] = useState(false);
  const [currentMelody, setCurrentMelody] = useState<MelodyNote[]>([]);
  
  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // Current time in seconds
  const [duration, setDuration] = useState(0); // Total duration in seconds
  const [tempo, setTempo] = useState<number>(1.0);
  const [transpose, setTranspose] = useState<number>(0);
  const [currentPitch, setCurrentPitch] = useState<string>('-');
  const [playbackKeys, setPlaybackKeys] = useState<Set<number>>(new Set());
  
  // Auto-Save State
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isFirstRender = useRef(true);

  // Refs for Playback Engine
  const progressRef = useRef(0);
  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const nextNoteIndexRef = useRef(0);
  const vibratoRef = useRef(vibratoEnabled);
  const vibratoDepthRef = useRef(vibratoDepth);
  
  // Refs for Arpeggiator Engine
  const arpIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heldMidiKeysRef = useRef<Set<number>>(new Set());
  const arpStepRef = useRef(0);
  const arpSettingsRef = useRef({ enabled: arpEnabled, rate: arpRate, pattern: arpPattern, octaves: arpOctaves });

  // Sync refs
  useEffect(() => { vibratoRef.current = vibratoEnabled; }, [vibratoEnabled]);
  useEffect(() => { vibratoDepthRef.current = vibratoDepth; }, [vibratoDepth]);

  useEffect(() => { 
      arpSettingsRef.current = { enabled: arpEnabled, rate: arpRate, pattern: arpPattern, octaves: arpOctaves }; 
      
      // Restart interval if rate changes and enabled
      if (arpEnabled) {
          stopArpeggiator();
          startArpeggiator();
      } else {
          stopArpeggiator();
          setArpActiveNote(null);
      }
  }, [arpEnabled, arpRate, arpPattern, arpOctaves]);

  // MIDI Input State
  const [midiKeys, setMidiKeys] = useState<Set<number>>(new Set());
  const [midiConnected, setMidiConnected] = useState(false);
  
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const midiInputRef = useRef<HTMLInputElement>(null);
  
  // Saved Presets
  const [savedPresets, setSavedPresets] = useState<UserPreset[]>([]);

  // --- Derived State ---
  const currentIntervals = mode === 'scale' 
    ? SCALES[selectedIndex].intervals 
    : CHORDS[selectedIndex].intervals;
  
  const activeNotes = getActiveNotes(rootNote, currentIntervals);
  const rootNoteIndex = NOTES.indexOf(rootNote);

  // --- Init ---
  useEffect(() => {
    // 1. Load Presets
    const saved = localStorage.getItem('melodyMindPresets');
    if (saved) {
      setSavedPresets(JSON.parse(saved));
    }

    // 2. Load Settings Profiles
    const savedProfiles = localStorage.getItem('melodyMindSettingsProfiles');
    if (savedProfiles) {
        setSettingsProfiles(JSON.parse(savedProfiles));
    }

    // 3. Load Restore Preference
    const savedRestorePref = localStorage.getItem('melodyMindRestoreOnStartup');
    const shouldRestore = savedRestorePref !== null ? JSON.parse(savedRestorePref) : true;
    setRestoreOnStartup(shouldRestore);

    // 4. Initial State Loading Strategy
    if (shouldRestore) {
        // Try Auto-Save
        const autoSave = localStorage.getItem('melodyMindAutoSave');
        if (autoSave) {
            applyConfig(JSON.parse(autoSave));
            setHasUnsavedChanges(true); // Treat as dirty until saved as preset
        } else {
            // Fallback to defaults
            loadDefaults();
        }
    } else {
        // Load Defaults
        loadDefaults();
    }
    
    // Initialize Physical MIDI
    initMidi(
      (note, velocity) => {
        const appIndex = note - 24; // MIDI 24 = C1 = index 0
        if (appIndex >= 0) { 
           // If Arp is enabled, we DON'T play directly. We just add to held keys.
           // If Arp is disabled, we play directly.
           
           if (arpSettingsRef.current.enabled) {
               heldMidiKeysRef.current.add(appIndex);
               // Trigger re-render for visual keys but NOT sound
               setMidiKeys(prev => {
                   const next = new Set(prev);
                   next.add(appIndex); 
                   return next;
               });
           } else {
               playNote(appIndex + transposeRef.current, instrumentRef.current, vibratoRef.current, vibratoDepthRef.current);
               setMidiKeys(prev => {
                   const next = new Set(prev);
                   next.add(appIndex); 
                   return next;
               });
           }
           setMidiConnected(true);
        }
      },
      (note) => {
        const appIndex = note - 24;
        if (arpSettingsRef.current.enabled) {
            heldMidiKeysRef.current.delete(appIndex);
        }
        setMidiKeys(prev => {
           const next = new Set(prev);
           next.delete(appIndex);
           return next;
        });
      }
    );
  }, []); 

  const loadDefaults = () => {
      const defaults = localStorage.getItem('melodyMindDefaults');
      if (defaults) {
          applyConfig(JSON.parse(defaults));
      } else {
          // Hardcoded Factory Defaults
          setRootNote('C');
          setMode('scale');
          setSelectedIndex(0);
          setInstrument('piano');
          setTempo(1.0);
          setTranspose(0);
          setArpEnabled(false);
          setVibratoEnabled(false);
      }
      setHasUnsavedChanges(false);
  };

  const applyConfig = (config: any) => {
    if (!config) return;
    if (config.rootNote) setRootNote(config.rootNote);
    if (config.mode) setMode(config.mode);
    if (config.selectedIndex !== undefined) setSelectedIndex(config.selectedIndex);
    if (config.instrument) setInstrument(config.instrument);
    if (config.tempo) setTempo(config.tempo);
    if (config.transpose !== undefined) setTranspose(config.transpose);
    
    // Extended Settings (Visuals & FX)
    if (config.arpEnabled !== undefined) setArpEnabled(config.arpEnabled);
    if (config.arpRate) setArpRate(config.arpRate);
    if (config.arpPattern) setArpPattern(config.arpPattern);
    if (config.arpOctaves) setArpOctaves(config.arpOctaves);
    
    if (config.vibratoEnabled !== undefined) setVibratoEnabled(config.vibratoEnabled);
    if (config.vibratoDepth) setVibratoDepth(config.vibratoDepth);

    if (config.showLabels !== undefined) setShowLabels(config.showLabels);
    if (config.highlightRoot !== undefined) setHighlightRoot(config.highlightRoot);
    if (config.showScale !== undefined) setShowScale(config.showScale);
  };

  const getCurrentConfig = (): AppConfig => ({
      rootNote,
      mode,
      selectedIndex,
      instrument,
      tempo,
      transpose,
      arpEnabled,
      arpRate,
      arpPattern,
      arpOctaves,
      vibratoEnabled,
      vibratoDepth,
      showLabels,
      highlightRoot,
      showScale
  });

  const transposeRef = useRef(transpose);
  useEffect(() => { transposeRef.current = transpose; }, [transpose]);
  const instrumentRef = useRef(instrument);
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);
  
  // --- Auto-Save Logic ---
  useEffect(() => {
      // Skip initial render or restore phase
      if (isFirstRender.current) {
          isFirstRender.current = false;
          return;
      }

      // Persist Restore Preference
      localStorage.setItem('melodyMindRestoreOnStartup', JSON.stringify(restoreOnStartup));

      const config = getCurrentConfig();
      localStorage.setItem('melodyMindAutoSave', JSON.stringify(config));
      setHasUnsavedChanges(true);
  }, [
      rootNote, mode, selectedIndex, instrument, tempo, transpose,
      arpEnabled, arpRate, arpPattern, arpOctaves,
      vibratoEnabled, vibratoDepth,
      showLabels, highlightRoot, showScale,
      restoreOnStartup
  ]);


  // --- Arpeggiator Engine ---
  const startArpeggiator = () => {
      if (arpIntervalRef.current) clearInterval(arpIntervalRef.current);
      
      arpIntervalRef.current = setInterval(() => {
          const keys = Array.from(heldMidiKeysRef.current).sort((a,b) => a - b);
          
          if (keys.length === 0) {
              setArpActiveNote(null);
              return;
          }

          const { pattern, octaves } = arpSettingsRef.current;
          let sequence: number[] = [];

          // Generate extended sequence based on octaves
          for (let o = 0; o < octaves; o++) {
              sequence.push(...keys.map(k => k + (o * 12)));
          }

          // Apply Pattern
          if (pattern === 'down') {
              sequence.reverse();
          } else if (pattern === 'up-down') {
              if (sequence.length > 1) {
                  // Duplicate middle part reversed: [1,2,3] -> [1,2,3, 2]
                  const up = [...sequence];
                  const down = [...sequence].reverse().slice(1, -1);
                  sequence = [...up, ...down];
              }
          } else if (pattern === 'random') {
              // Simple shuffle for this tick (not true random sequence per loop, but good enough)
              // Actually, for a consistent loop, random usually means 'pick random note each step'
              // Let's do random pick index below
          }

          let noteToPlay: number;
          if (pattern === 'random') {
              const rIndex = Math.floor(Math.random() * sequence.length);
              noteToPlay = sequence[rIndex];
          } else {
              noteToPlay = sequence[arpStepRef.current % sequence.length];
              arpStepRef.current = (arpStepRef.current + 1) % sequence.length;
          }

          // Check bound to avoid playing extremely high notes if user holds high keys + 3 octaves
          if (noteToPlay < 88) { // Arbitrary limit (piano size)
              playNote(noteToPlay + transposeRef.current, instrumentRef.current, vibratoRef.current, vibratoDepthRef.current);
              setArpActiveNote(noteToPlay);
          }
          
      }, arpSettingsRef.current.rate);
  };

  const stopArpeggiator = () => {
      if (arpIntervalRef.current) {
          clearInterval(arpIntervalRef.current);
          arpIntervalRef.current = null;
      }
      arpStepRef.current = 0;
  };
  
  const handleArpPlayCurrentTheory = () => {
      // Play a one-shot arpeggio of the current visual notes.
      const theoryKeys: number[] = [];
      const rootBase = 36; // C4
      
      currentIntervals.forEach(interval => {
          theoryKeys.push(rootBase + rootNoteIndex + interval);
      });
      
      // Clear held keys for clean demo
      heldMidiKeysRef.current.clear();
      theoryKeys.forEach(k => heldMidiKeysRef.current.add(k));
      
      // Temporarily enable arp if not on
      const wasEnabled = arpEnabled;
      if (!wasEnabled) {
          setArpEnabled(true);
      }
      
      // Stop after 4 seconds (one/two loops)
      setTimeout(() => {
          theoryKeys.forEach(k => heldMidiKeysRef.current.delete(k));
          if (!wasEnabled) setArpEnabled(false);
      }, 4000);
  };

  // --- Playback Engine ---

  // Reset player when melody changes
  useEffect(() => {
    if (currentMelody.length > 0) {
        const last = currentMelody[currentMelody.length - 1];
        setDuration((last.startTime || 0) + last.duration + 1); // Add buffer
    } else {
        setDuration(0);
    }
    stopPlayback();
  }, [currentMelody]);

  const stopPlayback = () => {
      setIsPlaying(false);
      setProgress(0);
      progressRef.current = 0;
      nextNoteIndexRef.current = 0;
      setPlaybackKeys(new Set());
      setCurrentPitch('-');
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const togglePlayback = () => {
      if (isPlaying) {
          setIsPlaying(false);
          lastTimeRef.current = undefined;
          if (requestRef.current) cancelAnimationFrame(requestRef.current);
      } else {
          setIsPlaying(true);
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTime = parseFloat(e.target.value);
      setProgress(newTime);
      progressRef.current = newTime;
      
      // Reset next note index to correct position
      const nextIdx = currentMelody.findIndex(n => (n.startTime || 0) >= newTime);
      nextNoteIndexRef.current = nextIdx === -1 ? currentMelody.length : nextIdx;
      
      // Update visuals immediately for seeking
      updateVisuals(newTime);
  };

  const updateVisuals = (currentTime: number) => {
      const active = new Set<number>();
      // Look at a window around current time to find ringing notes
      // We check notes that started before now, but end after now.
      // Optimization: Start searching backwards from nextNoteIndex
      let i = nextNoteIndexRef.current - 1;
      while (i >= 0) {
          const note = currentMelody[i];
          const start = note.startTime || 0;
          const end = start + note.duration;
          
          if (end > currentTime) {
                // Note is currently playing
                const noteNameClean = note.noteName.replace(/[0-9]/g, '');
                const octaveMatch = note.noteName.match(/[0-9]+/);
                const octave = parseInt(octaveMatch ? octaveMatch[0] : '4');
                const noteIdx = NOTES.indexOf(noteNameClean as NoteName);
                if (noteIdx !== -1) {
                    const semitoneIndex = ((octave - 1) * 12) + noteIdx;
                    active.add(semitoneIndex + transposeRef.current);
                }
          } else {
              // Notes are sorted by start time, but durations vary. 
              // We stop looking back if start time is significantly old (e.g. > 10s) 
              // just to be safe, though usually checking end > currentTime is the main filter.
              if (currentTime - end > 4) break; 
          }
          i--;
      }
      setPlaybackKeys(active);
  };

  // Main Loop
  useEffect(() => {
    if (!isPlaying) return;

    const animate = (time: number) => {
        if (lastTimeRef.current === undefined) {
            lastTimeRef.current = time;
        }
        const delta = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;

        const currentP = progressRef.current;
        const newP = currentP + (delta * tempo);
        
        progressRef.current = newP;
        setProgress(newP);

        // 1. Trigger Audio
        while (
            nextNoteIndexRef.current < currentMelody.length && 
            (currentMelody[nextNoteIndexRef.current].startTime || 0) <= newP
        ) {
            const note = currentMelody[nextNoteIndexRef.current];
            const noteStart = note.startTime || 0;
            
            const noteNameClean = note.noteName.replace(/[0-9]/g, '');
            const octaveMatch = note.noteName.match(/[0-9]+/);
            const octave = parseInt(octaveMatch ? octaveMatch[0] : '4');
            const noteIdx = NOTES.indexOf(noteNameClean as NoteName);
            
            if (noteIdx !== -1) {
                 const semitoneIndex = ((octave - 1) * 12) + noteIdx;
                 playNote(semitoneIndex + transposeRef.current, instrumentRef.current, vibratoRef.current, vibratoDepthRef.current);
                 setCurrentPitch(note.noteName);
            }
            
            nextNoteIndexRef.current += 1;
        }

        // 2. Update Visuals
        updateVisuals(newP);

        // 3. End Check
        if (newP >= duration) {
            setIsPlaying(false);
            setProgress(0);
            progressRef.current = 0;
            nextNoteIndexRef.current = 0;
            setPlaybackKeys(new Set());
            lastTimeRef.current = undefined;
        } else {
            requestRef.current = requestAnimationFrame(animate);
        }
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, duration, tempo, currentMelody]); 

  // --- Handlers ---

  const handleSendMessage = async () => {
    playUiClick();
    if (!chatInput.trim()) return;
    
    const newUserMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: chatInput,
      timestamp: new Date()
    };

    setChatHistory(prev => [...prev, newUserMsg]);
    setChatInput('');
    setIsChatLoading(true);

    const modelMsgId = (Date.now() + 1).toString();
    let modelText = '';

    setChatHistory(prev => [...prev, {
        id: modelMsgId,
        role: 'model',
        text: '',
        timestamp: new Date()
    }]);

    await streamChatResponse(chatHistory.concat(newUserMsg), chatInput, (chunk) => {
        modelText += chunk;
        setChatHistory(prev => prev.map(msg => 
            msg.id === modelMsgId ? { ...msg, text: modelText } : msg
        ));
    });
    
    setIsChatLoading(false);
  };

  const toggleRecording = async () => {
    playUiClick();
    if (isRecording) {
      const url = await stopRecording();
      setRecordedUrl(url);
      setIsRecording(false);
    } else {
      setRecordedUrl(null);
      if (startRecording()) {
        setIsRecording(true);
      }
    }
  };
  
  const deleteRecording = () => {
      playUiClick();
      setRecordedUrl(null);
  };

  const savePreset = () => {
    playUiClick();
    const newPreset: UserPreset = {
      id: Date.now().toString(),
      name: `${rootNote} ${mode === 'scale' ? SCALES[selectedIndex].name : CHORDS[selectedIndex].name}`,
      rootNote,
      mode,
      selectedIndex,
      instrument,
      melody: currentMelody.length > 0 ? currentMelody : undefined,
      timestamp: Date.now(),
      tempo,
      transpose
    };
    const updated = [newPreset, ...savedPresets];
    setSavedPresets(updated);
    localStorage.setItem('melodyMindPresets', JSON.stringify(updated));
    setHasUnsavedChanges(false);
  };

  const loadPreset = (preset: UserPreset) => {
    playUiClick();
    setRootNote(preset.rootNote);
    setMode(preset.mode);
    setSelectedIndex(preset.selectedIndex);
    setInstrument(preset.instrument);
    if (preset.tempo) setTempo(preset.tempo);
    if (preset.transpose !== undefined) setTranspose(preset.transpose);

    if (preset.melody) {
        setCurrentMelody(preset.melody);
    } else {
        setCurrentMelody([]);
    }
    setHasUnsavedChanges(false);
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    localStorage.setItem('melodyMindPresets', JSON.stringify(updated));
  };

  const handleSheetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTranscribingSheet(true);
    stopPlayback();

    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
            const rawNotes = await transcribeSheetMusic(base64String);
            if (rawNotes && rawNotes.length > 0) {
                // Convert sequential duration to absolute startTime
                let currentTime = 0;
                const timedNotes = rawNotes.map(n => {
                    const note = { ...n, startTime: currentTime };
                    currentTime += n.duration;
                    return note;
                });
                setCurrentMelody(timedNotes);
            } else {
                alert("No notes found in the image.");
            }
        } catch (err) {
            alert("Failed to read sheet music. Ensure the image is clear.");
        } finally {
            setTranscribingSheet(false);
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleMidiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      stopPlayback();

      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
             const data = ev.target?.result as ArrayBuffer;
             const midi = new Midi(data);
             
             const allNotes: MelodyNote[] = [];
             midi.tracks.forEach(track => {
                 track.notes.forEach(n => {
                     allNotes.push({
                         noteName: n.name,
                         duration: n.duration,
                         startTime: n.time,
                         velocity: n.velocity
                     });
                 });
             });
             
             // Sort is CRITICAL for the playback engine
             allNotes.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
             setCurrentMelody(allNotes);
             
          } catch (error) {
              console.error(error);
              alert("Failed to parse MIDI file.");
          }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
  };

  // --- Settings Handlers ---
  const saveCurrentAsDefault = () => {
      playUiClick();
      const config = getCurrentConfig();
      localStorage.setItem('melodyMindDefaults', JSON.stringify(config));
      alert("Current configuration saved as startup default.");
  };

  const resetToFactory = () => {
      playUiClick();
      if(confirm("Reset all settings to factory defaults?")) {
          localStorage.removeItem('melodyMindDefaults');
          loadDefaults();
      }
  };
  
  const saveSettingsProfile = () => {
      playUiClick();
      if (!newProfileName.trim()) return;
      
      const newProfile: SettingsProfile = {
          id: Date.now().toString(),
          name: newProfileName,
          config: getCurrentConfig()
      };
      
      const updated = [newProfile, ...settingsProfiles];
      setSettingsProfiles(updated);
      localStorage.setItem('melodyMindSettingsProfiles', JSON.stringify(updated));
      setNewProfileName('');
  };

  const loadSettingsProfile = (profile: SettingsProfile) => {
      playUiClick();
      applyConfig(profile.config);
      setHasUnsavedChanges(true);
  };

  const deleteSettingsProfile = (id: string) => {
      playUiClick();
      const updated = settingsProfiles.filter(p => p.id !== id);
      setSettingsProfiles(updated);
      localStorage.setItem('melodyMindSettingsProfiles', JSON.stringify(updated));
  };


  const chartData = currentIntervals.map((interval, i) => ({
      name: `Deg ${i + 1}`,
      semitones: interval,
      note: NOTES[(rootNoteIndex + interval) % 12]
  }));

  const instruments: { id: InstrumentType, label: string }[] = [
    { id: 'piano', label: 'Grand Piano' },
    { id: 'guitar', label: 'Electric Guitar' },
    { id: 'synth', label: 'Analog Synth' },
    { id: '8-bit', label: '8-Bit Chip' },
    { id: 'violin', label: 'Violin' },
    { id: 'cello', label: 'Cello' },
    { id: 'flute', label: 'Flute' },
    { id: 'harp', label: 'Concert Harp' },
    { id: 'marimba', label: 'Marimba' },
    { id: 'organ', label: 'Jazz Organ' },
  ];

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 font-sans overflow-hidden">
      
      {/* --- Sidebar Controls --- */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col z-20 shadow-xl">
        <div className="p-6 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center space-x-2 text-indigo-400 mb-1">
            <Music className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight text-white">MelodyMind</h1>
          </div>
          <p className="text-xs text-gray-400">AI-Enhanced Music Theory</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="space-y-3">
                <button 
                  onClick={() => setIsRootSelectorOpen(!isRootSelectorOpen)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-2">
                        Root Note: <span className="text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{rootNote}</span>
                    </span>
                    {isRootSelectorOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                {isRootSelectorOpen && (
                    <div className="animate-in slide-in-from-top-2 duration-200 space-y-3">
                        <div className="grid grid-cols-4 gap-2">
                            {NOTES.map(note => (
                                <button
                                    key={note}
                                    onClick={() => { playUiClick(); setRootNote(note); }}
                                    className={`
                                        py-2 rounded-md text-sm font-medium transition-all
                                        ${rootNote === note 
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}
                                    `}
                                >
                                    {note}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-gray-700/50 p-1 rounded-lg flex">
                <button 
                    onClick={() => { playUiClick(); setMode('scale'); setSelectedIndex(0); }}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'scale' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    Scales
                </button>
                <button 
                    onClick={() => { playUiClick(); setMode('chord'); setSelectedIndex(0); }}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'chord' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    Chords
                </button>
            </div>

            <div className="space-y-3">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Volume2 className="w-3 h-3" /> Instrument
                </label>
                <div className="flex flex-col gap-2 h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {instruments.map(inst => (
                         <button
                            key={inst.id}
                            onClick={() => { playUiClick(); setInstrument(inst.id); }}
                            className={`
                                flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all border shrink-0
                                ${instrument === inst.id
                                    ? 'bg-gray-700 border-indigo-500 text-white shadow-sm' 
                                    : 'bg-transparent border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'}
                            `}
                        >
                            <span>{inst.label}</span>
                            {instrument === inst.id && <div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {mode === 'scale' ? 'Select Scale' : 'Select Chord'}
                </label>
                <div className="flex flex-col space-y-1 h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {(mode === 'scale' ? SCALES : CHORDS).map((item, idx) => (
                        <button
                            key={item.name}
                            onClick={() => { playUiClick(); setSelectedIndex(idx); }}
                            className={`
                                text-left px-3 py-2 rounded-md text-sm transition-colors
                                ${selectedIndex === idx 
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                                    : 'hover:bg-gray-700 text-gray-400'}
                            `}
                        >
                            {item.name}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Settings Link in Sidebar */}
            <div className="pt-2">
                 <button 
                    onClick={() => { playUiClick(); setIsSettingsOpen(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white transition-all group"
                 >
                     <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500"/>
                     <span className="text-sm font-medium">Settings & Defaults</span>
                 </button>
            </div>
        </div>

        <div className="p-4 border-t border-gray-700 grid grid-cols-2 gap-3 bg-gray-800">
            <button 
                onClick={() => { playUiClick(); setIsChatOpen(!isChatOpen); }}
                className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg transition-all ${isChatOpen ? 'bg-indigo-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
            >
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm">AI Chat</span>
            </button>
            <button 
                onClick={() => { playUiClick(); setIsStudioOpen(!isStudioOpen); }}
                className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg transition-all ${isStudioOpen ? 'bg-emerald-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
            >
                <Disc className="w-4 h-4" />
                <span className="text-sm">Studio</span>
            </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative bg-gray-900 overflow-hidden">
        
        <div className="h-16 border-b border-gray-800 flex items-center justify-between px-8 bg-gray-900/95 backdrop-blur z-10 shrink-0">
            <h2 className="text-2xl font-light text-white">
                <span className="font-bold text-indigo-400">{rootNote}</span> {mode === 'scale' ? SCALES[selectedIndex].name : CHORDS[selectedIndex].name}
            </h2>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
               {hasUnsavedChanges && (
                   <button 
                        onClick={() => { playUiClick(); savePreset(); }}
                        className="flex items-center gap-2 bg-indigo-600/20 border border-indigo-500/50 hover:bg-indigo-600 hover:text-white text-indigo-300 text-xs font-medium px-3 py-1.5 rounded-lg transition-all animate-in fade-in zoom-in duration-300"
                   >
                       <AlertCircle className="w-3 h-3" />
                       Unsaved Changes • Save
                   </button>
               )}
               
               {midiConnected && (
                 <span className="flex items-center gap-1 text-emerald-400 animate-pulse">
                   <Cable className="w-3 h-3" /> MIDI Connected
                 </span>
               )}
               <button 
                   onClick={handleArpPlayCurrentTheory}
                   className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
               >
                   <Play className="w-3 h-3 fill-current" /> Arpeggiate View
               </button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar relative">
            
            <section className="bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                
                {/* STUDIO PLAYER BAR */}
                <div className="bg-gray-900 border-b border-gray-700 p-4 flex flex-col gap-4">
                    
                    {/* Top Row: Main Controls */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        
                        {/* File Inputs & Playback */}
                        <div className="flex items-center gap-3">
                             <div className="flex gap-2">
                                 <div className="relative group">
                                    <input type="file" ref={sheetInputRef} onChange={handleSheetUpload} accept="image/*" className="hidden" />
                                    <button onClick={() => sheetInputRef.current?.click()} disabled={transcribingSheet} className="w-9 h-9 bg-gray-800 hover:bg-gray-700 text-indigo-400 rounded-lg flex items-center justify-center border border-gray-700 transition-all" title="Upload Sheet Music">
                                        {transcribingSheet ? <Loader2 className="w-4 h-4 animate-spin"/> : <Scan className="w-4 h-4"/>}
                                    </button>
                                </div>
                                <div className="relative group">
                                    <input type="file" ref={midiInputRef} onChange={handleMidiUpload} accept=".mid,.midi" className="hidden" />
                                    <button onClick={() => midiInputRef.current?.click()} className="w-9 h-9 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded-lg flex items-center justify-center border border-gray-700 transition-all" title="Upload MIDI">
                                        <FileAudio className="w-4 h-4"/>
                                    </button>
                                </div>
                             </div>
                            
                            <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-1">
                                <button onClick={stopPlayback} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
                                    <StopCircle className="w-5 h-5" />
                                </button>
                                <div className="w-px h-6 bg-gray-700 mx-1"></div>
                                <button onClick={togglePlayback} disabled={currentMelody.length === 0} className={`p-1.5 rounded transition-colors ${isPlaying ? 'text-amber-400 bg-amber-900/20' : 'text-emerald-400 hover:bg-gray-700 disabled:text-gray-600'}`}>
                                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                                </button>
                            </div>

                            <div className="text-xs font-mono text-gray-400 bg-black/20 px-2 py-1 rounded border border-gray-700/50 min-w-[100px] text-center">
                                {formatTime(progress)} / {formatTime(duration)}
                            </div>
                        </div>

                        {/* Right: Pitch & Rec */}
                        <div className="flex items-center gap-3 ml-auto">
                            <div className="hidden lg:flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-gray-700 min-w-[80px] justify-center">
                                <span className="text-xs font-bold text-indigo-400 font-mono w-6 text-center">{currentPitch}</span>
                            </div>
                            
                            {recordedUrl && (
                                <div className="flex items-center gap-2 bg-emerald-900/30 px-3 py-1.5 rounded-lg border border-emerald-900/50">
                                    <audio src={recordedUrl} controls className="h-6 w-20 opacity-60 hover:opacity-100" />
                                    <button onClick={deleteRecording} className="p-1 text-red-400 hover:text-red-300 hover:bg-red-900/50 rounded"><Trash2 className="w-4 h-4"/></button>
                                    <a href={recordedUrl} download="session.webm" className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/50 rounded"><Download className="w-4 h-4"/></a>
                                </div>
                            )}
                            <button onClick={toggleRecording} className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-medium text-xs transition-all shadow-lg ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}>
                                <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-white' : 'bg-red-500'}`}></div>
                                {isRecording ? "REC" : "Record"}
                            </button>
                        </div>
                    </div>

                    {/* Bottom Row: Timeline & Settings */}
                    <div className="flex items-center gap-4 bg-gray-800/50 p-2 rounded-lg border border-gray-700/50">
                         {/* Timeline Slider */}
                         <div className="flex-1 flex items-center gap-2">
                            <input 
                                type="range" 
                                min="0" 
                                max={duration || 100} 
                                step="0.1" 
                                value={progress}
                                onChange={handleSeek}
                                disabled={currentMelody.length === 0}
                                className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50"
                            />
                         </div>

                         {/* Tempo */}
                         <div className="flex items-center gap-2 px-2 border-l border-gray-700">
                             <Gauge className="w-3 h-3 text-gray-500" />
                             <input type="range" min="0.5" max="2.0" step="0.1" value={tempo} onChange={(e) => setTempo(parseFloat(e.target.value))} className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                             <span className="text-[10px] font-mono text-gray-300 w-6 text-right">{tempo.toFixed(1)}x</span>
                         </div>
                         
                         {/* Transpose */}
                         <div className="flex items-center gap-1 px-2 border-l border-gray-700">
                             <span className="text-[9px] text-gray-500 font-bold uppercase">Trans</span>
                             <button onClick={() => setTranspose(t => t - 1)} className="p-0.5 text-gray-400 hover:text-white bg-gray-700 rounded"><Minus className="w-3 h-3"/></button>
                             <span className={`text-[10px] font-mono w-4 text-center ${transpose !== 0 ? 'text-indigo-400 font-bold' : 'text-gray-400'}`}>{transpose > 0 ? `+${transpose}` : transpose}</span>
                             <button onClick={() => setTranspose(t => t + 1)} className="p-0.5 text-gray-400 hover:text-white bg-gray-700 rounded"><Plus className="w-3 h-3"/></button>
                         </div>
                    </div>
                </div>

                {/* Piano Settings Toolbar (Next to Keyboard) */}
                <div className="px-8 pt-6 pb-2 flex flex-col gap-3">
                     <div className="flex items-center justify-between">
                         <span className="text-xs text-gray-500 font-mono">VISUALIZER & FX</span>
                         <div className="flex items-center gap-3">
                            {/* Toggle Scale Visibility */}
                            <button 
                                 onClick={() => { playUiClick(); setShowScale(!showScale); }}
                                 className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${showScale ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'}`}
                            >
                                <Grid3x3 className="w-3 h-3" />
                                Highlight Scale
                            </button>
                            
                             {/* Toggle Labels */}
                            <button 
                                 onClick={() => { playUiClick(); setShowLabels(!showLabels); }}
                                 className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${showLabels ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'}`}
                            >
                                <Type className="w-3 h-3" />
                                Labels
                            </button>
                            
                            {/* Toggle Root Highlight */}
                            <button 
                                 onClick={() => { playUiClick(); setHighlightRoot(!highlightRoot); }}
                                 className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${highlightRoot ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-300' : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'}`}
                            >
                                {highlightRoot ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                Root
                            </button>

                             {/* Toggle Vibrato */}
                            <button 
                                 onClick={() => { playUiClick(); setVibratoEnabled(!vibratoEnabled); }}
                                 className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${vibratoEnabled ? 'bg-pink-900/30 border-pink-500/50 text-pink-300 animate-pulse' : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'}`}
                            >
                                <Waves className="w-3 h-3" />
                                Vibrato
                            </button>

                            {/* Vibrato Intensity Slider (Conditional) */}
                            {vibratoEnabled && (
                                <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                                    <input 
                                        type="range" 
                                        min="0" max="1" step="0.1" 
                                        value={vibratoDepth}
                                        onChange={(e) => setVibratoDepth(parseFloat(e.target.value))}
                                        className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                                        title={`Intensity: ${(vibratoDepth * 100).toFixed(0)}%`}
                                    />
                                </div>
                            )}

                            <div className="w-px h-6 bg-gray-700 mx-1"></div>

                            {/* Arpeggiator Toggle */}
                            <button 
                                 onClick={() => { playUiClick(); setArpEnabled(!arpEnabled); setShowArpControls(!arpEnabled ? true : showArpControls); }}
                                 className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${arpEnabled ? 'bg-rose-900/30 border-rose-500/50 text-rose-300 shadow-lg shadow-rose-900/20' : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'}`}
                            >
                                <Activity className={`w-3 h-3 ${arpEnabled ? 'animate-pulse' : ''}`} />
                                ARP
                            </button>
                         </div>
                     </div>
                     
                     {/* Arpeggiator Settings Panel */}
                     {(arpEnabled || showArpControls) && (
                        <div className="bg-gray-800/80 p-3 rounded-lg border border-gray-700 flex items-center gap-6 animate-in slide-in-from-top-2 duration-200">
                             <div className="flex items-center gap-2 border-r border-gray-700 pr-4">
                                 <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Pattern</span>
                                 <div className="flex bg-gray-900/50 rounded-lg p-0.5">
                                     <button onClick={() => setArpPattern('up')} className={`p-1.5 rounded ${arpPattern === 'up' ? 'bg-gray-700 text-rose-400' : 'text-gray-500 hover:text-gray-300'}`} title="Up"><ArrowUp className="w-3 h-3"/></button>
                                     <button onClick={() => setArpPattern('down')} className={`p-1.5 rounded ${arpPattern === 'down' ? 'bg-gray-700 text-rose-400' : 'text-gray-500 hover:text-gray-300'}`} title="Down"><ArrowDown className="w-3 h-3"/></button>
                                     <button onClick={() => setArpPattern('up-down')} className={`p-1.5 rounded ${arpPattern === 'up-down' ? 'bg-gray-700 text-rose-400' : 'text-gray-500 hover:text-gray-300'}`} title="Up/Down"><ArrowUpDown className="w-3 h-3"/></button>
                                     <button onClick={() => setArpPattern('random')} className={`p-1.5 rounded ${arpPattern === 'random' ? 'bg-gray-700 text-rose-400' : 'text-gray-500 hover:text-gray-300'}`} title="Random"><Shuffle className="w-3 h-3"/></button>
                                 </div>
                             </div>

                             <div className="flex items-center gap-2 border-r border-gray-700 pr-4">
                                 <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Range</span>
                                 <div className="flex items-center gap-1">
                                     {[1, 2, 3].map(oct => (
                                         <button 
                                            key={oct} 
                                            onClick={() => setArpOctaves(oct)}
                                            className={`w-6 h-6 text-xs font-bold rounded flex items-center justify-center transition-colors ${arpOctaves === oct ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                         >
                                             {oct}
                                         </button>
                                     ))}
                                     <span className="text-[10px] text-gray-600 ml-1">Oct</span>
                                 </div>
                             </div>

                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Rate</span>
                                 <input 
                                    type="range" 
                                    min="50" 
                                    max="500" 
                                    step="10" 
                                    value={arpRate}
                                    onChange={(e) => setArpRate(parseInt(e.target.value))}
                                    className="w-24 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                 />
                                 <span className="text-xs font-mono text-gray-300 w-10">{arpRate}ms</span>
                             </div>
                        </div>
                     )}
                </div>

                {/* VISUALIZER */}
                <div className="px-8 pb-8 pt-2">
                     <Piano 
                        activeNotes={activeNotes} 
                        rootNoteIndex={rootNoteIndex} 
                        instrument={instrument} 
                        midiPressedKeys={midiKeys}
                        playbackKeys={playbackKeys}
                        arpActiveNote={arpActiveNote}
                        onKeyPress={(idx) => {
                             // Handle Manual Click Arp
                             if (arpEnabled) {
                                  playNote(idx + transpose, instrument, vibratoEnabled, vibratoDepth);
                             } else {
                                  playNote(idx + transpose, instrument, vibratoEnabled, vibratoDepth);
                             }
                        }}
                        isPlaying={isPlaying}
                        highlightRoot={highlightRoot}
                        showLabels={showLabels}
                        showScale={showScale}
                        vibratoEnabled={vibratoEnabled}
                        vibratoDepth={vibratoDepth}
                    />
                </div>
            </section>
            
            {/* ... Rest of app (Analysis/Charts) ... */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 h-80">
                    <h3 className="text-lg font-medium text-gray-200 mb-4">Interval Structure</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="note" stroke="#9CA3AF" />
                            <YAxis stroke="#9CA3AF" />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                                itemStyle={{ color: '#818CF8' }}
                            />
                            <Bar dataKey="semitones" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                 <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 h-80 flex flex-col justify-center items-center text-center">
                    <h3 className="text-lg font-medium text-gray-200 mb-4">Theory Breakdown</h3>
                    <div className="grid grid-cols-3 gap-6 w-full max-w-md">
                        <div className="bg-gray-700/50 p-4 rounded-xl">
                            <span className="block text-2xl font-bold text-indigo-400">{activeNotes.length}</span>
                            <span className="text-xs text-gray-400 uppercase">Notes</span>
                        </div>
                        <div className="bg-gray-700/50 p-4 rounded-xl">
                            <span className="block text-2xl font-bold text-pink-400">{currentIntervals[currentIntervals.length - 1]}</span>
                            <span className="text-xs text-gray-400 uppercase">Span (Semi)</span>
                        </div>
                        <div className="bg-gray-700/50 p-4 rounded-xl">
                             <span className="block text-2xl font-bold text-emerald-400">{mode === 'chord' ? 'Yes' : 'No'}</span>
                            <span className="text-xs text-gray-400 uppercase">Harmony</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        {/* Floating Panels: AI Chat & Studio (Same as before) */}
        {isChatOpen && (
            <div className="absolute right-0 top-0 h-full w-96 bg-gray-800 shadow-2xl border-l border-gray-700 z-30 flex flex-col transform transition-transform duration-300">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-indigo-900/20">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        AI Music Assistant
                    </h3>
                    <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900/50">
                    {chatHistory.length === 0 && (
                        <div className="text-center text-gray-500 mt-10">
                            <p className="text-sm">Ask me to compose a melody, explain a mode, or analyze a chord progression!</p>
                        </div>
                    )}
                    {chatHistory.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-br-none' 
                                    : 'bg-gray-700 text-gray-200 rounded-bl-none'
                            }`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isChatLoading && (
                        <div className="flex justify-start">
                             <div className="bg-gray-700 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                                <span className="text-xs text-gray-400">Thinking...</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-700 bg-gray-800">
                    <div className="flex items-center gap-2">
                        <input 
                            type="text" 
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Compose a sad melody..."
                            className="flex-1 bg-gray-900 border border-gray-600 text-white text-sm rounded-full px-4 py-2 focus:outline-none focus:border-indigo-500"
                        />
                        <button 
                            onClick={handleSendMessage}
                            disabled={isChatLoading || !chatInput.trim()}
                            className="p-2 bg-indigo-600 rounded-full hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-4 h-4 text-white" />
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isStudioOpen && (
             <div className="absolute right-0 top-0 h-full w-96 bg-gray-800 shadow-2xl border-l border-gray-700 z-30 flex flex-col transform transition-transform duration-300">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-emerald-900/20">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <Disc className="w-4 h-4 text-emerald-400" />
                        Saved Library
                    </h3>
                    <button onClick={() => setIsStudioOpen(false)} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                
                <div className="p-5 space-y-6 border-b border-gray-700 bg-gray-800">
                     {/* Save / Load */}
                     <div>
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex justify-between items-center">
                            <span>Saved Presets</span>
                            <button onClick={savePreset} className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1"><Save className="w-3 h-3"/> Save Current</button>
                        </label>
                        <div className="h-48 overflow-y-auto space-y-2 bg-gray-900/50 rounded-lg p-2 border border-gray-700">
                            {savedPresets.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-600 text-xs">
                                    <FolderOpen className="w-8 h-8 mb-2 opacity-20"/>
                                    No saved presets
                                </div>
                            ) : (
                                savedPresets.map(preset => (
                                    <div key={preset.id} className="flex items-center justify-between p-2 bg-gray-800 rounded hover:bg-gray-750 border border-gray-700 group">
                                        <div className="flex-1 cursor-pointer" onClick={() => loadPreset(preset)}>
                                            <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
                                                {preset.name}
                                                {preset.melody && <FileMusic className="w-3 h-3 text-emerald-400" />}
                                            </div>
                                            <div className="text-[10px] text-gray-500 uppercase">{preset.instrument} • {new Date(preset.timestamp).toLocaleDateString()}</div>
                                        </div>
                                        <button onClick={(e) => deletePreset(preset.id, e)} className="p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                            &times;
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* SETTINGS PANEL */}
        {isSettingsOpen && (
            <div className="absolute left-0 top-0 h-full w-96 bg-gray-800 shadow-2xl border-r border-gray-700 z-30 flex flex-col transform transition-transform duration-300">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/40">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                        <Settings className="w-4 h-4 text-gray-400" />
                        Settings & Defaults
                    </h3>
                    <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-white">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* General */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-700 pb-2">General Preference</h4>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-300">Restore last session on startup</span>
                            <button 
                                onClick={() => setRestoreOnStartup(!restoreOnStartup)}
                                className={`w-10 h-5 rounded-full relative transition-colors ${restoreOnStartup ? 'bg-indigo-600' : 'bg-gray-600'}`}
                            >
                                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${restoreOnStartup ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                            If enabled, the app will load your exact state from the last visit. If disabled, it will load the default configuration defined below.
                        </p>
                    </div>

                    {/* Defaults */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-700 pb-2">Default Configuration</h4>
                        <div className="space-y-3">
                            <button 
                                onClick={saveCurrentAsDefault}
                                className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium py-2 rounded-lg transition-colors border border-gray-600"
                            >
                                <Save className="w-4 h-4" />
                                Save Current State as Default
                            </button>
                            <button 
                                onClick={resetToFactory}
                                className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-red-900/20 text-red-400 hover:text-red-300 text-sm font-medium py-2 rounded-lg transition-colors border border-red-900/30"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Reset to Factory Defaults
                            </button>
                        </div>
                         <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                            "Save Current" will make the current instrument, scale, tempo, and effects the starting point for new sessions (when auto-restore is disabled).
                        </p>
                    </div>

                    {/* Profile Management */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-700 pb-2">Configuration Profiles</h4>
                        <div className="space-y-4">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Profile Name (e.g. 'Lofi Piano')"
                                    value={newProfileName}
                                    onChange={(e) => setNewProfileName(e.target.value)}
                                    className="flex-1 bg-gray-900 border border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                                />
                                <button 
                                    onClick={saveSettingsProfile}
                                    disabled={!newProfileName.trim()}
                                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                                >
                                    Save
                                </button>
                            </div>

                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                {settingsProfiles.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-gray-600 italic border border-dashed border-gray-700 rounded">
                                        No saved configuration profiles
                                    </div>
                                ) : (
                                    settingsProfiles.map(profile => (
                                        <div key={profile.id} className="flex items-center justify-between bg-gray-700/50 px-3 py-2 rounded-md border border-gray-700 group hover:bg-gray-700 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <UserCog className="w-4 h-4 text-indigo-400" />
                                                <span className="text-sm text-gray-300 font-medium">{profile.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => loadSettingsProfile(profile)}
                                                    className="p-1 hover:bg-emerald-900/50 text-emerald-400 rounded"
                                                    title="Load Profile"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => deleteSettingsProfile(profile.id)}
                                                    className="p-1 hover:bg-red-900/50 text-red-400 rounded"
                                                    title="Delete Profile"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                                Profiles save your settings (Instrument, Arp, Tempo, Visuals) without the melody, allowing you to quickly switch between different setups.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;