import { ref, type Ref } from "vue";

export interface Clock {
  now: Ref<Date>;
  start(): void;
  stop(): void;
}

/** A reactive "now" that ticks on an interval so "ago" labels stay current. */
export function createClock(intervalMs = 30_000, read: () => Date = () => new Date()): Clock {
  const now = ref(read());
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    now,
    start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        now.value = read();
      }, intervalMs);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
  };
}
