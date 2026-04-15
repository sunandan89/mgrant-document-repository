"""
Category Resolution Logic
Priority:
1. Explicit mapping from Document Category Mapping settings
2. Auto-derive from the Tab Break label the field sits under in the DocType
3. Fall back to source DocType name
4. Last resort: "Other"
"""

import frappe


# Tracked DocTypes whose file uploads should be indexed
TRACKED_DOCTYPES = [
    "Project",
    "Grant",
    "NGO",
    "Proposal",
    "Fund Request",
    "Vendor",
    "NGO Due Diligence",
    "Quarterly Utilisation Report",
    "Fund Disbursement",
    "Bank Details Update Request",
    "RFP",
]


def resolve_category(source_doctype, source_field):
    """Resolve the user-facing category for a file based on its source.

    Args:
        source_doctype: The DocType the file is attached to (e.g., "Project")
        source_field: The field the file is attached to (e.g., "mou_file")

    Returns:
        str: The resolved category label
    """
    if not source_doctype:
        return "Other"

    # Priority 1: Check explicit mapping
    category = _check_explicit_mapping(source_doctype, source_field)
    if category:
        return category

    # Priority 2: Auto-derive from Tab Break label
    if source_field:
        category = _derive_from_tab(source_doctype, source_field)
        if category:
            return category

    # Priority 3: Fall back to source DocType name
    return source_doctype


def _check_explicit_mapping(source_doctype, source_field):
    """Check Document Category Mapping settings for an explicit override."""
    try:
        settings = frappe.get_single("Document Category Mapping")
        for row in settings.mappings or []:
            if row.source_doctype == source_doctype and row.source_field == (source_field or ""):
                return row.category_label
    except Exception:
        pass
    return None


def _derive_from_tab(source_doctype, source_field):
    """Find the Tab Break that the source_field sits under in the DocType definition."""
    try:
        meta = frappe.get_meta(source_doctype)
        current_tab = None

        for field in meta.fields:
            if field.fieldtype == "Tab Break":
                current_tab = field.label
            if field.fieldname == source_field:
                return current_tab
    except Exception:
        pass
    return None


def get_file_type(file_name):
    """Derive file type category from filename extension."""
    if not file_name:
        return "Other"

    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""

    extension_map = {
        # PDF
        "pdf": "PDF",
        # Documents
        "doc": "Document",
        "docx": "Document",
        "odt": "Document",
        "rtf": "Document",
        "txt": "Document",
        # Spreadsheets
        "xls": "Spreadsheet",
        "xlsx": "Spreadsheet",
        "csv": "Spreadsheet",
        "ods": "Spreadsheet",
        # Images
        "jpg": "Image",
        "jpeg": "Image",
        "png": "Image",
        "gif": "Image",
        "bmp": "Image",
        "svg": "Image",
        "webp": "Image",
        # Videos
        "mp4": "Video",
        "avi": "Video",
        "mov": "Video",
        "wmv": "Video",
        "mkv": "Video",
        "webm": "Video",
        # Presentations
        "ppt": "Presentation",
        "pptx": "Presentation",
        "odp": "Presentation",
    }

    return extension_map.get(ext, "Other")


