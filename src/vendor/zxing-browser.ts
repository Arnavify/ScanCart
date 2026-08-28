type ScanResult = { getText: () => string }
type ScanControls = { stop: () => void }
type DetectorResult = { rawValue?: string }
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectorResult[]> }
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

declare global {
  interface Window { BarcodeDetector?: BarcodeDetectorConstructor }
}

const PRODUCT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf']

function clean(value: unknown) {
  return String(value || '').replace(/[^0-9]/g, '')
}

function validEan13(value: string) {
  if (!/^\d{13}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(value[12])
}

function validEan8(value: string) {
  if (!/^\d{8}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(value[7])
}

function validUpcA(value: string) {
  if (!/^\d{12}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 11; i++) sum += Number(value[i]) * (i % 2 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === Number(value[11])
}

function validProductCode(value: string) {
  return validEan13(value) || validEan8(value) || validUpcA(value)
}

function detector(): BarcodeDetectorLike | null {
  if (!window.BarcodeDetector) return null
  try { return new window.BarcodeDetector({ formats: PRODUCT_FORMATS }) } catch { return null }
}

function makeCanvas(video: HTMLVideoElement, crop: 'full' | 'center'): HTMLCanvasElement {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const canvas = document.createElement('canvas')
  const sw = crop === 'center' ? vw * 0.92 : vw
  const sh = crop === 'center' ? vh * 0.70 : vh
  const sx = crop === 'center' ? (vw - sw) / 2 : 0
  const sy = crop === 'center' ? (vh - sh) / 2 : 0
  const scale = Math.min(1.5, 1800 / Math.max(sw, 1))
  canvas.width = Math.max(800, Math.round(sw * scale))
  canvas.height = Math.max(500, Math.round(sh * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
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
    video.setAttribute('playsinline', 'true')
    await video.play()

    const nativeDetector = detector()
    let stopped = false
    let busy = false
    let timer: number | null = null
    let lastValue = ''
    let stableFrames = 0

    const finish = (candidate: string) => {
      const value = clean(candidate)
      if (!validProductCode(value)) return
      if (value === lastValue) stableFrames += 1
      else {
        lastValue = value
        stableFrames = 1
      }
      if (stableFrames >= 2) callback({ getText: () => value })
    }

    const nativeScan = async (source: CanvasImageSource) => {
      if (!nativeDetector) return
      try {
        const results = await nativeDetector.detect(source)
        for (const item of results) finish(item.rawValue || '')
      } catch {}
    }

    const requestAI = async () => {
      if (stopped || !video.videoWidth || !video.videoHeight) return
      try {
        const image = makeCanvas(video, 'center').toDataURL('image/jpeg', 0.9)
        const response = await fetch('/api/barcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
        })
        const data = await response.json().catch(() => null)
        if (data?.found && typeof data.barcode === 'string') finish(data.barcode)
      } catch {}
    }

    let aiAttempts = 0
    const loop = async () => {
      if (stopped) return
      if (!busy && video.readyState >= 2 && video.videoWidth > 0) {
        busy = true
        try {
          const full = makeCanvas(video, 'full')
          const center = makeCanvas(video, 'center')
          await nativeScan(video)
          await nativeScan(center)
          await nativeScan(full)
        } finally {
          busy = false
        }
      }
      aiAttempts += 1
      if (aiAttempts % 18 === 0) void requestAI()
      timer = window.setTimeout(loop, 120)
    }

    void loop()

    return {
      stop: () => {
        stopped = true
        if (timer !== null) window.clearTimeout(timer)
        stream.getTracks().forEach(track => track.stop())
        if (video.srcObject === stream) video.srcObject = null
      },
    }
  }

  async decodeFromVideoElement(video: HTMLVideoElement, callback: (result?: ScanResult, error?: any, controls?: ScanControls) => void) {
    return this.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920, min: 640 }, height: { ideal: 1080, min: 480 } }, audio: false },
      video,
      callback,
    )
  }

  reset() {}
}
