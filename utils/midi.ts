export const initMidi = (
  onNoteOn: (note: number, velocity: number) => void,
  onNoteOff: (note: number) => void
) => {
  if (typeof navigator.requestMIDIAccess !== 'function') {
    console.warn("Web MIDI API not supported in this browser.");
    return;
  }

  const handleMidiMessage = (message: any) => {
    const data = message.data;
    if (!data) return;
    const [command, note, velocity] = data;

    // Note On (Channels 1-16: 144-159)
    if (command >= 144 && command <= 159 && velocity > 0) {
      onNoteOn(note, velocity);
    }
    // Note Off (Channels 1-16: 128-143) or Note On with velocity 0
    if ((command >= 128 && command <= 143) || (command >= 144 && command <= 159 && velocity === 0)) {
      onNoteOff(note);
    }
  };

  navigator.requestMIDIAccess().then((access: any) => {
    // Attach listener to all existing inputs
    const inputs = access.inputs.values();
    for (const input of inputs) {
      input.onmidimessage = handleMidiMessage;
    }

    // Handle hot-plugging
    access.onstatechange = (e: any) => {
      if (e.port.type === 'input' && e.port.state === 'connected') {
        e.port.onmidimessage = handleMidiMessage;
      }
    };
  }, (err: any) => {
    console.error('Could not access MIDI devices.', err);
  });
};