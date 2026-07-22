import { signal } from '../core/signal';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type StandaloneNavigator = Navigator & { standalone?: boolean };
type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;
type SaveOpenProjects = () => Promise<void>;

export class PwaStore {
  readonly installAvailable = signal(false);
  readonly updateAvailable = signal(false);
  readonly applyingUpdate = signal(false);
  readonly updateError = signal<string | null>(null);

  private installPrompt: BeforeInstallPromptEvent | null = null;
  private listeningForInstall = false;
  private updateServiceWorker: UpdateServiceWorker | null = null;
  private updateActivated = false;
  private saveOpenProjects: SaveOpenProjects | null = null;
  private initialSave: Promise<void> | null = null;
  private finalizingUpdate: Promise<boolean> | null = null;
  private readonly reloadPage: () => void;

  constructor(reloadPage = () => window.location.reload()) {
    this.reloadPage = reloadPage;
  }

  start() {
    if (this.listeningForInstall) return;

    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.handleAppInstalled);
    this.listeningForInstall = true;
  }

  stop() {
    if (this.listeningForInstall) {
      window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', this.handleAppInstalled);
    }

    this.listeningForInstall = false;
    this.clearInstallPrompt();
    this.updateServiceWorker = null;
    this.updateActivated = false;
    this.saveOpenProjects = null;
    this.initialSave = null;
    this.finalizingUpdate = null;
    this.updateAvailable.value = false;
    this.applyingUpdate.value = false;
    this.updateError.value = null;
  }

  async promptInstall() {
    const prompt = this.installPrompt;
    if (!prompt) return;

    // A captured install prompt can only be used once, including when dismissed.
    this.clearInstallPrompt();
    await prompt.prompt();
    await prompt.userChoice;
  }

  setUpdateHandler(updateServiceWorker: UpdateServiceWorker) {
    this.updateServiceWorker = updateServiceWorker;
  }

  showUpdate() {
    this.updateActivated = false;
    this.updateError.value = null;
    this.updateAvailable.value = true;
  }

  dismissUpdate() {
    this.updateAvailable.value = false;
    this.updateError.value = null;
  }

  async restartWithUpdate(saveOpenProjects: SaveOpenProjects) {
    if (!this.updateAvailable.value || !this.updateServiceWorker || this.applyingUpdate.value) {
      return false;
    }

    this.applyingUpdate.value = true;
    this.updateError.value = null;
    this.saveOpenProjects = saveOpenProjects;

    const initialSave = saveOpenProjects();
    this.initialSave = initialSave;
    try {
      await initialSave;
    } catch {
      this.showSaveFailure();
      return false;
    } finally {
      if (this.initialSave === initialSave) {
        this.initialSave = null;
      }
    }

    if (this.updateActivated) {
      return this.handleUpdateControlling();
    }

    try {
      // vite-plugin-pwa ignores this argument in current versions. Passing
      // false documents that its controlling callback, not the updater,
      // owns the eventual reload.
      await this.updateServiceWorker(false);
      return true;
    } catch {
      this.saveOpenProjects = null;
      this.applyingUpdate.value = false;
      this.updateError.value = 'The update could not be started. Your current session stayed open.';
      return false;
    }
  }

  async handleUpdateControlling(): Promise<boolean> {
    this.updateActivated = true;
    this.updateAvailable.value = true;

    if (this.finalizingUpdate) return this.finalizingUpdate;

    const saveOpenProjects = this.saveOpenProjects;
    if (!saveOpenProjects) {
      this.applyingUpdate.value = false;
      return false;
    }

    const finalizingUpdate = this.finishActivatedUpdate(saveOpenProjects);
    this.finalizingUpdate = finalizingUpdate;
    try {
      return await finalizingUpdate;
    } finally {
      if (this.finalizingUpdate === finalizingUpdate) {
        this.finalizingUpdate = null;
      }
    }
  }

  private async finishActivatedUpdate(saveOpenProjects: SaveOpenProjects): Promise<boolean> {
    try {
      await this.initialSave;
      await saveOpenProjects();
    } catch {
      this.showSaveFailure();
      return false;
    }

    return this.reloadAfterSuccessfulSave();
  }

  private reloadAfterSuccessfulSave(): true {
    this.updateAvailable.value = false;
    this.updateError.value = null;
    this.applyingUpdate.value = false;
    this.saveOpenProjects = null;
    this.reloadPage();
    return true;
  }

  private showSaveFailure() {
    this.updateAvailable.value = true;
    this.applyingUpdate.value = false;
    this.saveOpenProjects = null;
    this.updateError.value =
      'Pixel Forge could not save before restarting. Your current session stayed open.';
  }

  private handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault();

    if (this.isRunningStandalone()) {
      this.clearInstallPrompt();
      return;
    }

    this.installPrompt = event as BeforeInstallPromptEvent;
    this.installAvailable.value = true;
  };

  private handleAppInstalled = () => {
    this.clearInstallPrompt();
  };

  private clearInstallPrompt() {
    this.installPrompt = null;
    this.installAvailable.value = false;
  }

  private isRunningStandalone() {
    const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const iosStandalone = (navigator as StandaloneNavigator).standalone === true;
    return displayModeStandalone || iosStandalone;
  }
}

export const pwaStore = new PwaStore();
