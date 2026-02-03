"""
Japanese Tokenizer Module

Provides Japanese text tokenization using MeCab (via fugashi).
Used for BM25 keyword search.

Improvements:
- Domain term expansion for job-seeking vocabulary
- Synonym handling for common abbreviations
"""

from typing import Optional
from functools import lru_cache
from pathlib import Path
import json
import re

# Try to import fugashi for MeCab-based tokenization
try:
    import fugashi

    HAS_FUGASHI = True
except ImportError:
    HAS_FUGASHI = False
    print("Warning: fugashi not installed. Using fallback tokenizer.")

# Domain terms dictionary path
DOMAIN_TERMS_PATH = Path(__file__).parent.parent.parent / "data" / "domain_terms.json"


@lru_cache(maxsize=1)
def _load_domain_terms() -> dict:
    """Load domain terms dictionary with caching."""
    if DOMAIN_TERMS_PATH.exists():
        try:
            with open(DOMAIN_TERMS_PATH, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def get_compound_terms() -> dict[str, list[str]]:
    """Get compound term expansions."""
    data = _load_domain_terms()
    return data.get("compound_terms", {})


def get_synonyms() -> dict[str, list[str]]:
    """Get synonym mappings."""
    data = _load_domain_terms()
    return data.get("synonyms", {})


class JapaneseTokenizer:
    """
    Japanese text tokenizer using MeCab.

    Falls back to simple character-based tokenization if fugashi is not available.
    """

    def __init__(self):
        """Initialize the tokenizer."""
        self._tagger: Optional["fugashi.Tagger"] = None
        if HAS_FUGASHI:
            try:
                self._tagger = fugashi.Tagger()
            except Exception as e:
                print(f"Warning: Failed to initialize MeCab: {e}")

    def tokenize(self, text: str) -> list[str]:
        """
        Tokenize Japanese text.

        Args:
            text: Text to tokenize

        Returns:
            List of tokens
        """
        if not text:
            return []

        # Normalize text
        text = self._normalize(text)

        if self._tagger:
            return self._tokenize_with_mecab(text)
        else:
            return self._tokenize_fallback(text)

    def _normalize(self, text: str) -> str:
        """Normalize text for consistent tokenization."""
        # Convert full-width to half-width for alphanumeric
        text = text.translate(
            str.maketrans(
                "ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ"
                "ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ"
                "０１２３４５６７８９",
                "ABCDEFGHIJKLMNOPQRSTUVWXYZ" "abcdefghijklmnopqrstuvwxyz" "0123456789",
            )
        )
        # Lowercase
        text = text.lower()
        # Remove extra whitespace
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _tokenize_with_mecab(self, text: str) -> list[str]:
        """Tokenize using MeCab."""
        tokens = []
        for word in self._tagger(text):
            surface = word.surface
            # Skip single-character particles and punctuation
            if len(surface) <= 1 and not surface.isalnum():
                continue
            # Skip common stopwords
            if surface in self._stopwords:
                continue
            tokens.append(surface)
        return tokens

    def _tokenize_fallback(self, text: str) -> list[str]:
        """
        Fallback tokenizer using simple rules.

        Splits on whitespace and punctuation, keeping meaningful tokens.
        """
        # Split on whitespace and common delimiters
        tokens = re.split(r"[\s\u3000,，、。．.!！?？\n\r\t]+", text)
        # Filter empty and very short tokens
        tokens = [t for t in tokens if len(t) >= 2 or t.isalnum()]
        return tokens

    @property
    def _stopwords(self) -> set[str]:
        """Japanese stopwords to filter out."""
        return {
            # Particles
            "の",
            "に",
            "は",
            "を",
            "た",
            "が",
            "で",
            "て",
            "と",
            "し",
            "れ",
            "さ",
            "ある",
            "いる",
            "も",
            "な",
            "する",
            "から",
            "な",
            "こと",
            "として",
            "い",
            "や",
            "など",
            "なっ",
            "ない",
            "この",
            "ため",
            "その",
            "あっ",
            "よう",
            "また",
            "もの",
            "という",
            "あり",
            "まで",
            "られ",
            "なる",
            "へ",
            "か",
            "だ",
            "これ",
            "によって",
            "により",
            "おり",
            "より",
            "による",
            "ず",
            "なり",
            "られる",
            "において",
            "ば",
            "なかっ",
            "なく",
            "しかし",
            "について",
            "せ",
            "だっ",
            "その他",
            "できる",
            "それ",
            "ほど",
            "ところ",
            "ただし",
            "でき",
            "つつ",
            # Common function words
            "ます",
            "です",
            "ました",
            "でした",
            "ません",
            "ください",
        }


# Singleton instance
_tokenizer: Optional[JapaneseTokenizer] = None


def get_tokenizer() -> JapaneseTokenizer:
    """Get or create the singleton tokenizer instance."""
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = JapaneseTokenizer()
    return _tokenizer


def tokenize(text: str) -> list[str]:
    """
    Tokenize Japanese text using the singleton tokenizer.

    Args:
        text: Text to tokenize

    Returns:
        List of tokens
    """
    return get_tokenizer().tokenize(text)


def tokenize_with_domain_expansion(
    text: str, expand_compounds: bool = True
) -> list[str]:
    """
    Tokenize text with domain-specific term expansion.

    Expands compound terms (e.g., "新卒採用" → ["新卒採用", "新卒", "採用"])
    and handles synonyms for job-seeking vocabulary.

    Args:
        text: Text to tokenize
        expand_compounds: Whether to expand compound terms

    Returns:
        List of tokens with expansions
    """
    base_tokens = tokenize(text)

    if not expand_compounds:
        return base_tokens

    compound_terms = get_compound_terms()
    synonyms = get_synonyms()

    expanded: list[str] = []
    seen: set[str] = set()

    for token in base_tokens:
        # Add original token
        if token not in seen:
            expanded.append(token)
            seen.add(token)

        # Check for compound term expansion
        if token in compound_terms:
            for expansion in compound_terms[token]:
                if expansion not in seen:
                    expanded.append(expansion)
                    seen.add(expansion)

        # Check for synonym expansion
        if token.upper() in synonyms:
            for syn in synonyms[token.upper()]:
                if syn not in seen:
                    expanded.append(syn)
                    seen.add(syn)

    return expanded


def expand_query_terms(query: str) -> str:
    """
    Expand query with domain-specific synonyms.

    Useful for BM25 query expansion.

    Args:
        query: Original query

    Returns:
        Expanded query string
    """
    tokens = tokenize_with_domain_expansion(query)
    return " ".join(tokens)


def reload_domain_terms() -> None:
    """
    Reload domain terms dictionary.

    Call this after updating the domain_terms.json file.
    """
    _load_domain_terms.cache_clear()
