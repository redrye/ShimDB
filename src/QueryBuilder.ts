import DB from './DB.ts';

export default class QueryBuilder<T> {
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
