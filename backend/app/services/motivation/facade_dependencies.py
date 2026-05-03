"""Compatibility accessors for legacy motivation monkeypatch points."""

from __future__ import annotations


def __getattr__(name: str):
    from app.services.motivation import facade

    return getattr(facade, name)
