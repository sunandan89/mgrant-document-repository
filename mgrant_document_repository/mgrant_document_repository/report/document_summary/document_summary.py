# Document Summary Report - Script Report for Document Registry
# Runs in Frappe safe_exec sandbox. No imports allowed.
# frappe, filters are pre-injected globals.
# Columns are defined in the Report document's child table, not here.

db_filters = {}

if filters.get("source_doctype"):
	db_filters["source_doctype"] = filters.get("source_doctype")

if filters.get("partner"):
	db_filters["partner"] = filters.get("partner")

if filters.get("project"):
	db_filters["project"] = filters.get("project")

if filters.get("file_type"):
	db_filters["file_type"] = filters.get("file_type")

if filters.get("compliance_status"):
	db_filters["compliance_status"] = filters.get("compliance_status")

if filters.get("source_category"):
	db_filters["source_category"] = filters.get("source_category")

if filters.get("from_date"):
	db_filters["upload_date"] = [">=", filters.get("from_date")]

if filters.get("to_date"):
	if "upload_date" in db_filters:
		db_filters["upload_date"] = ["between", [filters.get("from_date"), filters.get("to_date")]]
	else:
		db_filters["upload_date"] = ["<=", filters.get("to_date")]

result = frappe.db.get_all(
	"Document Registry",
	filters=db_filters,
	fields=[
		"name", "file_name", "file_type", "source_doctype",
		"source_record_title", "source_category", "partner_name",
		"project_title", "compliance_status", "upload_date",
		"file_size_display"
	],
	order_by="upload_date desc, file_name asc",
	limit_page_length=0
)
