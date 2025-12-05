import { useState, useCallback } from 'react';

const MAX_HISTORY_SIZE = 100;

export interface UseHistoryResult {
  history: string[];
  addToHistory: (input: string) => void;
  clearHistory: () => void;
}

export function useHistory(): UseHistoryResult {
  const [history, setHistory] = useState<string[]>([]);

  const addToHistory = useCallback((input: string) => {
    setHistory((prev) => {
      // Don't add duplicates of the last entry
      if (prev.length > 0 && prev[prev.length - 1] === input) {
        return prev;
      }

      const newHistory = [...prev, input];

      // Keep history within bounds
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(-MAX_HISTORY_SIZE);
      }

      return newHistory;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, addToHistory, clearHistory };
}
