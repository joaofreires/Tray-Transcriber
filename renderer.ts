/// <reference path="./types/tray-transcriber.d.ts" />

let mediaRecorder: MediaRecorder | null = null;
let chunks: BlobPart[] = [];
let desiredRecording = false;
let startInFlight = false;
let cancelOnStart = false;
let recordingStartedAt = 0;

function debug(message: string, data?: unknown) {
  console.log(message, data || '');
  if (window.trayTranscriber && typeof window.trayTranscriber.log === 'function') {
    window.trayTranscriber.log(message, data);
  }
}

async function startRecording() {
  if (mediaRecorder || startInFlight) return;
  startInFlight = true;
  cancelOnStart = false;
  debug('[renderer] startRecording requested');
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    startInFlight = false;
    debug('[renderer] getUserMedia failed', { error: String(err) });
    throw err;
  }
  if (!desiredRecording || cancelOnStart) {
    debug('[renderer] start canceled before recorder init');
    stream.getTracks().forEach((t) => t.stop());
    startInFlight = false;
    return;
  }
  let options: MediaRecorderOptions = { mimeType: 'audio/webm;codecs=opus' };
  if (!MediaRecorder.isTypeSupported(options.mimeType || '')) {
    options = {};
  }
  mediaRecorder = new MediaRecorder(stream, options);
  debug('[renderer] MediaRecorder created', { mimeType: mediaRecorder.mimeType || options.mimeType || 'default' });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
      debug('[renderer] dataavailable', { size: event.data.size, chunks: chunks.length });
    }
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    chunks = [];
    const durationMs = recordingStartedAt ? Date.now() - recordingStartedAt : 0;
    debug('[renderer] stop', { size: blob.size, durationMs });
    const arrayBuffer = await blob.arrayBuffer();
    window.trayTranscriber.notifyRecordingComplete({
      buffer: Array.from(new Uint8Array(arrayBuffer)),
      extension: 'webm',
      size: blob.size,
      durationMs
    });
    recordingStartedAt = 0;
  };

  mediaRecorder.start(200);
  recordingStartedAt = Date.now();
  debug('[renderer] recorder started');
  startInFlight = false;
}

function stopRecording() {
  desiredRecording = false;
  if (startInFlight) {
    cancelOnStart = true;
    debug('[renderer] stop requested during start, canceling');
    return;
  }
  if (!mediaRecorder) return;
  if (mediaRecorder.state === 'recording') {
    debug('[renderer] stopping recorder');
    mediaRecorder.stop();
  }
  const tracks = mediaRecorder.stream.getTracks();
  tracks.forEach((t) => t.stop());
  mediaRecorder = null;
}

window.trayTranscriber.onToggleRecording(async ({ isRecording }: { isRecording: boolean }) => {
  if (isRecording) {
    try {
      desiredRecording = true;
      await startRecording();
    } catch (err) {
      debug('[renderer] Failed to start recording', { error: String(err) });
    }
  } else {
    stopRecording();
  }
});
