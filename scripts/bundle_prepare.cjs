const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bundleDir = path.join(root, 'bundle');
const pythonDir = path.join(bundleDir, 'python');
const ffmpegDir = path.join(bundleDir, 'ffmpeg');

function ensureEmptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function resolveCommand(cmd) {
  try {
    const result = execFileSync('which', [cmd], { encoding: 'utf8' }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function main() {
  ensureEmptyDir(bundleDir);
  fs.mkdirSync(ffmpegDir, { recursive: true });

  const python = process.env.BUNDLE_PYTHON || resolveCommand('python3') || resolveCommand('python');
  if (!python) {
    console.error('Could not find python. Set BUNDLE_PYTHON=/path/to/python');
    process.exit(1);
  }

  console.log('[bundle] creating venv at', pythonDir);
  execFileSync(python, ['-m', 'venv', pythonDir], { stdio: 'inherit' });

  const pip = process.platform === 'win32'
    ? path.join(pythonDir, 'Scripts', 'pip')
    : path.join(pythonDir, 'bin', 'pip');

  console.log('[bundle] installing python deps (faster-whisper only)');
  execFileSync(pip, ['install', '--upgrade', 'pip', 'setuptools', 'wheel'], { stdio: 'inherit' });
  execFileSync(pip, ['install', 'faster-whisper'], { stdio: 'inherit' });

  const ffmpegPath = process.env.FFMPEG_PATH || resolveCommand('ffmpeg');
  if (!ffmpegPath) {
    console.error('Could not find ffmpeg. Install it or set FFMPEG_PATH=/path/to/ffmpeg');
    process.exit(1);
  }

  const ffmpegReal = fs.realpathSync(ffmpegPath);
  const dest = path.join(ffmpegDir, 'ffmpeg');
  fs.copyFileSync(ffmpegReal, dest);
  fs.chmodSync(dest, 0o755);
  console.log('[bundle] copied ffmpeg from', ffmpegReal);

  console.log('[bundle] done');
}

main();
