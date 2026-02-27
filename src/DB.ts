import SchemaBuilder from './SchemaBuilder.ts';

export default class DB {
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
