"""
D.6: LLM-judge golden set for gakuchika quality evaluation.

Uses the existing JUDGE_AXES["gakuchika"] (5 axes: star_completeness /
user_fact_preservation / logical_flow / question_depth / naturalness) from
backend/tests/conversation/llm_judge.py.

Marker: @pytest.mark.llm_judge — CI 対象外。手動実行:
    pytest -m llm_judge tests/conversation/gakuchika_golden_set.py -v

Acceptance thresholds:
  - Each axis >= 80/100  (maps to >= 4.0 when judge uses 1-5 integer scale)
  - Average >= 85/100    (maps to >= 4.25 on 1-5 scale)

Note: judge uses a 1-5 integer scale. We map the 80/100 threshold to 4.0
(i.e. raw score >= 4 is "pass") and 85/100 to 4.25 (mean >= 4.25).

These fixtures represent hand-crafted "golden" examples of good gakuchika
conversations. They are NOT LLM-generated; the point is to run them through
the judge to detect regressions in the prompt pipeline, not to validate the
fixtures themselves.

New fixtures only added here — no new harness, no new judge infra.

TRAINING_CASES: used during Phase 2 prompt optimisation.
HOLDOUT_CASES:  must NOT be read or referenced during Phase 2 optimisation
                (grep-guard: check `git diff -- gakuchika_golden_set.py`
                contains no holdout body changes after Phase 2 commits).
"""

from __future__ import annotations

from typing import Any

import pytest

from tests.conversation.llm_judge import (
    JUDGE_AXES,
    is_judge_enabled,
    run_conversation_judge,
)

# ---------------------------------------------------------------------------
# Threshold constants
# ---------------------------------------------------------------------------

# 1-5 integer scale (judge output); 80/100 ≈ 4.0, 85/100 ≈ 4.25
AXIS_PASS_THRESHOLD = 4  # each axis must be >= this value
MEAN_PASS_THRESHOLD = 4.25  # mean across all axes must be >= this


# ---------------------------------------------------------------------------
# Golden conversation fixtures — TRAINING SET (5 cases)
# ---------------------------------------------------------------------------

# Each fixture is a dict with:
#   case_id:     unique string identifier
#   title:       gakuchika topic title (sent to judge as context)
#   transcript:  list of {role, content} dicts (user + assistant turns)
#   final_text:  ES draft text generated at end of conversation
#   description: short description of what this case tests
#   notes:       (optional) extra annotation for human reviewers

