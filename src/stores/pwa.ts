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

export class PwaStore {
  readonly installAvailable = signal(false);
  readonly updateAvailable = signal(false);
  readonly applyingUpdate = signal(false);
  readonly updateError = signal<string | null>(null);

  private installPrompt: BeforeInstallPromptEvent | null = null;
  private listeningForInstall = false;
  private updateServiceWorker: UpdateServiceWorker | null = null;

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
    this.updateError.value = null;
    this.updateAvailable.value = true;
  }

  dismissUpdate() {
    this.updateAvailable.value = false;
    this.updateError.value = null;
  }

  async restartWithUpdate(saveCurrentProject: () => Promise<void>) {
    if (!this.updateAvailable.value || !this.updateServiceWorker || this.applyingUpdate.value) {
      return false;
    }

    this.applyingUpdate.value = true;
    this.updateError.value = null;

    try {
      await saveCurrentProject();
    } catch {
      this.updateError.value =
        'Pixel Forge could not save before restarting. Your current session stayed open.';
      this.applyingUpdate.value = false;
      return false;
    }

    try {
      this.updateAvailable.value = false;
      await this.updateServiceWorker(true);
      return true;
    } catch {
      this.updateAvailable.value = true;
      this.updateError.value = 'The update could not be started. Your current session stayed open.';
      return false;
    } finally {
      this.applyingUpdate.value = false;
    }
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
