import { useEffect, useRef, useState, useCallback } from 'react';

interface InactivityTimeoutOptions {
  timeoutMinutes: number;
  warningMinutes: number;
  onTimeout: () => void;
}

export function useInactivityTimeout({
  timeoutMinutes,
  warningMinutes,
  onTimeout,
}: InactivityTimeoutOptions) {
  const [showWarning, setShowWarning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    setShowWarning(false);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    const warningTime = (timeoutMinutes - warningMinutes) * 60 * 1000;
    const timeoutTime = timeoutMinutes * 60 * 1000;

    warningTimeoutRef.current = setTimeout(() => {
      setShowWarning(true);
    }, warningTime);

    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, timeoutTime);
  }, [timeoutMinutes, warningMinutes, onTimeout]);

  const extendSession = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];

    const handleActivity = () => {
      if (!showWarning) {
        resetTimer();
      }
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    resetTimer();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
    };
  }, [resetTimer, showWarning]);

  return {
    showWarning,
    extendSession,
  };
}
