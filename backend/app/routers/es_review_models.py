"""Compatibility shim for ES review service models."""

from app.services.es_review import models as _service
from app.services.es_review.router_shim import install_router_shim

install_router_shim(globals(), __name__, _service)
