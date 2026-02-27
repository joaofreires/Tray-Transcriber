import { setTrayBusy } from '../tray-manager.js';
import type { ShortcutDefinition, ShortcutDefaults } from './schema.js';
import { runShortcutPipeline } from './pipeline.js';

type QueueItem = {
  shortcut: ShortcutDefinition;
  defaults: ShortcutDefaults;
};

let queue: QueueItem[] = [];
let running = false;

async function drainQueue(): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length) {
    const item = queue.shift();
    if (!item) continue;

    setTrayBusy(true);
    try {
      await runShortcutPipeline(item.shortcut, item.defaults);
    } catch (err) {
      console.error('[shortcuts] shortcut execution failed', {
        shortcutId: item.shortcut.id,
        shortcutLabel: item.shortcut.label,
        error: err
      });
    } finally {
      setTrayBusy(false);
    }
  }

  running = false;
}

export function enqueueShortcutExecution(shortcut: ShortcutDefinition, defaults: ShortcutDefaults): void {
  queue.push({ shortcut, defaults });
  void drainQueue();
}

export function clearShortcutExecutionQueue(): void {
  queue = [];
}
