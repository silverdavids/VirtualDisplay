import {useCallback, useEffect, useRef, useState} from 'react';

const isEditableTarget = (target) => {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]')
  );
};

const SHORTCUT_CHARACTER = /^[0-9./+HA-]$/i;

const useLatest = (value) => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

export const useVirtualKeyboardShortcuts = ({
  disabled = false,
  onClearSlip,
  onExecute,
  onFocusStake,
  onOpenPayout,
  onOpenResults,
  onOpenSearch,
  onPrint,
  onSwitchMarket,
}) => {
  const [shortcut, setShortcut] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [highlightKey, setHighlightKey] = useState(null);
  const handlersRef = useLatest({
    onClearSlip,
    onExecute,
    onFocusStake,
    onOpenPayout,
    onOpenResults,
    onOpenSearch,
    onPrint,
    onSwitchMarket,
  });
  const shortcutRef = useLatest(shortcut);
  const feedbackTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);

  const showFeedback = useCallback((message, type = 'error') => {
    window.clearTimeout(feedbackTimerRef.current);
    setFeedback({message, type});
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 3000);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(feedbackTimerRef.current);
    window.clearTimeout(highlightTimerRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (disabled) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const handlers = handlersRef.current;
      const editable = isEditableTarget(event.target);
      const functionActions = {
        F2: handlers.onFocusStake,
        F4: handlers.onClearSlip,
        F6: handlers.onOpenSearch,
        F8: handlers.onOpenPayout,
        F9: handlers.onPrint,
        F10: handlers.onOpenResults,
      };
      if (functionActions[event.key]) {
        event.preventDefault();
        const result = functionActions[event.key]?.();
        if (result?.message) showFeedback(result.message, result.ok ? 'success' : 'error');
        return;
      }

      if (!editable && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        handlers.onSwitchMarket?.(event.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (editable) return;

      if (event.key === 'Enter') {
        if (!shortcutRef.current) return;
        event.preventDefault();
        const result = handlers.onExecute?.(shortcutRef.current);
        showFeedback(result?.message || (result?.ok ? 'Selection added' : 'Invalid shortcut'), result?.ok ? 'success' : 'error');
        if (result?.ok) {
          setShortcut('');
          setHighlightKey(result.highlightKey ?? null);
          window.clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = window.setTimeout(() => setHighlightKey(null), 900);
        }
        return;
      }
      if (event.key === 'Backspace') {
        if (!shortcutRef.current) return;
        event.preventDefault();
        setShortcut(value => value.slice(0, -1));
        return;
      }
      if (event.key === 'Escape' || event.key === 'Delete') {
        if (!shortcutRef.current && !feedback) return;
        event.preventDefault();
        setShortcut('');
        setFeedback(null);
        return;
      }
      if (event.key.length === 1 && SHORTCUT_CHARACTER.test(event.key)) {
        event.preventDefault();
        setShortcut(value => `${value}${event.key.toUpperCase()}`.slice(0, 24));
        setFeedback(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, feedback, handlersRef, shortcutRef, showFeedback]);

  return {feedback, highlightKey, shortcut};
};
