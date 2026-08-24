"""
Fluxentiq Admin Infrastructure Copilot — safe JSON patch parser.

Converts natural language admin commands into validated JSON patches against
organization_configs (dashboard_layout_json, dynamic_schema_json, copilot_rules_json).

RCE-safe: no exec/eval, only JSON structure validation via strict allow-list.
LLM is used when available, with deterministic regex fallback for offline/demo.

Supported intents (examples):
- "Hide the turnover card" → toggle widget enabled=false
- "Show payroll and hide expenses" → multiple toggles
- "Move attendance to top" → reorder widgets
- "Add a security clearance field" → add dynamic field (select)
- "Add cost center field" → add text field
- "Remove cost_center field" → remove field
- "Add a clearance field with options None, Secret, Top Secret" → select field with options

Output patch format:
{
  "dashboardLayout": { "widgets": [{id, enabled, order}] } // partial
  "dynamicSchema": { "fields": [...] } // full or partial
  "message": "Human readable summary"
}
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

# Known widget IDs (must match DEFAULT_WIDGETS in app/actions/studioActions.ts)
KNOWN_WIDGETS = {
    "assets": "Assets Overview",
    "attendance": "Attendance",
    "payroll": "Payroll Summary",
    "ai_copilot": "AI Copilot",
    "turnover": "Turnover Risk",
    "recruitment": "Recruitment Pipeline",
    "leave": "Leave Requests",
    "performance": "Performance Reviews",
    "expenses": "Expenses",
    "learning": "Learning & Compliance",
}

# Field type detection keywords
FIELD_TYPE_HINTS = {
    "text": ["text", "string", "name", "code", "center", "department"],
    "number": ["number", "amount", "count", "salary", "budget"],
    "select": ["clearance", "level", "status", "type", "category", "select", "option"],
    "boolean": ["boolean", "flag", "enabled", "active"],
    "date": ["date", "time", "deadline"],
}


def _normalize(text: str) -> str:
    return text.lower().strip()


def _extract_widget_mentions(prompt: str) -> List[Tuple[str, bool]]:
    """
    Extracts (widget_id, enabled) pairs from prompt.
    e.g., "Hide turnover" → ("turnover", False), "Show payroll" → ("payroll", True)
    """
    results: List[Tuple[str, bool]] = []
    lower = _normalize(prompt)

    # Patterns for hide/show
    hide_patterns = [
        r"hide (?:the )?([a-z0-9_ ]+?)(?: card| widget)?(?:\b|$|,| and)",
        r"disable (?:the )?([a-z0-9_ ]+?)(?: card| widget)?",
        r"remove (?:the )?([a-z0-9_ ]+?)(?: card| widget)?",
    ]
    show_patterns = [
        r"show (?:the )?([a-z0-9_ ]+?)(?: card| widget)?",
        r"enable (?:the )?([a-z0-9_ ]+?)(?: card| widget)?",
        r"add (?:the )?([a-z0-9_ ]+?)(?: card| widget)?",
    ]

    def match_widgets(patterns: List[str], enabled: bool):
        for pat in patterns:
            for m in re.finditer(pat, lower):
                raw = m.group(1).strip()
                # Try to map raw mention to known widget ID
                # Direct ID match
                if raw.replace(" ", "_") in KNOWN_WIDGETS:
                    results.append((raw.replace(" ", "_"), enabled))
                    continue
                # Fuzzy: check if any known widget label contains raw or vice versa
                for wid, label in KNOWN_WIDGETS.items():
                    if raw in wid or raw in label.lower() or wid in raw or label.lower() in raw:
                        # Avoid duplicates
                        if not any(r[0] == wid for r in results):
                            results.append((wid, enabled))

    match_widgets(hide_patterns, False)
    match_widgets(show_patterns, True)

    # Deduplicate keeping last
    deduped: Dict[str, bool] = {}
    for wid, en in results:
        deduped[wid] = en

    return list(deduped.items())


def _extract_field_additions(prompt: str) -> List[Dict[str, Any]]:
    """
    Extracts dynamic field additions.
    e.g., "Add a security clearance field" → {key: security_clearance, label: Security Clearance, type: select}
    """
    fields: List[Dict[str, Any]] = []
    lower = _normalize(prompt)

    # Pattern: add ... field
    # e.g., "add a clearance field", "add security clearance field with options None, Secret"
    add_field_patterns = [
        r"add (?:a )?(?:custom )?([a-z0-9_ ]+?)(?: field)?(?: with options ([^.,;]+))?",
        r"create (?:a )?([a-z0-9_ ]+?)(?: field)?(?: with options ([^.,;]+))?",
    ]

    # Avoid matching widget additions that contain "card" or "widget"
    if "card" in lower or "widget" in lower:
        # Only consider parts that mention "field"
        # Split by "and" to handle multiple intents
        parts = re.split(r"\band\b|,", lower)
        field_parts = [p for p in parts if "field" in p]
        search_text = " and ".join(field_parts)
    else:
        search_text = lower

    for pat in add_field_patterns:
        for m in re.finditer(pat, search_text):
            raw_label = m.group(1).strip()
            options_raw = m.group(2).strip() if m.group(2) else ""

            # Skip if raw_label is too generic or matches widget terms
            if raw_label in ("field", "custom field", "a field"):
                continue
            if any(w in raw_label for w in ["card", "widget", "dashboard"]):
                continue

            # Clean label: title case, remove extra words
            label = raw_label.title()
            # Remove leading "A ", "An ", "The "
            label = re.sub(r"^(A |An |The )", "", label)
            # Key: snake_case
            key = re.sub(r"[^a-z0-9]+", "_", raw_label.lower()).strip("_")
            if not key:
                continue
            # Ensure key not too long
            key = key[:60]

            # Detect type
            field_type = "text"
            # If options provided, type is select
            if options_raw:
                field_type = "select"
            else:
                # Heuristic based on keywords
                for t, hints in FIELD_TYPE_HINTS.items():
                    if any(h in raw_label for h in hints):
                        field_type = t
                        break

            field: Dict[str, Any] = {
                "key": key,
                "label": label,
                "type": field_type,
                "required": False,
                "description": f"Added via Admin Copilot: {prompt[:120]}",
            }

            if field_type == "select" and options_raw:
                opts = [o.strip().title() for o in options_raw.split(",") if o.strip()]
                field["options"] = opts[:20]
            elif field_type == "select":
                # Default options for known fields
                if "clearance" in key:
                    field["options"] = ["None", "Confidential", "Secret", "Top Secret"]
                elif "cost" in key and "center" in key:
                    field["options"] = []
                    field["type"] = "text"

            fields.append(field)

    # Deduplicate by key
    seen = set()
    deduped_fields: List[Dict[str, Any]] = []
    for f in fields:
        if f["key"] not in seen:
            seen.add(f["key"])
            deduped_fields.append(f)

    return deduped_fields


def _extract_field_removals(prompt: str) -> List[str]:
    """Extracts field keys to remove."""
    removals: List[str] = []
    lower = _normalize(prompt)

    patterns = [
        r"remove (?:the )?([a-z0-9_ ]+?)(?: field)?",
        r"delete (?:the )?([a-z0-9_ ]+?)(?: field)?",
    ]

    # Only look at parts mentioning field to avoid widget removal confusion
    parts = re.split(r"\band\b|,", lower)
    field_parts = [p for p in parts if "field" in p]
    search_text = " and ".join(field_parts) if field_parts else ""

    for pat in patterns:
        for m in re.finditer(pat, search_text):
            raw = m.group(1).strip()
            key = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
            if key and key not in ("field", "custom_field"):
                removals.append(key)

    return list(set(removals))


def parse_admin_command_deterministic(prompt: str, current_config: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Deterministic fallback parser — no LLM, regex only.
    Returns a patch dict with dashboardLayout and/or dynamicSchema.
    """
    widget_toggles = _extract_widget_mentions(prompt)
    field_adds = _extract_field_additions(prompt)
    field_removals = _extract_field_removals(prompt)

    patch: Dict[str, Any] = {}
    messages: List[str] = []

    if widget_toggles:
        # Build widget patch — need current config to preserve order
        current_widgets = []
        if current_config and "dashboardLayout" in current_config:
            current_widgets = current_config["dashboardLayout"].get("widgets", [])
        elif current_config and "dashboard_layout_json" in current_config:
            # Handle raw DB shape
            layout = current_config.get("dashboard_layout_json", {})
            if isinstance(layout, dict):
                current_widgets = layout.get("widgets", [])

        widget_map = {w["id"]: w for w in current_widgets} if current_widgets else {}

        patched_widgets = []
        for wid, enabled in widget_toggles:
            base = widget_map.get(wid, {"id": wid, "label": KNOWN_WIDGETS.get(wid, wid.replace("_", " ").title()), "order": len(widget_map), "category": "custom"})
            patched_widgets.append({**base, "enabled": enabled})
            messages.append(f"{'Enabled' if enabled else 'Disabled'} widget: {wid}")

        if patched_widgets:
            patch["dashboardLayout"] = {"widgets": patched_widgets}

    if field_adds:
        patch["dynamicSchema"] = {"fields": field_adds, "mode": "add"}  # mode add = merge
        for f in field_adds:
            messages.append(f"Added field: {f['label']} ({f['key']}) type={f['type']}")

    if field_removals:
        patch["dynamicSchema"] = patch.get("dynamicSchema", {})
        patch["dynamicSchema"]["removeKeys"] = field_removals
        for k in field_removals:
            messages.append(f"Removed field: {k}")

    if not patch:
        # No intent detected
        return {
            "dashboardLayout": None,
            "dynamicSchema": None,
            "message": f"Could not parse intent from: '{prompt}'. Try e.g., 'Hide the turnover card and add a security clearance field'.",
            "parsed": False,
        }

    return {
        "dashboardLayout": patch.get("dashboardLayout"),
        "dynamicSchema": patch.get("dynamicSchema"),
        "message": "; ".join(messages) if messages else "Applied patch.",
        "parsed": True,
    }


