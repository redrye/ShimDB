// eloquent-idb.ts

type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=';

/**
 * 1. SCHEMA BUILDER
 * Mimics Laravel's Schema::create()
 */
export class SchemaBuilder {
  constructor(private store: IDBObjectStore) {}

  index(name: string, unique: boolean = false) {
    this.store.createIndex(name, name, { unique });
    return this;
  }

  string(name: string) { return this.index(name); }
  integer(name: string) { return this.index(name); }
  unique(name: string) { return this.index(name, true); }
}

/**
 * 2. DATABASE CONNECTION MANAGER
 * Mimics Laravel's DB facade and Migrations
 */
export class DB {
  static connection: IDBDatabase | null = null;

  static async connect(dbName: string, version: number, migrations: Record<string, (schema: SchemaBuilder) => void>): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [table, callback] of Object.entries(migrations)) {
          if (!db.objectStoreNames.contains(table)) {
            // Defaulting to auto-incrementing 'id' primary key
            const store = db.createObjectStore(table, { keyPath: 'id', autoIncrement: true });
            callback(new SchemaBuilder(store));
          }
        }
      };

      request.onsuccess = () => {
        DB.connection = request.result;
        resolve(DB.connection);
      };

      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * 3. QUERY BUILDER
 * Mimics Laravel's DB::table()->where()->get()
 */
export class QueryBuilder<T> {
  private wheres: Array<{ field: keyof T; operator: Operator; value: any }> = [];

  constructor(private table: string, private modelClass: any) {}

  where(field: keyof T, operatorOrValue: any, value?: any): this {
    let operator: Operator = '=';
    let val = operatorOrValue;

    if (value !== undefined) {
      operator = operatorOrValue as Operator;
      val = value;
    }

    this.wheres.push({ field, operator, value: val });
    return this;
  }

  async get(): Promise<T[]> {
    if (!DB.connection) throw new Error("Database not connected.");

    return new Promise((resolve, reject) => {
      const transaction = DB.connection!.transaction(this.table, 'readonly');
      const store = transaction.objectStore(this.table);
      const request = store.getAll();

      request.onsuccess = () => {
        let results = request.result;

        // In-memory filtering (IndexedDB native querying is limited for multi-column)
        for (const w of this.wheres) {
          results = results.filter(item => {
            const itemVal = item[w.field as string];
            switch (w.operator) {
              case '=': return itemVal === w.value;
              case '!=': return itemVal !== w.value;
              case '>': return itemVal > w.value;
              case '<': return itemVal < w.value;
              case '>=': return itemVal >= w.value;
              case '<=': return itemVal <= w.value;
              default: return false;
            }
          });
        }

        // Hydrate plain objects into Model instances
        resolve(results.map(res => new this.modelClass(res)));
      };

      request.onerror = () => reject(request.error);
    });
  }

  async first(): Promise<T | null> {
    const results = await this.get();
    return results[0] || null;
  }

  async delete(): Promise<void> {
    const results = await this.get();
    const transaction = DB.connection!.transaction(this.table, 'readwrite');
    const store = transaction.objectStore(this.table);

    results.forEach((item: any) => store.delete(item.id));
  }
}

/**
 * 4. ELOQUENT BASE MODEL
 * Mimics Laravel's Eloquent ORM
 */
export abstract class Model {
  id?: number;

  constructor(attributes: Partial<Model> = {}) {
    Object.assign(this, attributes);
  }

  // Get table name automatically from class name (e.g., User -> users)
  static get table(): string {
    return this.name.toLowerCase() + 's';
  }

  static query<T extends Model>(this: new (...args: any[]) => T): QueryBuilder<T> {
    const staticClass = this as any;
    return new QueryBuilder<T>(staticClass.table, staticClass);
  }

  static where<T extends Model>(this: new (...args: any[]) => T, field: keyof T, operatorOrValue: any, value?: any): QueryBuilder<T> {
    const staticClass = this as any;
    return staticClass.query().where(field, operatorOrValue, value);
  }

  static async all<T extends Model>(this: new (...args: any[]) => T): Promise<T[]> {
    const staticClass = this as any;
    return staticClass.query().get();
  }

  static async find<T extends Model>(this: new (...args: any[]) => T, id: number): Promise<T | null> {
    const staticClass = this as any;
    if (!DB.connection) throw new Error("Database not connected.");

    return new Promise((resolve, reject) => {
      const transaction = DB.connection!.transaction(staticClass.table, 'readonly');
      const store = transaction.objectStore(staticClass.table);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result ? new staticClass(request.result) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async create<T extends Model>(this: new (...args: any[]) => T, data: Partial<T>): Promise<T> {
    const staticClass = this as any;
    if (!DB.connection) throw new Error("Database not connected.");

    return new Promise((resolve, reject) => {
      const transaction = DB.connection!.transaction(staticClass.table, 'readwrite');
      const store = transaction.objectStore(staticClass.table);

      const record = { ...data };
      const request = store.add(record);

      request.onsuccess = () => {
        resolve(new staticClass({ id: request.result as number, ...record }));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async save(): Promise<this> {
    if (!DB.connection) throw new Error("Database not connected.");
    const table = (this.constructor as any).table;

    return new Promise((resolve, reject) => {
      const transaction = DB.connection!.transaction(table, 'readwrite');
      const store = transaction.objectStore(table);

      const request = this.id ? store.put(this) : store.add(this);

      request.onsuccess = () => {
        if (!this.id) this.id = request.result as number;
        resolve(this);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(): Promise<boolean> {
    if (!this.id) return false;
    if (!DB.connection) throw new Error("Database not connected.");

    const table = (this.constructor as any).table;

    return new Promise((resolve, reject) => {
      const transaction = DB.connection!.transaction(table, 'readwrite');
      const store = transaction.objectStore(table);
      const request = store.delete(this.id!);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
}