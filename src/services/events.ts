import type { EntityName } from '@/database/schema';

/** Synchronized tables plus device-local tables the UI observes. */
export type DataTopic = EntityName | 'entry_drafts';

type Listener = (topics: readonly DataTopic[]) => void;

/** Notifies UI hooks that local data changed (local writes or sync pulls). */
class DataEvents {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(topics: readonly DataTopic[]): void {
    for (const l of [...this.listeners]) {
      try {
        l(topics);
      } catch {
        // A failing listener must not break the writer.
      }
    }
  }
}

export const dataEvents = new DataEvents();
