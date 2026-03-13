import {
  FINANCE_SUBINDUSTRIES,
  INDUSTRIES,
  canonicalizeIndustry,
  type Industry,
} from "@/lib/constants/industries";

export type RoleOptionSource =
  | "industry_default"
  | "company_override"
  | "application_job_type"
  | "document_job_type";

export interface RoleOption {
  value: string;
  label: string;
  source: RoleOptionSource;
}

export interface RoleGroup {
  id: string;
  label: string;
  options: RoleOption[];
}

export interface ResolvedMotivationRoleContext {
  resolvedIndustry: Industry | null;
  industrySource: "company_field" | "company_override" | "user_selected" | null;
  requiresIndustrySelection: boolean;
  industryOptions: readonly string[];
  roleGroups: RoleGroup[];
  roleCandidates: string[];
}

interface RoleSeedGroup {
  id: string;
  label: string;
  options: string[];
}

interface CompanyRoleOverride {
  industry: Industry;
  groups: RoleSeedGroup[];
}

const INDUSTRY_ROLE_SEEDS: Record<Industry, RoleSeedGroup[]> = {
  商社: [
    { id: "course", label: "採用コース / 職群", options: ["総合職", "ビジネスエキスパート / 事務"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["営業・トレーディング", "事業投資・事業開発", "コーポレート"] },
  ],
  銀行: [
    { id: "course", label: "採用コース / 職群", options: ["総合職", "オープン", "システム・デジタル"] },
    {
      id: "role",
      label: "具体業務 / 専門領域",
      options: [
        "法人営業",
        "リテール / ウェルスマネジメント",
        "市場 / トレーディング",
        "融資審査 / 信用",
        "リスク管理",
        "デジタル / システム",
        "クオンツ / データ",
        "コーポレート",
      ],
    },
  ],
  信託銀行: [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    {
      id: "role",
      label: "具体業務 / 専門領域",
      options: [
        "資産承継 / 相続",
        "年金 / 受託",
        "不動産",
        "証券代行",
        "資産運用・受託",
        "リスク管理",
        "デジタル / システム",
        "コーポレート",
      ],
    },
  ],
  証券: [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    {
      id: "role",
      label: "具体業務 / 専門領域",
      options: [
        "リテール / ウェルスマネジメント",
        "IB / 投資銀行",
        "マーケット / セールス&トレーディング",
        "リサーチ",
        "商品企画",
        "リスク / コンプラ",
        "デジタル / システム",
        "クオンツ",
      ],
    },
  ],
  保険: [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    {
      id: "role",
      label: "具体業務 / 専門領域",
      options: [
        "営業 / コンサルティング営業",
        "商品企画",
        "アクチュアリー",
        "資産運用",
        "引受 / アンダーライティング",
        "保険金サービス / 損害調査",
        "リスク管理",
        "デジタル / システム",
        "データ分析",
      ],
    },
  ],
  アセットマネジメント: [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    {
      id: "role",
      label: "具体業務 / 専門領域",
      options: [
        "ファンドマネージャー",
        "アナリスト / リサーチ",
        "クオンツ",
        "プロダクト / 商品企画",
        "機関投資家営業",
        "リスク管理",
        "オペレーション",
        "デジタル / システム",
        "ESG / スチュワードシップ",
      ],
    },
  ],
  "カード・リース・ノンバンク": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    {
      id: "role",
      label: "具体業務 / 専門領域",
      options: [
        "事業企画",
        "加盟店 / 法人営業",
        "個人向け企画",
        "与信 / 審査",
        "リスク管理",
        "マーケ / CRM",
        "データ / AI",
        "デジタル / システム",
        "コーポレート",
      ],
    },
  ],
  "政府系・系統金融": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    {
      id: "role",
      label: "具体業務 / 専門領域",
      options: [
        "融資 / 投資",
        "業界調査 / 政策調査",
        "国際業務",
        "アドバイザリー",
        "リスク管理",
        "デジタル / システム",
        "オペレーション",
        "コーポレート",
      ],
    },
  ],
  コンサルティング: [
    { id: "course", label: "採用コース / 職群", options: ["戦略コンサルタント", "ビジネス / 業務コンサル", "IT / テクノロジーコンサル"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["データ / AI", "エンジニア", "デザイン / クリエイティブ", "オペレーション", "コーポレート"] },
  ],
  "IT・通信": [
    { id: "course", label: "採用コース / 職群", options: ["SE / ソフトウェア", "PM / コンサル", "企画・営業"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["インフラ / クラウド", "データ / AI", "研究開発 / R&D", "ファシリティ", "コーポレート"] },
  ],
  "メーカー（電機・機械）": [
    { id: "course", label: "採用コース / 職群", options: ["技術系総合職", "事務系総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["研究開発 / R&D", "技術開発", "生産技術", "品質保証", "SCM / 調達", "営業", "企画 / マーケ", "IT / DX", "コーポレート"] },
  ],
  "メーカー（食品・日用品）": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["研究開発 / R&D", "商品開発", "生産 / 製造", "品質保証", "SCM / 購買", "マーケティング", "営業", "DX / データ", "コーポレート"] },
  ],
  "広告・マスコミ": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["営業 / アカウント", "ストラテジックプランニング", "クリエイティブ", "メディア", "コンテンツ制作 / 編集", "データ / マーケ", "プロデュース", "コーポレート"] },
  ],
  "不動産・建設": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["開発 / 事業企画", "営業 / リーシング", "設計 / 建築", "施工管理", "都市開発", "AM / 運用", "DX / データ", "コーポレート"] },
  ],
  "小売・流通": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["MD / 商品企画", "バイヤー", "店舗運営", "EC / デジタル", "SCM / 物流", "マーケティング", "法人営業", "データ分析", "コーポレート"] },
  ],
  "サービス・インフラ": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["運行 / オペレーション", "事業企画", "法人営業", "設備 / 保守", "DX / IT", "まちづくり / 開発", "カスタマーサクセス / CS", "コーポレート"] },
  ],
  "医療・福祉": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["研究開発 / R&D", "臨床開発 / 薬事", "MR / 営業", "生産 / 品質", "メディカル", "データ / デジタル", "事業企画", "コーポレート"] },
  ],
  教育: [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["教育企画 / 教材開発", "営業", "教室 / 運営", "EdTech / プロダクト", "コンテンツ制作", "事業企画", "データ分析", "コーポレート"] },
  ],
  "印刷・包装": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["研究開発 / R&D", "生産技術 / 製造", "包装設計", "営業", "SCM", "DX / IT", "企画", "コーポレート"] },
  ],
  "アパレル・繊維": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["商品企画", "MD / バイヤー", "生産管理", "マーケ / ブランド", "EC / デジタル", "営業", "SCM", "デザイン", "コーポレート"] },
  ],
  "設備工事・エンジニアリング": [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["設計", "施工管理", "保守 / メンテ", "技術営業", "研究開発 / R&D", "DX / IT", "調達 / SCM", "コーポレート"] },
  ],
  "公務員・団体": [
    { id: "course", label: "採用コース / 職群", options: ["総合職 / 事務"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["政策 / 企画", "調査 / 研究", "IT / DX", "現場運営", "渉外 / 国際", "管理"] },
  ],
  その他: [
    { id: "course", label: "採用コース / 職群", options: ["総合職"] },
    { id: "role", label: "具体業務 / 専門領域", options: ["企画", "営業", "エンジニア", "データ / AI", "マーケ", "研究開発 / R&D", "クリエイティブ", "コーポレート"] },
  ],
};

