import { describe, expect, it } from 'vitest';
import { toElectronAccelerator } from '../shortcuts/accelerator.js';

describe('toElectronAccelerator', () => {
  it('maps PrintScreen aliases to Electron PrintScreen key', () => {
    expect(toElectronAccelerator('PrintScreen')).toBe('PrintScreen');
    expect(toElectronAccelerator('Control+PrintScreen')).toBe('Control+PrintScreen');
    expect(toElectronAccelerator('Control+printscreen')).toBe('Control+PrintScreen');
    expect(toElectronAccelerator('Control+prtsc')).toBe('Control+PrintScreen');
    expect(toElectronAccelerator('Control+sysrq')).toBe('Control+PrintScreen');
  });
});