TRAINING_CASES: list[dict[str, Any]] = [
    # ------------------------------------------------------------------
    # Case 1: seed_only initial consultation — sparse input → good questions
    # ------------------------------------------------------------------
    {
        "case_id": "gak_golden_01_seed_only",
        "title": "塾講師のアルバイト",
        "description": (
            "Seed-only input (title only). Tests whether the conversation "
            "successfully elicits STAR elements from a sparse starting point."
        ),
        "transcript": [
            {"role": "assistant", "content": "塾講師のお仕事は身近でやりがいも大きいですよね。まずどんな生徒を担当し、どんな状況でしたか。"},
            {"role": "user", "content": "大学3年の夏から1年間、地元の個別指導塾で高校生5名を担当しました。受験生2名を含み、数学と英語が中心でした。"},
            {"role": "assistant", "content": "高校生5名を担当し受験生もいたのは責任のある役割ですね。その中で一番解決しなければいけないと感じた課題は何でしたか。"},
            {"role": "user", "content": "宿題の未提出が続いて成績が伸び悩んでいる生徒が2名いて、本人も保護者も困っていました。学習習慣の定着が一番の課題でした。"},
            {"role": "assistant", "content": "学習習慣の定着が課題だったのはよく分かりましたね。その課題に対して、あなた自身はどんな対策を取りましたか。"},
            {"role": "user", "content": "毎回の授業終わりに次回までの宿題を一緒に計画し、LINEで週1回確認メッセージを送るようにしました。また、宿題ができていたときは必ず具体的に褒めるようにしました。"},
            {"role": "assistant", "content": "週1回のLINE確認と具体的な褒め方は細やかな対応ですね。その結果、生徒の様子や成績はどう変化しましたか。"},
            {"role": "user", "content": "3ヶ月後には宿題提出率が60%から90%以上に上がり、担当2名が模試でそれぞれ20点以上の得点アップを達成しました。保護者からもお礼の言葉をいただきました。"},
        ],
        "final_text": (
            "私は個別指導塾で担当生徒の学習習慣定着に取り組みました。"
            "高校生5名を担当する中で、宿題未提出が続き成績が伸び悩む生徒が2名おり、"
            "学習習慣の形成が最大の課題でした。"
            "私は毎回の授業後に宿題計画を一緒に立て、週1回のLINE確認と具体的な承認を組み合わせた仕組みを構築しました。"
            "その結果、宿題提出率が60%から90%以上に向上し、担当生徒2名が模試で20点以上の得点アップを達成しました。"
            "この経験から、仕組みと定点観測を組み合わせることで行動習慣を変えられると学びました。"
        ),
    },

    # ------------------------------------------------------------------
    # Case 2: rough_episode mid-conversation — task and action clear
    # ------------------------------------------------------------------
    {
        "case_id": "gak_golden_02_rough_episode",
        "title": "学園祭実行委員",
        "description": (
            "Rough episode input. Tests that the conversation deepens a "
            "partially described episode by asking about action ownership "
            "and result evidence."
        ),
        "transcript": [
            {"role": "assistant", "content": "参加者が減っていた中で受付体制の見直しに取り組んだのは大事な一歩ですね。まず受付のどんな場面が一番詰まっていましたか。"},
            {"role": "user", "content": "昼のピーク時間帯に受付が1列しかなく、列が50人以上になることがありました。待ちきれず帰る来場者も出ていました。"},
            {"role": "assistant", "content": "50人以上の行列で帰る来場者が出ていたのは深刻な問題でしたね。その課題をあなた自身はどう解決しましたか。"},
            {"role": "user", "content": "私が会場の導線を見直して受付を2レーン制に変更し、入口案内の担当者も1名増やしました。案内板も3箇所追加設置しました。"},
            {"role": "assistant", "content": "受付の2レーン化と案内担当の増員は具体的な対処ですね。その結果、受付の状況はどう変わりましたか。"},
            {"role": "user", "content": "ピーク時の待機列が15分以内に収まるようになり、参加者アンケートでの満足度が前年比15ポイント上昇しました。"},
        ],
        "final_text": (
            "私は学園祭実行委員として来場者受付の混雑解消に取り組みました。"
            "昼のピーク時に50人以上の行列が発生し、待ちきれず帰る来場者が出ていたことが課題でした。"
            "私は会場導線を分析し、受付を1列から2レーン制に変更するとともに、入口案内担当者を増員し案内板を3箇所追加設置しました。"
            "この結果、ピーク時の待機時間が15分以内に短縮され、来場者満足度が前年比15ポイント向上しました。"
            "この経験から、現場の実態を数字で把握してから具体的な打ち手を決めることの重要性を学びました。"
        ),
    },

    # ------------------------------------------------------------------
    # Case 3: Approval + question pattern compliance
    # ------------------------------------------------------------------
    {
        "case_id": "gak_golden_03_approval_pattern",
        "title": "インターンシップでのデータ分析業務",
        "description": (
            "Tests that every assistant question follows the approval+question "
            "pattern. All assistant turns in this fixture intentionally begin "
            "with a substantive acknowledgment."
        ),
        "transcript": [
            {"role": "assistant", "content": "データ分析の仕事に取り組んだのは貴重な経験ですね。まずどんな業務でどんな状況でしたか。"},
            {"role": "user", "content": "マーケティング会社の3週間インターンで、ECサイトの購買データ分析を担当しました。チームは私を含め学生3名と社員メンターが1名でした。"},
            {"role": "assistant", "content": "ECサイトの購買データを3週間で分析するのはやりがいがありますね。その中でどんな課題に直面しましたか。"},
            {"role": "user", "content": "データの前処理に想定以上の時間がかかり、当初3日で終わる予定が1週間以上かかってしまいました。分析まで辿り着けないリスクがありました。"},
            {"role": "assistant", "content": "前処理に1週間以上かかるのは締め切りへの大きなプレッシャーでしたね。そのとき、あなたはどう対処しましたか。"},
            {"role": "user", "content": "前処理の手順を可視化してチームで分担する仕組みを作り、Pythonスクリプトで繰り返し処理を自動化しました。その結果2日で追いつくことができました。"},
            {"role": "assistant", "content": "手順の可視化と自動化で2日で取り戻せたのは大きな成果ですね。最終的な分析結果はどのような成果をもたらしましたか。"},
            {"role": "user", "content": "購買頻度と客単価の相関を発見し、提案したリピーター向けクーポン施策がメンターに採用されて実装されました。"},
        ],
        "final_text": (
            "私はマーケティング会社のインターンシップでECサイトの購買データ分析に取り組みました。"
            "データ前処理が予定の3日から1週間以上に膨らみ、分析完了が危ぶまれる状況に陥りました。"
            "私は前処理手順をドキュメント化してチームで役割分担し、Pythonで繰り返し処理を自動化することで2日で遅れを取り戻しました。"
            "この結果、購買頻度と客単価の相関を発見し、提案したリピーター向けクーポン施策が採用・実装されました。"
            "この経験から、工程を可視化して分担することで個人の負荷を下げながら締め切りを守る重要性を学びました。"
        ),
    },

    # ------------------------------------------------------------------
    # Case 4: Blocked focus redirect test
    # ------------------------------------------------------------------
    {
        "case_id": "gak_golden_04_blocked_focus",
        "title": "ゼミの研究発表準備",
        "description": (
            "Tests that the conversation does not ask about the same element "
            "more than twice. Questions about role are asked only once before "
            "moving to action and result."
        ),
        "transcript": [
            {"role": "assistant", "content": "ゼミの研究発表準備に取り組んだのは大学ならではの経験ですね。まずどんな規模や状況でしたか。"},
            {"role": "user", "content": "4年のゼミで6人チームの研究発表があり、私はリーダーを務めました。外部の学会での発表も控えていました。"},
            {"role": "assistant", "content": "6人チームのリーダーで学会発表も控えていたのはプレッシャーもあったと思いますね。チームとして一番大変だった点は何でしたか。"},
            {"role": "user", "content": "メンバーの進捗がバラバラで、誰がどこまで担当するかが不明確なまま発表2週間前になってしまいました。"},
            {"role": "assistant", "content": "発表2週間前に担当が不明確だったのは緊迫した状況でしたね。そのとき具体的にどう対処しましたか。"},
            {"role": "user", "content": "私がWBSを作成してタスクを洗い出し、各メンバーの担当と締め切りを全員で合意しました。毎日10分のオンラインミーティングも設定しました。"},
            {"role": "assistant", "content": "WBS作成と毎日の進捗確認を主導したのは組織的な対応でしたね。発表の結果はいかがでしたか。"},
            {"role": "user", "content": "学会で優秀発表賞を受賞し、指導教授からもチームワークの良さを評価していただきました。"},
        ],
        "final_text": (
            "私はゼミ研究で6人チームのリーダーとして、学会発表プロジェクトの進行管理に取り組みました。"
            "発表2週間前に担当タスクが不明確なまま進捗が止まるという課題に直面しました。"
            "私はWBSを作成して全タスクを洗い出し、メンバー全員で担当と締め切りを合意した上で毎日10分のオンラインMTGを設定しました。"
            "この結果、全員が期限通りに準備を完了し、学会での優秀発表賞受賞につながりました。"
            "この経験から、曖昧な状況を可視化して合意形成することがチームの行動を揃える最短手段だと学びました。"
        ),
    },

    # ------------------------------------------------------------------
    # Case 5: ES draft quality — naturalness and fact preservation
    # ------------------------------------------------------------------
    {
        "case_id": "gak_golden_05_es_draft_quality",
        "title": "ボランティア活動でのイベント運営",
        "description": (
            "Tests user_fact_preservation and naturalness. The student uses "
            "specific numbers and concrete verbs. The draft should reflect these "
            "without replacing them with generic LLM phrases."
        ),
        "transcript": [
            {"role": "assistant", "content": "ボランティア活動でのイベント運営は多くを学べる経験ですね。まずどんなイベントでどんな規模でしたか。"},
            {"role": "user", "content": "地域の子ども向けスポーツイベントで、参加者約100名の受付と進行管理を3名で担当しました。私は受付リーダーでした。"},
            {"role": "assistant", "content": "100名規模の受付を3名で回すのは大変でしたね。そのとき一番困った点は何でしたか。"},
            {"role": "user", "content": "受付開始直後に保護者が一斉に来て列が50m以上になり、予定より30分遅れが発生しました。子どもが待ちくたびれて泣いている場面もありました。"},
            {"role": "assistant", "content": "50mの列と30分遅延は想定外の事態でしたね。そのときあなたはどう動きましたか。"},
            {"role": "user", "content": "私がその場で受付を整理番号制に切り替え、待ちスペースで遊べる折り紙セットを配布することを提案・実行しました。スタッフを1名追加手配もしました。"},
            {"role": "assistant", "content": "整理番号制への切り替えと折り紙配布を即座に判断できたのはよい対応でしたね。最終的にどうなりましたか。"},
            {"role": "user", "content": "40分後には列が解消し、その後の進行は予定通りに進みました。終了後に主催者から来年もぜひ来てほしいと言ってもらえました。"},
        ],
        "final_text": (
            "私は地域の子ども向けスポーツイベントで受付リーダーとして100名規模の運営を担いました。"
            "受付開始直後に50m以上の行列が発生し30分の遅延が出る事態になりました。"
            "私はその場で受付を整理番号制に変更し、待機スペースへの折り紙セット配布とスタッフ1名の追加手配を即座に実行しました。"
            "40分後には列が解消し以降の進行は予定通り進みました。主催者から来年もぜひと声をかけていただきました。"
            "この経験から、現場判断で仕組みを変えることを恐れず、参加者視点で待ち時間の質を上げることの大切さを学びました。"
        ),
    },
]


