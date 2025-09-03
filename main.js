import * as Tone from "https://cdn.skypack.dev/tone@14.8.49";

// Basic DOM refs
const videoEl = document.getElementById("camera");
const handsCanvas = document.getElementById("hands");
const vizCanvas = document.getElementById("viz");
const powerOn = document.getElementById("powerOn");
const powerOff = document.getElementById("powerOff");
const levelKnob = document.getElementById("level");
const waveToggle = document.getElementById("waveToggle");
const panelToggle = document.getElementById("panelToggle");
const pitchA = document.getElementById("pitchA");
const pitchB = document.getElementById("pitchB");
const decay = document.getElementById("decay");
const delayTime = document.getElementById("delayTime");
const feedback = document.getElementById("feedback");

// Tone.js graph
let currentWave = "sine";
const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: currentWave },
  envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 1.2 }
});
const filter = new Tone.Filter(1200, "lowpass");
const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0.35 });
const reverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 });
const analyser = new Tone.Analyser("waveform", 64);

synth.chain(filter, delay, reverb, Tone.Destination);
reverb.connect(analyser);

// Visualizer
const vctx = vizCanvas.getContext("2d");
function renderViz(){
  const values = analyser.getValue();
  const w = vizCanvas.width = vizCanvas.clientWidth;
  const h = vizCanvas.height = vizCanvas.clientHeight;
  vctx.clearRect(0,0,w,h);
  vctx.fillStyle = "#fff";
  const bars = 24; const gap = 8; const bw = (w - (bars-1)*gap)/bars;
  for(let i=0;i<bars;i++){
    const idx = Math.floor(i / bars * values.length);
    const amp = Math.abs(values[idx] / 1.0);
    const bh = Math.max(6, amp * (h-12));
    const x = i * (bw+gap);
    const y = (h - bh)/2;
    vctx.beginPath();
    const r = Math.min(8,bw/2);
    vctx.moveTo(x+r,y);
    vctx.arcTo(x+bw,y,x+bw,y+bh,r);
    vctx.arcTo(x+bw,y+bh,x,y+bh,r);
    vctx.arcTo(x,y+bh,x,y,r);
    vctx.arcTo(x,y,x+bw,y,r);
    vctx.closePath();
    vctx.fill();
  }
  requestAnimationFrame(renderViz);
}

// Camera + hand tracking (MediaPipe Tasks)
let handLandmarker;
let running = false;
const hctx = handsCanvas.getContext("2d");

async function initHands(){
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9");
  const { FilesetResolver, HandLandmarker } = vision;
  const filesetResolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
    numHands: 2,
    runningMode: "VIDEO",
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" }
  });
}

async function initCamera(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await new Promise((resolve) => {
      if (videoEl.readyState >= 1) return resolve();
      videoEl.onloadedmetadata = () => resolve();
    });
    await videoEl.play();
    const vw = videoEl.videoWidth || vizCanvas.clientWidth || 640;
    const vh = videoEl.videoHeight || vizCanvas.clientHeight || 480;
    handsCanvas.width = vw;
    handsCanvas.height = vh;
  } catch (err){
    console.error("Camera initialization failed:", err);
    alert("Unable to access the camera. Please allow camera permission and reload.");
    throw err;
  }
}

function norm(v, a, b){ return (v - a) / (b - a); }

function mapHandToParams(x, y){
  // x selects chord degree; y maps to velocity/brightness
  const chordIndex = Math.floor(x * 5); // 0..4 chords
  const intensity = 0.2 + 0.8 * (1 - y); // top is louder
  return { chordIndex, intensity };
}

// Music helpers
const roots = ["C4","D4","E4","G3","A3"];
const chordTypes = [0,2,4]; // triad degrees

function buildChord(root, semitoneOffsetA, semitoneOffsetB){
  const rootFreq = Tone.Frequency(root).toFrequency();
  const major = [0,4,7];
  const notes = major.map(s => Tone.Frequency(rootFreq).transpose(s).toNote());
  const a = Tone.Frequency(root).transpose(semitoneOffsetA).toNote();
  const b = Tone.Frequency(root).transpose(semitoneOffsetB).toNote();
  return Array.from(new Set([...notes, a, b]));
}

