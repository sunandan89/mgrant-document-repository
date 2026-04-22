# Server Script: Document Registry - File Sync
# Type: DocType Event
# DocType: File
# Event: After Insert


TRACKED_DOCTYPES = [
    "Project", "Grant", "NGO", "Proposal", "Fund Request",
    "Vendor", "NGO Due Diligence", "Quarterly Utilisation Report",
    "Fund Disbursement", "Bank Details Update Request", "RFP",
]

if not doc.attached_to_doctype or doc.attached_to_doctype not in TRACKED_DOCTYPES:
    pass  # Skip non-tracked doctypes
elif doc.is_folder:
    pass  # Skip folders
else:
    source_doctype = doc.attached_to_doctype
    source_name = doc.attached_to_name
    source_field = doc.attached_to_field or ""

    # Resolve category from mapping
    category = source_doctype  # default fallback
    if source_field:
        mappings = frappe.get_all(
            "Document Category Mapping Row",
            filters={"parent": "Document Category Mapping", "source_doctype": source_doctype, "source_field": source_field},
            fields=["category_label"],
            limit=1,
        )
        if mappings:
            category = mappings[0].category_label
        else:
            # Auto-derive from tab name
            meta = frappe.get_meta(source_doctype)
            current_tab = None
            for f in meta.fields:
                if f.fieldtype == "Tab Break":
                    current_tab = f.label
                if f.fieldname == source_field:
                    if current_tab:
                        category = current_tab
                    break

    # If no field match, use default category for this DocType (first mapping entry)
    if category == source_doctype:
        default_mappings = frappe.get_all(
            "Document Category Mapping Row",
            filters={"parent": "Document Category Mapping", "source_doctype": source_doctype},
            fields=["category_label"],
            order_by="idx asc",
            limit=1,
        )
        if default_mappings:
            category = default_mappings[0].category_label

    # Derive file type
    ext = (doc.file_name or "").rsplit(".", 1)[-1].lower() if "." in (doc.file_name or "") else ""
    ext_map = {
        "pdf": "PDF", "doc": "Document", "docx": "Document", "odt": "Document", "txt": "Document", "rtf": "Document",
        "xls": "Spreadsheet", "xlsx": "Spreadsheet", "csv": "Spreadsheet", "ods": "Spreadsheet",
        "jpg": "Image", "jpeg": "Image", "png": "Image", "gif": "Image", "bmp": "Image", "svg": "Image", "webp": "Image",
        "mp4": "Video", "avi": "Video", "mov": "Video", "mkv": "Video", "webm": "Video",
        "ppt": "Presentation", "pptx": "Presentation", "odp": "Presentation",
    }
    file_type = ext_map.get(ext, "Other")

    # File size display
    sz = doc.file_size or 0
    if sz < 1024:
        size_display = f"{sz} B"
    elif sz < 1024 * 1024:
        size_display = f"{sz / 1024:.2f} KB"
    else:
        size_display = f"{sz / (1024 * 1024):.2f} MB"

    # Resolve context
    partner = project = donor = programme = record_title = partner_name = project_title = None

    if source_doctype == "NGO":
        partner = source_name
        partner_name = frappe.db.get_value("NGO", source_name, "ngo_name")
        record_title = partner_name
    elif source_doctype == "Project":
        pd = frappe.db.get_value("Project", source_name, ["project_name", "ngo", "donor", "programme"], as_dict=True)
        if pd:
            project, partner, donor, programme = source_name, pd.get("ngo"), pd.get("donor"), pd.get("programme")
            project_title = record_title = pd.get("project_name")
            if partner:
                partner_name = frappe.db.get_value("NGO", partner, "ngo_name")
    elif source_doctype == "Grant":
        gd = frappe.db.get_value("Grant", source_name, ["grant_name", "ngo", "project", "donor"], as_dict=True)
        if gd:
            partner, project, donor = gd.get("ngo"), gd.get("project"), gd.get("donor")
            record_title = gd.get("grant_name") or source_name
            if partner:
                partner_name = frappe.db.get_value("NGO", partner, "ngo_name")
            if project:
                project_title = frappe.db.get_value("Project", project, "project_name")
    elif source_doctype == "Proposal":
        ppd = frappe.db.get_value("Proposal", source_name, ["proposal_name", "ngo", "donor", "programme"], as_dict=True)
        if ppd:
            partner, donor, programme = ppd.get("ngo"), ppd.get("donor"), ppd.get("programme")
            record_title = ppd.get("proposal_name") or source_name
            if partner:
                partner_name = frappe.db.get_value("NGO", partner, "ngo_name")
    elif source_doctype == "Fund Request":
        frd = frappe.db.get_value("Fund Request", source_name, ["ngo", "grant", "donor"], as_dict=True)
        if frd:
            partner, donor = frd.get("ngo"), frd.get("donor")
            record_title = source_name
            if frd.get("grant"):
                project = frappe.db.get_value("Grant", frd["grant"], "project")
            if partner:
                partner_name = frappe.db.get_value("NGO", partner, "ngo_name")
            if project:
                project_title = frappe.db.get_value("Project", project, "project_name")
    elif source_doctype == "NGO Due Diligence":
        ddd = frappe.db.get_value("NGO Due Diligence", source_name, ["ngo", "ngo_name"], as_dict=True)
        if ddd:
            partner, partner_name = ddd.get("ngo"), ddd.get("ngo_name")
            record_title = f"DD - {partner_name or source_name}"
    elif source_doctype == "Vendor":
        vn = frappe.db.get_value("Vendor", source_name, "vendor_name")
        record_title = vn or source_name
    else:
        record_title = source_name

    uploaded_by_name = frappe.db.get_value("User", doc.owner, "full_name") or doc.owner

    registry = frappe.get_doc({
        "doctype": "Document Registry",
        "file_name": doc.file_name,
        "file_url": doc.file_url,
        "file_type": file_type,
        "file_extension": ext,
        "file_size": doc.file_size or 0,
        "file_size_display": size_display,
        "source_doctype": source_doctype,
        "source_name": source_name,
        "source_record_title": record_title or source_name,
        "source_field": source_field,
        "source_category": category,
        "partner": partner,
        "partner_name": partner_name,
        "project": project,
        "project_title": project_title,
        "donor": donor,
        "programme": programme,
        "uploaded_by": doc.owner,
        "uploaded_by_name": uploaded_by_name,
        "upload_date": doc.creation.date() if doc.creation else None,
        "frappe_file": doc.name,
        "is_private": doc.is_private,
        "compliance_status": "NA",
    })
    registry.insert(ignore_permissions=True)
