import type { EntityName } from '@/database/schema';

type Listener = (entities: readonly EntityName[]) => void;

/** Notifies UI hooks that local data changed (local writes or sync pulls). */
class DataEvents {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(entities: readonly EntityName[]): void {
    for (const l of [...this.listeners]) {
      try {
        l(entities);
      } catch {
        // A failing listener must not break the writer.
      }
    }
  }
}

export const dataEvents = new DataEvents();
