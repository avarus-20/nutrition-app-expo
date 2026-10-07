import type { MediaFileStore } from '@/services/photoService';
import { AppError } from '@/utils/errors';

/** In-memory device file storage. File content is the source URI (or the written text). */
export class FakeFiles implements MediaFileStore {
  readonly files = new Map<string, Uint8Array>();
  failPersist = false;
  persistSize: number | null = null;

  async persistFile(sourceUri: string, name: string): Promise<{ uri: string; size: number | null }> {
    if (this.failPersist) throw new AppError('database', 'disk full');
    const uri = `file:///media/${name}`;
    const bytes = new TextEncoder().encode(sourceUri);
    this.files.set(uri, bytes);
    return { uri, size: this.persistSize ?? bytes.length };
  }

  async readFileBytes(uri: string): Promise<Uint8Array> {
    const f = this.files.get(uri);
    if (!f) throw new AppError('not_found', 'missing');
    return f;
  }

  async deleteLocalFile(uri: string): Promise<void> {
    this.files.delete(uri);
  }

  async fileExists(uri: string): Promise<boolean> {
    return this.files.has(uri);
  }

  async writeFileBytes(name: string, bytes: Uint8Array): Promise<string> {
    const uri = `file:///media/${name}`;
    this.files.set(uri, bytes);
    return uri;
  }
}
