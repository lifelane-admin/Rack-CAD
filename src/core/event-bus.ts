import { AppEvents } from './types';

type EventCallback<T = any> = (data: T) => void;

class EventBus {
  private listeners: { [K in keyof AppEvents]?: EventCallback<AppEvents[K]>[] } = {};

  on<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [] as any;
    }
    this.listeners[event]!.push(callback);
  }

  off<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(cb => cb !== callback) as any;
  }

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    if (!this.listeners[event]) return;
    this.listeners[event]!.forEach(callback => callback(data));
  }

  once<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    const wrapper = (data: AppEvents[K]) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }
}

export const eventBus = new EventBus();
export default eventBus;
