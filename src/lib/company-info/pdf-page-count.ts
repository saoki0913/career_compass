/**
 * ブラウザ上で PDF のページ数だけを取得する（RAG 取込前の見積もり用）。
 * 暗号化・破損などで読めない場合は null。
 */
export async function getPdfPageCountFromFile(file: File): Promise<number | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const bytes = await file.arrayBuffer();
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const n = doc.getPageCount();
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}
