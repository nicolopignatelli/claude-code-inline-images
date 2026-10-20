// The runtime has the ES2025 base64 methods; TypeScript's es2023 lib does not declare them.
interface Uint8ArrayConstructor {
  fromBase64(base64: string): Uint8Array
}

interface Uint8Array {
  toBase64(): string
}
