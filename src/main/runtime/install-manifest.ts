import type { InstallArtifact } from './types.js';

export type ManifestEntry = {
  providerId: string;
  version: string;
  artifacts: InstallArtifact[];
};

// URLs and checksums are placeholders for v1 scaffolding; callers may still use local binaries.
export const INSTALL_MANIFEST: ManifestEntry[] = [
  {
    providerId: 'stt.local.whisperx',
    version: '1.0.0',
    artifacts: []
  },
  {
    providerId: 'stt.local.whisper',
    version: '1.0.0',
    artifacts: []
  },
  {
    providerId: 'stt.local.faster_whisper',
    version: '1.0.0',
    artifacts: []
  },
  {
    providerId: 'llm.ollama',
    version: '1.0.0',
    artifacts: []
  },
  {
    providerId: 'llm.lmstudio',
    version: '1.0.0',
    artifacts: []
  },
  {
    providerId: 'ocr.local_tesseract',
    version: '1.0.0',
    artifacts: []
  }
];

export function getManifestEntry(providerId: string): ManifestEntry | null {
  return INSTALL_MANIFEST.find((entry) => entry.providerId === providerId) || null;
}
