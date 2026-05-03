"""Compatibility shim for ES review request helpers."""

from app.services.es_review import request as _service
from app.services.es_review.router_shim import install_router_shim

install_router_shim(globals(), __name__, _service)
