import { config } from './ctx.js';

export interface DictionaryItem { term: string; description: string; }
export interface CorrectionRule { from: string; to: string; }

export function getDictionaryItems(): DictionaryItem[] {
  const raw: any[] = Array.isArray(config?.dictionary) ? config.dictionary : [];
  const items: DictionaryItem[] = [];
  for (const entry of raw) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      const term = entry.trim();
      if (term) items.push({ term, description: '' });
    } else if (typeof entry === 'object') {
      const term = String(entry.term || entry.word || '').trim();
      const description = String(entry.description || '').trim();
      if (term) items.push({ term, description });
    }
  }
  return items;
}

export function getDictionaryCorrections(): CorrectionRule[] {
  const raw: any[] = Array.isArray(config?.dictionaryCorrections) ? config.dictionaryCorrections : [];
  return raw
    .filter(Boolean)
    .map((e) => ({ from: String(e.from || e.source || '').trim(), to: String(e.to || e.target || '').trim() }))
    .filter((r) => r.from && r.to);
}

export function applyDictionaryCorrections(text: string): string {
  const rules = getDictionaryCorrections();
  if (!rules.length) return text;
  let result = text;
  for (const rule of rules) {
    const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), rule.to);
  }
  return result;
}

export function normalizeTranscript(text: any): string {
  if (!text) return '';
  return applyDictionaryCorrections(String(text).replace(/\s+/g, ' ').trim());
}

export function buildInitialPrompt(): string {
  const custom = (config?.prompt || '').trim();
  const dictItems = getDictionaryItems();
  const dictText = dictItems.length && config?.includeDictionaryInPrompt
    ? `Vocabulary: ${dictItems
        .map((item) =>
          config.includeDictionaryDescriptions && item.description
            ? `${item.term} (${item.description})`
            : item.term
        )
        .join(', ')}`
    : '';
  if (!custom && !dictText) return '';
  if (!dictText) return custom;
  if (!custom) return dictText;
  return config.promptMode === 'prepend' ? `${dictText}\n${custom}` : `${custom}\n${dictText}`;
}
