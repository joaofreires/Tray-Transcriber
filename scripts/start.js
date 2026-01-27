const { spawn } = require('child_process');

const electronPath = require('electron');
const env = { ...process.env };

// Some environments export ELECTRON_RUN_AS_NODE=1 globally; Electron ignores the value.
if ('ELECTRON_RUN_AS_NODE' in env) {
  delete env.ELECTRON_RUN_AS_NODE;
}

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
