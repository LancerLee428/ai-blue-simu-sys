import { ref, computed } from 'vue';
import type { EntityConfig } from '../types/deployment';

/**
 * 命令接口
 */
export interface Command {
  execute(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  canExecute(): boolean;
  getDescription(): string;
}

/**
 * 命令历史管理器
 */
export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistorySize = 50;

  /**
   * 执行命令
   */
  async execute(command: Command): Promise<void> {
    if (!command.canExecute()) {
      throw new Error('命令无法执行');
    }

    await command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // 清空重做栈

    // 限制历史记录大小
    if (this.undoStack.length > this.maxHistorySize) {
      this.undoStack.shift();
    }

    this.notifyListeners();
  }

  /**
   * 撤销命令
   */
  async undo(): Promise<void> {
    const command = this.undoStack.pop();
    if (command) {
      await command.undo();
      this.redoStack.push(command);
      this.notifyListeners();
    }
  }

  /**
   * 重做命令
   */
  async redo(): Promise<void> {
    const command = this.redoStack.pop();
    if (command) {
      await command.redo();
      this.undoStack.push(command);
      this.notifyListeners();
    }
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * 获取撤销栈顶命令描述
   */
  getUndoDescription(): string {
    const command = this.undoStack[this.undoStack.length - 1];
    return command ? command.getDescription() : '';
  }

  /**
   * 获取重做栈顶命令描述
   */
  getRedoDescription(): string {
    const command = this.redoStack[this.redoStack.length - 1];
    return command ? command.getDescription() : '';
  }

  /**
   * 清空历史
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  /**
   * 订阅状态变化
   */
  private listeners: Set<() => void> = new Set();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }
}

/**
 * 创建实体命令
 */
export class CreateEntityCommand implements Command {
  private createdEntityId?: string;

  constructor(
    private stateManager: any,
    private config: EntityConfig
  ) {}

  async execute(): Promise<void> {
    const entity = await this.stateManager.createEntity(this.config);
    this.createdEntityId = entity.id;
  }

  async undo(): Promise<void> {
    if (this.createdEntityId) {
      await this.stateManager.deleteEntity(this.createdEntityId);
    }
  }

  async redo(): Promise<void> {
    await this.execute();
  }

  canExecute(): boolean {
    // 只要有配置数据就可以执行，sourceEntityId 允许为空字符串
    return this.config !== null && this.config !== undefined;
  }

  getDescription(): string {
    return `创建实体: ${this.config.name || '未命名'}`;
  }
}

/**
 * 更新实体命令
 */
export class UpdateEntityCommand implements Command {
  private previousState?: any;

  constructor(
    private stateManager: any,
    private entityId: string,
    private updates: Partial<any>
  ) {}

  async execute(): Promise<void> {
    // 保存当前状态
    const entity = this.stateManager.getEntity(this.entityId);
    if (entity) {
      this.previousState = { ...entity };
    }

    await this.stateManager.updateEntity(this.entityId, this.updates);
  }

  async undo(): Promise<void> {
    if (this.previousState) {
      // 恢复之前的状态
      await this.stateManager.updateEntity(this.entityId, this.previousState);
    }
  }

  async redo(): Promise<void> {
    await this.execute();
  }

  canExecute(): boolean {
    return !!this.entityId;
  }

  getDescription(): string {
    return `更新实体: ${this.entityId.slice(-6)}`;
  }
}

/**
 * 删除实体命令
 */
export class DeleteEntityCommand implements Command {
  private deletedState?: any;

  constructor(
    private stateManager: any,
    private entityId: string
  ) {}

  async execute(): Promise<void> {
    // 保存删除前的状态
    const entity = this.stateManager.getEntity(this.entityId);
    if (entity) {
      this.deletedState = { ...entity };
    }

    await this.stateManager.deleteEntity(this.entityId);
  }

  async undo(): Promise<void> {
    if (this.deletedState) {
      // 重新创建实体
      await this.stateManager.createEntity(this.deletedState);
    }
  }

  async redo(): Promise<void> {
    await this.execute();
  }

  canExecute(): boolean {
    return !!this.entityId;
  }

  getDescription(): string {
    return `删除实体: ${this.entityId.slice(-6)}`;
  }
}

/**
 * 复合命令（批量操作）
 */
export class CompositeCommand implements Command {
  constructor(
    private commands: Command[],
    private description: string
  ) {}

  async execute(): Promise<void> {
    for (const command of this.commands) {
      await command.execute();
    }
  }

  async undo(): Promise<void> {
    // 反向撤销
    for (let i = this.commands.length - 1; i >= 0; i--) {
      await this.commands[i].undo();
    }
  }

  async redo(): Promise<void> {
    for (const command of this.commands) {
      await command.redo();
    }
  }

  canExecute(): boolean {
    return this.commands.every(cmd => cmd.canExecute());
  }

  getDescription(): string {
    return this.description || `批量操作 (${this.commands.length} 个命令)`;
  }
}

/**
 * 命令系统 Composable
 */
export function useCommandSystem() {
  const commandHistory = new CommandHistory();

  const canUndo = computed(() => commandHistory.canUndo());
  const canRedo = computed(() => commandHistory.canRedo());
  const undoDescription = computed(() => commandHistory.getUndoDescription());
  const redoDescription = computed(() => commandHistory.getRedoDescription());

  async function execute(command: Command) {
    await commandHistory.execute(command);
  }

  async function undo() {
    await commandHistory.undo();
  }

  async function redo() {
    await commandHistory.redo();
  }

  function clear() {
    commandHistory.clear();
  }

  return {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    execute,
    undo,
    redo,
    clear,
    commandHistory
  };
}