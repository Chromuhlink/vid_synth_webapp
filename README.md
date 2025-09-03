VID SYNTH (web)

A browser camera theremin that triggers synth chords. Hand position controls tone and intensity; the control deck adjusts pitch offsets, decay, delay time, feedback, and volume. The bar shows the audio waveform.

Quick start
- Serve this folder with a static server (camera needs https or localhost).
- Example: Python -> python3 -m http.server 5173 --bind 127.0.0.1
- Or Node -> npx http-server -p 5173
- Open http://127.0.0.1:5173 and click ON. Grant camera permission.

Controls
- Start: user gesture to start audio and camera
- Volume: master volume in dB
- Pitch: two semitone offsets added into the chord
- Decay: envelope decay and release
- Time: delay time (seconds)
- Feedback: delay feedback amount

Tech
- Tone.js PolySynth → Filter → Delay → Reverb → Destination
- MediaPipe HandLandmarker for hand tracking
- Canvas visualizer fed by Tone.Analyser

Notes
- Hand x-axis selects chord root; y-axis maps to intensity and filter cutoff.
- Good lighting improves detection.

Deploy (Vercel)
- Framework preset: Other
- Build command: None
- Output directory: .
- Install command: None
- CLI: vercel --prod --yes --confirm

