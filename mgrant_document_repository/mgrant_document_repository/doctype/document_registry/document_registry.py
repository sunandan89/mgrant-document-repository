import frappe
from frappe.model.document import Document


class DocumentRegistry(Document):
    pass


def get_permission_query_conditions(user=None):
    """Row-level security: NGO users see only their partner's docs,
    Donor users see only their donor's project docs."""
    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):
        return ""

    conditions = []

    # NGO user restriction - see only own partner's documents
    ngo = frappe.db.get_value("NGO", {"user": user}, "name")
    if ngo:
        conditions.append(f"(`tabDocument Registry`.partner = {frappe.db.escape(ngo)})")

    # Donor user restriction - see only own donor's project documents
    donor = frappe.db.get_value("Donor", {"user": user}, "name")
    if donor:
        # Get all projects linked to this donor
        conditions.append(
            f"(`tabDocument Registry`.donor = {frappe.db.escape(donor)})"
        )

    if conditions:
        return " OR ".join(conditions)

    return ""


def has_permission(doc, ptype, user):
    """Check if user has permission to view this specific document."""
    if not user:
        user = frappe.session.user

    if "System Manager" in frappe.get_roles(user):
        return True

    # NGO user check
    ngo = frappe.db.get_value("NGO", {"user": user}, "name")
    if ngo and doc.partner == ngo:
        return True

    # Donor user check
    donor = frappe.db.get_value("Donor", {"user": user}, "name")
    if donor and doc.donor == donor:
        return True

    # Programme Manager, Senior Programme Manager, Finance Manager - can see all
    user_roles = frappe.get_roles(user)
    allowed_roles = ["Programme Manager", "Senior Programme Manager", "Finance Manager"]
    if any(role in user_roles for role in allowed_roles):
        return True

    return False
