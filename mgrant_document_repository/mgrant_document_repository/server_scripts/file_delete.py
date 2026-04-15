# Server Script: Document Registry - File Delete
# Type: DocType Event
# DocType: File
# Event: Before Delete


TRACKED_DOCTYPES = [
    "Project", "Grant", "NGO", "Proposal", "Fund Request",
    "Vendor", "NGO Due Diligence", "Quarterly Utilisation Report",
    "Fund Disbursement", "Bank Details Update Request", "RFP",
]

if doc.attached_to_doctype and doc.attached_to_doctype in TRACKED_DOCTYPES:
    registry_name = frappe.db.get_value("Document Registry", {"frappe_file": doc.name}, "name")
    if registry_name:
        frappe.delete_doc("Document Registry", registry_name, force=True, ignore_permissions=True)
