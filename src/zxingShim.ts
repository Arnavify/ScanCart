type ScanResult = { getText: () => string }
type Controls = { stop: () => void }

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor
  }
}

function getDetector(): BarcodeDetectorLike | null {
  if (!window.BarcodeDetector) return null
  try {
    return new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar'],
    })
  } catch {
    try { return new window.BarcodeDetector() } catch { return null }
  }
}

export class BrowserMultiFormatReader {
  async decodeFromConstraints(
    constraints: MediaStreamConstraints,
    video: HTMLVideoElement,
    callback: (result: ScanResult | undefined, error?: unknown) => void,
  ): Promise<Controls> {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    video.srcObject = stream
    video.muted = true
    video.setAttribute('playsinline', 'true')
    await video.play()

    let stopped = false
    let timer = 0
    let detecting = false
    const detector = getDetector()

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })

    const tick = async () => {
      if (stopped) return
      if (!detecting && video.readyState >= 2 && video.videoWidth > 0) {
        detecting = true
        try {
          if (detector) {
            const results = await detector.detect(video)
            const value = results.find(x => /^\d{8,14}$/.test(String(x.rawValue || '')))?.rawValue
            if (value) callback({ getText: () => String(value) })
          } else if (context) {
            // BarcodeDetector is unavailable on browsers such as Safari.
            // The ScanCart AI endpoint handles this path from captured frames.
            const width = Math.min(video.videoWidth, 1280)
            const height = Math.round(video.videoHeight * (width / video.videoWidth))
            canvas.width = width
            canvas.height = height
            context.drawImage(video, 0, 0, width, height)
          }
        } catch {
          // Keep scanning. Camera/AI errors should not kill the scanner loop.
        } finally {
          detecting = false
        }
      }
      timer = window.setTimeout(tick, detector ? 120 : 500)
    }

    void tick()

    return {
      stop: () => {
        stopped = true
        window.clearTimeout(timer)
        stream.getTracks().forEach(track => track.stop())
        if (video.srcObject === stream) video.srcObject = null
      },
    }
  }

  reset() {
    // Kept for compatibility with the existing scanner lifecycle.
  }
}