let lastTrigTime = 0;
function triggerChord(root, velocity){
  const chord = buildChord(root, parseInt(pitchA.value,10), parseInt(pitchB.value,10));
  const now = Tone.now();
  const dur = Math.max(0.1, parseFloat(decay.value));
  synth.triggerAttackRelease(chord, dur, now, velocity);
}

async function startAll(){
  if(running) return;
  await Tone.start();
  await initCamera();
  await initHands();
  Tone.Destination.mute = false;
  running = true;
  renderViz();
  loop();
}

async function loop(){
  if(!running) return;
  const w = handsCanvas.width = videoEl.videoWidth;
  const h = handsCanvas.height = videoEl.videoHeight;
  hctx.clearRect(0,0,w,h);
  const res = handLandmarker && await handLandmarker.detectForVideo(videoEl, performance.now());
  if(res && res.landmarks){
    res.landmarks.forEach((lm, i) => {
      const wrist = lm[0];
      const x = wrist.x; const y = wrist.y;
      const { chordIndex, intensity } = mapHandToParams(x, y);
      hctx.fillStyle = i === 0 ? "#ff4d4d" : "#4d9dff";
      hctx.beginPath();
      hctx.arc(x*w, y*h, 12, 0, Math.PI*2);
      hctx.fill();
      if(i === 0){
        const now = performance.now();
        if(now - lastTrigTime > 200){
          triggerChord(roots[chordIndex % roots.length], intensity);
          lastTrigTime = now;
        }
        const cutoff = 300 + (1 - y) * 4000;
        filter.frequency.rampTo(cutoff, 0.05);
      }
    });
  }
  requestAnimationFrame(loop);
}

// Power wiring
powerOn.addEventListener("click", startAll);
powerOff.addEventListener("click", () => { running = false; Tone.Destination.mute = true; });
levelKnob.addEventListener("input", () => {
  Tone.Destination.volume.rampTo(parseFloat(levelKnob.value));
});
decay.addEventListener("input", () => {
  // envelope release will use decay as well for now
  const d = parseFloat(decay.value);
  synth.set({ envelope: { attack: 0.02, decay: d, sustain: 0.55, release: Math.max(0.4, d) } });
});
delayTime.addEventListener("input", () => delay.delayTime.rampTo(parseFloat(delayTime.value), 0.05));
feedback.addEventListener("input", () => delay.feedback.rampTo(parseFloat(feedback.value), 0.05));

// Waveform toggle: cycles sine -> square -> triangle -> sawtooth
const waves = ["sine","square","triangle","sawtooth"];
let waveIndex = 0;
function updateWave(){
  currentWave = waves[waveIndex % waves.length];
  waveToggle.textContent = currentWave.toUpperCase();
  synth.set({ oscillator: { type: currentWave } });
}
waveToggle.addEventListener("click", () => {
  waveIndex = (waveIndex + 1) % waves.length;
  updateWave();
});
updateWave();

// Panel transparency toggle (solid vs 50%)
const controlDeck = document.querySelector(".control-deck");
let panelIsHalf = true;
function updatePanelOpacity(){
  if(panelIsHalf){
    controlDeck.style.background = "rgba(47,48,50,0.5)";
    panelToggle.textContent = "50%";
  } else {
    controlDeck.style.background = "var(--panel)";
    panelToggle.textContent = "SOLID";
  }
}
panelToggle.addEventListener("click", () => {
  panelIsHalf = !panelIsHalf;
  updatePanelOpacity();
});
updatePanelOpacity();

