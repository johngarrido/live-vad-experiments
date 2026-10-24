"""Gera o OpenAPIToolset a partir da spec da API mock (sem precisar do servidor no ar)."""

import os
import sys
from pathlib import Path

from google.adk.tools.openapi_tool.openapi_spec_parser.openapi_toolset import OpenAPIToolset

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from mock_api.main import app  # noqa: E402

# No Cloud Run a API mock roda montada no próprio servidor (/mock); local é o serviço da 8092.
MOCK_API_URL = os.environ.get("MOCK_API_URL", "http://localhost:8092")


def build_toolset() -> OpenAPIToolset:
    spec = app.openapi()
    spec["servers"] = [{"url": MOCK_API_URL}]
    return OpenAPIToolset(spec_dict=spec)


invest_toolset = build_toolset()