# ---------------------------------------------------------------------------
# Golden conversation fixtures — HOLDOUT SET (3 cases)
#
# WARNING: These cases must NOT be read, referenced, or modified during
# Phase 2 prompt optimisation. They exist solely for post-optimisation
# overfitting detection (Phase 3 holdout check).
# ---------------------------------------------------------------------------

HOLDOUT_CASES: list[dict[str, Any]] = [
    # ------------------------------------------------------------------
    # Holdout 1: rich, detailed episode — quantitative science internship
    #
    # Purpose: star_completeness / user_fact_preservation under maximum
    # information density. Multiple numbers, proper nouns, and named
    # roles appear in the transcript. A good draft must carry them all
    # through; any hardening into generic LLM phrases is detectable.
    # ------------------------------------------------------------------
    {
        "case_id": "gak_holdout_01_rich_detailed_episode",
        "title": "研究室でのデータ分析インターン",
        "description": (
            "Rich quantitative episode: science internship with named tools, "
            "multiple concrete numbers, and distinct role. Tests star_completeness "
            "and user_fact_preservation under high information density."
        ),
        "transcript": [
            {"role": "assistant", "content": "研究室インターンでのデータ分析は具体的な成果が見えやすい経験ですね。まずどんな研究室でどんな状況でしたか。"},
            {"role": "user", "content": "材料工学の研究室で夏季3か月のインターンをしました。指導教員1名と博士課程の先輩2名のチームで、私は学部3年でした。主な役割は実験データの前処理と機械学習モデルの評価でした。"},
            {"role": "assistant", "content": "学部3年で博士課程のチームに加わり前処理と評価を担当したのは大きな責任でしたね。そこで直面した一番の課題は何でしたか。"},
            {"role": "user", "content": "実験装置の測定ノイズが想定より多く、取得した約8,000件のデータのうち約30%が欠損または外れ値でした。手動でクリーニングしていたため1週間で200件しか処理できず、締め切りに間に合わない状況でした。"},
            {"role": "assistant", "content": "8,000件のうち30%が欠損・外れ値で手作業では200件/週しか進まないのは深刻でしたね。あなた自身はどう対処しましたか。"},
            {"role": "user", "content": "Pythonのscikit-learnとpandasを使って外れ値検出スクリプトをゼロから書き、IQR法と移動平均の2段階フィルタリングを実装しました。先輩にレビューをお願いし2回修正して精度を上げました。"},
            {"role": "assistant", "content": "scikit-learnとpandasでIQR+移動平均の2段階フィルタを自作してレビューを経て仕上げたのは主体的な取り組みでしたね。その結果どうなりましたか。"},
            {"role": "user", "content": "処理速度が200件/週から約5,600件/週に改善し、3週間で全データのクリーニングが完了しました。モデルの予測精度もRMSEで15%改善し、指導教員から学会投稿の候補に入れると言ってもらえました。"},
        ],
        "final_text": (
            "私は材料工学の研究室インターンで実験データの前処理自動化に取り組みました。"
            "約8,000件の測定データのうち30%が欠損・外れ値で、手作業では200件/週しか処理できず締め切りに間に合わない状況でした。"
            "私はPythonのscikit-learnとpandasを用いてIQR法と移動平均による2段階フィルタリングスクリプトをゼロから実装し、"
            "博士課程の先輩に2回のコードレビューを依頼して精度を改善しました。"
            "この結果、処理速度が5,600件/週に向上し3週間で全データのクリーニングが完了、モデルのRMSEが15%改善しました。"
            "この経験から、自動化の設計と他者への確認を組み合わせることで個人の限界を超えられると学びました。"
        ),
    },

    # ------------------------------------------------------------------
    # Holdout 2: ambiguous role and scope in a multi-person activity
    #
    # Purpose: role_scope detection. The student's exact decision authority
    # is unclear because multiple committee members acted together. The
    # conversation must surface "what did YOU decide" versus "what did the
    # group decide". Tests question_depth and logical_flow under ambiguity.
    # ------------------------------------------------------------------
    {
        "case_id": "gak_holdout_02_ambiguous_role_scope",
        "title": "サークルの合宿企画",
        "description": (
            "Multi-person activity where decision authority is ambiguous. "
            "Tests question_depth (probing 'what did YOU decide') and "
            "logical_flow when role/scope boundaries are unclear."
        ),
        "transcript": [
            {"role": "assistant", "content": "サークルの合宿企画に取り組んだのはチームでの調整が多い経験ですね。まずどんな体制でどんな状況でしたか。"},
            {"role": "user", "content": "40名の写真サークルで幹部4名が合宿担当でした。私も幹部の一人として企画に関わりました。昨年より参加者が減っていて今年は何とかしたいという雰囲気がありました。"},
            {"role": "assistant", "content": "幹部4名で企画した中で参加者減少という課題があったのですね。その状況でどんな問題が起きていましたか。"},
            {"role": "user", "content": "参加費の設定や行き先についてメンバー間で意見が割れ、3回話し合っても決まらない状態が続きました。私も含め誰が最終的に決めるかが曖昧でした。"},
            {"role": "assistant", "content": "3回話し合っても決まらない状態が続いたのは大変でしたね。その膠着をあなた自身はどう動いて打開しましたか。"},
            {"role": "user", "content": "私が「自分が参加費案を一本化して提案する」と手を挙げ、部員30名にアンケートを取って予算帯の希望を集計しました。それを元に参加費5,000円・近郊宿泊地の案を作り、4名で確認の場を設けました。"},
            {"role": "assistant", "content": "あなた自身がアンケート設計と集計・案の作成を担当したのですね。最終的にその案はどう決まり、合宿はどうなりましたか。"},
            {"role": "user", "content": "4名の幹部で案を検討し、私の案をベースに日程だけ修正して決定しました。合宿の参加者は昨年の28名から35名に増えました。"},
        ],
        "final_text": (
            "私は写真サークルの幹部として合宿の参加費と行き先の意思決定を担いました。"
            "幹部4名で3回議論しても決まらない膠着状態が続き、誰が決めるかが曖昧なまま時間だけが経過していました。"
            "私は「自分が案を一本化する」と手を挙げ、部員30名にアンケートを実施して希望予算帯を集計し、"
            "参加費5,000円・近郊宿泊地の具体案を作成して幹部4名で検討する場を設けました。"
            "日程のみ修正を加えた上で案が承認され、合宿参加者は昨年比7名増の35名になりました。"
            "この経験から、合意形成の膠着を打開するには誰かが具体案を持ち込んで検討の土台を作ることが重要だと学びました。"
        ),
    },

    # ------------------------------------------------------------------
    # Holdout 3: learning-heavy, abstraction-prone volunteer experience
    #
    # Purpose: naturalness / learning_reusability detection. The student's
    # learning section drifts toward abstract vocabulary ("多様性の大切さ",
    # "主体性"). The final_text intentionally retains some of that
    # abstraction so the naturalness axis can detect the subtle AI-like
    # phrasing. This is a deliberately mixed-quality case.
    # ------------------------------------------------------------------
    {
        "case_id": "gak_holdout_03_learning_only_feedback",
        "title": "地域支援ボランティア",
        "description": (
            "Volunteer experience where the learning section tends toward "
            "abstract vocabulary. final_text intentionally includes mild "
            "AI-like phrasing ('多様性', '主体性') to stress-test the "
            "naturalness axis. Deliberately mixed quality."
        ),
        "transcript": [
            {"role": "assistant", "content": "地域支援ボランティアは現場での気づきが多い活動ですね。まずどんな活動でどんな状況でしたか。"},
            {"role": "user", "content": "大学2年から2年間、週1回地域の高齢者向けITサポート窓口でボランティアをしました。月に延べ30〜40名の方が来られていました。"},
            {"role": "assistant", "content": "週1回2年間にわたって月30〜40名を支援し続けたのは継続的な関わりでしたね。その中で一番難しかった点は何でしたか。"},
            {"role": "user", "content": "スマートフォンの操作を説明しても、次の週には忘れてしまう方が多く、毎回同じ質問が繰り返されていました。どう定着させるか悩みました。"},
            {"role": "assistant", "content": "毎週同じ質問が繰り返されると定着しない悔しさがありますね。あなた自身はどう対処しましたか。"},
            {"role": "user", "content": "よく聞かれる操作を10項目に絞り、大きな文字とイラストで手順カードを作りました。次の来訪時に本人に声かけして使い方を確認するフォローも続けました。"},
            {"role": "assistant", "content": "手順カード作成と次回フォローを組み合わせたのは丁寧な対応でしたね。その取り組みで何か変化はありましたか。"},
            {"role": "user", "content": "3か月後には同じ質問の繰り返しが半分以下になり、「自分でできた」と報告してくれる方が増えました。ただ学んだことは、技術よりも「どう伝えるか」の大切さです。"},
        ],
        "final_text": (
            "私は高齢者向けITサポートボランティアで学習定着の仕組み作りに取り組みました。"
            "週1回の活動で月30〜40名を支援する中、毎週同じ操作を質問される状況が続き、定着しない原因の解消が課題でした。"
            "私はよく聞かれる操作10項目を大きな文字とイラストで手順カードにまとめ、次回来訪時に本人へ声かけしてフォローする仕組みを導入しました。"
            "3か月後には繰り返し質問が半分以下になり、自分で操作できたと報告してくれる方が増えました。"
            "この経験から、多様な背景を持つ人への支援では、技術の正確さより伝え方の工夫と継続的な関わりが大切だという主体性の重要性を学びました。"
        ),
    },
]


