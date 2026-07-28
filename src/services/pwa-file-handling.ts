import { projectFileImportService, type ProjectFileImportService } from './project-file-import';
import { log } from '../utils/log';
import { importProjectFiles, type ProjectFileImportReport } from './project-file-handling';
import { productTelemetry, type TelemetryClient } from './telemetry';

type ProjectFileBatchImporter = Pick<ProjectFileImportService, 'importFiles'>;

export type PwaFileLaunchResult = ProjectFileImportReport;

export class PwaFileHandlingService {
  private readonly importer: ProjectFileBatchImporter;
  private readonly telemetry: TelemetryClient;
  private launchConsumerRegistered = false;
  private launchQueue: Promise<void> = Promise.resolve();

  constructor(importer: ProjectFileBatchImporter, telemetry: TelemetryClient = productTelemetry) {
    this.importer = importer;
    this.telemetry = telemetry;
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

  importLaunch(launchParams: LaunchParams): Promise<PwaFileLaunchResult> {
    if ((launchParams.files?.length ?? 0) > 0) {
      this.telemetry.record({
        name: 'editor_loaded',
        dimensions: { entryPoint: 'file_handler' },
      });
    }
    const importLaunch = this.launchQueue.then(() => this.readLaunchFiles(launchParams));
    this.launchQueue = importLaunch.then(
      () => undefined,
      () => undefined
    );
    return importLaunch;
  }

  private async readLaunchFiles(launchParams: LaunchParams): Promise<PwaFileLaunchResult> {
    const files: File[] = [];
    const unreadableFiles: string[] = [];

    for (const handle of launchParams.files ?? []) {
      try {
        files.push(await handle.getFile());
      } catch (error) {
        unreadableFiles.push(handle.name);
        log.warn('Could not read a launched file from the operating system:', error);
      }
    }

    return await importProjectFiles(files, {
      importer: this.importer,
      unreadableFiles,
    });
  }
}

export const pwaFileHandling = new PwaFileHandlingService(projectFileImportService);
