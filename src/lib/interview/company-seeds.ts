import { INDUSTRIES, type Industry } from "@/lib/constants/industries";

export type InterviewCompanySeed = {
  name: string;
  officialRecruitUrl?: string;
  companyTopics: string[];
  roleTopics: string[];
  cultureTopics: string[];
};

export type InterviewIndustrySeedProfile = {
  industry: Industry;
  commonTopics: string[];
  watchouts: string[];
  representativeCompanies: [InterviewCompanySeed, InterviewCompanySeed, InterviewCompanySeed];
};

const SEEDS = [
  {
    industry: "商社",
    commonTopics: ["なぜ商社か", "事業投資とトレードの理解", "初期配属と現場経験の理解"],
    watchouts: ["総花的な商社志望", "他社比較の薄さ", "扱いたい事業領域が抽象的"],
    representativeCompanies: [
      { name: "三井物産", companyTopics: ["事業経営力", "現場入り込み", "職務グループや初期配属"], roleTopics: ["事業投資", "営業", "コーポレート"], cultureTopics: ["挑戦と構想力", "多様アセットの横断"] },
      { name: "三菱商事", companyTopics: ["産業DXやEXへの関心", "グローバル事業経営", "人材育成"], roleTopics: ["営業", "事業開発", "コーポレート"], cultureTopics: ["組織での価値創出", "変革志向"] },
      { name: "伊藤忠商事", companyTopics: ["生活消費分野の強み", "現場起点の価値創出", "非資源分野の解像度"], roleTopics: ["営業", "事業投資", "職能"], cultureTopics: ["現場主義", "商人らしさ"] },
    ],
  },
  {
    industry: "銀行",
    commonTopics: ["なぜ銀行か", "法人・リテール・市場の違い", "社会基盤としての金融理解"],
    watchouts: ["金融志望の汎用化", "職種理解の浅さ", "他金融業態との差分不足"],
    representativeCompanies: [
      { name: "三菱UFJ銀行", companyTopics: ["グローバル案件", "法人金融の深さ", "デジタル変革"], roleTopics: ["法人営業", "市場", "デジタル"], cultureTopics: ["大規模基盤", "変革推進"] },
      { name: "三井住友銀行", companyTopics: ["事業変革支援", "SMBCグループ連携", "法人ソリューション"], roleTopics: ["法人営業", "市場", "システム・デジタル"], cultureTopics: ["挑戦", "スピード"] },
      { name: "みずほ銀行", companyTopics: ["産業知見", "One MIZUHO連携", "社会課題解決"], roleTopics: ["法人営業", "市場", "デジタル"], cultureTopics: ["協働", "総合力"] },
    ],
  },
  {
    industry: "信託銀行",
    commonTopics: ["銀行との違い", "信託ならではの受託・資産承継理解", "専門性と長期関係構築"],
    watchouts: ["銀行との混同", "不動産・年金・証券代行の理解不足", "専門性志向の弱さ"],
    representativeCompanies: [
      { name: "三井住友信託銀行", companyTopics: ["信託機能の幅広さ", "資産運用と資産承継", "専門性の掛け算"], roleTopics: ["不動産", "年金", "相続"], cultureTopics: ["専門性", "信頼関係"] },
      { name: "三菱UFJ信託銀行", companyTopics: ["信託ならではの提案力", "資産承継", "受託領域"], roleTopics: ["相続", "年金", "証券代行"], cultureTopics: ["誠実さ", "専門性"] },
      { name: "みずほ信託銀行", companyTopics: ["One MIZUHO内の信託機能", "不動産・相続", "顧客基盤活用"], roleTopics: ["不動産", "相続", "受託"], cultureTopics: ["協働", "専門性"] },
    ],
  },
  {
    industry: "証券",
    commonTopics: ["なぜ証券か", "リテールとホールセールの理解", "市場を通じた価値提供"],
    watchouts: ["金融全般との違いが曖昧", "マーケット理解不足", "顧客価値の言語化不足"],
    representativeCompanies: [
      { name: "野村證券", companyTopics: ["フルライン証券", "ウェルスマネジメント", "グローバル・ホールセール"], roleTopics: ["リテール", "IB", "マーケッツ"], cultureTopics: ["プロ意識", "顧客本位"] },
      { name: "大和証券", companyTopics: ["資産形成支援", "ホールセール", "グループ連携"], roleTopics: ["リテール", "IB", "リサーチ"], cultureTopics: ["伴走", "挑戦"] },
      { name: "SMBC日興証券", companyTopics: ["銀行連携", "ソリューション提供", "法人・個人の橋渡し"], roleTopics: ["リテール", "IB", "マーケッツ"], cultureTopics: ["総合力", "チームワーク"] },
    ],
  },
  {
    industry: "保険",
    commonTopics: ["なぜ保険か", "生命・損保の違い", "無形商材での価値提供"],
    watchouts: ["金融一般に留まる", "商品・支払い・引受の理解不足", "顧客接点の浅さ"],
    representativeCompanies: [
      { name: "東京海上日動", companyTopics: ["リスクソリューション", "グローバル展開", "挑戦を支える保険"], roleTopics: ["営業", "商品企画", "損害サービス"], cultureTopics: ["挑戦支援", "信頼"] },
      { name: "三井住友海上", companyTopics: ["CSV", "法人リスク対応", "グループ連携"], roleTopics: ["営業", "商品企画", "保険金サービス"], cultureTopics: ["社会課題解決", "協働"] },
      { name: "住友生命", companyTopics: ["生命保険の長期伴走", "Well-being", "商品開発"], roleTopics: ["営業", "商品企画", "資産運用"], cultureTopics: ["寄り添い", "長期信頼"] },
    ],
  },
  {
    industry: "アセットマネジメント",
    commonTopics: ["なぜ運用会社か", "販売会社との違い", "運用・商品・営業の役割理解"],
    watchouts: ["証券・銀行との混同", "市場観と顧客価値の接続不足", "専門性の浅さ"],
    representativeCompanies: [
      { name: "野村アセットマネジメント", companyTopics: ["機関投資家と個人向け両輪", "運用プロダクト", "ESG"], roleTopics: ["運用", "商品企画", "営業"], cultureTopics: ["専門性", "長期視点"] },
      { name: "アセットマネジメントOne", companyTopics: ["グループ連携", "機関投資家対応", "商品開発"], roleTopics: ["運用", "営業", "商品企画"], cultureTopics: ["協働", "誠実さ"] },
      { name: "三井住友DSアセットマネジメント", companyTopics: ["運用と顧客提案の接続", "市場分析", "責任投資"], roleTopics: ["運用", "営業", "リスク管理"], cultureTopics: ["分析力", "長期投資"] },
    ],
  },
  {
    industry: "カード・リース・ノンバンク",
    commonTopics: ["銀行以外の金融機能を選ぶ理由", "与信・決済・リースの事業理解", "事業会社に近い企画余地"],
    watchouts: ["金融一般の話に寄る", "与信や決済基盤の理解不足", "事業企画志向の抽象化"],
    representativeCompanies: [
      { name: "オリックス", companyTopics: ["多角的事業ポートフォリオ", "金融と事業の越境", "投資・事業経営"], roleTopics: ["法人営業", "投資", "事業企画"], cultureTopics: ["挑戦", "自律"] },
      { name: "三菱HCキャピタル", companyTopics: ["リースとソリューション", "アセット活用", "グローバル案件"], roleTopics: ["法人営業", "事業投資", "企画"], cultureTopics: ["長期関係", "専門性"] },
      { name: "オリコ", companyTopics: ["決済・与信基盤", "加盟店支援", "個人向けサービス"], roleTopics: ["営業", "マーケ", "与信"], cultureTopics: ["生活者視点", "誠実さ"] },
    ],
  },
  {
    industry: "政府系・系統金融",
    commonTopics: ["民間金融との違い", "政策性と事業性の両立", "公的使命への納得感"],
    watchouts: ["安定志向に見える", "政策目的の理解不足", "事業性評価の浅さ"],
    representativeCompanies: [
      { name: "DBJ", companyTopics: ["投融資一体", "政策金融と民間補完", "産業育成"], roleTopics: ["投融資", "調査", "アドバイザリー"], cultureTopics: ["公共性", "事業性"] },
      { name: "日本政策金融公庫", companyTopics: ["中小企業支援", "地域経済", "創業支援"], roleTopics: ["融資", "相談支援", "調査"], cultureTopics: ["現場性", "公共性"] },
      { name: "農林中央金庫", companyTopics: ["農林水産業基盤", "系統金融", "機関投資家機能"], roleTopics: ["投融資", "市場", "法人対応"], cultureTopics: ["社会基盤", "長期視点"] },
    ],
  },
  {
    industry: "コンサルティング",
    commonTopics: ["なぜコンサルか", "戦略・業務・ITの違い", "課題解決を仕事にする理由"],
    watchouts: ["成長志向だけに見える", "役割理解が浅い", "実行フェーズへの視点不足"],
    representativeCompanies: [
      { name: "アクセンチュア", companyTopics: ["戦略から実装まで", "テクノロジー活用", "業界横断"], roleTopics: ["戦略", "業務", "テクノロジー"], cultureTopics: ["変革", "多様性"] },
      { name: "デロイト トーマツ コンサルティング", companyTopics: ["日本企業変革", "業界知見", "実装伴走"], roleTopics: ["戦略", "業務", "IT"], cultureTopics: ["協働", "専門性"] },
      { name: "NRI", companyTopics: ["コンサルとITソリューションの一体性", "産業知見", "長期伴走"], roleTopics: ["コンサル", "SE", "研究"], cultureTopics: ["本質志向", "知的専門性"] },
    ],
  },
  {
    industry: "IT・通信",
    commonTopics: ["なぜIT・通信か", "顧客課題と技術の橋渡し", "職種ごとの価値発揮理解"],
    watchouts: ["IT業界の広さに対する解像度不足", "プロダクトと受託の差が曖昧", "職種理解不足"],
    representativeCompanies: [
      { name: "NTTデータ", companyTopics: ["社会基盤システム", "大規模案件", "顧客業務理解"], roleTopics: ["SE", "PM", "コンサル"], cultureTopics: ["協働", "社会影響"] },
      { name: "KDDI", companyTopics: ["通信基盤と事業創造", "ライフデザイン", "新規事業"], roleTopics: ["企画", "営業", "エンジニア"], cultureTopics: ["事業創造", "挑戦"] },
      { name: "NTTドコモ", companyTopics: ["顧客接点の広さ", "通信と金融・エンタメの融合", "サービス企画"], roleTopics: ["企画", "営業", "エンジニア"], cultureTopics: ["生活者視点", "変革"] },
    ],
  },
  {
    industry: "メーカー（電機・機械）",
    commonTopics: ["なぜメーカーか", "BtoB/BtoCと現場理解", "技術・製品・事業のつながり"],
    watchouts: ["ものづくり志向が抽象的", "製品や事業の理解不足", "職種別の貢献像が浅い"],
    representativeCompanies: [
      { name: "日立製作所", companyTopics: ["社会イノベーション", "OT×IT", "事業横断"], roleTopics: ["技術開発", "営業", "DX"], cultureTopics: ["社会課題解決", "協創"] },
      { name: "パナソニックグループ", companyTopics: ["くらし起点", "事業会社制", "技術と顧客価値"], roleTopics: ["研究開発", "商品企画", "営業"], cultureTopics: ["顧客起点", "挑戦"] },
      { name: "キーエンス", companyTopics: ["付加価値営業", "高収益構造", "顧客課題起点"], roleTopics: ["営業", "商品開発", "コーポレート"], cultureTopics: ["自律", "成果責任"] },
    ],
  },
  {
    industry: "メーカー（食品・日用品）",
    commonTopics: ["なぜ食品・日用品か", "生活者理解", "ブランド・商品・SCMの連携"],
    watchouts: ["好きな商品起点だけ", "事業や職種への理解不足", "生活者価値の浅さ"],
    representativeCompanies: [
      { name: "味の素", companyTopics: ["アミノサイエンス", "食と健康", "事業の社会性"], roleTopics: ["研究開発", "営業", "マーケ"], cultureTopics: ["科学と生活者価値", "長期視点"] },
      { name: "サントリー", companyTopics: ["やってみなはれ", "ブランド経営", "食品・酒類の横断"], roleTopics: ["営業", "マーケ", "生産"], cultureTopics: ["挑戦", "生活文化"] },
      { name: "花王", companyTopics: ["消費者理解", "研究開発起点", "ESG"], roleTopics: ["研究開発", "マーケ", "SCM"], cultureTopics: ["本質研究", "生活者視点"] },
    ],
  },
  {
    industry: "広告・マスコミ",
    commonTopics: ["なぜ広告・マスコミか", "クライアント価値と生活者価値", "企画と実行の往復"],
    watchouts: ["華やかさ志向に見える", "媒体・制作・営業の差分不足", "社会への視点不足"],
    representativeCompanies: [
      { name: "電通", companyTopics: ["顧客課題から社会変化まで", "統合提案", "BX/DX/CX"], roleTopics: ["営業", "プランニング", "クリエイティブ"], cultureTopics: ["変化創出", "統合力"] },
      { name: "博報堂プロダクツ", companyTopics: ["実装・制作力", "生活者発想", "現場推進"], roleTopics: ["制作", "プロデュース", "企画"], cultureTopics: ["現場力", "生活者視点"] },
      { name: "講談社", companyTopics: ["IPと編集", "コンテンツ価値", "メディア変革"], roleTopics: ["編集", "営業", "デジタル"], cultureTopics: ["コンテンツ愛", "企画力"] },
    ],
  },
  {
    industry: "不動産・建設",
    commonTopics: ["なぜ不動産・建設か", "長期的価値創出", "街・建物・利用者の視点"],
    watchouts: ["街づくりの抽象論", "開発・営業・運用の違い不明", "事業の長期性理解不足"],
    representativeCompanies: [
      { name: "三井不動産", companyTopics: ["街づくり", "経年で価値を高める", "多用途開発"], roleTopics: ["開発", "リーシング", "運営"], cultureTopics: ["街への長期責任", "構想力"] },
      { name: "三菱地所", companyTopics: ["丸の内エリアマネジメント", "都市開発", "グローバル"], roleTopics: ["開発", "AM", "営業"], cultureTopics: ["都市視点", "品格"] },
      { name: "大和ハウス工業", companyTopics: ["住宅・商業・物流の幅", "現場と事業の接続", "事業多角化"], roleTopics: ["営業", "設計", "施工管理"], cultureTopics: ["現場力", "事業幅"] },
    ],
  },
  {
    industry: "小売・流通",
    commonTopics: ["なぜ小売・流通か", "顧客接点の近さ", "MD・店舗・SCMの連携"],
    watchouts: ["接客志向だけに見える", "事業モデル理解不足", "データや物流視点の欠如"],
    representativeCompanies: [
      { name: "イオンリテール", companyTopics: ["地域密着", "生活インフラ", "店舗運営と企画"], roleTopics: ["店舗運営", "商品企画", "営業"], cultureTopics: ["地域貢献", "生活者起点"] },
      { name: "ローソン", companyTopics: ["身近な顧客接点", "加盟店支援", "データ活用"], roleTopics: ["SV", "企画", "マーケ"], cultureTopics: ["現場起点", "変化対応"] },
      { name: "ニトリ", companyTopics: ["製造物流IT小売", "SPA型の強み", "暮らし提案"], roleTopics: ["商品企画", "店舗", "SCM"], cultureTopics: ["合理性", "顧客価値"] },
    ],
  },
  {
    industry: "サービス・インフラ",
    commonTopics: ["なぜインフラ・サービスか", "安定運営と変革の両立", "社会基盤の現場理解"],
    watchouts: ["公共性だけで終わる", "現場オペレーション理解不足", "事業変革視点不足"],
    representativeCompanies: [
      { name: "JR東日本", companyTopics: ["鉄道基盤", "生活ソリューション", "まちづくり"], roleTopics: ["運行", "企画", "開発"], cultureTopics: ["安全", "社会基盤"] },
      { name: "ANA", companyTopics: ["安全とサービス", "グローバルネットワーク", "非航空事業"], roleTopics: ["運航支援", "営業", "企画"], cultureTopics: ["チームワーク", "顧客体験"] },
      { name: "東京ガス", companyTopics: ["エネルギー転換", "地域基盤", "ソリューション営業"], roleTopics: ["営業", "技術", "企画"], cultureTopics: ["社会基盤", "脱炭素"] },
    ],
  },
  {
    industry: "医療・福祉",
    commonTopics: ["なぜ医療・福祉か", "利用者への直接的価値", "制度理解と現場理解"],
    watchouts: ["社会貢献の一般論", "現場理解不足", "事業性との両立が見えない"],
    representativeCompanies: [
      { name: "SOMPOケア", companyTopics: ["介護現場の質向上", "テクノロジー活用", "地域包括ケア"], roleTopics: ["現場運営", "企画", "DX"], cultureTopics: ["利用者中心", "現場改善"] },
      { name: "ニチイ学館", companyTopics: ["医療事務と介護の基盤", "人材育成", "地域密着"], roleTopics: ["運営", "営業", "企画"], cultureTopics: ["地域密着", "支援基盤"] },
      { name: "LITALICO", companyTopics: ["障害福祉・教育支援", "個別支援", "事業拡張"], roleTopics: ["支援職", "企画", "プロダクト"], cultureTopics: ["多様性", "当事者視点"] },
    ],
  },
  {
    industry: "教育",
    commonTopics: ["なぜ教育か", "学習者起点", "教材・サービス・運営のつながり"],
    watchouts: ["教育への思いだけ", "ビジネスモデル理解不足", "EdTech視点の浅さ"],
    representativeCompanies: [
      { name: "ベネッセ", companyTopics: ["教育と生活支援", "個別最適化", "社会課題解決"], roleTopics: ["企画", "教材開発", "営業"], cultureTopics: ["学びへの伴走", "社会性"] },
      { name: "学研", companyTopics: ["出版と教育サービスの横断", "教室運営", "高齢者支援までの広がり"], roleTopics: ["教材開発", "営業", "企画"], cultureTopics: ["学びの裾野", "現場理解"] },
      { name: "Z会", companyTopics: ["質の高い学習体験", "難関層向け価値", "デジタル学習"], roleTopics: ["教材開発", "編集", "EdTech"], cultureTopics: ["質重視", "学習者視点"] },
    ],
  },
  {
    industry: "印刷・包装",
    commonTopics: ["なぜ印刷・包装か", "素材・製造・顧客課題の接続", "BtoB提案理解"],
    watchouts: ["印刷の旧来イメージ", "情報・包装・DXの広がり理解不足", "BtoB価値の浅さ"],
    representativeCompanies: [
      { name: "TOPPAN", companyTopics: ["情報と生活の接点", "包装・セキュア・DX", "事業多角化"], roleTopics: ["営業", "研究開発", "企画"], cultureTopics: ["変革", "技術応用"] },
      { name: "DNP", companyTopics: ["P&I", "包装から情報まで", "社会課題解決"], roleTopics: ["営業", "開発", "DX"], cultureTopics: ["価値創造", "誠実さ"] },
      { name: "レンゴー", companyTopics: ["段ボール・包装", "サプライチェーン支援", "環境配慮"], roleTopics: ["営業", "生産", "開発"], cultureTopics: ["現場力", "環境対応"] },
    ],
  },
  {
    industry: "アパレル・繊維",
    commonTopics: ["なぜアパレル・繊維か", "ブランド・素材・生産の理解", "生活者接点とサプライチェーン"],
    watchouts: ["ファッション好きだけに見える", "素材や生産の理解不足", "事業モデル理解不足"],
    representativeCompanies: [
      { name: "ファーストリテイリング", companyTopics: ["情報製造小売", "グローバルブランド経営", "顧客起点"], roleTopics: ["MD", "店舗運営", "生産"], cultureTopics: ["世界基準", "経営視点"] },
      { name: "オンワード樫山", companyTopics: ["ブランド運営", "顧客接点", "ECと店舗の融合"], roleTopics: ["MD", "営業", "EC"], cultureTopics: ["ブランド愛着", "顧客理解"] },
      { name: "東レ", companyTopics: ["素材技術", "BtoBソリューション", "繊維から先端材料"], roleTopics: ["研究開発", "営業", "生産"], cultureTopics: ["技術起点", "長期視点"] },
    ],
  },
  {
    industry: "設備工事・エンジニアリング",
    commonTopics: ["なぜエンジニアリングか", "プロジェクト遂行力", "設計から施工・保守までの理解"],
    watchouts: ["スケール感だけに寄る", "プロジェクト現場の理解不足", "安全・品質視点が薄い"],
    representativeCompanies: [
      { name: "日揮HD", companyTopics: ["大型EPC", "エネルギー転換", "国際案件"], roleTopics: ["設計", "プロジェクト管理", "調達"], cultureTopics: ["スケール", "協働"] },
      { name: "千代田化工建設", companyTopics: ["プラントEPC", "技術蓄積", "脱炭素関連"], roleTopics: ["設計", "施工管理", "技術開発"], cultureTopics: ["技術力", "現場遂行"] },
      { name: "NTTファシリティーズ", companyTopics: ["建築・設備・通信基盤", "省エネ", "社会インフラ"], roleTopics: ["設計", "施工管理", "ファシリティ運営"], cultureTopics: ["基盤支援", "品質"] },
    ],
  },
  {
    industry: "公務員・団体",
    commonTopics: ["なぜ民間でなく公的組織か", "制度と現場の両立", "公共性への納得感"],
    watchouts: ["安定志向に見える", "組織使命の理解不足", "具体的な貢献像が薄い"],
    representativeCompanies: [
      { name: "JICA", companyTopics: ["国際協力", "開発課題", "現地との協働"], roleTopics: ["事業企画", "調査", "総務"], cultureTopics: ["公共性", "国際協働"] },
      { name: "JETRO", companyTopics: ["海外展開支援", "産業振興", "調査発信"], roleTopics: ["調査", "企業支援", "企画"], cultureTopics: ["民間支援", "グローバル視点"] },
      { name: "JNTO", companyTopics: ["観光立国", "地域振興", "海外発信"], roleTopics: ["プロモーション", "調査", "企画"], cultureTopics: ["地域連携", "発信力"] },
    ],
  },
  {
    industry: "その他",
    commonTopics: ["業界横断でこの会社を選ぶ理由", "事業モデル理解", "職種と成長機会の接続"],
    watchouts: ["業界理由の後付け", "会社固有の論点不足", "強みの接続が薄い"],
    representativeCompanies: [
      { name: "リクルート", companyTopics: ["マッチング事業", "事業づくり", "圧倒的当事者意識"], roleTopics: ["営業", "企画", "プロダクト"], cultureTopics: ["自律", "事業創造"] },
      { name: "パーソルキャリア", companyTopics: ["はたらく支援", "転職サービス", "個人と法人の両面価値"], roleTopics: ["営業", "企画", "データ"], cultureTopics: ["はたらいて笑おう", "伴走"] },
      { name: "ディップ", companyTopics: ["求人メディア", "DXサービス", "現場課題解決"], roleTopics: ["営業", "企画", "商品"], cultureTopics: ["現場起点", "挑戦"] },
    ],
  },
] satisfies InterviewIndustrySeedProfile[];

export const INTERVIEW_INDUSTRY_SEEDS: InterviewIndustrySeedProfile[] = SEEDS;

export function getInterviewIndustrySeed(industry: string | null | undefined) {
  return INTERVIEW_INDUSTRY_SEEDS.find((seed) => seed.industry === industry) ?? null;
}

export function getInterviewCompanySeed(
  industry: string | null | undefined,
  companyName: string | null | undefined,
) {
  const seed = getInterviewIndustrySeed(industry);
  if (!seed || !companyName) return null;
  return (
    seed.representativeCompanies.find((company) => company.name === companyName) ?? null
  );
}

export function hasCompleteInterviewIndustrySeeds() {
  return (
    INTERVIEW_INDUSTRY_SEEDS.length === INDUSTRIES.length &&
    INTERVIEW_INDUSTRY_SEEDS.every((seed) => seed.representativeCompanies.length === 3)
  );
}
