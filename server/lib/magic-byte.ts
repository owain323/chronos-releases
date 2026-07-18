/**
 * validateMagicByte — v3.9.2 magic-byte 二次校验
 * 读取文件头前4字节, 按真实类型判定, 拒绝伪造扩展名的文件
 * (与声明 MIME 的 allowlist 叠加使用, 两者同需通过)
 */
export function validateMagicByte(buffer: Buffer, allowedTypes: string[]): string | null {
  const head = buffer.slice(0, 4);
  // PNG: 89 50 4E 47
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) {
    if (allowedTypes.includes("image/png") || allowedTypes.includes("image/*")) return "image/png";
  }
  // JPEG: FF D8 FF
  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) {
    if (allowedTypes.includes("image/jpeg") || allowedTypes.includes("image/*")) return "image/jpeg";
  }
  // GIF: 47 49 46 38
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38) {
    if (allowedTypes.includes("image/gif") || allowedTypes.includes("image/*")) return "image/gif";
  }
  // PDF: 25 50 44 46
  if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
    if (allowedTypes.includes("application/pdf")) return "application/pdf";
  }
  return null;
}
