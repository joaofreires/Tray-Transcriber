import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  desktopCapturerMock,
  screenMock,
  nativeImageMock,
  selectRegionOnDisplayMock,
  selectScreenshotModeMock,
  spawnMock
} = vi.hoisted(() => ({
  desktopCapturerMock: { getSources: vi.fn() } as any,
  screenMock: {
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn(),
    getPrimaryDisplay: vi.fn()
  } as any,
  nativeImageMock: {
    createFromBuffer: vi.fn()
  } as any,
  selectRegionOnDisplayMock: vi.fn(),
  selectScreenshotModeMock: vi.fn(),
  spawnMock: vi.fn()
}));

vi.mock('../ctx.js', () => ({
  desktopCapturer: desktopCapturerMock,
  screen: screenMock,
  nativeImage: nativeImageMock
}));

vi.mock('../shortcuts/region-overlay.js', () => ({
  selectRegionOnDisplay: selectRegionOnDisplayMock
}));

vi.mock('../shortcuts/screenshot-mode-picker.js', () => ({
  selectScreenshotMode: selectScreenshotModeMock
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock
  }
}));

import {
  captureScreenshot,
  captureActiveWindow,
  captureFullScreen,
  captureRegion
} from '../shortcuts/screenshot.js';

function createThumbnail(bufferValue: string, width = 100, height = 80) {
  return {
    isEmpty: () => false,
    toPNG: () => Buffer.from(bufferValue),
    getSize: () => ({ width, height })
  };
}

function spawnProcess(code: number, stdout = '', stderr = '', error?: Error) {
  const processEmitter = new EventEmitter() as any;
  processEmitter.stdout = new EventEmitter();
  processEmitter.stderr = new EventEmitter();
  process.nextTick(() => {
    if (error) {
      processEmitter.emit('error', error);
      return;
    }
    if (stdout) processEmitter.stdout.emit('data', stdout);
    if (stderr) processEmitter.stderr.emit('data', stderr);
    processEmitter.emit('close', code);
  });
  return processEmitter;
}

describe('screenshot capture', () => {
  beforeEach(() => {
    desktopCapturerMock.getSources.mockReset();
    screenMock.getCursorScreenPoint.mockReset();
    screenMock.getDisplayNearestPoint.mockReset();
    screenMock.getPrimaryDisplay.mockReset();
    nativeImageMock.createFromBuffer.mockReset();
    selectRegionOnDisplayMock.mockReset();
    selectScreenshotModeMock.mockReset();
    spawnMock.mockReset();

    const display = {
      id: '1',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      scaleFactor: 1
    };
    screenMock.getCursorScreenPoint.mockReturnValue({ x: 20, y: 20 });
    screenMock.getDisplayNearestPoint.mockReturnValue(display);
    screenMock.getPrimaryDisplay.mockReturnValue(display);
  });

  it('captures full screen from cursor display source', async () => {
    desktopCapturerMock.getSources.mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', thumbnail: createThumbnail('full-screen') }
    ]);

    const result = await captureFullScreen();
    expect(result.toString()).toBe('full-screen');
  });

  it('captures active window by matching active window id', async () => {
    desktopCapturerMock.getSources.mockResolvedValue([
      { id: 'window:123:0', name: 'Editor', thumbnail: createThumbnail('window-123') },
      { id: 'window:321:0', name: 'Terminal', thumbnail: createThumbnail('window-321') }
    ]);

    if (process.platform === 'linux') {
      spawnMock.mockImplementation((cmd: string) => {
        if (cmd === 'xdotool') return spawnProcess(0, '321\n');
        return spawnProcess(1, '', 'unexpected command');
      });
    } else if (process.platform === 'darwin') {
      spawnMock.mockImplementation((cmd: string) => {
        if (cmd === 'osascript') return spawnProcess(0, 'Terminal\n');
        return spawnProcess(1, '', 'unexpected command');
      });
    } else {
      spawnMock.mockImplementation((cmd: string) => {
        if (cmd === 'powershell') return spawnProcess(0, '321|Terminal\n');
        return spawnProcess(1, '', 'unexpected command');
      });
    }

    const result = await captureActiveWindow();
    expect(result.toString()).toContain('window-321');
  });

  it('returns typed cancel path for region selection', async () => {
    desktopCapturerMock.getSources.mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', thumbnail: createThumbnail('base-screen') }
    ]);
    selectRegionOnDisplayMock.mockResolvedValue(null);

    await expect(captureRegion()).rejects.toMatchObject({
      code: 'SCREENSHOT_SELECTION_CANCELLED'
    });
  });

  it('crops selected region from captured screen image', async () => {
    desktopCapturerMock.getSources.mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', thumbnail: createThumbnail('base-screen', 100, 100) }
    ]);
    selectRegionOnDisplayMock.mockResolvedValue({ x: 10, y: 20, width: 30, height: 40 });
    nativeImageMock.createFromBuffer.mockReturnValue({
      getSize: () => ({ width: 100, height: 100 }),
      crop: (_rect: any) => ({
        isEmpty: () => false,
        toPNG: () => Buffer.from('cropped-screen')
      })
    });

    const result = await captureRegion();
    expect(result.toString()).toBe('cropped-screen');
  });

  it('dispatches choose_each_time to the selected mode', async () => {
    selectScreenshotModeMock.mockResolvedValue('full_screen');
    desktopCapturerMock.getSources.mockResolvedValue([
      { id: 'screen:1:0', display_id: '1', thumbnail: createThumbnail('full-from-chooser') }
    ]);

    const result = await captureScreenshot('choose_each_time');
    expect(selectScreenshotModeMock).toHaveBeenCalledTimes(1);
    expect(result.toString()).toBe('full-from-chooser');
  });

  it('returns typed cancel error when choose_each_time is cancelled', async () => {
    selectScreenshotModeMock.mockResolvedValue(null);
    await expect(captureScreenshot('choose_each_time')).rejects.toMatchObject({
      code: 'SCREENSHOT_SELECTION_CANCELLED'
    });
  });
});
