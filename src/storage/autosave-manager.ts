/**
 * AutoSave & Auto-Recovery Manager for Rack Slicer
 *
 * Guarantees that users never lose their work due to forgotten saves,
 * browser refreshes, tab closures, network hiccups, or unexpected crashes.
 *
 * Key Capabilities:
 * - Automatically initializes a temporary working draft named after the user/project.
 * - Debounces and persists state changes to browser storage in the background.
 * - Detects unsaved recovery sessions on application launch with 1-click restore.
 * - Maintains an archival vault of recent snapshots (preventing accidental overwrite).
 * - Live UI status indicator: "● Unsaved Draft", "☁ Autosaved [time]", "✓ Saved".
 * - Seamlessly reconciles temporary drafts when users explicitly Save / Save As.
 */

import EventBus from '../core/event-bus';
import State from '../core/state';
import { exportJSON, importJSON } from '../utils/export';
import { authStore } from '../auth/auth-store';

export type SaveStatus = 'unsaved' | 'autosaved' | 'saved';

export interface AutoSaveMetadata {
  id: string;
  projectName: string;
  isExplicitlySaved: boolean;
  associatedFileName?: string;
  timestamp: number;
  createdAt: number;
  deviceCount: number;
  rackCount: number;
  cableCount: number;
  cloudNodeCount: number;
  status: SaveStatus;
  version: number;
}

export interface AutoSavePayload extends AutoSaveMetadata {
  dataJson: string;
}

