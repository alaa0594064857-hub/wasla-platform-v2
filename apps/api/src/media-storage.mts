import { randomUUID } from "node:crypto";

export const MAX_PROFILE_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 4096;
export const MAX_IMAGE_PIXELS = 16_000_000;
export const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];
export type MediaPurpose = "avatar" | "store_logo" | "product_image";

export interface ParsedImageDataUrl {
  contentType: SupportedMediaType;
  bytes: Buffer;
  byteLength: number;
}

/** Provider-neutral contract for future S3-compatible adapters. */
export interface MediaStorageAdapter {
  createPresignedUpload(input: {
    objectKey: string;
    contentType: SupportedMediaType;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{ uploadUrl: string; expiresAt: Date; requiredHeaders: Record<string, string> }>;
  verifyUploadedObject(input: {
    objectKey: string;
    expectedContentType: SupportedMediaType;
    maxBytes: number;
  }): Promise<{ contentType: string; contentLength: number } | null>;
  deleteObject(objectKey: string): Promise<void>;
}


export interface ImageDimensions { width: number; height: number }

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (segmentLength < 7) return null;
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 30) return null;
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b1 = bytes[21] ?? 0;
    const b2 = bytes[22] ?? 0;
    const b3 = bytes[23] ?? 0;
    const b4 = bytes[24] ?? 0;
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

export function readImageDimensions(contentType: SupportedMediaType, bytes: Buffer): ImageDimensions | null {
  if (contentType === "image/png") {
    if (bytes.length < 24 || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (contentType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    return readJpegDimensions(bytes);
  }
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  return readWebpDimensions(bytes);
}

function hasSafeDimensions(dimensions: ImageDimensions | null): boolean {
  return Boolean(dimensions &&
    Number.isSafeInteger(dimensions.width) &&
    Number.isSafeInteger(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0 &&
    dimensions.width <= MAX_IMAGE_DIMENSION &&
    dimensions.height <= MAX_IMAGE_DIMENSION &&
    dimensions.width * dimensions.height <= MAX_IMAGE_PIXELS);
}

const IMAGE_SIGNATURES: Record<SupportedMediaType, (bytes: Buffer) => boolean> = {
  "image/png": (bytes) =>
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/jpeg": (bytes) =>
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/webp": (bytes) =>
    bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
};

export function parseImageDataUrl(value: string): ParsedImageDataUrl | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return null;
  const contentType = match[1] as SupportedMediaType;
  const encoded = match[2];
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_PROFILE_IMAGE_BYTES ||
    bytes.toString("base64") !== encoded ||
    !IMAGE_SIGNATURES[contentType](bytes) ||
    !hasSafeDimensions(readImageDimensions(contentType, bytes))
  ) return null;
  return { contentType, bytes, byteLength: bytes.length };
}

/** Keys are generated by the server; clients must never supply object keys. */
export function createMediaObjectKey(ownerId: string, purpose: MediaPurpose, contentType: SupportedMediaType): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)) {
    throw new Error("A valid owner id is required");
  }
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length);
  return `users/${ownerId}/${purpose}/${randomUUID()}.${extension}`;
}

export function isVerifiedStoredImage(
  expected: { contentType: SupportedMediaType; byteLength: number },
  actual: { contentType: string; contentLength: number } | null,
): boolean {
  return Boolean(actual &&
    actual.contentType === expected.contentType &&
    actual.contentLength === expected.byteLength &&
    actual.contentLength > 0 &&
    actual.contentLength <= MAX_PROFILE_IMAGE_BYTES);
}
