type ScanResult = { getText: () => string }
type ScanControls = { stop: () => void }
type DetectorResult = { rawValue?: string }
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectorResult[]> }
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

declare global {
  interface Window { BarcodeDetector?: BarcodeDetectorConstructor }
}

function createDetector(): BarcodeDetectorLike | null {
  if (!window.BarcodeDetector) return null
  try {
    return new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'] })
  } catch {
    try { return new window.BarcodeDetector() } catch { return null }
  }
}

export class BrowserMultiFormatReader {
  async decodeFromConstraints(
    constraints: MediaStreamConstraints,
    video: HTMLVideoElement,
    callback: (result?: ScanResult, error?: any, controls?: ScanControls) => void,
  ): Promise<ScanControls> {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play()

    let stopped = false
    let timer = 0
    let detecting = false
    const detector = createDetector()

    const loop = async () => {
      if (stopped) return
      if (!detecting && video.readyState >= 2 && video.videoWidth > 0 && detector) {
        detecting = true
        try {
          const results = await detector.detect(video)
          const value = results.map(x => String(x.rawValue || '').replace(/[^0-9]/g, '')).find(x => /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(x))
          if (value) callback({ getText: () => value })
        } catch {
          // Keep scanning instead of killing the camera loop.
        } finally {
          detecting = false
        }
      }
      timer = window.setTimeout(loop, detector ? 120 : 500)
    }

    void loop()
    return {
      stop: () => {
        stopped = true
        window.clearTimeout(timer)
        stream.getTracks().forEach(track => track.stop())
        if (video.srcObject === stream) video.srcObject = null
      },
    }
  }

  async decodeFromVideoElement(video: HTMLVideoElement, callback: (result?: ScanResult, error?: any, controls?: ScanControls) => void) {
    return this.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, callback)
  }

  reset() {}
}
