type ZXingLibraryGlobal = {
  BarcodeFormat: Record<string, any>
  DecodeHintType: Record<string, any>
}

const globalZXing = (globalThis as any).ZXing as ZXingLibraryGlobal | undefined

if (!globalZXing?.BarcodeFormat || !globalZXing?.DecodeHintType) {
  throw new Error('ZXing library did not load. Check the ZXing CDN scripts in index.html.')
}

export const BarcodeFormat = globalZXing.BarcodeFormat
export const DecodeHintType = globalZXing.DecodeHintType
