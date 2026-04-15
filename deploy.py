"""
Deploy Central Document Repository to any mGrant instance via REST API.
No bench/SSH access required.

Usage:
    python deploy.py --url https://your-instance.mgrant.in --key API_KEY:API_SECRET

Creates:
    - Document Category Mapping Row (child table DocType)
    - Document Category Mapping (settings DocType)
    - Document Registry (main DocType)
    - 25 default category mappings
    - Server Scripts (file sync on insert, cleanup on delete, RLS permission query)
    - Client Scripts (enhanced card-based form view, list view indicators)
    - Script Report: Document Summary (with 8 filters)
    - Custom HTML Block (Document Repository UI with sidebar, search, pagination)
    - Workspace entry with CHB wiring
    - Backfills all existing files from tracked modules
"""

import argparse
import json
import os
import time

import requests


def get_config():
    parser = argparse.ArgumentParser(description="Deploy Document Repository")
    parser.add_argument("--url", required=True, help="Instance URL (e.g. https://stg.lichfl.mgrant.in)")
    parser.add_argument("--key", required=True, help="API key:secret (e.g. abc123:def456)")
    args = parser.parse_args()
    return args.url.rstrip("/"), args.key


BASE, API_KEY = "", ""
HDR = {}


def init(base, key):
    global BASE, API_KEY, HDR
    BASE = base
    API_KEY = key
    HDR = {"Authorization": f"token {key}", "Content-Type": "application/json"}


def api_get(endpoint, params=None):
    r = requests.get(f"{BASE}{endpoint}", headers=HDR, params=params, verify=True)
    return r.json()


def api_post(endpoint, data):
    r = requests.post(f"{BASE}{endpoint}", headers=HDR, json=data, verify=True)
    return r.json()


def api_put(endpoint, data):
    r = requests.put(f"{BASE}{endpoint}", headers=HDR, json=data, verify=True)
    return r.json()


def doctype_exists(name):
    r = requests.get(f"{BASE}/api/resource/DocType/{requests.utils.quote(name)}", headers=HDR)
    return r.status_code == 200


def script_exists(name):
    r = requests.get(f"{BASE}/api/resource/Server Script/{requests.utils.quote(name)}", headers=HDR)
    return r.status_code == 200 and r.json().get("data")


def read_file(path):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    full_path = os.path.join(script_dir, path)
    with open(full_path, "r") as f:
        return f.read()


# ═══════════════════════════════════════════
# STEP 1: Child Table - Document Category Mapping Row
# ═══════════════════════════════════════════
def create_mapping_row_doctype():
    name = "Document Category Mapping Row"
    if doctype_exists(name):
        print(f"  [SKIP] {name} already exists")
        return
    payload = {
        "doctype": "DocType", "name": name, "module": "Mgrant", "custom": 1, "istable": 1,
        "fields": [
            {"fieldname": "source_doctype", "fieldtype": "Link", "label": "Source DocType", "options": "DocType", "in_list_view": 1, "reqd": 1, "idx": 1},
            {"fieldname": "source_field", "fieldtype": "Data", "label": "Source Field", "in_list_view": 1, "reqd": 1, "idx": 2},
            {"fieldname": "category_label", "fieldtype": "Data", "label": "Category Label", "in_list_view": 1, "reqd": 1, "idx": 3},
        ],
    }
    result = api_post("/api/resource/DocType", payload)
    print(f"  [{'OK' if result.get('data') else 'ERROR'}] {name}")


