import { afterEach, describe, expect, it, vi } from 'vitest';

const { runShortcutPipelineMock, setTrayBusyMock } = vi.hoisted(() => ({
  runShortcutPipelineMock: vi.fn(),
  setTrayBusyMock: vi.fn()
}));

vi.mock('../shortcuts/pipeline.js', () => ({
  runShortcutPipeline: runShortcutPipelineMock
}));

vi.mock('../tray-manager.js', () => ({
  setTrayBusy: setTrayBusyMock
}));

import { clearShortcutExecutionQueue, enqueueShortcutExecution } from '../shortcuts/executor.js';

afterEach(() => {
  clearShortcutExecutionQueue();
  runShortcutPipelineMock.mockReset();
  setTrayBusyMock.mockReset();
});

describe('shortcut executor queue', () => {
  it('executes queued shortcut pipelines sequentially', async () => {
    const order: string[] = [];

    runShortcutPipelineMock.mockImplementation(async (shortcut: any) => {
      order.push(`start-${shortcut.id}`);
      if (shortcut.id === 'one') {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      order.push(`end-${shortcut.id}`);
      return {};
    });

    const defaults = {
      assistantInputMode: 'prompt_plus_selection',
      textOutputMode: 'paste_then_clipboard',
      ocrProviderId: ''
    } as any;

    enqueueShortcutExecution({ id: 'one', label: 'one', enabled: true, shortcut: 'Ctrl+1', steps: [] } as any, defaults);
    enqueueShortcutExecution({ id: 'two', label: 'two', enabled: true, shortcut: 'Ctrl+2', steps: [] } as any, defaults);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(order).toEqual(['start-one', 'end-one', 'start-two', 'end-two']);
    expect(runShortcutPipelineMock).toHaveBeenCalledTimes(2);
    expect(setTrayBusyMock).toHaveBeenCalled();
  });
});
