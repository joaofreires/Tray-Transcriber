import { useCallback, useEffect, useRef, useState } from 'react';

type UseConfigSyncParams<TConfig, TDraft> = {
  baseConfig: TConfig;
  draft: TDraft;
  setBaseConfig: (value: TConfig) => void;
  setDraft: (value: TDraft) => void;
  normalizeDraft: (config: TConfig) => TDraft;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right) return false;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!deepEqual(left[index], right[index])) return false;
    }
    return true;
  }

  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
      if (!deepEqual(left[key], right[key])) return false;
    }
    return true;
  }

  return false;
}

export function useConfigSync<TConfig, TDraft>({
  baseConfig,
  draft,
  setBaseConfig,
  setDraft,
  normalizeDraft
}: UseConfigSyncParams<TConfig, TDraft>) {
  const [hasExternalUpdate, setHasExternalUpdate] = useState(false);
  const baseRef = useRef(baseConfig);
  const draftRef = useRef(draft);
  const normalizeRef = useRef(normalizeDraft);
  const latestExternalConfigRef = useRef<TConfig | null>(null);

  useEffect(() => {
    baseRef.current = baseConfig;
  }, [baseConfig]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    normalizeRef.current = normalizeDraft;
  }, [normalizeDraft]);

  const dismissExternalUpdate = useCallback(() => {
    setHasExternalUpdate(false);
  }, []);

  const reloadFromLatest = useCallback(() => {
    const latest = latestExternalConfigRef.current ?? baseRef.current;
    setBaseConfig(latest);
    setDraft(normalizeRef.current(latest));
    latestExternalConfigRef.current = null;
    setHasExternalUpdate(false);
  }, [setBaseConfig, setDraft]);

  useEffect(() => {
    const off = window.trayTranscriber?.onConfigChanged?.((payload) => {
      const incomingConfig = ((payload?.config || {}) as unknown) as TConfig;
      const currentBase = baseRef.current;
      const currentDraft = draftRef.current;
      const normalizedCurrentBase = normalizeRef.current(currentBase);
      const normalizedIncoming = normalizeRef.current(incomingConfig);
      if (currentDraft === null || currentDraft === undefined) {
        setBaseConfig(incomingConfig);
        setDraft(normalizedIncoming);
        latestExternalConfigRef.current = null;
        setHasExternalUpdate(false);
        return;
      }
      const isClean = deepEqual(currentDraft, normalizedCurrentBase);

      setBaseConfig(incomingConfig);

      if (isClean) {
        setDraft(normalizedIncoming);
        latestExternalConfigRef.current = null;
        setHasExternalUpdate(false);
        return;
      }

      latestExternalConfigRef.current = incomingConfig;
      setHasExternalUpdate(true);
    });

    return () => {
      off?.();
    };
  }, [setBaseConfig, setDraft]);

  return {
    hasExternalUpdate,
    reloadFromLatest,
    dismissExternalUpdate
  };
}
