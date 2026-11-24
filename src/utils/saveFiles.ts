/** Mobile-friendly strategies for getting received photos onto the device. */

/** Batches above this size tend to fail in the iOS/Android share sheet. */
export const SHARE_RECOMMENDED_MAX_FILES = 20;

export function downloadFile(file: Blob, fileName: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser plenty of time to start reading the blob before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

/** Opens the native share sheet ("Save N Images" on iOS, "Save to Photos"/Gallery on Android). */
export async function shareFiles(files: File[]): Promise<'shared' | 'dismissed'> {
  try {
    await navigator.share({ files, title: 'PhotoCrew photos' });
    return 'shared';
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return 'dismissed';
    throw err;
  }
}

function uniqueNames(files: File[]): string[] {
  const used = new Map<string, number>();
  return files.map((f) => {
    const name = f.name || 'photo.jpg';
    const count = used.get(name.toLowerCase()) ?? 0;
    used.set(name.toLowerCase(), count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}

/** Bundles photos into a ZIP (STORE – photos are already compressed) and downloads it. */
export async function downloadAsZip(files: File[], zipName: string, onProgress?: (percent: number) => void): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const names = uniqueNames(files);
  files.forEach((file, i) => zip.file(names[i], file, { binary: true, date: new Date(file.lastModified || Date.now()) }));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, (meta) =>
    onProgress?.(meta.percent),
  );
  downloadFile(blob, zipName);
}
