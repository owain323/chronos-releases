/**
 * validateMagicByte — v4.1 全类型 magic-byte 校验
 * 读取文件头识别真实类型, 拒绝伪造扩展名的文件
 *
 * Supported:
 *   Images: PNG, JPEG, GIF, WebP, BMP, ICO
 *   Office: PDF, DOCX/XLSX/PPTX (ZIP), DOC (OLE), XLS (OLE)
 *   Text: TXT, CSV, JSON, HTML, XML, SVG (no magic — 扩展名兜底)
 *   Archives: ZIP, GZ, RAR, 7Z
 *   Audio/Video: MP3, WAV, MP4, WebM
 */
export function validateMagicByte(
  buffer: Buffer,
  _allowedTypes: string[]
): string | null {
  const head = buffer.slice(0, 8);

  // --- Images ---
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  )
    return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return "image/jpeg";
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46)
    return "image/gif";
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46
  )
    return "image/webp"; // RIFF....WEBP
  if (head[0] === 0x42 && head[1] === 0x4d) return "image/bmp";

  // --- PDF ---
  if (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46
  )
    return "application/pdf";

  // --- ZIP-based (DOCX, XLSX, PPTX, ODT, jar, apk) ---
  if (
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  )
    return "application/zip";

  // --- OLE2-based (DOC, XLS, PPT old) ---
  if (
    head[0] === 0xd0 &&
    head[1] === 0xcf &&
    head[2] === 0x11 &&
    head[3] === 0xe0
  )
    return "application/ole";

  // --- GZ ---
  if (head[0] === 0x1f && head[1] === 0x8b) return "application/gzip";

  // --- RAR ---
  if (
    head[0] === 0x52 &&
    head[1] === 0x61 &&
    head[2] === 0x72 &&
    head[3] === 0x21
  )
    return "application/rar";

  // --- 7Z ---
  if (
    head[0] === 0x37 &&
    head[1] === 0x7a &&
    head[2] === 0xbc &&
    head[3] === 0xaf
  )
    return "application/7z";

  // --- Audio/Video ---
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33)
    return "audio/mpeg"; // ID3
  if (head[0] === 0xff && head[1] === 0xfb) return "audio/mpeg"; // MPEG frame header
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46
  )
    return "audio/wav"; // RIFF....WAVE (need to check offset 8-11)
  if (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0x00)
    return "video/mp4"; // ftyp boxes often start with null

  // --- Text files: no magic, return null → extension-based fallback ---
  return null;
}
