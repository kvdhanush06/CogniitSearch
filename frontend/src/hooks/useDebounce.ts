import { useEffect, useState } from 'react';

interface UseDebounceReturn<T> {
  debouncedValue: T;
  isDebouncing: boolean;
}

export function useDebounce<T>(value: T, delay: number = 500): UseDebounceReturn<T> {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isDebouncing, setIsDebouncing] = useState(false);

  useEffect(() => {
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedValue(value);
      setIsDebouncing(false);
    }, delay);

    return () => {
      clearTimeout(timer);
      setIsDebouncing(false);
    };
  }, [value, delay]);

  return { debouncedValue, isDebouncing };
}
