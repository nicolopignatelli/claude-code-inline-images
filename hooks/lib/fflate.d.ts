// The two functions of the vendored fflate 0.8.2 this mod uses.
export function unzlibSync(data: Uint8Array, opts?: { out?: Uint8Array; dictionary?: Uint8Array }): Uint8Array
export function zlibSync(data: Uint8Array, opts?: { level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }): Uint8Array
