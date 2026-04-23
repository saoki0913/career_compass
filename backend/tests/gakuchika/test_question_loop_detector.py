from app.utils.question_loop_detector import (
    _detect_question_loops_in_history,
    _extract_char_ngrams,
    _extract_recent_assistant_questions,
    _jaccard_similarity,
)


def test_jaccard_identical() -> None:
    grams = _extract_char_ngrams("その時の課題は何でしたか？")
    assert _jaccard_similarity(grams, grams) == 1.0


def test_jaccard_completely_different() -> None:
    a = _extract_char_ngrams("abcde")
    b = _extract_char_ngrams("vwxyz")
    assert _jaccard_similarity(a, b) == 0.0


def test_jaccard_partial_overlap() -> None:
    a = _extract_char_ngrams("行動の背景")
    b = _extract_char_ngrams("行動の理由")
    score = _jaccard_similarity(a, b)
    assert 0.3 <= score <= 0.7


def test_loop_detected_repeated_question() -> None:
    history = [
        {"role": "assistant", "content": "そのときの課題は何でしたか？"},
        {"role": "user", "content": "集客の落ち込みです。"},
        {"role": "assistant", "content": "そのときの課題は何でしたか？"},
        {"role": "user", "content": "来場者数の減少です。"},
        {"role": "assistant", "content": "そのときの課題は何でしたか？"},
    ]

    result = _detect_question_loops_in_history(history, "そのときの課題は何でしたか？")

    assert result["loop_detected"] is True
    assert result["similar_count"] == 3
    assert result["max_similarity"] == 1.0


def test_no_loop_for_varied_questions() -> None:
    history = [
        {"role": "assistant", "content": "どのような状況でしたか？"},
        {"role": "assistant", "content": "なぜそれを課題だと考えましたか？"},
        {"role": "assistant", "content": "どんな行動を取りましたか？"},
        {"role": "assistant", "content": "結果はどう変わりましたか？"},
    ]

    result = _detect_question_loops_in_history(history, "その経験から何を学びましたか？")

    assert result["loop_detected"] is False
    assert result["similar_count"] == 0


def test_window_size_respected() -> None:
    history = [
        {"role": "assistant", "content": "初回だけの質問ですか？"},
        {"role": "assistant", "content": "状況はどうでしたか？"},
        {"role": "assistant", "content": "課題は何でしたか？"},
        {"role": "assistant", "content": "なぜその方法を選びましたか？"},
        {"role": "assistant", "content": "役割は何でしたか？"},
        {"role": "assistant", "content": "学びは何でしたか？"},
    ]

    result = _detect_question_loops_in_history(history, "初回だけの質問ですか？", window=5)

    assert result["loop_detected"] is False
    assert result["similar_count"] == 0


def test_extract_recent_questions_filters_user_messages() -> None:
    history = [
        {"role": "assistant", "content": "最初の質問です"},
        {"role": "user", "content": "回答です"},
        {"role": "assistant", "content": "次の質問です"},
        {"role": "user", "content": "追加の回答です"},
    ]

    assert _extract_recent_assistant_questions(history) == ["最初の質問です", "次の質問です"]


def test_japanese_bigrams() -> None:
    assert _extract_char_ngrams("成果") == {"成果"}
    assert _extract_char_ngrams("改善") == {"改善"}
    assert _extract_char_ngrams("成長") == {"成長"}
