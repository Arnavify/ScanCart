import { BrowserMultiFormatReader } from '@zxing/browser'

type Detected = { rawValue?: string }
type BarcodeDetectorLike = new (options?: { formats?: string[] }) => {
  detect: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<Detected[]>
}
type ScannerControls = { stop: () => void }

const BarcodeDetectorCtor = (globalThis as typeof globalThis & {
  BarcodeDetector?: BarcodeDetectorLike
}).BarcodeDetector

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']

function cleanBarcode(value: unknown): string {
  return String(value ?? '').replace(/[^0-9]/g, '')
}

function validEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(value[12])
}

function validEan8(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 7; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === Number(value[7])
}

function validUpcA(value: string): boolean {
  if (!/^\d{12}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 11; i++) sum += Number(value[i]) * (i % 2 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === Number(value[11])
}

function normalize(value: unknown): string {
  const clean = cleanBarcode(value)
  if (validEan13(clean) || validEan8(clean) || validUpcA(clean)) return clean
  return clean.length >= 8 && clean.length <= 14 ? clean : ''
}

function makeCanvas(video: HTMLVideoElement, mode: 'full' | 'wide' | 'tight' | 'gray'): HTMLCanvasElement {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const scale = Math.min(1, 1600 / vw)
  let sx = 0
  let sy = 0
  let sw = vw
  let sh = vh

  if (mode === 'wide') {
    sw = vw * 0.9
    sh = vh * 0.72
    sx = (vw - sw) / 2
    sy = (vh - sh) / 2
  } else if (mode === 'tight' || mode === 'gray') {
    sw = vw * 0.82
    sh = vh * 0.58
    sx = (vw - sw) / 2
    sy = (vh - sh) / 2
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(640, Math.round(sw * scale))
  canvas.height = Math.max(360, Math.round(sh * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: mode === 'gray' })
  if (!ctx) return canvas
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

  if (mode === 'gray') {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < data.data.length; i += 4) {
      const r = data.data[i]
      const g = data.data[i + 1]
      const b = data.data[i + 2]
      const y = Math.max(0, Math.min(255, ((0.299 * r + 0.587 * g + 0.114 * b) - 128) * 1.65 + 128))
      data.data[i] = y
      data.data[i + 1] = y
      data.data[i + 2] = y
    }
    ctx.putImageData(data, 0, 0)
  }

  return canvas
}

async function nativeDecode(detector: InstanceType<BarcodeDetectorLike>, video: HTMLVideoElement): Promise<string> {
  try {
    const results = await detector.detect(video)
    for (const result of results) {
      const value = normalize(result.rawValue)
      if (value) return value
    }
  } catch {
    // BarcodeDetector is optional. ZXing remains the fallback.
  }
  return ''
}

function zxingDecode(reader: any, video: HTMLVideoElement): string {
  for (const mode of ['full', 'wide', 'tight', 'gray'] as const) {
    try {
      const result = reader.decodeFromCanvas(makeCanvas(video, mode))
      const value = normalize(result?.getText?.())
      if (value) return value
    } catch {
      // No barcode in this frame is expected.
    }
  }
  return ''
}

const prototype = (BrowserMultiFormatReader as any).prototype
const original = prototype.decodeFromVideoElement

if (!prototype.__scanCartPatched) {
  prototype.__scanCartPatched = true
  prototype.decodeFromVideoElement = async function patchedDecodeFromVideoElement(
    source: string | HTMLVideoElement,
    callback: (result: any, error?: any) => void,
  ): Promise<ScannerControls> {
    const video = typeof source === 'string' ? document.getElementById(source) as HTMLVideoElement | null : source
    if (!video) throw new Error('Scanner video element was not found.')

    let stopped = false
    let busy = false
    let frameHandle = 0
    let lastAttempt = 0
    let stableValue = ''
    let stableCount = 0

    let detector: InstanceType<BarcodeDetectorLike> | null = null
    if (BarcodeDetectorCtor) {
      try {
        detector = new BarcodeDetectorCtor({ formats: NATIVE_FORMATS })
      } catch {
        detector = null
      }
    }

    const report = (value: string) => {
      if (value === stableValue) stableCount += 1
      else {
        stableValue = value
        stableCount = 1
      }
      if (stableCount >= 2) callback({ getText: () => value }, null)
    }

    const tick = async (now: number) => {
      if (stopped) return
      if (now - lastAttempt < 110 || busy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        frameHandle = requestAnimationFrame(tick)
        return
      }
      lastAttempt = now
      busy = true
      try {
        let value = detector ? await nativeDecode(detector, video) : ''
        if (!value) value = zxingDecode(this, video)
        if (value) report(value)
      } finally {
        busy = false
        if (!stopped) frameHandle = requestAnimationFrame(tick)
      }
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>(resolve => video.addEventListener('loadeddata', () => resolve(), { once: true }))
    }
    if (video.paused) await video.play()
    frameHandle = requestAnimationFrame(tick)

    return {
      stop() {
        stopped = true
        cancelAnimationFrame(frameHandle)
      },
    }
  }

  prototype.__scanCartOriginalDecodeFromVideoElement = original
}
