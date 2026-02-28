import { normalizeLlmHost } from './llm-api.js';

type AnyRecord = Record<string, any>;

function changedString(nextValue: unknown, prevValue: unknown): boolean {
  return String(nextValue ?? '').trim() !== String(prevValue ?? '').trim();
}

function ensureLlmProfileShape(config: AnyRecord): { llmConfig: AnyRecord; profile: AnyRecord } {
  if (!config.providers || typeof config.providers !== 'object') config.providers = {};
  if (!config.providers.llm || typeof config.providers.llm !== 'object') {
    config.providers.llm = {
      activeProviderId: 'llm.openai_compatible',
      activeProfileId: 'llm-legacy-bridge',
      profiles: []
    };
  }

  const llmConfig = config.providers.llm as AnyRecord;
  llmConfig.activeProviderId = String(llmConfig.activeProviderId || 'llm.openai_compatible').trim() || 'llm.openai_compatible';
  llmConfig.activeProfileId = String(llmConfig.activeProfileId || '').trim();
  if (!Array.isArray(llmConfig.profiles)) llmConfig.profiles = [];

  let profile = llmConfig.profiles.find(
    (entry: AnyRecord) =>
      entry &&
      String(entry.id || '').trim() === llmConfig.activeProfileId &&
      String(entry.providerId || '').trim() === llmConfig.activeProviderId
  );

  if (!profile) {
    profile = llmConfig.profiles.find(
      (entry: AnyRecord) => entry && String(entry.providerId || '').trim() === llmConfig.activeProviderId
    );
  }

  if (!profile) {
    profile = {
      id: llmConfig.activeProfileId || 'llm-legacy-bridge',
      providerId: llmConfig.activeProviderId,
      label: 'LLM Profile',
      endpoint: '',
      model: '',
      options: {}
    };
    llmConfig.profiles.push(profile);
  }

  if (!profile.id) profile.id = llmConfig.activeProfileId || 'llm-legacy-bridge';
  if (!llmConfig.activeProfileId) llmConfig.activeProfileId = profile.id;
  if (!profile.providerId) profile.providerId = llmConfig.activeProviderId;
  if (!profile.options || typeof profile.options !== 'object') profile.options = {};

  return { llmConfig, profile };
}

export function applyLegacyAssistantOverrides(nextConfig: AnyRecord, previousConfig: AnyRecord): void {
  const endpointChanged = changedString(nextConfig.llmEndpoint, previousConfig.llmEndpoint);
  const modelChanged = changedString(nextConfig.llmModel, previousConfig.llmModel);
  const assistantNameChanged = changedString(nextConfig.assistantName, previousConfig.assistantName);
  const systemPromptChanged = changedString(nextConfig.llmSystemPrompt, previousConfig.llmSystemPrompt);

  if (!endpointChanged && !modelChanged && !assistantNameChanged && !systemPromptChanged) return;

  const { profile } = ensureLlmProfileShape(nextConfig);

  if (endpointChanged) profile.endpoint = normalizeLlmHost(String(nextConfig.llmEndpoint || '').trim());
  if (modelChanged) profile.model = String(nextConfig.llmModel || '').trim();
  if (assistantNameChanged) profile.options.assistantName = String(nextConfig.assistantName || '').trim();
  if (systemPromptChanged) profile.options.systemPrompt = String(nextConfig.llmSystemPrompt || '');
}
