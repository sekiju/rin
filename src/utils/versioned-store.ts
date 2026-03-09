import type { RootDatabase, Database } from "lmdb";

type Migration<T> = (old: any) => T;

interface Versioned<T> {
  v: number;
  d: T;
}

interface StoreOptions<T> {
  db: RootDatabase;
  name: string;
  version: number;
  migrations: Record<number, Migration<T>>;
  default: T;
}

export class VersionedStore<T> {
  private store: Database<Versioned<T>, string>;
  private readonly name: string;
  private readonly version: number;
  private readonly migrations: Record<number, Migration<T>>;
  private readonly default: T;

  constructor(opts: StoreOptions<T>) {
    this.store = opts.db.openDB<Versioned<T>, string>({ name: opts.name });
    this.name = opts.name;
    this.version = opts.version;
    this.migrations = opts.migrations;
    this.default = opts.default;
  }

  get(key: string): T | undefined;
  get(key: string, withDefault: true): T;
  get(key: string, withDefault: false): T | undefined;
  get(key: string, withDefault = true): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      if (withDefault) {
        return this.default;
      }
      return undefined;
    }

    if (entry.v === this.version) return entry.d;

    const migrated = this.migrate(entry);
    // lazy write-back — next read is fast
    this.store.put(key, { v: this.version, d: migrated });
    return migrated;
  }

  put(key: string, value: T): Promise<boolean> {
    return this.store.put(key, { v: this.version, d: value });
  }

  remove(key: string): Promise<boolean> {
    return this.store.remove(key);
  }

  *entries(): IterableIterator<[string, T]> {
    for (const { key, value } of this.store.getRange()) {
      if (value.v === this.version) {
        yield [key, value.d];
      } else {
        const migrated = this.migrate(value);
        this.store.put(key, { v: this.version, d: migrated });
        yield [key, migrated];
      }
    }
  }

  private migrate(entry: Versioned<any>): T {
    let data = entry.d;
    for (let v = entry.v + 1; v <= this.version; v++) {
      const fn = this.migrations[v];
      if (!fn) throw new Error(`Missing migration for ${this.name} v${v}`);
      data = fn(data);
    }
    return data;
  }
}