const COMPANY_ROLE_OVERRIDES: Record<string, CompanyRoleOverride> = {
  "三菱UFJ銀行": {
    industry: "銀行",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["オープン", "システム・デジタル", "カスタマーサービス"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["グローバル", "トレードビジネス", "フィナンシャル・エンジニアリング", "戦略財務（会計・税務）", "ウェルスマネジメント", "グローバル・マーケッツ"] },
    ],
  },
  "三菱UFJフィナンシャル・グループ": {
    industry: "銀行",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["オープン", "システム・デジタル"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["グローバル", "トレードビジネス", "グローバル・マーケッツ", "フィナンシャル・エンジニアリング"] },
    ],
  },
  "三菱UFJ信託銀行": {
    industry: "信託銀行",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["資産承継 / 相続", "年金 / 受託", "不動産", "証券代行", "デジタル / システム"] },
    ],
  },
  "三井住友銀行": {
    industry: "銀行",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職", "システム・デジタル"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["法人営業", "リテール", "市場 / トレーディング", "リスク管理", "データ / AI"] },
    ],
  },
  "三井住友信託銀行": {
    industry: "信託銀行",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["資産承継 / 相続", "年金 / 受託", "不動産", "証券代行", "資産運用・受託"] },
    ],
  },
  "みずほ銀行": {
    industry: "銀行",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["オープンコース", "ITシステムコース"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["法人営業", "リテール", "市場 / トレーディング", "リスク管理", "データ / AI"] },
    ],
  },
  "みずほフィナンシャルグループ": {
    industry: "銀行",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["オープンコース", "ITシステムコース"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["法人営業", "リテール", "市場 / トレーディング", "リスク管理", "データ / AI"] },
    ],
  },
  "野村證券": {
    industry: "証券",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職", "オープンキャリア型"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["リテール / ウェルスマネジメント", "IB / 投資銀行", "マーケット", "リサーチ", "デジタル / システム"] },
    ],
  },
  "野村ホールディングス": {
    industry: "証券",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["IB / 投資銀行", "マーケット", "リサーチ", "デジタル / システム"] },
    ],
  },
  "大和証券": {
    industry: "証券",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["リテール / ウェルスマネジメント", "IB / 投資銀行", "マーケット", "リサーチ", "デジタル / システム"] },
    ],
  },
  "SMBC日興証券": {
    industry: "証券",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["リテール / ウェルスマネジメント", "IB / 投資銀行", "マーケット", "リサーチ", "デジタル / システム"] },
    ],
  },
  "みずほ証券": {
    industry: "証券",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["リテール / ウェルスマネジメント", "IB / 投資銀行", "マーケット", "リサーチ", "デジタル / システム"] },
    ],
  },
  "東京海上日動火災保険": {
    industry: "保険",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["営業 / コンサルティング営業", "商品企画", "アクチュアリー", "資産運用", "保険金サービス / 損害調査", "デジタル / システム"] },
    ],
  },
  "東京海上ホールディングス": {
    industry: "保険",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["商品企画", "資産運用", "アクチュアリー", "リスク管理", "デジタル / システム"] },
    ],
  },
  "三井住友海上火災保険": {
    industry: "保険",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["営業 / コンサルティング営業", "商品企画", "アクチュアリー", "資産運用", "保険金サービス / 損害調査", "デジタル / システム"] },
    ],
  },
  "損害保険ジャパン": {
    industry: "保険",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["営業 / コンサルティング営業", "商品企画", "アクチュアリー", "資産運用", "保険金サービス / 損害調査", "デジタル / システム"] },
    ],
  },
  日本生命: {
    industry: "保険",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["営業 / コンサルティング営業", "商品企画", "アクチュアリー", "資産運用", "リスク管理", "デジタル / システム"] },
    ],
  },
  第一生命: {
    industry: "保険",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["オープンコース", "アクチュアリーコース", "クオンツコース"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["営業 / コンサルティング営業", "商品企画", "資産運用", "デジタル / システム", "データ分析"] },
    ],
  },
  "アセットマネジメントOne": {
    industry: "アセットマネジメント",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職", "職種別採用"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["ファンドマネージャー", "アナリスト / リサーチ", "クオンツ", "プロダクト / 商品企画", "機関投資家営業", "リスク管理", "オペレーション"] },
    ],
  },
  JCB: {
    industry: "カード・リース・ノンバンク",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["事業企画", "加盟店 / 法人営業", "個人向け企画", "与信 / 審査", "マーケ / CRM", "データ / AI", "デジタル / システム"] },
    ],
  },
  "三井住友カード": {
    industry: "カード・リース・ノンバンク",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["事業企画", "加盟店 / 法人営業", "マーケ / CRM", "データ / AI", "リスク管理", "デジタル / システム"] },
    ],
  },
  オリックス: {
    industry: "カード・リース・ノンバンク",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["事業投資", "法人営業", "リース / ファイナンス", "環境エネルギー", "不動産", "デジタル / システム"] },
    ],
  },
  "日本政策投資銀行": {
    industry: "政府系・系統金融",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["融資 / 投資", "業界調査 / 政策調査", "アドバイザリー", "リスク管理", "デジタル / システム"] },
    ],
  },
  "国際協力銀行": {
    industry: "政府系・系統金融",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["国際業務", "融資 / 投資", "業界調査 / 政策調査", "リスク管理", "デジタル / システム"] },
    ],
  },
  "農林中央金庫": {
    industry: "政府系・系統金融",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["融資 / 投資", "資産運用", "業界調査 / 政策調査", "リスク管理", "デジタル / システム"] },
    ],
  },
  "日本政策金融公庫": {
    industry: "政府系・系統金融",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["融資", "業界調査 / 政策調査", "リスク管理", "デジタル / システム", "オペレーション"] },
    ],
  },
  アクセンチュア: {
    industry: "コンサルティング",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["ビジネスコンサルタント", "デジタルコンサルタント", "戦略コンサルタント", "ソリューション・エンジニア"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["データサイエンティスト", "AIアーキテクト", "デザイン", "クリエイティブ"] },
    ],
  },
  "NTTデータ": {
    industry: "IT・通信",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["SE・コンサル・営業", "建築系ファシリティマネジメント", "電力系ファシリティマネジメント", "法務スタッフ", "財務スタッフ", "人事スタッフ"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["SE / ソフトウェア", "PM / コンサル", "企画・営業", "ファシリティ", "コーポレート"] },
    ],
  },
  "伊藤忠商事": {
    industry: "商社",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職", "ビジネスエキスパート職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["営業・トレーディング", "事業投資・事業開発", "コーポレート"] },
    ],
  },
  "三菱商事": {
    industry: "商社",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職", "バックオフィス職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["営業・トレーディング", "事業投資・事業開発", "コーポレート"] },
    ],
  },
  "三井不動産": {
    industry: "不動産・建設",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["開発 / 事業企画", "営業 / リーシング", "都市開発", "DX / データ", "コーポレート"] },
    ],
  },
  "JR東日本": {
    industry: "サービス・インフラ",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["総合職", "エリア職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["運行 / オペレーション", "事業企画", "設備 / 保守", "DX / IT", "まちづくり / 開発"] },
    ],
  },
  "トヨタ自動車": {
    industry: "メーカー（電機・機械）",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["技術職", "事務職"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["研究開発 / R&D", "技術開発", "生産技術", "品質保証", "SCM / 調達", "営業", "企画 / マーケ", "IT / DX"] },
    ],
  },
  花王: {
    industry: "メーカー（食品・日用品）",
    groups: [
      { id: "course", label: "採用コース / 職群", options: ["事務系", "技術系", "研究系"] },
      { id: "role", label: "具体業務 / 専門領域", options: ["研究開発 / R&D", "商品開発", "生産 / 製造", "品質保証", "SCM / 購買", "マーケティング", "営業", "DX / データ"] },
    ],
  },
};

