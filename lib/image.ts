import sharp from "sharp";

export async function compressImage(
  input: ArrayBuffer | Uint8Array,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<{ data: Buffer; type: string; ext: string }> {
  const maxWidth = options?.maxWidth ?? 512;
  const maxHeight = options?.maxHeight ?? 512;
  const quality = options?.quality ?? 80;

  const buf = input instanceof ArrayBuffer ? Buffer.from(new Uint8Array(input)) : Buffer.from(input);
  const data = await sharp(buf)
    .resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

  return { data, type: "image/webp", ext: "webp" };
}
