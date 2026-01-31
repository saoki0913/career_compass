"""
Japanese Tokenizer Module

Provides Japanese text tokenization using MeCab (via fugashi).
Used for BM25 keyword search.
"""

from typing import Optional
import re

# Try to import fugashi for MeCab-based tokenization
try:
    import fugashi
    HAS_FUGASHI = True
except ImportError:
    HAS_FUGASHI = False
    print("Warning: fugashi not installed. Using fallback tokenizer.")


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
        text = text.translate(str.maketrans(
            'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'
            'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ'
            '０１２３４５６７８９',
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
            'abcdefghijklmnopqrstuvwxyz'
            '0123456789'
        ))
        # Lowercase
        text = text.lower()
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
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
        tokens = re.split(r'[\s\u3000,，、。．.!！?？\n\r\t]+', text)
        # Filter empty and very short tokens
        tokens = [t for t in tokens if len(t) >= 2 or t.isalnum()]
        return tokens

    @property
    def _stopwords(self) -> set[str]:
        """Japanese stopwords to filter out."""
        return {
            # Particles
            'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ',
            'さ', 'ある', 'いる', 'も', 'な', 'する', 'から', 'な', 'こと',
            'として', 'い', 'や', 'など', 'なっ', 'ない', 'この', 'ため',
            'その', 'あっ', 'よう', 'また', 'もの', 'という', 'あり', 'まで',
            'られ', 'なる', 'へ', 'か', 'だ', 'これ', 'によって', 'により',
            'おり', 'より', 'による', 'ず', 'なり', 'られる', 'において',
            'ば', 'なかっ', 'なく', 'しかし', 'について', 'せ', 'だっ', 'その他',
            'できる', 'それ', 'ほど', 'ところ', 'ただし', 'でき', 'つつ',
            # Common function words
            'ます', 'です', 'ました', 'でした', 'ません', 'ください',
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
