"""
search_eval - Search quality evaluation framework.

Modular components for evaluating company info search accuracy,
computing IR metrics, managing baselines, and generating reports.
"""

from tests.search_eval.models import (
    HybridRawResult,
    JudgmentGrade,
    RunJudgment,
    RunRecord,
)
from tests.search_eval.config import SearchTestConfig
from tests.search_eval.company_loader import CompanyLoader
from tests.search_eval.judge import ResultJudge
from tests.search_eval.metrics import MetricsComputer
from tests.search_eval.failure_taxonomy import classify_failure, FailureTaxonomy
from tests.search_eval.baseline import BaselineManager
from tests.search_eval.runner import SearchRunner
from tests.search_eval.report import ReportGenerator

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
