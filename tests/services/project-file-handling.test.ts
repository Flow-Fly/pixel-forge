import { describe, expect, it } from 'vitest';
import {
  describeProjectFileImport,
  isSupportedProjectFile,
  supportedProjectFiles,
  type ProjectFileImportReport,
} from '../../src/services/project-file-handling';

function successfulFile(file: File, opened = true) {
  return {
    file,
    ok: true as const,
    result: { projectId: file.name, opened },
  };
}

describe('project file handling', () => {
  it('recognizes only supported project formats', () => {
    const files = [
      new File([], 'drawing.PF'),
      new File([], 'legacy.json'),
      new File([], 'sprite.ase'),
      new File([], 'sprite.aseprite'),
      new File([], 'notes.txt'),
    ];

    expect(files.map(isSupportedProjectFile)).toEqual([true, true, true, true, false]);
    expect(supportedProjectFiles(files).map((file) => file.name)).toEqual([
      'drawing.PF',
      'legacy.json',
      'sprite.ase',
      'sprite.aseprite',
    ]);
  });

  it('describes opened, library-only, and failed imports concisely', () => {
    const report: ProjectFileImportReport = {
      outcomes: [
        successfulFile(new File([], 'portrait.pf')),
        successfulFile(new File([], 'overflow.ase'), false),
        {
          file: new File([], 'broken.pf'),
          ok: false,
          error: new Error('broken'),
        },
      ],
      unreadableFiles: [],
    };

    expect(describeProjectFileImport(report)).toBe(
      'Opened portrait.pf. Saved 1 imported project to Project Library because all tabs are in use. 1 file could not be imported.'
    );
  });

  it('names a lone failed file', () => {
    expect(
      describeProjectFileImport({
        outcomes: [],
        unreadableFiles: ['private.ase'],
      })
    ).toBe('Could not import private.ase.');
  });
});