const STORAGE_KEY_CURRENT_DRAFT = 'rackslicer_autosave_active_draft';
const STORAGE_KEY_RECOVERY_VAULT = 'rackslicer_autosave_recovery_vault';
const STORAGE_KEY_AUTOSAVE_CONFIG = 'rackslicer_autosave_config';
const MAX_VAULT_SNAPSHOTS = 6;
const DEBOUNCE_INTERVAL_MS = 1500;
const PERIODIC_FLUSH_INTERVAL_MS = 30000;
const UNSAVED_REMINDER_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export class AutoSaveManager {
  private activeDraft: AutoSavePayload | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private reminderTimer: ReturnType<typeof setTimeout> | null = null;
  private isEnabled: boolean = true;
  private hasShownReminder: boolean = false;
  private lastSavedJson: string = '';

  constructor() {
    this.loadConfig();
  }

  /**
   * Initializes the autosave manager and checks for recoverable drafts.
   */
  public init(): void {
    // Check if there is an unsaved recovery candidate from a previous run
    const recoveredDraft = this.checkRecoveryCandidate();

    // Initialize or continue the active draft session
    this.initActiveDraftSession(recoveredDraft);

    // Setup event listeners
    this.setupListeners();

    // Start background periodic flush timer
    this.periodicTimer = setInterval(() => {
      this.flushPendingAutoSave();
    }, PERIODIC_FLUSH_INTERVAL_MS);

    // Flush immediately if page is hidden or about to unload
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushPendingAutoSave();
      }
    });

    window.addEventListener('beforeunload', () => {
      this.flushPendingAutoSave();
    });

    // Notify listeners of initial status
    if (this.activeDraft) {
      this.broadcastStatus();
    }
  }

  /**
   * Checks if an unsaved draft from a previous session is available for recovery.
   */
  private checkRecoveryCandidate(): AutoSavePayload | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CURRENT_DRAFT);
      if (!raw) return null;

      const draft: AutoSavePayload = JSON.parse(raw);
      // Only treat as recovery candidate if it contains content and was not explicitly saved
      const hasContent = (draft.rackCount > 0 || draft.deviceCount > 0 || draft.cloudNodeCount > 0);
      if (hasContent && !draft.isExplicitlySaved) {
        return draft;
      }
    } catch (e) {
      console.warn('Failed to inspect autosave recovery draft:', e);
    }
    return null;
  }

  /**
   * Initializes active working draft state.
   */
  private initActiveDraftSession(recoveredDraft: AutoSavePayload | null): void {
    if (recoveredDraft) {
      // We have an unsaved session from earlier — notify recovery banner
      this.activeDraft = recoveredDraft;
      setTimeout(() => {
        EventBus.emit('autosave:recovery-available' as any, {
          draftId: recoveredDraft.id,
          projectName: recoveredDraft.projectName,
          timestamp: recoveredDraft.timestamp,
          deviceCount: recoveredDraft.deviceCount,
          rackCount: recoveredDraft.rackCount,
          cableCount: recoveredDraft.cableCount,
        });
      }, 350);
      return;
    }

    // Fresh new draft session
    const user = authStore.getCurrentUser();
    const now = Date.now();
    const dateStr = new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const userName = (user && !user.isGuest && user.name) ? user.name.split(' ')[0] : 'Untitled';

    const defaultProjectName = `${userName} Draft - ${dateStr} ${timeStr}`;

    this.activeDraft = {
      id: `draft_${now}_${Math.random().toString(36).slice(2, 6)}`,
      projectName: defaultProjectName,
      isExplicitlySaved: false,
      timestamp: now,
      createdAt: now,
      deviceCount: 0,
      rackCount: 0,
      cableCount: 0,
      cloudNodeCount: 0,
      status: 'saved', // Start clean until changes happen
      version: 1,
      dataJson: '',
    };

    this.lastSavedJson = exportJSON();
  }

  private setupListeners(): void {
    // Listen to all application state changes
    EventBus.on('state:changed', () => {
      if (!this.isEnabled) return;
      this.onStateChanged();
    });

    // Listen to explicit file saves
    EventBus.on('file:save', () => {
      // In app.ts this triggers saveProject; when successful, markExplicitlySaved is called
    });

    EventBus.on('file:new', () => {
      this.onNewProject();
    });

    EventBus.on('project:load', (content: string) => {
      this.onProjectLoaded(content);
    });

    (EventBus as any).on('autosave:trigger-now', () => {
      this.flushPendingAutoSave();
    });
  }

  /**
   * Fired when canvas or infrastructure objects change.
   */
  private onStateChanged(): void {
    if (!this.activeDraft) return;

    // Mark as unsaved draft
    if (this.activeDraft.status !== 'unsaved') {
      this.activeDraft.status = 'unsaved';
      this.broadcastStatus();
      this.scheduleUnsavedReminder();
    }

    // Debounce background write
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.performAutoSave();
    }, DEBOUNCE_INTERVAL_MS);
  }

  /**
   * Executes the actual autosave operation to browser storage.
   */
  public performAutoSave(): void {
    if (!this.activeDraft || !this.isEnabled) return;

    try {
      const json = exportJSON();
      // Skip if state has not structurally changed from last saved payload
      if (json === this.lastSavedJson && this.activeDraft.status === 'autosaved') {
        return;
      }

      const s = State.getState();
      const now = Date.now();

      this.activeDraft.timestamp = now;
      this.activeDraft.deviceCount = s.devices?.length || 0;
      this.activeDraft.rackCount = s.racks?.length || 0;
      this.activeDraft.cableCount = s.cables?.length || 0;
      this.activeDraft.cloudNodeCount = s.cloudNodes?.length || 0;
      this.activeDraft.dataJson = json;
      this.activeDraft.version += 1;
      this.activeDraft.status = 'autosaved';

      this.lastSavedJson = json;

      // Save to active draft slot
      localStorage.setItem(STORAGE_KEY_CURRENT_DRAFT, JSON.stringify(this.activeDraft));

      // Append to recovery vault snapshots
      this.recordToVault(this.activeDraft);

      this.broadcastStatus();
    } catch (err) {
      console.warn('AutoSave execution failed (storage full?):', err);
    }
  }

  /**
   * Flushes any debounced autosave immediately.
   */
  public flushPendingAutoSave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.activeDraft && this.activeDraft.status === 'unsaved') {
      this.performAutoSave();
    }
  }

  /**
   * Records a snapshot to the recovery vault history.
   */
  private recordToVault(draft: AutoSavePayload): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RECOVERY_VAULT);
      let vault: AutoSavePayload[] = raw ? JSON.parse(raw) : [];

      // Avoid duplicate consecutive identical snapshots
      if (vault.length > 0 && vault[0].dataJson === draft.dataJson) {
        vault[0].timestamp = draft.timestamp;
      } else {
        vault.unshift({ ...draft });
      }

      // Keep only recent snapshots
      if (vault.length > MAX_VAULT_SNAPSHOTS) {
        vault = vault.slice(0, MAX_VAULT_SNAPSHOTS);
      }

      localStorage.setItem(STORAGE_KEY_RECOVERY_VAULT, JSON.stringify(vault));
    } catch (e) {
      // Storage quota safety: clear oldest snapshot if needed
      try {
        const raw = localStorage.getItem(STORAGE_KEY_RECOVERY_VAULT);
        if (raw) {
          let vault: AutoSavePayload[] = JSON.parse(raw);
          if (vault.length > 2) {
            vault = vault.slice(0, 2);
            localStorage.setItem(STORAGE_KEY_RECOVERY_VAULT, JSON.stringify(vault));
          }
        }
      } catch (inner) {}
    }
  }

  /**
   * Called when the user explicitly saves to a file or cloud project.
   */
  public markExplicitlySaved(fileNameOrProjectName?: string): void {
    if (!this.activeDraft) return;

    this.activeDraft.isExplicitlySaved = true;
    this.activeDraft.status = 'saved';
    if (fileNameOrProjectName) {
      this.activeDraft.associatedFileName = fileNameOrProjectName;
      this.activeDraft.projectName = fileNameOrProjectName.replace(/\.json$/i, '');
    }
    this.activeDraft.timestamp = Date.now();
    this.hasShownReminder = false;
    if (this.reminderTimer) clearTimeout(this.reminderTimer);

    try {
      this.activeDraft.dataJson = exportJSON();
      this.lastSavedJson = this.activeDraft.dataJson;
      localStorage.setItem(STORAGE_KEY_CURRENT_DRAFT, JSON.stringify(this.activeDraft));
    } catch (e) {}

    this.broadcastStatus();
  }

  /**
   * Restores an autosaved recovery draft back onto the active canvas.
   */
  public restoreDraft(draftPayload?: AutoSavePayload): boolean {
    const target = draftPayload || this.activeDraft;
    if (!target || !target.dataJson) {
      EventBus.emit('notification', { message: 'No recovery draft data available.', type: 'error' });
      return false;
    }

    try {
      importJSON(target.dataJson);
      this.activeDraft = {
        ...target,
        status: 'autosaved',
        timestamp: Date.now(),
      };
      this.lastSavedJson = target.dataJson;
      localStorage.setItem(STORAGE_KEY_CURRENT_DRAFT, JSON.stringify(this.activeDraft));
      this.broadcastStatus();

      EventBus.emit('notification', {
        message: `⚡ Restored working draft: "${this.activeDraft.projectName}" (${this.activeDraft.rackCount} racks, ${this.activeDraft.deviceCount} devices)`,
        type: 'success',
      });
      return true;
    } catch (err) {
      console.error('Failed to restore draft:', err);
      EventBus.emit('notification', { message: `Failed to restore draft: ${err}`, type: 'error' });
      return false;
    }
  }

  /**
   * Discards the recovery draft prompt and marks the active draft as clean.
   */
  public discardRecoveryDraft(): void {
    if (this.activeDraft) {
      // Archive current to vault before discarding
      this.recordToVault(this.activeDraft);
    }

    // Start fresh clean draft
    const now = Date.now();
    this.activeDraft = {
      id: `draft_${now}_${Math.random().toString(36).slice(2, 6)}`,
      projectName: `Draft - ${new Date(now).toLocaleDateString()}`,
      isExplicitlySaved: false,
      timestamp: now,
      createdAt: now,
      deviceCount: 0,
      rackCount: 0,
      cableCount: 0,
      cloudNodeCount: 0,
      status: 'saved',
      version: 1,
      dataJson: '',
    };

    localStorage.removeItem(STORAGE_KEY_CURRENT_DRAFT);
    this.broadcastStatus();

    EventBus.emit('notification', {
      message: 'Recovery draft dismissed. You are working on a fresh session.',
      type: 'info',
    });
  }

  /**
   * Handles user starting a brand new project.
   */
  private onNewProject(): void {
    // If previous draft had unsaved changes, preserve it in the vault
    if (this.activeDraft && this.activeDraft.dataJson && !this.activeDraft.isExplicitlySaved) {
      this.recordToVault(this.activeDraft);
    }

    const now = Date.now();
    const dateStr = new Date(now).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const user = authStore.getCurrentUser();
    const userName = (user && !user.isGuest && user.name) ? user.name.split(' ')[0] : 'Untitled';

    this.activeDraft = {
      id: `draft_${now}_${Math.random().toString(36).slice(2, 6)}`,
      projectName: `${userName} Project - ${dateStr} ${timeStr}`,
      isExplicitlySaved: false,
      timestamp: now,
      createdAt: now,
      deviceCount: 0,
      rackCount: 1,
      cableCount: 0,
      cloudNodeCount: 0,
      status: 'saved',
      version: 1,
      dataJson: '',
    };

    this.lastSavedJson = exportJSON();
    localStorage.removeItem(STORAGE_KEY_CURRENT_DRAFT);
    this.broadcastStatus();
  }

  /**
   * Handles project loaded from file or cloud.
   */
  private onProjectLoaded(jsonContent: string): void {
    try {
      const parsed = JSON.parse(jsonContent);
      const name = parsed.name || 'Imported Project';
      const now = Date.now();

      this.activeDraft = {
        id: `draft_${now}_${Math.random().toString(36).slice(2, 6)}`,
        projectName: name,
        isExplicitlySaved: true,
        associatedFileName: name,
        timestamp: now,
        createdAt: now,
        deviceCount: parsed.devices?.length || 0,
        rackCount: parsed.racks?.length || 0,
        cableCount: parsed.cables?.length || 0,
        cloudNodeCount: parsed.cloudNodes?.length || 0,
        status: 'saved',
        version: 1,
        dataJson: jsonContent,
      };

      this.lastSavedJson = jsonContent;
      localStorage.setItem(STORAGE_KEY_CURRENT_DRAFT, JSON.stringify(this.activeDraft));
      this.broadcastStatus();
    } catch (e) {}
  }

  /**
   * Recommends saving to permanent file if user has spent significant time without saving.
   */
  private scheduleUnsavedReminder(): void {
    if (this.hasShownReminder) return;

    if (this.reminderTimer) clearTimeout(this.reminderTimer);
    this.reminderTimer = setTimeout(() => {
      if (this.activeDraft && this.activeDraft.status !== 'saved' && !this.activeDraft.isExplicitlySaved) {
        this.hasShownReminder = true;
        EventBus.emit('notification', {
          message: `💡 Tip: You're working on an unsaved draft ("${this.activeDraft.projectName}"). Changes are autosaved to recovery cache, but we recommend saving to a file (Ctrl+S).`,
          type: 'info',
        });
      }
    }, UNSAVED_REMINDER_THRESHOLD_MS);
  }

  /**
   * Broadcasts status changes to all UI subscribers (Toolbar, Statusbar, etc.).
   */
  private broadcastStatus(): void {
    if (!this.activeDraft) return;

    EventBus.emit('autosave:status-changed' as any, {
      status: this.activeDraft.status,
      timestamp: this.activeDraft.timestamp,
      projectName: this.activeDraft.projectName,
      isExplicitlySaved: this.activeDraft.isExplicitlySaved,
    });
  }

  /**
   * Returns current active draft metadata.
   */
  public getActiveMetadata(): AutoSaveMetadata | null {
    if (!this.activeDraft) return null;
    const { dataJson, ...meta } = this.activeDraft;
    return meta;
  }

  /**
   * Returns all recovery snapshots stored in the vault.
   */
  public getVaultSnapshots(): AutoSavePayload[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RECOVERY_VAULT);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  private loadConfig(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_AUTOSAVE_CONFIG);
      if (raw) {
        const config = JSON.parse(raw);
        if (typeof config.enabled === 'boolean') {
          this.isEnabled = config.enabled;
        }
      }
    } catch (e) {}
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    localStorage.setItem(STORAGE_KEY_AUTOSAVE_CONFIG, JSON.stringify({ enabled }));
  }
}

export const autoSaveManager = new AutoSaveManager();