function normalizeRoleLabel(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function mergeSeedGroup(
  groups: Map<string, RoleGroup>,
  group: RoleSeedGroup,
  source: RoleOptionSource,
) {
  const existing = groups.get(group.id) ?? {
    id: group.id,
    label: group.label,
    options: [],
  };
  const seen = new Set(existing.options.map((option) => option.value));
  for (const option of group.options) {
    const normalized = normalizeRoleLabel(option);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    existing.options.push({
      value: normalized,
      label: normalized,
      source,
    });
    seen.add(normalized);
  }
  groups.set(group.id, existing);
}

export function getSelectableIndustryOptions(currentIndustry?: string | null): readonly string[] {
  const canonical = canonicalizeIndustry(currentIndustry);
  if (canonical) {
    return INDUSTRIES;
  }

  if (currentIndustry?.trim() === "金融・保険") {
    return FINANCE_SUBINDUSTRIES;
  }

  return INDUSTRIES;
}

export function requiresIndustrySelection(currentIndustry?: string | null): boolean {
  if (!currentIndustry?.trim()) {
    return true;
  }
  if (currentIndustry.trim() === "金融・保険") {
    return true;
  }
  return canonicalizeIndustry(currentIndustry) === null;
}

export function getCompanyRoleOverride(companyName?: string | null): CompanyRoleOverride | null {
  const normalized = companyName?.trim();
  if (!normalized) {
    return null;
  }
  return COMPANY_ROLE_OVERRIDES[normalized] ?? null;
}

export function resolveIndustryForReview(input: {
  companyName?: string | null;
  companyIndustry?: string | null;
  industryOverride?: string | null;
}): Industry | null {
  const override = canonicalizeIndustry(input.industryOverride);
  if (override) {
    return override;
  }

  const companyOverride = getCompanyRoleOverride(input.companyName);
  if (companyOverride) {
    return companyOverride.industry;
  }

  return canonicalizeIndustry(input.companyIndustry);
}

export function buildRoleGroups(input: {
  industry: Industry;
  companyName?: string | null;
  documentRole?: string | null;
  applicationRoles?: string[];
}): RoleGroup[] {
  const groups = new Map<string, RoleGroup>();

  for (const seed of INDUSTRY_ROLE_SEEDS[input.industry] ?? []) {
    mergeSeedGroup(groups, seed, "industry_default");
  }

  const companyOverride = getCompanyRoleOverride(input.companyName);
  if (companyOverride && companyOverride.industry === input.industry) {
    for (const seed of companyOverride.groups) {
      mergeSeedGroup(groups, seed, "company_override");
    }
  }

  const applicationRoles = Array.from(
    new Set(
      (input.applicationRoles ?? [])
        .map((role) => normalizeRoleLabel(role))
        .filter((role): role is string => Boolean(role)),
    ),
  );
  if (applicationRoles.length > 0) {
    mergeSeedGroup(
      groups,
      {
        id: "application",
        label: "応募中の職種",
        options: applicationRoles,
      },
      "application_job_type",
    );
  }

  const documentRole = normalizeRoleLabel(input.documentRole);
  if (documentRole) {
    mergeSeedGroup(
      groups,
      {
        id: "document",
        label: "このESに紐づく職種",
        options: [documentRole],
      },
      "document_job_type",
    );
  }

  return [...groups.values()].filter((group) => group.options.length > 0);
}

export function flattenRoleCandidates(roleGroups: RoleGroup[]): string[] {
  return Array.from(
    new Set(
      roleGroups.flatMap((group) =>
        group.options.map((option) => option.value.trim()).filter(Boolean),
      ),
    ),
  );
}

export function resolveMotivationRoleContext(input: {
  companyName?: string | null;
  companyIndustry?: string | null;
  selectedIndustry?: string | null;
  documentRole?: string | null;
  applicationRoles?: string[];
}): ResolvedMotivationRoleContext {
  const industryOptions = getSelectableIndustryOptions(input.companyIndustry);
  const requiresSelection = requiresIndustrySelection(input.companyIndustry);
  const selectedIndustry = canonicalizeIndustry(input.selectedIndustry);
  const companyOverride = getCompanyRoleOverride(input.companyName);
  const canonicalCompanyIndustry = canonicalizeIndustry(input.companyIndustry);
  const resolvedIndustry = resolveIndustryForReview({
    companyName: input.companyName,
    companyIndustry: input.companyIndustry,
    industryOverride: input.selectedIndustry,
  });
  const industrySource = selectedIndustry
    ? "user_selected"
    : companyOverride
      ? "company_override"
      : canonicalCompanyIndustry
        ? "company_field"
        : null;

  const roleGroups = resolvedIndustry
    ? buildRoleGroups({
        industry: resolvedIndustry,
        companyName: input.companyName,
        documentRole: input.documentRole,
        applicationRoles: input.applicationRoles,
      })
    : [];

  return {
    resolvedIndustry,
    industrySource,
    requiresIndustrySelection: !resolvedIndustry && requiresSelection,
    industryOptions,
    roleGroups,
    roleCandidates: flattenRoleCandidates(roleGroups),
  };
}
