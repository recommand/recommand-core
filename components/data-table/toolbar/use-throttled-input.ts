import React from "react";

interface UseThrottledInputOptions {
  enabled: boolean;
  value: string;
  onChange: (value: string) => void;
  intervalMs?: number;
}

export function useThrottledInput({
  enabled,
  value,
  onChange,
  intervalMs = 300,
}: UseThrottledInputOptions) {
  const [inputValue, setInputValue] = React.useState(value);
  const timeoutRef = React.useRef<number | null>(null);
  const pendingValueRef = React.useRef(value);
  const lastEmittedValueRef = React.useRef(value);
  const lastEmittedAtRef = React.useRef(0);

  const clearScheduledChange = React.useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const emitValue = React.useCallback(
    (nextValue: string) => {
      lastEmittedAtRef.current = Date.now();
      lastEmittedValueRef.current = nextValue;
      onChange(nextValue);
    },
    [onChange]
  );

  React.useEffect(() => {
    if (!enabled) {
      clearScheduledChange();
      pendingValueRef.current = value;
      lastEmittedValueRef.current = value;
      setInputValue(value);
      return;
    }

    if (value === lastEmittedValueRef.current) {
      return;
    }

    clearScheduledChange();
    pendingValueRef.current = value;
    setInputValue(value);
  }, [clearScheduledChange, enabled, value]);

  React.useEffect(() => {
    return clearScheduledChange;
  }, [clearScheduledChange]);

  const setValue = React.useCallback(
    (nextValue: string) => {
      setInputValue(nextValue);
      pendingValueRef.current = nextValue;

      if (!enabled) {
        emitValue(nextValue);
        return;
      }

      clearScheduledChange();

      const elapsed = Date.now() - lastEmittedAtRef.current;
      if (elapsed >= intervalMs) {
        emitValue(nextValue);
        return;
      }

      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        emitValue(pendingValueRef.current);
      }, intervalMs - elapsed);
    },
    [clearScheduledChange, emitValue, enabled, intervalMs]
  );

  const clear = React.useCallback(() => {
    clearScheduledChange();
    setInputValue("");
    pendingValueRef.current = "";
    emitValue("");
  }, [clearScheduledChange, emitValue]);

  return {
    inputValue,
    setValue,
    clear,
  };
}
