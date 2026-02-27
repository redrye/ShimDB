import QueryBuilder from './QueryBuilder.ts';
import DB from './DB.ts';

export default abstract class Model {
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