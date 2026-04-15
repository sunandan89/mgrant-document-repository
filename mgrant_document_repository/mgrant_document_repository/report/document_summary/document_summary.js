// Copyright (c) 2026, mGrant Document Repository Contributors and contributors
// For license information, please see license.txt

frappe.query_reports["Document Summary"] = {
	"filters": [
		{
			"fieldname": "source_doctype",
			"label": __("Source DocType"),
			"fieldtype": "Link",
			"options": "DocType",
			"width": "100px"
		},
		{
			"fieldname": "partner",
			"label": __("Partner"),
			"fieldtype": "Link",
			"options": "NGO",
			"width": "100px"
		},
		{
			"fieldname": "project",
			"label": __("Project"),
			"fieldtype": "Link",
			"options": "Project",
			"width": "100px"
		},
		{
			"fieldname": "file_type",
			"label": __("File Type"),
			"fieldtype": "Select",
			"options": [
				"",
				"PDF",
				"Document",
				"Spreadsheet",
				"Image",
				"Video",
				"Presentation",
				"Other"
			],
			"width": "100px"
		},
		{
			"fieldname": "compliance_status",
			"label": __("Compliance Status"),
			"fieldtype": "Select",
			"options": [
				"",
				"Active",
				"Expired",
				"Pending",
				"Rejected",
				"NA"
			],
			"width": "100px"
		},
		{
			"fieldname": "source_category",
			"label": __("Source Category"),
			"fieldtype": "Data",
			"width": "100px"
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"width": "100px"
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"width": "100px"
		}
	]
};
