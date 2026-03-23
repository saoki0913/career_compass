/**
 * 文書分類ごとの初期ブロック。文言は後から差し替え前提（履歴書の実文は PDF 等を参照して手で調整）。
 */

import type { DocumentBlock } from "@/hooks/useDocuments";
import type { EsDocumentCategory } from "@/lib/es-document-category";

function b(
  type: DocumentBlock["type"],
  content: string,
  charLimit?: number
): DocumentBlock {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    ...(charLimit !== undefined ? { charLimit } : {}),
  };
}

export function getDefaultBlocksForEsCategory(category: EsDocumentCategory): DocumentBlock[] {
  switch (category) {
    case "entry_sheet":
      return [
        b("h2", ""),
        b("paragraph", "ここに回答を入力..."),
      ];
    case "resume":
      return [
        b("h2", "基本情報"),
        b("paragraph", "氏名・連絡先・志望職種など（後から整えてください）"),
        b("h2", "学歴"),
        b("paragraph", "（例）20XX年4月　〇〇大学 △△学部 入学\n20XX年3月　卒業見込"),
        b("h2", "学歴詳細"),
        b("paragraph", "ゼミ・研究・取得資格など"),
        b("h2", "学生時代に力を入れたこと"),
        b("paragraph", ""),
        b("h2", "本人PR・志望動機"),
        b("paragraph", ""),
        b("h2", "趣味・特技"),
        b("paragraph", ""),
      ];
    case "assignment":
      return [
        b("h2", "課題・提出物"),
        b("paragraph", "課題の趣旨・提出要件をメモしてから回答を書いてください。"),
        b("h2", "設問・指示の要約"),
        b("paragraph", ""),
        b("h2", "回答"),
        b("paragraph", ""),
      ];
    case "memo":
      return [
        b("h2", "メモ"),
        b("paragraph", ""),
      ];
    case "interview_prep":
      return [
        b("h2", "企業・業界メモ"),
        b("paragraph", ""),
        b("h2", "想定質問"),
        b("bullet", "（例）自己紹介を1分で"),
        b("bullet", "（例）志望動機"),
        b("h2", "回答メモ"),
        b("paragraph", ""),
        b("h2", "逆質問リスト"),
        b("bullet", "（例）事業について教えてください"),
      ];
    case "tips":
      return [
        b("h2", "Tips メモ"),
        b("paragraph", "参考にした情報源・気づきを書き留めます。"),
        b("h2", "ポイント"),
        b("bullet", "（箇条書きで追記）"),
      ];
    case "reflection":
      return [
        b("h2", "選考・活動の振り返り"),
        b("paragraph", "いつ・どの企業・どの段階か"),
        b("h2", "うまくいった点"),
        b("paragraph", ""),
        b("h2", "改善したい点"),
        b("paragraph", ""),
        b("h2", "次に活かすこと"),
        b("paragraph", ""),
      ];
    case "other":
    default:
      return [
        b("h2", ""),
        b("paragraph", ""),
      ];
  }
}
