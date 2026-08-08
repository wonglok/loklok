// ---------------------------------------------------------------------------
// Image conversion utilities
// ---------------------------------------------------------------------------
// Browser-native image re-encoding via Canvas.  No external dependencies.
// ---------------------------------------------------------------------------

/** Default WebP quality (0–1).  0.85 balances size and fidelity for most textures. */
const WEBP_DEFAULT_QUALITY = 1;

/** MIME types that are already in a modern compressed format — no re-encode needed. */
const SKIP_MIMES = new Set(["image/webp"]);

/**
 * Convert an image (PNG, JPEG, etc.) to WebP using the browser's Canvas API.
 *
 * Returns the WebP bytes **and the new MIME** on success, or the original
 * bytes unchanged on failure (including when the image is already WebP).
 */
export async function convertToWebP(
  imageBytes: ArrayBuffer,
  originalMime: string,
  quality: number = WEBP_DEFAULT_QUALITY,
): Promise<{ bytes: ArrayBuffer; mime: string }> {
  // Already WebP — nothing to do
  if (SKIP_MIMES.has(originalMime)) {
    return { bytes: imageBytes, mime: originalMime };
  }

  try {
    const blob = new Blob([imageBytes], { type: originalMime });
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { bytes: imageBytes, mime: originalMime };
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const webpBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );

    if (!webpBlob) {
      return { bytes: imageBytes, mime: originalMime };
    }

    const webpBytes = await webpBlob.arrayBuffer();
    return { bytes: webpBytes, mime: "image/webp" };
  } catch {
    // Decode or encode failed — fall back to original
    return { bytes: imageBytes, mime: originalMime };
  }
}
