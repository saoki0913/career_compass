"""Company info search evaluation framework."""

from evals.company_info_search.models import (
    HybridRawResult,
    JudgmentGrade,
    RunJudgment,
    RunRecord,
)
from evals.company_info_search.config import SearchTestConfig
from evals.company_info_search.company_loader import CompanyLoader
from evals.company_info_search.judge import ResultJudge
from evals.company_info_search.metrics import MetricsComputer
from evals.company_info_search.failure_taxonomy import classify_failure, FailureTaxonomy
from evals.company_info_search.baseline import BaselineManager
from evals.company_info_search.runner import SearchRunner
from evals.company_info_search.report import ReportGenerator

__all__ = [
    "HybridRawResult",
    "JudgmentGrade",
    "RunJudgment",
    "RunRecord",
    "SearchTestConfig",
    "CompanyLoader",
    "ResultJudge",
    "MetricsComputer",
    "classify_failure",
    "FailureTaxonomy",
    "BaselineManager",
    "SearchRunner",
    "ReportGenerator",
]
