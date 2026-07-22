import {
  projectFileImportService,
  type ProjectFileImportOutcome,
  type ProjectFileImportService,
} from './project-file-import';

export const PROJECT_FILE_IMPORT_REPORT_EVENT = 'project-file-import-report';

export interface ProjectFileImportReport {
  outcomes: ProjectFileImportOutcome[];
  unreadableFiles: string[];
}

type ProjectFileBatchImporter = Pick<ProjectFileImportService, 'importFiles'>;

interface ImportProjectFilesOptions {
  importer?: ProjectFileBatchImporter;
  unreadableFiles?: string[];
}

const SUPPORTED_PROJECT_FILE_EXTENSIONS = new Set(['pf', 'json', 'ase', 'aseprite']);

export function isSupportedProjectFile(file: File): boolean {
  return SUPPORTED_PROJECT_FILE_EXTENSIONS.has(getFileExtension(file.name));
}

export function supportedProjectFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter(isSupportedProjectFile);
}

export async function importProjectFiles(
  files: Iterable<File>,
  options: ImportProjectFilesOptions = {}
): Promise<ProjectFileImportReport> {
  const importer = options.importer ?? projectFileImportService;
  const outcomes = await importer.importFiles(files);
  const report = {
    outcomes,
    unreadableFiles: options.unreadableFiles ?? [],
  };
  dispatchProjectFileImportReport(report);
  return report;
}

function dispatchProjectFileImportReport(report: ProjectFileImportReport): void {
  if (report.outcomes.length === 0 && report.unreadableFiles.length === 0) return;

  window.dispatchEvent(
    new CustomEvent<ProjectFileImportReport>(PROJECT_FILE_IMPORT_REPORT_EVENT, {
      detail: report,
    })
  );
}

export function describeProjectFileImport(report: ProjectFileImportReport): string | null {
  const opened = report.outcomes.filter((outcome) => outcome.ok && outcome.result.opened);
  const saved = report.outcomes.filter((outcome) => outcome.ok && !outcome.result.opened);
  const failed = report.outcomes.filter((outcome) => !outcome.ok).length;
  const failureCount = failed + report.unreadableFiles.length;
  const messages: string[] = [];

  if (opened.length === 1) {
    messages.push(`Opened ${opened[0].file.name}.`);
  } else if (opened.length > 1) {
    messages.push(`Opened ${opened.length} projects.`);
  }

  if (saved.length === 1) {
    messages.push('Saved 1 imported project to Project Library because all tabs are in use.');
  } else if (saved.length > 1) {
    messages.push(
      `Saved ${saved.length} imported projects to Project Library because all tabs are in use.`
    );
  }

  if (failureCount === 1 && opened.length === 0 && saved.length === 0) {
    const failedOutcome = report.outcomes.find((outcome) => !outcome.ok);
    const filename = failedOutcome?.file.name ?? report.unreadableFiles[0];
    messages.push(`Could not import ${filename}.`);
  } else if (failureCount === 1) {
    messages.push('1 file could not be imported.');
  } else if (failureCount > 1) {
    messages.push(`${failureCount} files could not be imported.`);
  }

  return messages.join(' ') || null;
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}
