import { createStore } from 'zustand/vanilla';

type MainRuntimeState = {
  tray: any | null;
  win: any | null;
  configWin: any | null;
  isRecording: boolean;
  trayBusy: boolean;
  trayTimer: NodeJS.Timeout | null;
  trayFrameIndex: number;
  trayFrames: any[];
};

const store = createStore<MainRuntimeState>(() => ({
  tray: null,
  win: null,
  configWin: null,
  isRecording: false,
  trayBusy: false,
  trayTimer: null,
  trayFrameIndex: 0,
  trayFrames: []
}));

export function getMainState() {
  return store.getState();
}

export function setMainState(partial: Partial<MainRuntimeState>) {
  store.setState(partial);
}
