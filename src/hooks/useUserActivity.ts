import { useState, useEffect, useRef, useCallback } from "react";

/**
 * 用户活动检测Hook
 * 监听用户的鼠标、键盘等交互事件，判断用户是否活跃
 */
export function useUserActivity(timeoutMs: number = 10000) {
  const [isActive, setIsActive] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(timeoutMs);
  const lastActivityRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 更新活动时间
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsActive(true);
    setTimeRemaining(timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    // 监听的事件类型
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click", "wheel"];

    // 添加事件监听器
    events.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // 启动定时器，每秒检查一次
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeoutMs - elapsed);

      setTimeRemaining(remaining);

      if (elapsed >= timeoutMs) {
        setIsActive(false);
      }
    }, 1000);

    // 清理
    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timeoutMs, updateActivity]);

  return {
    isActive,
    timeRemaining,
    timeRemainingSeconds: Math.ceil(timeRemaining / 1000),
    resetActivity: updateActivity,
  };
}