# ---------------------------------------------------------------------------
# Backward-compatible alias (smoke test and ad-hoc inspection use all cases)
# ---------------------------------------------------------------------------

GOLDEN_CASES: list[dict[str, Any]] = TRAINING_CASES + HOLDOUT_CASES


# ---------------------------------------------------------------------------
# Helpers for judge evaluation
# ---------------------------------------------------------------------------


def _compute_score_100(raw_score: int) -> int:
    """Convert 1-5 integer judge score to 0-100 scale."""
    # 1 -> 20, 2 -> 40, 3 -> 60, 4 -> 80, 5 -> 100
    return max(0, min(100, raw_score * 20))


def _mean_100(scores: dict[str, int]) -> float:
    """Compute mean score on 0-100 scale from raw 1-5 scores dict."""
    if not scores:
        return 0.0
    converted = [_compute_score_100(v) for v in scores.values() if isinstance(v, int)]
    return sum(converted) / len(converted) if converted else 0.0


# ---------------------------------------------------------------------------
# Shared judge assertion helper
# ---------------------------------------------------------------------------


async def _assert_judge_passes(case: dict[str, Any]) -> None:
    """Run a single golden case through the LLM judge and assert quality.

    Acceptance criteria:
      - Each JUDGE_AXES["gakuchika"] axis raw score >= 4 (== 80/100)
      - Mean across axes >= 4.25 (== 85/100)
    """
    case_id: str = case["case_id"]
    title: str = case["title"]
    transcript: list[dict] = case["transcript"]
    final_text: str = case["final_text"]

    result = await run_conversation_judge(
        feature="gakuchika",
        case_id=case_id,
        title=title,
        transcript=transcript,
        final_text=final_text,
    )

    assert result is not None, (
        f"[{case_id}] Judge returned None — check LIVE_AI_CONVERSATION_LLM_JUDGE env var"
    )

    scores: dict[str, int] = result.get("scores", {})
    axes = JUDGE_AXES["gakuchika"]

    # Per-axis threshold check
    per_axis_failures: list[str] = []
    for axis in axes:
        raw = scores.get(axis, 0)
        score_100 = _compute_score_100(raw)
        if score_100 < 80:
            per_axis_failures.append(
                f"{axis}={raw}/5 ({score_100}/100 < 80 threshold)"
            )

    # Mean score check
    mean = _mean_100(scores)

    print(
        f"\n[{case_id}] '{title}'\n"
        f"  scores: { {k: f'{v}/5 ({_compute_score_100(v)}/100)' for k, v in scores.items()} }\n"
        f"  mean: {mean:.1f}/100\n"
        f"  warnings: {result.get('warnings', [])}\n"
        f"  fail_reasons: {result.get('reasons', [])}"
    )

    assert not per_axis_failures, (
        f"[{case_id}] Per-axis threshold failures (< 80/100):\n"
        + "\n".join(f"  - {f}" for f in per_axis_failures)
    )
    assert mean >= 85.0, (
        f"[{case_id}] Mean score {mean:.1f}/100 is below 85/100 threshold. "
        f"Scores: {scores}"
    )


