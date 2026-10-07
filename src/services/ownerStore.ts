import { LOCAL_OWNER } from '@/domain/types';

type Listener = (ownerId: string) => void;

/**
 * Current data owner: the signed-in Supabase user id, or `local` when the app
 * is used without an account. Repositories always filter by this id.
 */
class OwnerStore {
  private id: string = LOCAL_OWNER;
  private listeners = new Set<Listener>();

  get = (): string => this.id;

  set(id: string): void {
    if (id === this.id) return;
    this.id = id;
    for (const l of [...this.listeners]) l(id);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const ownerStore = new OwnerStore();
