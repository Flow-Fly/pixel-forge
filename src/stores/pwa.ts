import { signal } from '../core/signal';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type StandaloneNavigator = Navigator & { standalone?: boolean };

export class PwaStore {
  readonly installAvailable = signal(false);

  private installPrompt: BeforeInstallPromptEvent | null = null;
  private listeningForInstall = false;

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
  }

  async promptInstall() {
    const prompt = this.installPrompt;
    if (!prompt) return;

    // A captured install prompt can only be used once, including when dismissed.
    this.clearInstallPrompt();
    await prompt.prompt();
    await prompt.userChoice;
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
