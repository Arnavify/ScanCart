type ZXingBrowserGlobal = {
  BrowserMultiFormatReader: new (...args: any[]) => any
}

const globalZXing = (globalThis as any).ZXingBrowser as ZXingBrowserGlobal | undefined

if (!globalZXing?.BrowserMultiFormatReader) {
  throw new Error('ZXing browser decoder did not load. Check the ZXing CDN scripts in index.html.')
}

export const BrowserMultiFormatReader = globalZXing.BrowserMultiFormatReader
