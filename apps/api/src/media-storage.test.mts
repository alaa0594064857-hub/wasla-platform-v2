import { describe, expect, it } from "vitest";

import {
  MAX_PROFILE_IMAGE_BYTES,
  createMediaObjectKey,
  isVerifiedStoredImage,
  parseImageDataUrl,
  readImageDimensions,
} from "./media-storage.mjs";

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("media storage validation", () => {
  it("reads PNG dimensions from the IHDR header", () => {
    expect(readImageDimensions("image/png", pngHeader(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("rejects malformed image headers and unsupported data URL formats", () => {
    expect(readImageDimensions("image/png", Buffer.alloc(24))).toBeNull();
    expect(parseImageDataUrl("data:image/gif;base64,R0lGODlh")).toBeNull();
    expect(parseImageDataUrl("data:image/png;base64,not-base64!")).toBeNull();
  });

  it("accepts a canonical PNG data URL with safe dimensions", () => {
    const encoded = pngHeader(320, 240).toString("base64");
    const parsed = parseImageDataUrl(`data:image/png;base64,${encoded}`);

    expect(parsed?.contentType).toBe("image/png");
    expect(parsed?.byteLength).toBe(24);
    expect(parsed?.bytes.equals(pngHeader(320, 240))).toBe(true);
  });

  it("rejects image data URLs whose declared type does not match their signature", () => {
    const encoded = pngHeader(320, 240).toString("base64");
    expect(parseImageDataUrl(`data:image/jpeg;base64,${encoded}`)).toBeNull();
  });

  it("rejects zero-sized and over-limit image dimensions", () => {
    expect(parseImageDataUrl(`data:image/png;base64,${pngHeader(0, 240).toString("base64")}`)).toBeNull();
    expect(parseImageDataUrl(`data:image/png;base64,${pngHeader(4097, 1).toString("base64")}`)).toBeNull();
  });

  it("creates server-owned object keys scoped to a valid owner and purpose", () => {
    const ownerId = "123e4567-e89b-42d3-a456-426614174000";
    const key = createMediaObjectKey(ownerId, "avatar", "image/webp");

    expect(key).toMatch(new RegExp(`^users/${ownerId}/avatar/[0-9a-f-]+\\.webp$`));
    expect(() => createMediaObjectKey("not-a-uuid", "avatar", "image/webp")).toThrow(
      "A valid owner id is required",
    );
  });

  it("verifies stored media only when type and exact byte length match", () => {
    const expected = { contentType: "image/webp" as const, byteLength: 1024 };

    expect(isVerifiedStoredImage(expected, { contentType: "image/webp", contentLength: 1024 })).toBe(true);
    expect(isVerifiedStoredImage(expected, { contentType: "image/png", contentLength: 1024 })).toBe(false);
    expect(isVerifiedStoredImage(expected, { contentType: "image/webp", contentLength: 1023 })).toBe(false);
    expect(isVerifiedStoredImage(expected, null)).toBe(false);
    expect(isVerifiedStoredImage(
      { contentType: "image/webp", byteLength: MAX_PROFILE_IMAGE_BYTES + 1 },
      { contentType: "image/webp", contentLength: MAX_PROFILE_IMAGE_BYTES + 1 },
    )).toBe(false);
  });
});
