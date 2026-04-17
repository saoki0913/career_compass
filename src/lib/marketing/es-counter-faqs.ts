import type { MarketingFaq } from "./landing-faqs";

export const ES_COUNTER_PAGE_FAQS: readonly MarketingFaq[] = [
  {
    question: "空白や改行を除いた文字数は確認できますか？",
    answer:
      "はい、空白除外・改行除外のトグルがあり、ES提出時に必要な正味の文字数を確認できます。",
  },
  {
    question: "ESの文字数はどのくらいが一般的ですか？",
    answer:
      "設問によりますが、300字・400字・500字が多く使われます。カウンターではこの3つの目安ラインを表示しています。",
  },
  {
    question: "カウンターを使うのにログインは必要ですか？",
    answer:
      "不要です。ページを開いてそのままテキストを貼り付ければ文字数が表示されます。",
  },
  {
    question: "数えた後にそのままAI添削に進めますか？",
    answer:
      "ログインすれば、同じ文章をESエディタに持ち込んでAI添削を受けられます。Free プランでも月50クレジットで試せます。",
  },
];