# ═══════════════════════════════════════════
# STEP 2: Single DocType - Document Category Mapping
# ═══════════════════════════════════════════
def create_mapping_doctype():
    name = "Document Category Mapping"
    if doctype_exists(name):
        print(f"  [SKIP] {name} already exists")
        return
    payload = {
        "doctype": "DocType", "name": name, "module": "Mgrant", "custom": 1, "issingle": 1,
        "fields": [
            {"fieldname": "info_html", "fieldtype": "HTML", "label": "Info",
             "options": "<div class='alert alert-info'><b>Document Category Mapping</b><br><br>Configure how document source fields map to user-facing categories.<br><br><b>Priority:</b> 1. Explicit mapping below  2. Tab label auto-derive  3. DocType name  4. \"Other\"</div>", "idx": 1},
            {"fieldname": "mappings", "fieldtype": "Table", "label": "Category Mappings", "options": "Document Category Mapping Row", "idx": 2},
        ],
        "permissions": [{"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1}],
    }
    result = api_post("/api/resource/DocType", payload)
    print(f"  [{'OK' if result.get('data') else 'ERROR'}] {name}")


# ═══════════════════════════════════════════
# STEP 3: Main DocType - Document Registry
# ═══════════════════════════════════════════
def create_registry_doctype():
    name = "Document Registry"
    if doctype_exists(name):
        print(f"  [SKIP] {name} already exists")
        return

    # Discover available roles on this instance
    r = api_get("/api/resource/Role", {"limit_page_length": 0, "fields": json.dumps(["name"])})
    available_roles = {x["name"] for x in r.get("data", [])}

    # Build permissions based on available roles
    permissions = [
        {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1},
    ]
    optional_roles = [
        ("PM", {"read": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1}),
        ("SPM", {"read": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1}),
        ("HO Finance", {"read": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1}),
        ("Partner NGO", {"read": 1, "export": 1, "print": 1, "report": 1}),
        ("Donor Admin", {"read": 1, "export": 1, "print": 1, "report": 1}),
        ("mGrant Partnerships", {"read": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1}),
        ("Programme Manager", {"read": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1}),
        ("Senior Programme Manager", {"read": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1}),
        ("Finance Manager", {"read": 1, "export": 1, "print": 1, "email": 1, "report": 1, "share": 1}),
    ]
    for role_name, perms in optional_roles:
        if role_name in available_roles:
            permissions.append({"role": role_name, **perms})

    fields = [
        {"fieldname": "details_tab", "fieldtype": "Tab Break", "label": "Details", "idx": 1},
        {"fieldname": "file_name", "fieldtype": "Data", "label": "File Name", "reqd": 1, "bold": 1, "in_list_view": 1, "idx": 2},
        {"fieldname": "file_url", "fieldtype": "Data", "label": "File URL", "options": "URL", "reqd": 1, "idx": 3},
        {"fieldname": "column_break_file", "fieldtype": "Column Break", "idx": 4},
        {"fieldname": "file_type", "fieldtype": "Select", "label": "File Type", "options": "\nPDF\nDocument\nSpreadsheet\nImage\nVideo\nPresentation\nOther", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1, "idx": 5},
        {"fieldname": "file_extension", "fieldtype": "Data", "label": "Extension", "idx": 6},
        {"fieldname": "file_size", "fieldtype": "Int", "label": "File Size (bytes)", "hidden": 1, "idx": 7},
        {"fieldname": "file_size_display", "fieldtype": "Data", "label": "File Size", "read_only": 1, "in_list_view": 1, "idx": 8},
        {"fieldname": "source_section", "fieldtype": "Section Break", "label": "Source", "idx": 9},
        {"fieldname": "source_doctype", "fieldtype": "Link", "label": "Source Module", "options": "DocType", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1, "idx": 10},
        {"fieldname": "source_name", "fieldtype": "Dynamic Link", "label": "Source Record", "options": "source_doctype", "reqd": 1, "idx": 11},
        {"fieldname": "source_record_title", "fieldtype": "Data", "label": "Record Title", "read_only": 1, "in_list_view": 1, "idx": 12},
        {"fieldname": "column_break_source", "fieldtype": "Column Break", "idx": 13},
        {"fieldname": "source_field", "fieldtype": "Data", "label": "Source Field/Tab", "idx": 14},
        {"fieldname": "source_category", "fieldtype": "Data", "label": "Category", "bold": 1, "in_list_view": 1, "in_standard_filter": 1, "idx": 15},
        {"fieldname": "context_section", "fieldtype": "Section Break", "label": "Context", "idx": 16},
        {"fieldname": "partner", "fieldtype": "Link", "label": "Partner / NGO", "options": "NGO", "in_list_view": 1, "in_standard_filter": 1, "idx": 17},
        {"fieldname": "partner_name", "fieldtype": "Data", "label": "Partner Name", "read_only": 1, "idx": 18},
        {"fieldname": "project", "fieldtype": "Link", "label": "Project", "options": "Project", "in_standard_filter": 1, "idx": 19},
        {"fieldname": "project_title", "fieldtype": "Data", "label": "Project Title", "read_only": 1, "idx": 20},
        {"fieldname": "column_break_context", "fieldtype": "Column Break", "idx": 21},
        {"fieldname": "donor", "fieldtype": "Link", "label": "Donor", "options": "Donor", "in_standard_filter": 1, "idx": 22},
        {"fieldname": "programme", "fieldtype": "Link", "label": "Programme", "options": "Programme", "idx": 23},
        {"fieldname": "compliance_section", "fieldtype": "Section Break", "label": "Compliance", "collapsible": 1, "idx": 24},
        {"fieldname": "document_number", "fieldtype": "Data", "label": "Document Number", "idx": 25},
        {"fieldname": "issuance_date", "fieldtype": "Date", "label": "Issuance Date", "idx": 26},
        {"fieldname": "column_break_compliance", "fieldtype": "Column Break", "idx": 27},
        {"fieldname": "expiry_date", "fieldtype": "Date", "label": "Expiry Date", "idx": 28},
        {"fieldname": "compliance_status", "fieldtype": "Select", "label": "Compliance Status", "options": "\nActive\nExpired\nPending\nRejected\nNA", "default": "NA", "in_standard_filter": 1, "idx": 29},
        {"fieldname": "metadata_section", "fieldtype": "Section Break", "label": "Metadata", "collapsible": 1, "idx": 30},
        {"fieldname": "uploaded_by", "fieldtype": "Link", "label": "Uploaded By", "options": "User", "in_standard_filter": 1, "idx": 31},
        {"fieldname": "uploaded_by_name", "fieldtype": "Data", "label": "Uploaded By Name", "read_only": 1, "idx": 32},
        {"fieldname": "column_break_metadata", "fieldtype": "Column Break", "idx": 33},
        {"fieldname": "upload_date", "fieldtype": "Date", "label": "Upload Date", "in_list_view": 1, "idx": 34},
        {"fieldname": "frappe_file", "fieldtype": "Link", "label": "Frappe File ID", "options": "File", "reqd": 1, "idx": 35},
        {"fieldname": "is_private", "fieldtype": "Check", "label": "Private", "idx": 36},
    ]

    payload = {
        "doctype": "DocType", "name": name, "module": "Mgrant", "custom": 1,
        "autoname": "DOC-REG-.#####", "title_field": "file_name",
        "show_title_field_in_link": 1, "sort_field": "upload_date", "sort_order": "DESC",
        "track_changes": 1, "fields": fields, "permissions": permissions,
    }
    result = api_post("/api/resource/DocType", payload)
    print(f"  [{'OK' if result.get('data') else 'ERROR'}] {name}")
    if not result.get("data"):
        print(f"    {json.dumps(result)[:400]}")


# ═══════════════════════════════════════════
# STEP 4: Default category mappings
# ═══════════════════════════════════════════
def populate_default_mappings():
    result = api_get("/api/resource/Document Category Mapping/Document Category Mapping")
    if result.get("data", {}).get("mappings"):
        print("  [SKIP] Mappings already populated")
        return

    DEFAULT_MAPPINGS = [
        ("Project", "mou_file", "Details"), ("Grant", "grant_agreement_mou", "Details"),
        ("Grant", "custom_upload_mou", "Details"), ("Proposal", "upload_draft_mou_here", "Details"),
        ("Proposal", "mou_signed_document", "Details"), ("NGO", "custom_12a", "Documents"),
        ("NGO", "custom_80g", "Documents"), ("NGO", "custom_society_reg", "Documents"),
        ("NGO", "custom_trust_deed", "Documents"),
        ("NGO", "custom_latest_3_years_financial_statement", "Documents"),
        ("NGO Due Diligence", "pan", "Due Diligence"),
        ("NGO Due Diligence", "g80_certificate", "Due Diligence"),
        ("NGO Due Diligence", "a12_certificate", "Due Diligence"),
        ("NGO Due Diligence", "csr_1_form", "Due Diligence"),
        ("NGO Due Diligence", "trust_deed", "Due Diligence"),
        ("NGO Due Diligence", "fcra", "Due Diligence"),
        ("NGO Due Diligence", "gst", "Due Diligence"),
        ("NGO Due Diligence", "yrs_balance_sheet", "Due Diligence"),
        ("NGO Due Diligence", "yrs_annual_report", "Due Diligence"),
        ("NGO Due Diligence", "code_of_conduct_attachment", "Due Diligence"),
        ("Fund Disbursement", "memo_template", "Fund Request & Disbursement"),
        ("Quarterly Utilisation Report", "upload_report", "Utilisation"),
        ("Vendor", "registration_certificate", "Documents"),
        ("Vendor", "pan_copy_upload", "Documents"),
        ("Bank Details Update Request", "supporting_document", "Bank Details"),
    ]

    rows = [{"source_doctype": dt, "source_field": f, "category_label": l, "idx": i + 1}
            for i, (dt, f, l) in enumerate(DEFAULT_MAPPINGS)]

    result = api_put("/api/resource/Document Category Mapping/Document Category Mapping", {"mappings": rows})
    print(f"  [{'OK' if result.get('data') else 'ERROR'}] {len(DEFAULT_MAPPINGS)} mappings")


# ═══════════════════════════════════════════
# STEP 5: Server Scripts
# ═══════════════════════════════════════════
def create_server_scripts():
    scripts = [
        {
            "name": "Document Registry - File Sync",
            "script_type": "DocType Event",
            "reference_doctype": "File",
            "doctype_event": "After Insert",
            "file": "mgrant_document_repository/mgrant_document_repository/server_scripts/file_sync.py",
        },
        {
            "name": "Document Registry - File Delete",
            "script_type": "DocType Event",
            "reference_doctype": "File",
            "doctype_event": "Before Delete",
            "file": "mgrant_document_repository/mgrant_document_repository/server_scripts/file_delete.py",
        },
        {
            "name": "Document Registry - Permission Query",
            "script_type": "Permission Query",
            "reference_doctype": "Document Registry",
            "doctype_event": "",
            "file": "mgrant_document_repository/mgrant_document_repository/server_scripts/permission_query.py",
        },
    ]

    for s in scripts:
        if script_exists(s["name"]):
            print(f"  [SKIP] {s['name']} already exists")
            continue

        # Read script content, skip comment header lines
        content = read_file(s["file"])
        lines = content.split("\n")
        script_lines = []
        past_header = False
        for line in lines:
            if past_header:
                script_lines.append(line)
            elif not line.startswith("#"):
                past_header = True
                script_lines.append(line)
        script_body = "\n".join(script_lines).strip()

        payload = {
            "doctype": "Server Script", "name": s["name"],
            "script_type": s["script_type"], "reference_doctype": s["reference_doctype"],
            "disabled": 0, "script": script_body,
        }
        if s["doctype_event"]:
            payload["doctype_event"] = s["doctype_event"]

        result = api_post("/api/resource/Server Script", payload)
        print(f"  [{'OK' if result.get('data') else 'ERROR'}] {s['name']}")


# ═══════════════════════════════════════════
# STEP 6: Client Scripts (enhanced form view + list view)
# ═══════════════════════════════════════════
def create_client_scripts():
    # Read the full enhanced client script from file
    full_js = read_file("mgrant_document_repository/mgrant_document_repository/doctype/document_registry/document_registry.js")

    cs_form = {
        "name": "Document Registry - Form", "dt": "Document Registry", "view": "Form",
        "script": full_js,
    }

    for cs in [cs_form]:
        r = requests.get(f'{BASE}/api/resource/Client Script/{requests.utils.quote(cs["name"])}', headers=HDR)
        if r.status_code == 200 and r.json().get("data"):
            # Update existing
            result = api_put(f'/api/resource/Client Script/{requests.utils.quote(cs["name"])}',
                             {"script": cs["script"], "enabled": 1})
            print(f"  [OK] Updated {cs['name']}")
        else:
            payload = {"doctype": "Client Script", "enabled": 1, **cs}
            result = api_post("/api/resource/Client Script", payload)
            print(f"  [{'OK' if result.get('data') else 'ERROR'}] {cs['name']}")


# ═══════════════════════════════════════════
# STEP 6b: Script Report - Document Summary
# ═══════════════════════════════════════════
def create_script_report():
    REPORT_NAME = "Document Summary"
    r = requests.get(f'{BASE}/api/resource/Report/{requests.utils.quote(REPORT_NAME)}', headers=HDR)

    report_script = read_file("mgrant_document_repository/mgrant_document_repository/report/document_summary/document_summary.py")
    report_js = read_file("mgrant_document_repository/mgrant_document_repository/report/document_summary/document_summary.js")

    filters_json = [
        {"fieldname": "source_doctype", "fieldtype": "Link", "label": "Source DocType", "options": "DocType"},
        {"fieldname": "partner", "fieldtype": "Link", "label": "Partner", "options": "NGO"},
        {"fieldname": "project", "fieldtype": "Link", "label": "Project", "options": "Project"},
        {"fieldname": "file_type", "fieldtype": "Select", "label": "File Type",
         "options": "\nPDF\nDocument\nSpreadsheet\nImage\nVideo\nPresentation\nOther"},
        {"fieldname": "compliance_status", "fieldtype": "Select", "label": "Compliance Status",
         "options": "\nActive\nExpired\nPending\nRejected\nNA"},
        {"fieldname": "source_category", "fieldtype": "Data", "label": "Source Category"},
        {"fieldname": "from_date", "fieldtype": "Date", "label": "From Date"},
        {"fieldname": "to_date", "fieldtype": "Date", "label": "To Date"},
    ]

    columns_json = [
        {"fieldname": "file_name", "label": "File Name", "fieldtype": "Data", "width": 200},
        {"fieldname": "name", "label": "ID", "fieldtype": "Link", "options": "Document Registry", "width": 130},
        {"fieldname": "file_type", "label": "File Type", "fieldtype": "Data", "width": 100},
        {"fieldname": "source_doctype", "label": "Source Module", "fieldtype": "Data", "width": 130},
        {"fieldname": "source_record_title", "label": "Source Record", "fieldtype": "Data", "width": 150},
        {"fieldname": "source_category", "label": "Category", "fieldtype": "Data", "width": 120},
        {"fieldname": "partner_name", "label": "Partner", "fieldtype": "Data", "width": 150},
        {"fieldname": "project_title", "label": "Project", "fieldtype": "Data", "width": 150},
        {"fieldname": "compliance_status", "label": "Compliance", "fieldtype": "Data", "width": 100},
        {"fieldname": "upload_date", "label": "Upload Date", "fieldtype": "Date", "width": 110},
        {"fieldname": "file_size_display", "label": "Size", "fieldtype": "Data", "width": 80},
    ]

    payload = {
        "doctype": "Report",
        "report_name": REPORT_NAME,
        "ref_doctype": "Document Registry",
        "report_type": "Script Report",
        "is_standard": "No",
        "module": "Custom",
        "disabled": 0,
        "report_script": report_script,
        "javascript": report_js,
        "filters": filters_json,
        "columns": columns_json,
    }

    # Discover available roles for report access
    r2 = api_get("/api/resource/Role", {"limit_page_length": 0, "fields": json.dumps(["name"])})
    available_roles = set()
    for x in r2.get("data", []):
        available_roles.add(x["name"])

    report_roles = []
    for role_name in ["System Manager", "PM", "SPM", "HO Finance", "Partner NGO", "Donor Admin", "mGrant Partnerships"]:
        if role_name in available_roles:
            report_roles.append({"role": role_name})
    payload["roles"] = report_roles

    if r.status_code == 200 and r.json().get("data"):
        result = api_put(f'/api/resource/Report/{requests.utils.quote(REPORT_NAME)}', payload)
        print(f"  [OK] Updated Report: {REPORT_NAME}")
    else:
        result = api_post("/api/resource/Report", payload)
        print(f"  [{'OK' if result.get('data') else 'ERROR'}] Report: {REPORT_NAME}")


# ═══════════════════════════════════════════
# STEP 7: Custom HTML Block + Workspace
# ═══════════════════════════════════════════
def deploy_custom_ui():
    CHB_NAME = "document-repository-chb"
    WS_NAME = "Document Repository"

    chb_html = read_file("mgrant_document_repository/mgrant_document_repository/custom_html_block/document_repository.html")
    chb_css = read_file("mgrant_document_repository/mgrant_document_repository/custom_html_block/document_repository.css")
    chb_js = read_file("mgrant_document_repository/mgrant_document_repository/custom_html_block/document_repository.js")

    # Create or update CHB
    r = requests.get(f'{BASE}/api/resource/Custom HTML Block/{CHB_NAME}', headers=HDR)
    if r.status_code == 200 and r.json().get("data"):
        result = api_put(f"/api/resource/Custom HTML Block/{CHB_NAME}",
                         {"html": chb_html, "style": chb_css, "script": chb_js, "private": 0})
        print(f"  [OK] Updated CHB: {CHB_NAME}")
    else:
        result = api_post("/api/resource/Custom HTML Block",
                          {"doctype": "Custom HTML Block", "name": CHB_NAME,
                           "html": chb_html, "style": chb_css, "script": chb_js, "private": 0})
        print(f"  [{'OK' if result.get('data') else 'ERROR'}] Created CHB: {CHB_NAME}")

    # Create or update Workspace
    r = requests.get(f'{BASE}/api/resource/Workspace/{requests.utils.quote(WS_NAME)}', headers=HDR)
    content_blocks = [{"id": "ws-chb-01", "type": "custom_block", "data": {"custom_block_name": CHB_NAME, "col": 12}}]
    cb_row = {"custom_block_name": CHB_NAME, "label": CHB_NAME,
              "parentfield": "custom_blocks", "parenttype": "Workspace", "doctype": "Workspace Custom Block"}

    if r.status_code == 200 and r.json().get("data"):
        result = api_put(f"/api/resource/Workspace/{requests.utils.quote(WS_NAME)}",
                         {"content": json.dumps(content_blocks), "custom_blocks": [cb_row]})
        print(f"  [OK] Updated Workspace: {WS_NAME}")
    else:
        result = api_post("/api/resource/Workspace",
                          {"doctype": "Workspace", "label": WS_NAME, "title": WS_NAME,
                           "module": "Mgrant", "icon": "file", "public": 1, "is_hidden": 0,
                           "for_user": "", "parent_page": "", "sequence_id": 15.0,
                           "content": json.dumps(content_blocks), "custom_blocks": [cb_row]})
        print(f"  [{'OK' if result.get('data') else 'ERROR'}] Created Workspace: {WS_NAME}")

    # Verify wiring
    rv = requests.get(f"{BASE}/api/method/frappe.desk.desktop.get_desktop_page", headers=HDR,
                      params={"page": json.dumps({"name": WS_NAME, "title": WS_NAME, "public": 1})})
    items = rv.json().get("message", {}).get("custom_blocks", {}).get("items", [])
    if items and items[0].get("label") == items[0].get("custom_block_name"):
        print(f"  [OK] Workspace wiring verified (label match)")
    else:
        print(f"  [WARN] Workspace wiring may need manual check")


# ═══════════════════════════════════════════
# STEP 8: Backfill existing files
# ═══════════════════════════════════════════
def backfill_existing_files():
    TRACKED = ["Project", "Grant", "NGO", "Proposal", "Fund Request", "Vendor",
               "NGO Due Diligence", "Quarterly Utilisation Report", "Fund Disbursement",
               "Bank Details Update Request", "RFP"]

    EXT_MAP = {
        "pdf": "PDF", "doc": "Document", "docx": "Document", "txt": "Document",
        "xls": "Spreadsheet", "xlsx": "Spreadsheet", "csv": "Spreadsheet",
        "jpg": "Image", "jpeg": "Image", "png": "Image", "gif": "Image", "svg": "Image", "webp": "Image",
        "mp4": "Video", "avi": "Video", "mov": "Video",
        "ppt": "Presentation", "pptx": "Presentation",
    }

    # Build default category lookup
    mappings = api_get("/api/resource/Document Category Mapping/Document Category Mapping").get("data", {}).get("mappings", [])
    dt_default_cat = {}
    for m in mappings:
        if m["source_doctype"] not in dt_default_cat:
            dt_default_cat[m["source_doctype"]] = m["category_label"]

    total_created = total_skipped = 0

    for dt in TRACKED:
        files = api_get("/api/resource/File", {
            "filters": json.dumps([["attached_to_doctype", "=", dt], ["is_folder", "=", 0]]),
            "fields": json.dumps(["name", "file_name", "file_url", "file_size", "attached_to_doctype",
                                   "attached_to_name", "attached_to_field", "owner", "creation", "is_private"]),
            "limit_page_length": 0,
        }).get("data", [])
        if not files:
            continue

        print(f"  {dt}: {len(files)} files")
        for f in files:
            check = api_get("/api/method/frappe.client.get_count",
                            {"doctype": "Document Registry", "filters": json.dumps({"frappe_file": f["name"]})})
            if int(check.get("message", 0)) > 0:
                total_skipped += 1
                continue

            fname = f.get("file_name") or ""
            ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
            file_type = EXT_MAP.get(ext, "Other")
            category = dt_default_cat.get(dt, dt)

            sz = f.get("file_size") or 0
            if sz < 1024: size_d = f"{sz} B"
            elif sz < 1048576: size_d = f"{sz/1024:.1f} KB"
            else: size_d = f"{sz/1048576:.1f} MB"

            payload = {
                "doctype": "Document Registry", "file_name": fname, "file_url": f.get("file_url"),
                "file_type": file_type, "file_extension": ext, "file_size": sz, "file_size_display": size_d,
                "source_doctype": dt, "source_name": f.get("attached_to_name"),
                "source_record_title": f.get("attached_to_name", ""),
                "source_field": f.get("attached_to_field") or "", "source_category": category,
                "uploaded_by": f.get("owner"), "uploaded_by_name": f.get("owner", ""),
                "upload_date": (f.get("creation") or "")[:10], "frappe_file": f["name"],
                "is_private": f.get("is_private", 0), "compliance_status": "NA",
            }
            result = api_post("/api/resource/Document Registry", payload)
            if result.get("data"):
                total_created += 1
            else:
                print(f"    [ERROR] {fname}: {json.dumps(result)[:150]}")

    print(f"  [DONE] Created: {total_created}, Skipped: {total_skipped}")


# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════
if __name__ == "__main__":
    base, key = get_config()
    init(base, key)

    print("=" * 60)
    print(f"Deploying Document Repository to {base}")
    print("=" * 60)

    print("\n1/8 Creating Document Category Mapping Row...")
    create_mapping_row_doctype()

    print("\n2/8 Creating Document Category Mapping...")
    create_mapping_doctype()

    print("\n3/8 Creating Document Registry...")
    create_registry_doctype()

    time.sleep(3)

    print("\n4/8 Populating default mappings...")
    populate_default_mappings()

    print("\n5/8 Creating Server Scripts...")
    create_server_scripts()

    print("\n6/9 Creating Client Scripts (enhanced form view)...")
    create_client_scripts()

    print("\n7/9 Creating Script Report (Document Summary)...")
    create_script_report()

    print("\n8/9 Deploying Custom UI (CHB + Workspace)...")
    deploy_custom_ui()

    print("\n9/9 Backfilling existing files...")
    backfill_existing_files()

    print("\n" + "=" * 60)
    print("DEPLOYMENT COMPLETE!")
    print(f"  Custom UI:   {base}/app/document-repository")
    print(f"  Native List: {base}/app/document-registry")
    print(f"  Report:      {base}/app/query-report/Document Summary")
    print("=" * 60)
