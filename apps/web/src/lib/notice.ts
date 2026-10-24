import { ref, type Ref } from "vue";

export interface NoticeStore {
  /** The text on show, or null. */
  current: Readonly<Ref<string | null>>;
  /** Shows `text` for `ms` milliseconds; a new post replaces the text and restarts the timer. */
  post(text: string, ms?: number): void;
  /** Hides the text at once. */
  clear(): void;
}

export const NOTICE_MS = 2500;

/** One short app-level message at a time, for feedback that has no natural place in the layout. */
export function createNotice(): NoticeStore {
  const current = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  function clear(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    current.value = null;
  }
  return {
    current,
    post(text, ms = NOTICE_MS) {
      clear();
      current.value = text;
      timer = setTimeout(clear, ms);
    },
    clear,
  };
}
