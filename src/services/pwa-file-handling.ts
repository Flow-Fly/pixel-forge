import {
  projectFileImportService,
  type ProjectFileImportOutcome,
  type ProjectFileImportService,
} from './project-file-import';
import { log } from '../utils/log';

type ProjectFileBatchImporter = Pick<ProjectFileImportService, 'importFiles'>;

export interface PwaFileLaunchResult {
  outcomes: ProjectFileImportOutcome[];
  unreadableFiles: string[];
}

export class PwaFileHandlingService {
  private readonly importer: ProjectFileBatchImporter;
  private launchConsumerRegistered = false;

  constructor(importer: ProjectFileBatchImporter) {
    this.importer = importer;
  }

  registerLaunchConsumer(launchQueue = window.launchQueue): boolean {
    if (!launchQueue || this.launchConsumerRegistered) return false;

    launchQueue.setConsumer((launchParams) => {
      void this.importLaunch(launchParams).catch((error) => {
        log.error('Failed to handle an external file launch:', error);
      });
    });
    this.launchConsumerRegistered = true;
    return true;
  }

  async importLaunch(launchParams: LaunchParams): Promise<PwaFileLaunchResult> {
    const files: File[] = [];
    const unreadableFiles: string[] = [];

    for (const handle of launchParams.files ?? []) {
      try {
        files.push(await handle.getFile());
      } catch (error) {
        unreadableFiles.push(handle.name);
        log.warn(`Could not read ${handle.name} from the operating system:`, error);
      }
    }

    return {
      outcomes: await this.importer.importFiles(files),
      unreadableFiles,
    };
  }
}

export const pwaFileHandling = new PwaFileHandlingService(projectFileImportService);
