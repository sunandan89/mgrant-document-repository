"""
Default category mappings - populated on app install.
"""

import frappe


DEFAULT_MAPPINGS = [
    # Project
    {"source_doctype": "Project", "source_field": "mou_file", "category_label": "Details"},
    # Grant
    {"source_doctype": "Grant", "source_field": "grant_agreement_mou", "category_label": "Details"},
    {"source_doctype": "Grant", "source_field": "custom_upload_mou", "category_label": "Details"},
    # Proposal
    {"source_doctype": "Proposal", "source_field": "upload_draft_mou_here", "category_label": "Details"},
    {"source_doctype": "Proposal", "source_field": "mou_signed_document", "category_label": "Details"},
    # NGO custom fields
    {"source_doctype": "NGO", "source_field": "custom_12a", "category_label": "Documents"},
    {"source_doctype": "NGO", "source_field": "custom_80g", "category_label": "Documents"},
    {"source_doctype": "NGO", "source_field": "custom_society_reg", "category_label": "Documents"},
    {"source_doctype": "NGO", "source_field": "custom_trust_deed", "category_label": "Documents"},
    {"source_doctype": "NGO", "source_field": "custom_latest_3_years_financial_statement", "category_label": "Documents"},
    # NGO Due Diligence
    {"source_doctype": "NGO Due Diligence", "source_field": "pan", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "g80_certificate", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "a12_certificate", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "csr_1_form", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "trust_deed", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "fcra", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "gst", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "yrs_balance_sheet", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "yrs_annual_report", "category_label": "Due Diligence"},
    {"source_doctype": "NGO Due Diligence", "source_field": "code_of_conduct_attachment", "category_label": "Due Diligence"},
    # Fund Disbursement
    {"source_doctype": "Fund Disbursement", "source_field": "memo_template", "category_label": "Fund Request & Disbursement"},
    # Quarterly Utilisation Report
    {"source_doctype": "Quarterly Utilisation Report", "source_field": "upload_report", "category_label": "Utilisation"},
    # Vendor
    {"source_doctype": "Vendor", "source_field": "registration_certificate", "category_label": "Documents"},
    {"source_doctype": "Vendor", "source_field": "pan_copy_upload", "category_label": "Documents"},
    # Bank Details Update Request
    {"source_doctype": "Bank Details Update Request", "source_field": "supporting_document", "category_label": "Bank Details"},
]


def after_install():
    """Populate default category mappings on app install."""
    print("Setting up default Document Category Mappings...")

    settings = frappe.get_single("Document Category Mapping")

    # Only add if no mappings exist yet (don't overwrite customer customizations)
    if settings.mappings and len(settings.mappings) > 0:
        print("  Mappings already exist, skipping.")
        return

    for mapping in DEFAULT_MAPPINGS:
        settings.append("mappings", mapping)

    settings.flags.ignore_permissions = True
    settings.save()
    frappe.db.commit()

    print(f"  Added {len(DEFAULT_MAPPINGS)} default mappings.")