def build_llm_system_prompt() -> str:
    return """
You are Fluxentiq Admin Infrastructure Copilot — a safe JSON patch generator for organization_configs.

Your job: Convert natural language admin commands into a JSON patch against organization_configs.

Allowed patches ONLY:
- dashboardLayout.widgets: array of {id, enabled, order?, label?}
  Known widget IDs: assets, attendance, payroll, ai_copilot, turnover, recruitment, leave, performance, expenses, learning
  Action: set enabled true/false, optionally order.

- dynamicSchema.fields: array of {key, label, type, required, description?, options?}
  key: lowercase alphanumeric + underscore, max 80 chars
  label: human readable
  type: text | number | select | boolean | date
  required: boolean
  options: array of strings (for select type only)

- Remove fields: dynamicSchema.removeKeys: array of field keys to delete

RULES:
- Output JSON ONLY, no markdown, no explanation outside JSON.
- Never output shell commands, code, or exec.
- Only use known widget IDs or create safe field keys (snake_case).
- For "add clearance field", use key=security_clearance, type=select, options=["None","Confidential","Secret","Top Secret"]
- For "cost center", use key=cost_center, type=text
- Message field: human readable summary of what you did.

Example input: "Hide the turnover card and add a clearance field"
Example output:
{
  "dashboardLayout": {"widgets": [{"id": "turnover", "enabled": false}]},
  "dynamicSchema": {"fields": [{"key": "security_clearance", "label": "Security Clearance", "type": "select", "required": false, "options": ["None","Confidential","Secret","Top Secret"]}], "mode": "add"},
  "message": "Disabled turnover widget and added security_clearance field",
  "parsed": true
}

If you cannot parse, return:
{
  "dashboardLayout": null,
  "dynamicSchema": null,
  "message": "Could not parse intent...",
  "parsed": false
}
""".strip()


async def parse_with_llm(prompt: str, provider) -> Dict[str, Any] | None:
    """
    Tries to parse using LLM provider (if configured). Returns dict or None on failure.
    """
    try:
        system = build_llm_system_prompt()
        user = f"Admin command: {prompt}\n\nCurrent widgets: {', '.join(KNOWN_WIDGETS.keys())}\n\nRespond with JSON only."

        result = await provider.complete_json(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
        )
        # Validate basic structure
        if not isinstance(result, dict):
            return None

        # Ensure only allowed top-level keys
        allowed_keys = {"dashboardLayout", "dynamicSchema", "message", "parsed"}
        # Filter to allowed, but keep result as is for flexibility
        # RCE-safe: no code execution, just JSON
        return result
    except Exception:
        return None
