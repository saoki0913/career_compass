"""Compatibility shim for company info schedule extraction helpers."""

from app.routers import company_info_candidate_scoring as _candidate_scoring
from app.routers import company_info_config as _config
from app.routers import company_info_models as _models
from app.services.company_info import extract_deadlines as _service
from app.services.es_review.router_shim import install_router_shim

_service.configure_dependencies(
    models=_models,
    config=_config,
    candidate_scoring=_candidate_scoring,
)
install_router_shim(globals(), __name__, _service)
