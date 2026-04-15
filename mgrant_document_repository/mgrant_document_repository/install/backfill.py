"""
One-time backfill script to index all existing files into Document Registry.
Idempotent - safe to run multiple times.

Usage:
    bench --site your-site execute mgrant_document_repository.mgrant_document_repository.install.backfill.run
"""

import frappe

from mgrant_document_repository.mgrant_document_repository.events.category_resolver import (
    TRACKED_DOCTYPES,
    format_file_size,
    get_file_type,
    resolve_category,
    resolve_context,
)


def run():
    """Backfill all existing files from tracked modules into Document Registry."""
    frappe.flags.in_backfill = True

    print("Starting Document Registry backfill...")
    print(f"Tracked DocTypes: {', '.join(TRACKED_DOCTYPES)}")

    total_created = 0
    total_skipped = 0
    total_errors = 0

    for doctype in TRACKED_DOCTYPES:
        files = frappe.get_all(
            "File",
            filters={
                "attached_to_doctype": doctype,
                "is_folder": 0,
            },
            fields=[
                "name",
                "file_name",
                "file_url",
                "file_size",
                "attached_to_doctype",
                "attached_to_name",
                "attached_to_field",
                "owner",
                "creation",
                "is_private",
            ],
            limit_page_length=0,  # Get all
        )

        print(f"\n{doctype}: {len(files)} files found")

        for i, file_doc in enumerate(files):
            try:
                # Check if already indexed (idempotent)
                existing = frappe.db.exists(
                    "Document Registry", {"frappe_file": file_doc.name}
                )
                if existing:
                    total_skipped += 1
                    continue

                # Resolve metadata
                source_field = file_doc.attached_to_field or ""
                category = resolve_category(doctype, source_field)
                context = resolve_context(doctype, file_doc.attached_to_name)
                file_type = get_file_type(file_doc.file_name)
                file_extension = (
                    file_doc.file_name.rsplit(".", 1)[-1].lower()
                    if file_doc.file_name and "." in file_doc.file_name
                    else ""
                )
                uploaded_by_name = (
                    frappe.db.get_value("User", file_doc.owner, "full_name")
                    or file_doc.owner
                )

                registry = frappe.get_doc(
                    {
                        "doctype": "Document Registry",
                        "file_name": file_doc.file_name,
                        "file_url": file_doc.file_url,
                        "file_type": file_type,
                        "file_extension": file_extension,
                        "file_size": file_doc.file_size or 0,
                        "file_size_display": format_file_size(file_doc.file_size),
                        "source_doctype": doctype,
                        "source_name": file_doc.attached_to_name,
                        "source_record_title": context.get("record_title")
                        or file_doc.attached_to_name,
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
                        "upload_date": file_doc.creation.date()
                        if file_doc.creation
                        else None,
                        "frappe_file": file_doc.name,
                        "is_private": file_doc.is_private,
                        "compliance_status": "NA",
                    }
                )
                registry.flags.ignore_permissions = True
                registry.insert()
                total_created += 1

                # Commit every 100 records to avoid memory issues
                if (i + 1) % 100 == 0:
                    frappe.db.commit()
                    print(f"  ... processed {i + 1}/{len(files)}")

            except Exception as e:
                total_errors += 1
                frappe.log_error(
                    f"Backfill error for File {file_doc.name}: {e}",
                    "Document Registry Backfill Error",
                )

        frappe.db.commit()

    frappe.flags.in_backfill = False

    print(f"\n{'='*50}")
    print(f"Backfill complete!")
    print(f"  Created:  {total_created}")
    print(f"  Skipped:  {total_skipped} (already indexed)")
    print(f"  Errors:   {total_errors}")
    print(f"{'='*50}")
