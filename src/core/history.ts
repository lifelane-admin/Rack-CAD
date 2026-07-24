import { eventBus } from './event-bus';

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  push(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    eventBus.emit('history:push', undefined);
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (command) {
      command.undo();
      this.redoStack.push(command);
      eventBus.emit('history:undo', undefined);
    }
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (command) {
      command.execute();
      this.undoStack.push(command);
      eventBus.emit('history:redo', undefined);
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}

export const historyManager = new HistoryManager();