// Circular knob interaction
function attachCircularKnob(el, opts){
  const { min, max, step } = el;
  const minVal = parseFloat(min);
  const maxVal = parseFloat(max);
  const stepVal = parseFloat(step) || 1;
  const angleMin = -135; // degrees
  const angleMax = 135;

  function valueToAngle(v){
    const t = (v - minVal) / (maxVal - minVal);
    return angleMin + t * (angleMax - angleMin);
  }
  function angleToValue(a){
    const t = (a - angleMin) / (angleMax - angleMin);
    const raw = minVal + t * (maxVal - minVal);
    return Math.round(raw / stepVal) * stepVal;
  }
  function setAngleFromValue(){
    const v = parseFloat(el.value);
    el.style.setProperty("--angle", `${(valueToAngle(v)+360)%360}deg`);
  }
  setAngleFromValue();

  let dragging = false;
  let cx = 0, cy = 0;
  function onPointerDown(e){
    dragging = true;
    const rect = el.getBoundingClientRect();
    cx = rect.left + rect.width/2; cy = rect.top + rect.height/2;
    el.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e){
    if(!dragging) return;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let ang = Math.atan2(dy, dx) * 180/Math.PI + 90; // top=0
    if(ang < -180) ang += 360;
    if(ang > 180) ang -= 360;
    ang = Math.max(angleMin, Math.min(angleMax, ang));
    const v = angleToValue(ang);
    if(parseFloat(el.value) !== v){
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      setAngleFromValue();
    } else {
      setAngleFromValue();
    }
  }
  function onPointerUp(e){ dragging = false; try{ el.releasePointerCapture(e.pointerId);}catch(_){} }
  el.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  el.addEventListener('change', setAngleFromValue);
  el.addEventListener('input', setAngleFromValue);
}

[levelKnob, pitchA, pitchB, decay, delayTime, feedback].forEach(el => attachCircularKnob(el));

// Recording
const recordBtn = document.getElementById('recordBtn');
const finishBtn = document.getElementById('finishBtn');
const recordFormat = document.getElementById('recordFormat');

let mediaRecorder;
let recordedChunks = [];
let audioCtx, destNode, srcNode;

function ensureRecordingGraph(){
  if(!audioCtx){
    audioCtx = Tone.getContext().rawContext;
    destNode = audioCtx.createMediaStreamDestination();
    const toneNode = Tone.Destination;
    toneNode.channelCount = 2;
    toneNode.connect(destNode);
  }
}

function stopEnsureGraph(){
  try{ Tone.Destination.disconnect(); }catch(_){}
}

recordBtn.addEventListener('click', async () => {
  ensureRecordingGraph();
  recordedChunks = [];
  const wantVideo = recordFormat.value === 'video+mp3';
  let stream = destNode.stream;
  if(wantVideo){
    const canvasStream = document.querySelector('.stage').captureStream(30);
    const mixed = new MediaStream([...canvasStream.getVideoTracks(), ...stream.getAudioTracks()]);
    stream = mixed;
  }
  mediaRecorder = new MediaRecorder(stream, { mimeType: wantVideo ? 'video/webm;codecs=vp9,opus' : 'audio/webm;codecs=opus' });
  mediaRecorder.ondataavailable = e => { if(e.data && e.data.size) recordedChunks.push(e.data); };
  mediaRecorder.start();
  recordBtn.disabled = true; finishBtn.disabled = false;
});

finishBtn.addEventListener('click', async () => {
  if(!mediaRecorder) return;
  const wantVideo = recordFormat.value === 'video+mp3';
  await new Promise(resolve => { mediaRecorder.onstop = resolve; mediaRecorder.stop(); });
  const blob = new Blob(recordedChunks, { type: wantVideo ? 'video/webm' : 'audio/webm' });
  if(!wantVideo){
    // Transcode WebM/Opus to MP3 using lamejs (best-effort, simple decode via AudioContext)
    const arrayBuf = await blob.arrayBuffer();
    const ac = Tone.getContext().rawContext;
    const audioBuf = await ac.decodeAudioData(arrayBuf.slice(0));
    const left = audioBuf.getChannelData(0);
    const right = audioBuf.numberOfChannels>1?audioBuf.getChannelData(1):left;
    const mp3encoder = new lamejs.Mp3Encoder(2, audioBuf.sampleRate, 128);
    const blockSize = 1152;
    let mp3Data = [];
    for (let i = 0; i < left.length; i += blockSize) {
      const leftChunk = left.subarray(i, i + blockSize);
      const rightChunk = right.subarray(i, i + blockSize);
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) mp3Data.push(new Int8Array(mp3buf));
    }
    const enc = mp3encoder.flush();
    if (enc.length > 0) mp3Data.push(new Int8Array(enc));
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
    downloadBlob(mp3Blob, 'recording.mp3');
  } else {
    downloadBlob(blob, 'recording.webm');
  }
  recordBtn.disabled = false; finishBtn.disabled = true;
});

function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// Initialize default volume mute until user gesture
Tone.Destination.mute = true;


