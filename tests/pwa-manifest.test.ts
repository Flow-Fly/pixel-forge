import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';

let outputDirectory: string | undefined;

afterEach(async () => {
  if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
  outputDirectory = undefined;
});

describe('generated PWA manifest', () => {
  it('registers project formats with one focused application window', async () => {
    outputDirectory = await mkdtemp(join(tmpdir(), 'pixel-forge-pwa-'));
    await build({
      configFile: resolve(process.cwd(), 'vite.config.ts'),
      logLevel: 'silent',
      build: {
        outDir: outputDirectory,
        emptyOutDir: true,
      },
    });
    const manifest = JSON.parse(
      await readFile(join(outputDirectory, 'manifest.webmanifest'), 'utf8')
    );

    expect(manifest.file_handlers).toEqual([
      {
        action: './',
        accept: {
          'application/x-pixelforge': ['.pf'],
          'application/x-aseprite': ['.ase', '.aseprite'],
        },
        launch_type: 'single-client',
      },
    ]);
    expect(manifest.launch_handler).toEqual({ client_mode: 'focus-existing' });
  }, 20_000);
});
