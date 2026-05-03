"""Compatibility shim for Gakuchika question pipeline helpers."""

from app.services.es_review.router_shim import install_router_shim
from app.services.gakuchika import question_pipeline as _service


install_router_shim(globals(), __name__, _service)
