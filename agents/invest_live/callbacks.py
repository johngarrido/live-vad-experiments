from typing import Any

from google.adk.agents.callback_context import CallbackContext
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

from .profile import USER_PROFILE


def seed_profile_state(callback_context: CallbackContext) -> None:
    """Semeia o perfil do cliente no estado da sessão (simula o contexto enviado pelo app)."""
    for key, value in USER_PROFILE.items():
        if key not in callback_context.state:
            callback_context.state[key] = value


def inject_account_id(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext
) -> None:
    """Força o account_id do cliente em toda tool que aceita esse parâmetro.

    Garante que o modelo nunca opere numa conta diferente da do usuário logado.
    """
    if "account_id" in args or _tool_declares_account_id(tool):
        args["account_id"] = tool_context.state.get("account_id", USER_PROFILE["account_id"])


def _tool_declares_account_id(tool: BaseTool) -> bool:
    try:
        declaration = tool._get_declaration()
        if declaration is None:
            return False
        if declaration.parameters is not None:
            return "account_id" in (declaration.parameters.properties or {})
        schema = declaration.parameters_json_schema or {}
        return "account_id" in schema.get("properties", {})
    except Exception:
        return False
