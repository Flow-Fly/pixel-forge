import pako from 'pako';

export class FileService {
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
