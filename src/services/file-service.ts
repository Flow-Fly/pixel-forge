import pako from 'pako';

export class FileService {
  // ===== JSON (uncompressed) =====

  static saveToJSON(data: any, filename: string) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  static loadFromJSON<T>(): Promise<T> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const json = JSON.parse(event.target?.result as string);
            resolve(json);
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      };

      input.click();
    });
  }

  // ===== Compressed .pf format =====

  /**
   * Save project data as compressed .pf file using ZLIB compression.
   * Significantly smaller than uncompressed JSON.
   */
  static saveCompressed(data: any, filename: string) {
    const json = JSON.stringify(data);
    const compressed = pako.deflate(json);
    const blob = new Blob([compressed], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pf') ? filename : `${filename}.pf`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Load a compressed .pf file and return parsed data.
   */
  static loadCompressed<T>(): Promise<T> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pf';

      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        try {
          const buffer = await file.arrayBuffer();
          const decompressed = pako.inflate(new Uint8Array(buffer), { to: 'string' });
          const json = JSON.parse(decompressed);
          resolve(json);
        } catch (error) {
          reject(new Error(`Failed to load .pf file: ${error}`));
        }
      };

      input.click();
    });
  }

  /**
   * Load either .pf (compressed) or .json (uncompressed) project files.
   */
  static loadProject<T>(): Promise<T> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pf,.json';

      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        try {
          if (file.name.endsWith('.pf')) {
            // Compressed format
            const buffer = await file.arrayBuffer();
            const decompressed = pako.inflate(new Uint8Array(buffer), { to: 'string' });
            resolve(JSON.parse(decompressed));
          } else {
            // JSON format
            const text = await file.text();
            resolve(JSON.parse(text));
          }
        } catch (error) {
          reject(new Error(`Failed to load project: ${error}`));
        }
      };

      input.click();
    });
  }

  // ===== Image Export =====

  static exportToPNG(canvas: HTMLCanvasElement, filename: string) {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    a.click();
  }

  static exportToWebP(canvas: HTMLCanvasElement, filename: string, quality = 1) {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.webp') ? filename : `${filename}.webp`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/webp', quality);
  }

  // ===== Utility =====

  static downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
