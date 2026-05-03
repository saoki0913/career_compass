"""Compatibility shim for company info RAG service helpers."""

from app.routers import company_info_models as _models
from app.routers import company_info_pdf as _pdf
from app.services.company_info import build_rag_source as _service
from app.services.es_review.router_shim import install_router_shim

_service.configure_dependencies(models=_models, pdf=_pdf)
install_router_shim(globals(), __name__, _service)
