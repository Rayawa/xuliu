import { YiyanBook, YiyanLibraryCard } from './YiyanModels';

class YiyanListSource<T> implements IDataSource {
  version: number = 0;
  private values: T[] = [];
  private listeners: DataChangeListener[] = [];
  totalCount(): number { return this.values.length; }
  getData(index: number): T { return this.values[index]; }
  replace(values: T[]): void { this.values = values; this.version++; this.listeners.forEach((listener) => listener.onDataReloaded()); }
  registerDataChangeListener(listener: DataChangeListener): void { if (!this.listeners.includes(listener)) this.listeners.push(listener); }
  unregisterDataChangeListener(listener: DataChangeListener): void { this.listeners = this.listeners.filter((item) => item !== listener); }
}
export class YiyanBookSource extends YiyanListSource<YiyanBook> {}
export class YiyanCardSource extends YiyanListSource<YiyanLibraryCard> {}
