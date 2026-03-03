#!/usr/bin/env python3
"""Generate a curated list of ~300 popular companies for live search testing.

Selection strategy:
1. Must-include list: Hand-curated from job-hunting popularity rankings
   (キャリタス就活, マイナビ・日経, 学情, みん就 2025-2027 data)
2. Remaining quota filled from company_mappings.json by industry proportion

Sources:
- キャリタス就活 就職希望企業ランキング 2026
- マイナビ・日経 2026年卒大学生就職企業人気ランキング
- 学情 2026年卒就職人気企業ランキング (7年連続伊藤忠1位)
- みん就 2027年卒 新卒就職人気企業ランキング
- 就活の教科書 人気企業TOP200

Usage:
    python backend/tests/scripts/generate_popular_companies.py
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime
from pathlib import Path

TARGET_TOTAL = 350  # Flexible: must-include takes priority, fill to this cap

# =========================================================================
# Must-include companies by industry
# Based on job-hunting popularity rankings + industry importance
# These companies MUST be included regardless of has_parent or tier
# =========================================================================
MUST_INCLUDE: dict[str, list[str]] = {
    "商社": [
        # 総合商社（7社）
        "三井物産", "三菱商事", "伊藤忠商事", "住友商事", "丸紅", "豊田通商", "双日",
        # 専門商社（主要）
        "兼松", "日鉄物産", "JFE商事", "阪和興業", "長瀬産業", "岩谷産業",
        "伊藤忠丸紅鉄鋼", "メタルワン", "三菱食品", "稲畑産業",
    ],
    "金融・保険": [
        # メガバンク（HD + 実体銀行）
        "三菱UFJフィナンシャル・グループ", "三菱UFJ銀行", "三菱UFJ信託銀行",
        "三井住友フィナンシャルグループ", "三井住友銀行", "三井住友信託銀行",
        "みずほフィナンシャルグループ", "みずほ銀行",
        "りそなホールディングス",
        # 証券
        "野村ホールディングス", "野村證券", "大和証券", "SMBC日興証券",
        "三菱UFJモルガン・スタンレー証券", "みずほ証券",
        # 損保・生保
        "東京海上ホールディングス", "東京海上日動火災保険",
        "三井住友海上火災保険", "損害保険ジャパン",
        "あいおいニッセイ同和損保",
        "日本生命", "第一生命", "明治安田生命", "住友生命",
        # 信託・政府系
        "三井住友トラスト・ホールディングス",
        "日本政策投資銀行", "国際協力銀行", "農林中央金庫", "日本政策金融公庫",
        # カード・リース
        "JCB", "三井住友カード", "オリックス",
        # 外資系金融
        "ゴールドマン・サックス", "モルガン・スタンレー", "JPモルガン",
        # 地方銀行
        "横浜銀行", "千葉銀行",
    ],
    "コンサルティング": [
        # 戦略コンサル
        "アクセンチュア", "マッキンゼー", "BCG", "ベイン・アンド・カンパニー",
        "A.T.カーニー", "ローランド・ベルガー",
        # Big4
        "PwC", "デロイト", "EY", "KPMG",
        # 日系コンサル
        "アビームコンサルティング", "ベイカレント",
        # シンクタンク
        "野村総合研究所", "三菱総合研究所", "日本総合研究所", "大和総研",
        "三菱UFJリサーチ&コンサルティング", "みずほリサーチ&テクノロジーズ",
    ],
    "IT・通信": [
        # 通信キャリア
        "NTT", "NTTデータ", "NTTドコモ", "NTTコミュニケーションズ", "NTT東日本",
        "KDDI", "ソフトバンク", "ソフトバンクグループ", "楽天グループ",
        # SIer
        "SCSK", "TIS", "BIPROGY", "富士ソフト", "オービック",
        "伊藤忠テクノソリューションズ", "日鉄ソリューションズ", "Sky",
        "日立ソリューションズ", "日立システムズ", "大塚商会",
        "NECソリューションイノベータ",
        # メガベンダー
        "富士通", "NEC",
        # Web/SaaS
        "サイバーエージェント", "DeNA", "メルカリ", "LINE", "ヤフー",
        "LINEヤフー", "PayPay", "ZOZO", "freee", "マネーフォワード",
        # 外資IT
        "Google", "Amazon", "Apple", "Microsoft", "Meta",
        "日本IBM", "日本オラクル", "セールスフォース・ジャパン", "AWS",
    ],
    "メーカー（電機・機械）": [
        # 自動車
        "トヨタ自動車", "本田技研工業", "日産自動車", "マツダ", "SUBARU", "スズキ",
        "ヤマハ発動機", "日野自動車", "ダイハツ工業",
        # 自動車部品
        "デンソー", "アイシン", "豊田自動織機",
        # 電機・重工
        "ソニーグループ", "パナソニックホールディングス", "パナソニック",
        "日立製作所", "三菱電機", "東芝",
        "三菱重工業", "川崎重工業", "IHI",
        # 素材
        "日本製鉄", "JFEスチール", "住友金属鉱山", "住友電気工業",
        "旭化成", "三菱ケミカル", "住友化学", "信越化学", "東レ",
        "ブリヂストン", "積水化学工業",
        # 電子部品・半導体
        "キヤノン", "富士フイルム",
        "キーエンス", "村田製作所", "TDK", "京セラ", "ローム",
        "東京エレクトロン", "ディスコ", "アドバンテスト", "レーザーテック",
        "日本電産", "オムロン", "ルネサス",
        # 精密機器
        "島津製作所", "浜松ホトニクス",
        # 機械
        "ファナック", "SMC", "ダイキン", "コマツ", "クボタ",
        "日揮ホールディングス", "荏原製作所",
        # ガラス・住設
        "AGC", "TOTO", "LIXIL",
        # シャープ・安川
        "シャープ", "安川電機",
        # 医療機器
        "オリンパス", "シスメックス", "HOYA", "テルモ",
    ],
    "メーカー（食品・日用品）": [
        # 日用品
        "花王", "資生堂", "ライオン", "ユニ・チャーム", "P&G",
        # 食品（人気ランキング上位）
        "味の素", "サントリー", "キリン", "アサヒ", "明治",
        "日清食品", "ロッテ", "カゴメ", "キッコーマン",
        "ヤクルト", "森永製菓", "カルビー", "キユーピー",
        "伊藤園", "JT", "ハウス食品",
        # 外資
        "ユニリーバ", "ネスレ日本", "コカ・コーラ",
    ],
    "広告・マスコミ": [
        # 広告
        "電通グループ", "博報堂", "博報堂DYホールディングス", "ADKホールディングス",
        # テレビ
        "日本テレビ", "TBS", "フジテレビ", "テレビ朝日", "テレビ東京", "NHK",
        # 新聞
        "読売新聞", "朝日新聞", "日本経済新聞",
        # 出版（人気急上昇）
        "集英社", "講談社", "小学館", "KADOKAWA",
        # エンタメ（ランキング上位）
        "東宝", "任天堂", "バンダイナムコ", "オリエンタルランド",
        "カプコン", "コナミ", "スクウェア・エニックス", "セガサミー",
        "ソニーミュージック",
        # 人材
        "リクルート", "リクルートホールディングス",
    ],
    "不動産・建設": [
        # デベロッパー
        "三井不動産", "三菱地所", "住友不動産", "東急不動産",
        "野村不動産", "森ビル", "ヒューリック", "東京建物",
        # ゼネコン
        "大林組", "鹿島建設", "清水建設", "大成建設", "竹中工務店",
        # 住宅
        "積水ハウス", "大和ハウス", "住友林業",
        "長谷工コーポレーション",
        # 追加
        "五洋建設", "戸田建設",
    ],
    "小売・流通": [
        "ファーストリテイリング", "ユニクロ",
        "イオン", "セブン&アイ", "セブン-イレブン・ジャパン",
        "ローソン", "ファミリーマート",
        "三越伊勢丹", "高島屋",
        "ニトリ", "良品計画",
        "マツモトキヨシ", "スターバックス",
    ],
    "サービス・インフラ": [
        # JR
        "JR東日本", "JR西日本", "JR東海", "JR九州",
        # 私鉄（主要）
        "東急電鉄", "小田急電鉄", "阪急阪神ホールディングス",
        "京王電鉄", "東京メトロ",
        # 航空
        "ANA", "JAL",
        # エネルギー
        "東京電力", "関西電力", "中部電力",
        "東京ガス", "大阪ガス",
        "ENEOS", "出光興産", "INPEX", "JERA",
        # 海運
        "日本郵船", "商船三井", "川崎汽船",
        # 物流
        "ヤマト運輸", "佐川急便", "日本通運",
        # 旅行（人気上昇）
        "JTB", "星野リゾート",
        # セキュリティ
        "セコム",
        # 道路
        "首都高速道路",
        # 医療IT
        "エムスリー",
        # 公的機関（就活人気）
        "日本銀行", "日本貿易振興機構", "国際協力機構", "JAXA",
        "日本郵政グループ",
    ],
    "医療・福祉": [
        "武田薬品工業", "アステラス製薬", "第一三共", "エーザイ",
        "中外製薬", "大塚製薬", "塩野義製薬", "小野薬品工業",
        "田辺三菱製薬", "協和キリン", "参天製薬",
    ],
    "教育": [
        "ベネッセ", "学研", "河合塾",
    ],
    "印刷・包装": [
        "大日本印刷", "凸版印刷",
    ],
    "アパレル・繊維": [
        "ワコール", "オンワード", "ゴールドウイン",
    ],
    "設備工事・エンジニアリング": [
        "関電工", "きんでん", "九電工",
    ],
    "その他人気企業": [
        "ポケモン", "コロプラ", "Cygames", "ミクシィ",
    ],
}


def parse_mappings(mappings: dict) -> dict[str, list[str]]:
    """Parse company_mappings.json into industry -> company_name list."""
    industry_map: dict[str, list[str]] = {}
    current_industry: str | None = None

    for key, value in mappings.items():
        if key.startswith("_section_"):
            label = value.strip().strip("=").strip()
            current_industry = label if label else None
            continue
        if key.startswith("_"):
            continue
        if current_industry:
            industry_map.setdefault(current_industry, []).append(key)

    return industry_map


def main():
    script_dir = Path(__file__).resolve().parent
    backend_root = script_dir.parent.parent
    mappings_path = backend_root / "data" / "company_mappings.json"

    if not mappings_path.exists():
        print(f"ERROR: {mappings_path} not found", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(mappings_path.read_text(encoding="utf-8"))
    mappings = raw.get("mappings", {})
    if not mappings:
        print("ERROR: No 'mappings' key found", file=sys.stderr)
        sys.exit(1)

    # All valid company names from mappings
    all_valid = {k for k in mappings if not k.startswith("_")}

    # Parse industry structure
    industry_companies = parse_mappings(mappings)

    print(f"Parsed {len(industry_companies)} industries, {len(all_valid)} companies total\n")

    # Step 1: Validate and collect must-include companies
    selected: list[dict] = []
    selected_names: set[str] = set()
    warnings: list[str] = []

    for industry, companies in MUST_INCLUDE.items():
        for name in companies:
            if name in selected_names:
                continue
            if name not in all_valid:
                warnings.append(f"  NOT IN MAPPINGS: {name} ({industry})")
                continue
            selected.append({
                "name": name,
                "industry": industry,
                "priority": "must_include",
            })
            selected_names.add(name)

    print(f"Must-include: {len(selected)} companies selected")
    if warnings:
        print(f"Warnings ({len(warnings)}):")
        for w in warnings:
            print(w)
    print()

    # Count must-include per industry (needed for summary)
    must_per_industry: dict[str, int] = {}
    for c in selected:
        must_per_industry[c["industry"]] = must_per_industry.get(c["industry"], 0) + 1

    # Step 2: Fill remaining quota from mappings (by industry proportion)
    remaining_quota = TARGET_TOTAL - len(selected)
    if remaining_quota > 0:
        # Industries with remaining candidates
        fill_pool: dict[str, list[str]] = {}
        for industry, companies in industry_companies.items():
            candidates = [c for c in companies if c not in selected_names]
            if candidates:
                fill_pool[industry] = candidates

        # Proportional fill from remaining candidates
        total_remaining_pool = sum(len(v) for v in fill_pool.values())
        if total_remaining_pool > 0 and remaining_quota > 0:
            # Allocate proportionally
            for industry in sorted(fill_pool.keys()):
                candidates = fill_pool[industry]
                alloc = max(1, math.floor(len(candidates) / total_remaining_pool * remaining_quota))
                alloc = min(alloc, len(candidates), remaining_quota)
                for name in candidates[:alloc]:
                    if len(selected) >= TARGET_TOTAL:
                        break
                    selected.append({
                        "name": name,
                        "industry": industry,
                        "priority": "fill",
                    })
                    selected_names.add(name)

        # If still under target, add more from largest pools
        while len(selected) < TARGET_TOTAL:
            added = False
            for industry in sorted(fill_pool.keys(), key=lambda x: len(fill_pool[x]), reverse=True):
                candidates = [c for c in fill_pool[industry] if c not in selected_names]
                if candidates:
                    name = candidates[0]
                    selected.append({
                        "name": name,
                        "industry": industry,
                        "priority": "fill",
                    })
                    selected_names.add(name)
                    added = True
                    if len(selected) >= TARGET_TOTAL:
                        break
            if not added:
                break

    # Build allocation summary
    allocation: dict[str, int] = {}
    for c in selected:
        allocation[c["industry"]] = allocation.get(c["industry"], 0) + 1

    # Build output
    output = {
        "_comment": "就活テスト用300社リスト。就活人気ランキング＋業界主要企業から選定。",
        "_generated_at": datetime.now().strftime("%Y-%m-%d"),
        "_generated_by": "generate_popular_companies.py",
        "_version": 2,
        "_total": len(selected),
        "_sources": [
            "キャリタス就活 就職希望企業ランキング 2026",
            "マイナビ・日経 2026年卒大学生就職企業人気ランキング",
            "学情 2027年卒就職人気企業ランキング",
            "就活の教科書 人気企業TOP200",
        ],
        "_allocation": allocation,
        "companies": selected,
    }

    output_path = backend_root / "tests" / "fixtures" / "popular_companies_300.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Output: {output_path}")
    print(f"Total: {len(selected)}")
    print(f"\nAllocation by industry:")
    for ind, count in sorted(allocation.items(), key=lambda x: -x[1]):
        must_count = must_per_industry.get(ind, 0)
        fill_count = count - must_count
        print(f"  {ind}: {count} (must:{must_count}, fill:{fill_count})")

    priority_counts: dict[str, int] = {}
    for c in selected:
        priority_counts[c["priority"]] = priority_counts.get(c["priority"], 0) + 1
    print(f"\nPriority breakdown: {priority_counts}")


if __name__ == "__main__":
    main()
