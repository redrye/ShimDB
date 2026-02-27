export default class SchemaBuilder {
  constructor(private store: IDBObjectStore) {}

  index(name: string, unique: boolean = false) {
    this.store.createIndex(name, name, { unique });
    return this;
  }

  string(name: string) { return this.index(name); }
  integer(name: string) { return this.index(name); }
  unique(name: string) { return this.index(name, true); }
}