def format_file_size(size_bytes):
    """Convert bytes to human-readable file size."""
    if not size_bytes:
        return ""

    size_bytes = int(size_bytes)
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.2f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def resolve_context(source_doctype, source_name):
    """Resolve partner, project, donor, programme from the source record.

    Returns:
        dict with keys: partner, partner_name, project, project_title, donor, programme, record_title
    """
    context = {
        "partner": None,
        "partner_name": None,
        "project": None,
        "project_title": None,
        "donor": None,
        "programme": None,
        "record_title": None,
    }

    try:
        if source_doctype == "NGO":
            context["partner"] = source_name
            context["partner_name"] = frappe.db.get_value("NGO", source_name, "ngo_name")
            context["record_title"] = context["partner_name"]

        elif source_doctype == "Project":
            project_data = frappe.db.get_value(
                "Project", source_name,
                ["project_name", "ngo", "donor", "programme"],
                as_dict=True,
            )
            if project_data:
                context["project"] = source_name
                context["project_title"] = project_data.get("project_name")
                context["partner"] = project_data.get("ngo")
                context["donor"] = project_data.get("donor")
                context["programme"] = project_data.get("programme")
                context["record_title"] = project_data.get("project_name")
                if context["partner"]:
                    context["partner_name"] = frappe.db.get_value("NGO", context["partner"], "ngo_name")

        elif source_doctype == "Grant":
            grant_data = frappe.db.get_value(
                "Grant", source_name,
                ["grant_name", "ngo", "project", "donor"],
                as_dict=True,
            )
            if grant_data:
                context["partner"] = grant_data.get("ngo")
                context["project"] = grant_data.get("project")
                context["donor"] = grant_data.get("donor")
                context["record_title"] = grant_data.get("grant_name") or source_name
                if context["partner"]:
                    context["partner_name"] = frappe.db.get_value("NGO", context["partner"], "ngo_name")
                if context["project"]:
                    context["project_title"] = frappe.db.get_value("Project", context["project"], "project_name")

        elif source_doctype == "Proposal":
            proposal_data = frappe.db.get_value(
                "Proposal", source_name,
                ["proposal_name", "ngo", "donor", "programme"],
                as_dict=True,
            )
            if proposal_data:
                context["partner"] = proposal_data.get("ngo")
                context["donor"] = proposal_data.get("donor")
                context["programme"] = proposal_data.get("programme")
                context["record_title"] = proposal_data.get("proposal_name") or source_name
                if context["partner"]:
                    context["partner_name"] = frappe.db.get_value("NGO", context["partner"], "ngo_name")

        elif source_doctype == "Fund Request":
            fr_data = frappe.db.get_value(
                "Fund Request", source_name,
                ["ngo", "grant", "donor"],
                as_dict=True,
            )
            if fr_data:
                context["partner"] = fr_data.get("ngo")
                context["donor"] = fr_data.get("donor")
                context["record_title"] = source_name
                if fr_data.get("grant"):
                    context["project"] = frappe.db.get_value("Grant", fr_data["grant"], "project")
                if context["partner"]:
                    context["partner_name"] = frappe.db.get_value("NGO", context["partner"], "ngo_name")
                if context["project"]:
                    context["project_title"] = frappe.db.get_value("Project", context["project"], "project_name")

        elif source_doctype == "Vendor":
            context["record_title"] = frappe.db.get_value("Vendor", source_name, "vendor_name") or source_name

        elif source_doctype == "NGO Due Diligence":
            dd_data = frappe.db.get_value(
                "NGO Due Diligence", source_name, ["ngo", "ngo_name"], as_dict=True
            )
            if dd_data:
                context["partner"] = dd_data.get("ngo")
                context["partner_name"] = dd_data.get("ngo_name")
                context["record_title"] = f"DD - {dd_data.get('ngo_name', source_name)}"

        elif source_doctype == "Quarterly Utilisation Report":
            qur_data = frappe.db.get_value(
                "Quarterly Utilisation Report", source_name,
                ["ngo", "grant", "project"],
                as_dict=True,
            )
            if qur_data:
                context["partner"] = qur_data.get("ngo")
                context["project"] = qur_data.get("project")
                context["record_title"] = source_name
                if context["partner"]:
                    context["partner_name"] = frappe.db.get_value("NGO", context["partner"], "ngo_name")
                if context["project"]:
                    context["project_title"] = frappe.db.get_value("Project", context["project"], "project_name")

        elif source_doctype == "Fund Disbursement":
            fd_data = frappe.db.get_value(
                "Fund Disbursement", source_name,
                ["ngo", "grant", "project"],
                as_dict=True,
            )
            if fd_data:
                context["partner"] = fd_data.get("ngo")
                context["project"] = fd_data.get("project")
                context["record_title"] = source_name
                if context["partner"]:
                    context["partner_name"] = frappe.db.get_value("NGO", context["partner"], "ngo_name")

        else:
            # Generic fallback - try to get a title field
            try:
                meta = frappe.get_meta(source_doctype)
                title_field = meta.title_field or "name"
                context["record_title"] = frappe.db.get_value(source_doctype, source_name, title_field) or source_name
            except Exception:
                context["record_title"] = source_name

    except Exception as e:
        frappe.log_error(f"Error resolving context for {source_doctype}/{source_name}: {e}")
        context["record_title"] = source_name

    return context