# ---------------------------------------------------------------------------
# Pytest parametrized tests — separated by set
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def _require_judge_enabled():
    """Skip llm_judge tests when LLM judge is disabled."""
    if not is_judge_enabled():
        pytest.skip(
            "LLM judge disabled. "
            "Set LIVE_AI_CONVERSATION_LLM_JUDGE=1 to run gakuchika golden set."
        )


@pytest.mark.llm_judge
@pytest.mark.asyncio
@pytest.mark.usefixtures("_require_judge_enabled")
@pytest.mark.parametrize(
    "case",
    TRAINING_CASES,
    ids=[c["case_id"] for c in TRAINING_CASES],
)
async def test_gakuchika_training_case(case: dict[str, Any]) -> None:
    """Run a TRAINING golden case through the LLM judge.

    Use this during Phase 2 prompt optimisation to measure improvement.
    HOLDOUT cases must not be read during optimisation.

    To run manually:
        LIVE_AI_CONVERSATION_LLM_JUDGE=1 pytest -m llm_judge \
            tests/conversation/gakuchika_golden_set.py::test_gakuchika_training_case -v
    """
    await _assert_judge_passes(case)


@pytest.mark.llm_judge
@pytest.mark.asyncio
@pytest.mark.usefixtures("_require_judge_enabled")
@pytest.mark.parametrize(
    "case",
    HOLDOUT_CASES,
    ids=[c["case_id"] for c in HOLDOUT_CASES],
)
async def test_gakuchika_holdout_case(case: dict[str, Any]) -> None:
    """Run a HOLDOUT golden case through the LLM judge.

    Use this only in Phase 3 to detect overfitting from Phase 2 changes.
    These cases must NOT be referenced during Phase 2 prompt optimisation.

    To run manually:
        LIVE_AI_CONVERSATION_LLM_JUDGE=1 pytest -m llm_judge \
            tests/conversation/gakuchika_golden_set.py::test_gakuchika_holdout_case -v
    """
    await _assert_judge_passes(case)


