"""Compatibility shim for company info schedule link helpers."""

from app.routers import company_info_candidate_scoring as _candidate_scoring
from app.routers import company_info_config as _config
from app.routers import company_info_models as _models
from app.routers import company_info_pdf as _pdf
from app.routers import company_info_url_utils as _url_utils
from app.services.company_info import fetch_schedule as _service
from app.services.es_review.router_shim import install_router_shim

_service.configure_dependencies(
    models=_models,
    config=_config,
    candidate_scoring=_candidate_scoring,
    url_utils=_url_utils,
    pdf_module=_pdf,
)
install_router_shim(globals(), __name__, _service)
