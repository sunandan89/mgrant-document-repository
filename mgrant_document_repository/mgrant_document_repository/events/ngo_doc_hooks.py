"""
NGO Documents doc_events hooks.
Syncs compliance fields (status, expiry, issuance) to Document Registry.
"""

import frappe


def on_ngo_doc_update(doc, method):
    """Called when an NGO Documents record is updated.
    Syncs compliance-related fields to any matching Document Registry records.
    """
    if not doc.attach:
        return

    try:
        # Find the File record for this attachment
        file_name = frappe.db.get_value(
            "File",
            {"file_url": doc.attach, "attached_to_doctype": "NGO"},
            "name",
        )
        if not file_name:
            return

        # Find matching Document Registry record
        registry_name = frappe.db.get_value(
            "Document Registry", {"frappe_file": file_name}, "name"
        )
        if not registry_name:
            return

        # Update compliance fields
        frappe.db.set_value(
            "Document Registry",
            registry_name,
            {
                "document_number": doc.document_number or "",
                "issuance_date": doc.issuance_date,
                "expiry_date": doc.expiry_date,
                "compliance_status": doc.status or "NA",
            },
            update_modified=True,
        )

    except Exception as e:
        frappe.log_error(
            f"Document Registry: Failed to sync NGO Document {doc.name}: {e}",
            "Document Registry Compliance Sync Error",
        )


def on_ngo_doc_delete(doc, method):
    """Called when an NGO Documents record is trashed.
    Resets compliance fields on the matching Document Registry record.
    """
    if not doc.attach:
        return

    try:
        file_name = frappe.db.get_value(
            "File",
            {"file_url": doc.attach, "attached_to_doctype": "NGO"},
            "name",
        )
        if not file_name:
            return

        registry_name = frappe.db.get_value(
            "Document Registry", {"frappe_file": file_name}, "name"
        )
        if not registry_name:
            return

        frappe.db.set_value(
            "Document Registry",
            registry_name,
            {
                "document_number": "",
                "issuance_date": None,
                "expiry_date": None,
                "compliance_status": "NA",
            },
            update_modified=True,
        )

    except Exception as e:
        frappe.log_error(
            f"Document Registry: Failed to reset compliance for NGO Document {doc.name}: {e}",
            "Document Registry Compliance Sync Error",
        )
