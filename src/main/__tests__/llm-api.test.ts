import { describe, expect, it } from 'vitest';
import { extractTextFromLlmResponse, normalizeLlmHost, resolveLlmEndpoint } from '../llm-api.js';

describe('llm-api helpers', () => {
  it('normalizes host from legacy endpoint URL', () => {
    expect(normalizeLlmHost('http://localhost:1234/v1/chat/completions')).toBe('http://localhost:1234');
  });

  it('resolves host to responses endpoint', () => {
    expect(resolveLlmEndpoint('http://localhost:1234').endpoint).toBe('http://localhost:1234/v1/responses');
  });

  it('adds scheme for host-only value', () => {
    expect(resolveLlmEndpoint('api.openai.com').endpoint).toBe('https://api.openai.com/v1/responses');
  });

  it('extracts output text from responses payload', () => {
    const text = extractTextFromLlmResponse({
      output: [
        {
          content: [
            { type: 'output_text', text: 'Line one\n' },
            { type: 'output_text', text: 'Line two' }
          ]
        }
      ]
    });
    expect(text).toBe('Line one\nLine two');
  });
});
