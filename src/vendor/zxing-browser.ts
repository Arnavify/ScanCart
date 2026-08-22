type ZXingBrowserGlobal = {
  BrowserMultiFormatReader: new (...args: any[]) => any
}

type ScanControls = {
  stop: () => void
}

const globalZXing = (globalThis as any).ZXingBrowser as ZXingBrowserGlobal | undefined

if (!globalZXing?.BrowserMultiFormatReader) {
  throw new Error('ZXing browser decoder did not load. Check the ZXing CDN scripts in index.html.')
}

export class BrowserMultiFormatReader {
  private readonly inner: any
  private stopped = false
  private timer: number | null = null

  constructor(...args: any[]) {
    this.inner = new globalZXing.BrowserMultiFormatReader(...args)
  }

  async decodeFromVideoElement(
    video: HTMLVideoElement,
    callback: (result?: any, error?: any, controls?: ScanControls) => void,
  ): Promise<ScanControls> {
    if (!video) throw new Error('A video element must be provided.')

    this.stopped = false
    await video.play().catch(() => undefined)

    const controls: ScanControls = {
      stop: () => {
        this.stopped = true
        if (this.timer !== null) {
          window.clearTimeout(this.timer)
          this.timer = null
        }
      },
    }

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not create scanner canvas.')

    const scanFrame = () => {
      if (this.stopped) return

      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
          const scale = Math.min(1, 1600 / video.videoWidth)
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
          context.drawImage(video, 0, 0, canvas.width, canvas.height)

          try {
            const result = this.inner.decodeFromCanvas(canvas)
            if (result) {
              callback(result, undefined, controls)
              return
            }
          } catch (error) {
            callback(undefined, error, controls)
          }
        }
      } catch (error) {
        callback(undefined, error, controls)
      }

      this.timer = window.setTimeout(scanFrame, 120)
    }

    scanFrame()
    return controls
  }

  reset() {
    this.stopped = true
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    try { this.inner.reset?.() } catch {}
  }
}
