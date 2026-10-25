/** The OpenJPEG wasm decoder, typed for what the relief build needs; the package ships no types. */
declare module "@cornerstonejs/codec-openjpeg/decodewasmjs" {
  export interface J2KFrameInfo {
    width: number;
    height: number;
    bitsPerSample: number;
    componentCount: number;
    isSigned: boolean;
  }
  export interface J2KDecoder {
    getEncodedBuffer(size: number): Uint8Array;
    decode(): void;
    getFrameInfo(): J2KFrameInfo;
    getDecodedBuffer(): Uint8Array;
    delete(): void;
  }
  export interface OpenJpegModule {
    J2KDecoder: new () => J2KDecoder;
  }
  const factory: () => Promise<OpenJpegModule>;
  export default factory;
}
