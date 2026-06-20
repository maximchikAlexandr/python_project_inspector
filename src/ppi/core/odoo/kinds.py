"""Coupling edge kind groupings shared by analysis and storage."""

from __future__ import annotations

GRAPH_MODEL_REUSE_KINDS = {
    "python_many2one",
    "python_one2many",
    "python_many2many",
    "python_related",
    "python_api_depends",
    "python_api_onchange",
    "python_api_constrains",
    "python_env_model",
    "security_ir_rule_model_ref",
}
GRAPH_FIELD_PROPERTY_KINDS = {
    "python_field_property_access",
}
GRAPH_EXTENSION_METHOD_KINDS = {
    "python__inherit",
    "python_method_call",
    "python_private_method_call",
}
GRAPH_VIEW_KINDS = {
    "xml_inherit_id",
    "xml_ref",
    "xml_percent_ref",
}

KIND_TO_CATEGORY: dict[str, str] = {
    **{kind: "model_reuse" for kind in GRAPH_MODEL_REUSE_KINDS},
    **{kind: "extension_or_method" for kind in GRAPH_EXTENSION_METHOD_KINDS},
    **{kind: "view" for kind in GRAPH_VIEW_KINDS},
    **{kind: "field_property" for kind in GRAPH_FIELD_PROPERTY_KINDS},
}
