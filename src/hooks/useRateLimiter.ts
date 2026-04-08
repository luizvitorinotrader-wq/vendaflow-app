import { useState, useCallback, useRef } from 'react';

interface RateLimiterOptions {
  cooldownSeconds: number;
}

export function useRateLimiter({ cooldownSeconds }: RateLimiterOptions) {
  const [isLocked, setIsLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startCooldown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsLocked(true);
    setRemainingSeconds(cooldownSeconds);

    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [cooldownSeconds]);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsLocked(false);
    setRemainingSeconds(0);
  }, []);

  return {
    isLocked,
    remainingSeconds,
    startCooldown,
    reset,
  };
}
