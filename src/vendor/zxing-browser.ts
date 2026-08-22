type ZXingBrowserGlobal = {
  BrowserMultiFormatReader: new (...args: any[]) => any
}

type ScanControls = { stop: () => void }

const globalZXing = (globalThis as any).ZXingBrowser as ZXingBrowserGlobal | undefined

if (!globalZXing?.BrowserMultiFormatReader) {
  throw new Error('ZXing browser decoder did not load. Check the ZXing CDN script in index.html.')
}

export class BrowserMultiFormatReader {
  private readonly inner: any

  constructor(...args: any[]) {
    this.inner = new globalZXing.BrowserMultiFormatReader(...args)
  }

  async decodeFromVideoElement(
    video: HTMLVideoElement,
    callback: (result?: any, error?: any, controls?: ScanControls) => void,
  ): Promise<ScanControls> {
    if (!video) throw new Error('A video element must be provided.')
    if (typeof this.inner.decodeFromVideoElement !== 'function') {
      throw new Error('ZXing browser decoder does not support video scanning.')
    }
    return this.inner.decodeFromVideoElement(video, callback)
  }

  async decodeFromConstraints(
    constraints: MediaStreamConstraints,
    video: HTMLVideoElement,
    callback: (result?: any, error?: any, controls?: ScanControls) => void,
  ): Promise<ScanControls> {
    if (typeof this.inner.decodeFromConstraints !== 'function') {
      throw new Error('ZXing browser decoder does not support camera constraints.')
    }
    return this.inner.decodeFromConstraints(constraints, video, callback)
  }

  reset() {
    try { this.inner.reset?.() } catch {}
  }
}
