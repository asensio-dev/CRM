/** Operaciones que la caché necesita de una tabla catálogo (id, name único). */
export interface CatalogStore {
  loadAll(): Promise<{ id: number; name: string }[]>;
  createMany(names: string[]): Promise<void>;
  upsert(name: string): Promise<void>;
  findIdByName(name: string): Promise<number | null>;
}

const keyOf = (name: string) => name.toUpperCase();

/**
 * Caché nombre → id de un catálogo. Se precarga completa (≈1 000 filas) y solo consulta la base
 * por los nombres nuevos. Las comparaciones de SQL Server son case-insensitive, por eso la clave
 * va en mayúsculas.
 */
export class CatalogCache {
  private readonly ids = new Map<string, number>();
  private loaded = false;

  constructor(private readonly store: CatalogStore) {}

  idOf(name: string | null): number | null {
    return name === null ? null : (this.ids.get(keyOf(name)) ?? null);
  }

  private lock: Promise<unknown> = Promise.resolve();

  /**
   * Garantiza que todos los nombres existan en el catálogo. Devuelve cuántos se crearon.
   * Las llamadas se serializan (los lotes se escriben en paralelo).
   */
  ensure(names: Iterable<string | null>): Promise<number> {
    const list = [...names];
    const run = this.lock.then(() => this.doEnsure(list));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async doEnsure(names: Iterable<string | null>): Promise<number> {
    if (!this.loaded) {
      for (const row of await this.store.loadAll()) this.ids.set(keyOf(row.name), row.id);
      this.loaded = true;
    }
    const missing = new Map<string, string>();
    for (const name of names) {
      if (name !== null && !this.ids.has(keyOf(name))) missing.set(keyOf(name), name);
    }
    if (missing.size === 0) return 0;

    const list = [...missing.values()];
    try {
      await this.store.createMany(list);
    } catch {
      // Colisión por intercalación (p. ej. nombres equivalentes para SQL Server): uno a uno.
      for (const name of list) await this.store.upsert(name);
    }
    for (const [key, name] of missing) {
      const id = await this.store.findIdByName(name);
      if (id === null) throw new Error('No se pudo resolver una entrada del catálogo');
      this.ids.set(key, id);
    }
    return list.length;
  }
}
