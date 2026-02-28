import type { ProviderDescriptor, ProviderUiAction } from '../types';

export function resolveProviderActions(descriptor: ProviderDescriptor): ProviderUiAction[] {
  if (descriptor.requiresInstall) {
    const actions: ProviderUiAction[] = ['use', 'configure', 'install', 'update', 'remove'];
    if (descriptor.supportsLocalPath) actions.push('use_existing');
    return actions;
  }
  if (descriptor.supportsLocalPath) {
    return ['use', 'configure', 'use_existing'];
  }
  return ['use', 'configure'];
}

