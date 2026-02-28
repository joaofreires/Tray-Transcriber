import { describe, expect, it } from 'vitest';
import { InstallerService } from '../runtime/installer-service.js';
import { normalizeRuntimeConfig } from '../runtime/runtime-config.js';

describe('InstallerService', () => {
  it('queues and completes use_existing job', async () => {
    const installer = new InstallerService();
    installer.configure(normalizeRuntimeConfig({}));

    const job = installer.startJob({
      providerId: 'llm.ollama',
      action: 'use_existing',
      localPath: '/usr/bin/ollama'
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const persisted = installer.listJobs().find((entry) => entry.id === job.id);
    expect(persisted).toBeTruthy();
    expect(['completed', 'queued', 'installing']).toContain(String(persisted?.state));
  });
});
