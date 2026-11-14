export const maxDocumentBytes = 10 * 1024 * 1024;
export const maxDocumentPages = 20;

export function validateDocumentSignature(mimeType: string, size: number, bytes: Uint8Array) {
  if (size <= 0) throw new Error("The selected file is empty.");
  if (size > maxDocumentBytes) throw new Error("Select a file no larger than 10 MB.");
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const valid = mimeType === "application/pdf" ? text(0, Math.min(1024, bytes.length)).includes("%PDF-") :
    mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
    mimeType === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) :
    mimeType === "image/webp" ? text(0, 4) === "RIFF" && text(8, 12) === "WEBP" : false;
  if (!valid) throw new Error("File contents do not match a supported PDF, JPG/JPEG, PNG or WEBP file. Choose a valid original.");
}
