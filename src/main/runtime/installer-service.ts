import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, fetchFn, logger } from '../ctx.js';
import { getManifestEntry } from './install-manifest.js';
import type {
  InstallAction,
  InstallArtifact,
  InstallJob,
  InstallRequest,
  InstallState,
  RuntimeConfig
} from './types.js';

const execFileAsync = promisify(execFile);

type PersistedInstallerState = {
  jobs: InstallJob[];
  installs: Record<string, InstallState>;
};

function installerStatePath(): string {
  const root = app?.getPath?.('userData') || process.cwd();
  return path.join(root, 'installer-state.json');
}

function readPersistedState(): PersistedInstallerState {
  const stateFile = installerStatePath();
  if (!fs.existsSync(stateFile)) return { jobs: [], installs: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { jobs: [], installs: {} };
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      installs: parsed.installs && typeof parsed.installs === 'object' ? parsed.installs : {}
    };
  } catch {
    return { jobs: [], installs: {} };
  }
}

function writePersistedState(state: PersistedInstallerState): void {
  const file = installerStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function setJobState(job: InstallJob, state: InstallJob['state'], message = ''): void {
  job.state = state;
  job.updatedAt = Date.now();
  job.message = message;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function downloadArtifact(artifact: InstallArtifact, installRoot: string, onState: (state: InstallJob['state'], message: string) => void): Promise<string> {
  onState('downloading', `Downloading ${artifact.filename}`);
  const response = await fetchFn(artifact.url, { method: 'GET' } as any);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const data = Buffer.from(arrayBuffer);
  onState('verifying', `Verifying ${artifact.filename}`);
  const digest = sha256(data);
  if (digest !== artifact.sha256) {
    throw new Error(`Checksum mismatch for ${artifact.filename}`);
  }
  const downloadsDir = path.join(installRoot, '_downloads');
  ensureDirectory(downloadsDir);
  const destination = path.join(downloadsDir, artifact.filename);
  fs.writeFileSync(destination, data);
  return destination;
}

async function installLocalPython(providerId: string, installRoot: string): Promise<{ version: string; installPath: string }> {
  const targetDir = path.join(installRoot, 'python-stt');
  ensureDirectory(targetDir);

  const pythonCmd = process.env.BUNDLE_PYTHON || 'python3';
  const venvDir = path.join(targetDir, 'venv');
  if (!fs.existsSync(venvDir)) {
    await execFileAsync(pythonCmd, ['-m', 'venv', venvDir]);
  }

  const pip = process.platform === 'win32'
    ? path.join(venvDir, 'Scripts', 'pip')
    : path.join(venvDir, 'bin', 'pip');

  const packageName = providerId === 'stt.local.whisperx'
    ? 'whisperx'
    : providerId === 'stt.local.whisper'
      ? 'openai-whisper'
      : 'faster-whisper';

  await execFileAsync(pip, ['install', '--upgrade', packageName]);
  return { version: 'managed', installPath: targetDir };
}

function removeInstallPath(installPath?: string): void {
  if (!installPath) return;
  try {
    fs.rmSync(installPath, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
}

export class InstallerService {
  private queue: InstallJob[] = [];
  private jobs: InstallJob[] = [];
  private installs: Record<string, InstallState> = {};
  private running = false;
  private runtimeConfig: RuntimeConfig | null = null;

  constructor() {
    const persisted = readPersistedState();
    this.jobs = persisted.jobs || [];
    this.installs = persisted.installs || {};
  }

  configure(config: RuntimeConfig): void {
    this.runtimeConfig = config;
    ensureDirectory(config.installer.installRoot);
  }

  getInstallState(providerId: string): InstallState {
    const existing = this.installs[providerId];
    if (existing) return existing;
    return {
      providerId,
      installed: false,
      source: 'none',
      updatedAt: 0
    };
  }

  listInstallStates(): InstallState[] {
    return Object.values(this.installs);
  }

  listJobs(): InstallJob[] {
    return [...this.jobs].sort((a, b) => b.createdAt - a.createdAt);
  }

  cancelJob(jobId: string): boolean {
    const queued = this.queue.find((entry) => entry.id === jobId);
    if (queued && queued.state === 'queued') {
      setJobState(queued, 'cancelled', 'Cancelled before execution');
      this.persist();
      return true;
    }
    const existing = this.jobs.find((entry) => entry.id === jobId);
    if (existing && existing.state === 'queued') {
      setJobState(existing, 'cancelled', 'Cancelled before execution');
      this.persist();
      return true;
    }
    return false;
  }

  async checkForUpdates(): Promise<Array<{ providerId: string; currentVersion?: string; latestVersion: string; hasUpdate: boolean }>> {
    const now = Date.now();
    const results: Array<{ providerId: string; currentVersion?: string; latestVersion: string; hasUpdate: boolean }> = [];

    for (const state of Object.values(this.installs)) {
      const manifest = getManifestEntry(state.providerId);
      if (!manifest) continue;
      const latestVersion = manifest.version;
      const currentVersion = state.version;
      const hasUpdate = !!currentVersion && currentVersion !== latestVersion;
      results.push({ providerId: state.providerId, currentVersion, latestVersion, hasUpdate });
    }

    if (this.runtimeConfig?.installer?.updateChecks) {
      this.runtimeConfig.installer.updateChecks.lastCheckedAt = now;
    }
    return results;
  }

  startJob(request: InstallRequest): InstallJob {
    const now = Date.now();
    const job: InstallJob = {
      id: randomUUID(),
      providerId: String(request.providerId || '').trim(),
      action: request.action,
      createdAt: now,
      updatedAt: now,
      state: 'queued',
      localPath: request.localPath ? String(request.localPath) : undefined,
      message: 'Queued'
    };
    this.queue.push(job);
    this.jobs.push(job);
    this.persist();
    void this.drainQueue();
    return job;
  }

  private async drainQueue(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      if (!job) continue;
      if (job.state === 'cancelled') continue;
      try {
        await this.runJob(job);
      } catch (err: any) {
        setJobState(job, 'failed', err?.message || String(err));
      }
      this.persist();
    }
    this.running = false;
  }

  private async runJob(job: InstallJob): Promise<void> {
    const config = this.runtimeConfig;
    if (!config) throw new Error('Installer service is not configured');
    const installRoot = config.installer.installRoot;
    ensureDirectory(installRoot);

    if (job.action === 'remove') {
      const existing = this.installs[job.providerId];
      if (existing?.installPath) removeInstallPath(existing.installPath);
      this.installs[job.providerId] = {
        providerId: job.providerId,
        installed: false,
        source: 'none',
        updatedAt: Date.now()
      };
      setJobState(job, 'completed', 'Removed');
      return;
    }

    if (job.action === 'use_existing') {
      if (!job.localPath) throw new Error('localPath is required for use_existing');
      this.installs[job.providerId] = {
        providerId: job.providerId,
        installed: true,
        source: 'existing',
        installPath: job.localPath,
        version: 'existing',
        updatedAt: Date.now()
      };
      setJobState(job, 'completed', 'Using existing installation');
      return;
    }

    const manifest = getManifestEntry(job.providerId);
    const installState = this.installs[job.providerId];
    if (manifest?.artifacts?.length) {
      for (const artifact of manifest.artifacts) {
        job.artifact = artifact;
        await downloadArtifact(artifact, installRoot, (state, message) => {
          setJobState(job, state, message);
          this.persist();
        });
      }
    }

    setJobState(job, 'installing', job.action === 'update' ? 'Updating runtime' : 'Installing runtime');

    if (job.providerId.startsWith('stt.local.')) {
      const installed = await installLocalPython(job.providerId, installRoot);
      this.installs[job.providerId] = {
        providerId: job.providerId,
        installed: true,
        source: 'managed',
        version: manifest?.version || installed.version,
        installPath: installed.installPath,
        updatedAt: Date.now()
      };
      setJobState(job, 'completed', 'Local STT runtime ready');
      return;
    }

    if (job.localPath) {
      this.installs[job.providerId] = {
        providerId: job.providerId,
        installed: true,
        source: 'existing',
        installPath: job.localPath,
        version: manifest?.version || installState?.version || 'existing',
        updatedAt: Date.now()
      };
      setJobState(job, 'completed', 'Using supplied local path');
      return;
    }

    // For external providers we currently require existing local binaries/connections.
    this.installs[job.providerId] = {
      providerId: job.providerId,
      installed: true,
      source: 'managed',
      version: manifest?.version || 'managed',
      installPath: installState?.installPath,
      updatedAt: Date.now()
    };
    setJobState(job, 'completed', 'Provider marked as installed. Configure endpoint/path in profile.');
  }

  private persist(): void {
    writePersistedState({ jobs: this.jobs, installs: this.installs });
  }
}
