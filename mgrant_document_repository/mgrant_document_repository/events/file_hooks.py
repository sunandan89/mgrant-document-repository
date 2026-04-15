"""
File doc_events hooks.
Triggered on File.after_insert and File.on_trash to sync Document Registry.
"""

import frappe

from mgrant_document_repository.mgrant_document_repository.events.category_resolver import (
    TRACKED_DOCTYPES,
    format_file_size,
    get_file_type,
    resolve_category,
    resolve_context,
)


def on_file_create(doc, method):
    """Called after a File record is inserted.
    Creates a Document Registry record if the file is attached to a tracked module.
    """
    if not doc.attached_to_doctype or doc.attached_to_doctype not in TRACKED_DOCTYPES:
        return

    if doc.is_folder:
        return

    try:
        _create_registry_entry(doc)
    except Exception as e:
        frappe.log_error(
            f"Document Registry: Failed to index file {doc.name} "
            f"({doc.attached_to_doctype}/{doc.attached_to_name}): {e}",
            "Document Registry Sync Error",
        )


def on_file_delete(doc, method):
    """Called when a File record is trashed.
    Deletes the corresponding Document Registry record.
    """
    if not doc.attached_to_doctype or doc.attached_to_doctype not in TRACKED_DOCTYPES:
        return

    try:
        registry_name = frappe.db.get_value(
            "Document Registry", {"frappe_file": doc.name}, "name"
        )
        if registry_name:
            frappe.delete_doc("Document Registry", registry_name, force=True)
    except Exception as e:
        frappe.log_error(
            f"Document Registry: Failed to delete index for file {doc.name}: {e}",
            "Document Registry Sync Error",
        )


def _create_registry_entry(file_doc):
    """Create a Document Registry record from a File document."""
    source_doctype = file_doc.attached_to_doctype
    source_name = file_doc.attached_to_name
    source_field = file_doc.attached_to_field or ""

    # Resolve category
    category = resolve_category(source_doctype, source_field)

    # Resolve context (partner, project, donor, programme)
    context = resolve_context(source_doctype, source_name)

    # Derive file type from extension
    file_type = get_file_type(file_doc.file_name)
    file_extension = (
        file_doc.file_name.rsplit(".", 1)[-1].lower()
        if file_doc.file_name and "." in file_doc.file_name
        else ""
    )

    # Get uploader's full name
    uploaded_by_name = frappe.db.get_value("User", file_doc.owner, "full_name") or file_doc.owner

    registry = frappe.get_doc(
        {
            "doctype": "Document Registry",
            "file_name": file_doc.file_name,
            "file_url": file_doc.file_url,
            "file_type": file_type,
            "file_extension": file_extension,
            "file_size": file_doc.file_size or 0,
            "file_size_display": format_file_size(file_doc.file_size),
            "source_doctype": source_doctype,
            "source_name": source_name,
            "source_record_title": context.get("record_title") or source_name,
            "source_field": source_field,
            "source_category": category,
            "partner": context.get("partner"),
            "partner_name": context.get("partner_name"),
            "project": context.get("project"),
            "project_title": context.get("project_title"),
            "donor": context.get("donor"),
            "programme": context.get("programme"),
            "uploaded_by": file_doc.owner,
            "uploaded_by_name": uploaded_by_name,
            "upload_date": file_doc.creation.date() if file_doc.creation else None,
            "frappe_file": file_doc.name,
            "is_private": file_doc.is_private,
            "compliance_status": "NA",
        }
    )
    registry.flags.ignore_permissions = True
    registry.insert()