# ---------------------------------------------------------------------------
# Collection smoke test (no LLM required)
# ---------------------------------------------------------------------------


def test_golden_cases_are_well_formed() -> None:
    """All golden cases must have required fields and non-empty content.

    Also verifies TRAINING / HOLDOUT counts and global uniqueness of case IDs.
    This test runs without LLM (no llm_judge marker) to validate the
    fixture structure in CI.
    """
    required_keys = {"case_id", "title", "transcript", "final_text", "description"}
    axes = JUDGE_AXES["gakuchika"]

    # Count assertions (Phase 0.1 invariants)
    assert len(TRAINING_CASES) == 5, (
        f"Expected 5 TRAINING_CASES, got {len(TRAINING_CASES)}"
    )
    assert len(HOLDOUT_CASES) == 3, (
        f"Expected 3 HOLDOUT_CASES, got {len(HOLDOUT_CASES)}"
    )

    # All case IDs are globally unique
    all_ids = [c["case_id"] for c in GOLDEN_CASES]
    assert len(all_ids) == len(set(all_ids)), "All case_ids must be unique across TRAINING + HOLDOUT"

    for case in GOLDEN_CASES:
        missing_keys = required_keys - set(case.keys())
        assert not missing_keys, (
            f"Case {case.get('case_id')!r} missing keys: {missing_keys}"
        )

        assert case["transcript"], f"Case {case['case_id']!r}: transcript must not be empty"
        assert case["final_text"].strip(), f"Case {case['case_id']!r}: final_text must not be empty"

        # Transcript must have at least one user and one assistant turn
        user_turns = [t for t in case["transcript"] if t.get("role") == "user"]
        assistant_turns = [t for t in case["transcript"] if t.get("role") == "assistant"]
        assert user_turns, f"Case {case['case_id']!r}: must have at least one user turn"
        assert assistant_turns, f"Case {case['case_id']!r}: must have at least one assistant turn"

    # Verify axes are what we expect
    assert axes == [
        "star_completeness",
        "user_fact_preservation",
        "logical_flow",
        "question_depth",
        "naturalness",
    ]

    # Verify all case IDs are unique (GOLDEN_CASES alias check)
    case_ids = [c["case_id"] for c in GOLDEN_CASES]
    assert len(case_ids) == len(set(case_ids)), "All case_ids must be unique"
