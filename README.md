# Central Document Repository for mGrant

A Frappe Framework module that aggregates documents from across all mGrant modules (NGO, Proposal, Project, Grant, Fund Request, Vendor) into a single searchable, filterable, sortable view using native Frappe Desk UI.

## Architecture

**Approach:** Index DocType + Event Hooks (not a Virtual DocType)

A regular DocType called `Document Registry` acts as a lightweight index. Whenever a file is uploaded, modified, or deleted anywhere in the platform, `doc_events` hooks on the `File` DocType automatically create/update/delete the corresponding `Document Registry` record.

### Why this approach?

- Native Frappe List View works out of the box — filters, sorting, grouping, sidebar stats, pagination, Report Builder
- Excellent performance via single-table queries with proper indexes
- Standard Frappe report builder works
- Easy to extend and maintain
- Generic/multi-tenant — category mapping is configurable per customer

## Module Structure

```
mgrant_document_repository/
├── mgrant_document_repository/
│   ├── doctype/
│   │   ├── document_registry/          # Main index DocType (27 fields)
│   │   ├── document_category_mapping/  # Single settings DocType
│   │   └── document_category_mapping_row/  # Child table for mapping rows
│   ├── events/
│   │   ├── file_hooks.py               # File.after_insert, File.on_trash
│   │   └── ngo_doc_hooks.py            # NGO Documents.on_update sync
│   ├── install/
│   │   ├── backfill.py                 # One-time migration for existing files
│   │   └── default_mappings.py         # Default category mappings on install
│   └── report/
│       └── document_summary/           # Pre-built script report
├── hooks.py
├── setup.py
└── README.md
```

## DocTypes

### 1. Document Registry

The main index DocType. Each record represents one file uploaded anywhere in mGrant.

| Section | Fields |
|---------|--------|
| **File Details** | file_name, file_url, file_preview, file_type, file_extension, file_size, file_size_display |
| **Source** | source_doctype, source_name, source_record_title, source_field, source_category |
| **Context** | partner (NGO), partner_name, project, project_title, donor, programme |
| **Compliance** | document_number, issuance_date, expiry_date, compliance_status |
| **Metadata** | uploaded_by, uploaded_by_name, upload_date, frappe_file (Link to File), is_private |

**List View defaults:** File Name, File Type, Source Module, Source Record Title, Partner Name, Category, Upload Date, File Size

**Sidebar filters:** Source Module, Category, File Type, Partner, Project, Donor, Compliance Status, Uploaded By

### 2. Document Category Mapping (Settings)

A Single DocType with a child table that maps `source_doctype` + `source_field` → `category_label`.

**Category Resolution Logic (in priority order):**

1. Check Document Category Mapping for an explicit override matching `source_doctype` + `source_field`
2. Auto-derive from DocType metadata: find which Tab Break the `source_field` sits under, use that tab's label
3. For child DocType fields where no parent tab is determinable, fall back to the source DocType name
4. Last resort: "Other"

### Default Category Mappings

| Source DocType | Source Field | Category |
|---|---|---|
| Project | mou_file | Details |
| Grant | grant_agreement_mou | Details |
| Grant | custom_upload_mou | Details |
| Proposal | upload_draft_mou_here | Details |
| Proposal | mou_signed_document | Details |
| NGO | custom_12a | Documents |
| NGO | custom_80g | Documents |
| NGO | custom_society_reg | Documents |
| NGO | custom_trust_deed | Documents |
| NGO | custom_latest_3_years_financial_statement | Documents |
| NGO Due Diligence | pan | Due Diligence |
| NGO Due Diligence | g80_certificate | Due Diligence |
| NGO Due Diligence | a12_certificate | Due Diligence |
| NGO Due Diligence | csr_1_form | Due Diligence |
| NGO Due Diligence | trust_deed | Due Diligence |
| NGO Due Diligence | fcra | Due Diligence |
| NGO Due Diligence | gst | Due Diligence |
| NGO Due Diligence | yrs_balance_sheet | Due Diligence |
| NGO Due Diligence | yrs_annual_report | Due Diligence |
| NGO Due Diligence | code_of_conduct_attachment | Due Diligence |
| Fund Disbursement | memo_template | Fund Request & Disbursement |
| Quarterly Utilisation Report | upload_report | Utilisation |
| Vendor | registration_certificate | Documents |
| Vendor | pan_copy_upload | Documents |
| Bank Details Update Request | supporting_document | Bank Details |

## Sync Hooks

```python
# hooks.py
doc_events = {
    "File": {
        "after_insert": "mgrant_document_repository.events.file_hooks.on_file_create",
        "on_trash": "mgrant_document_repository.events.file_hooks.on_file_delete",
    },
    "NGO Documents": {
        "on_update": "mgrant_document_repository.events.ngo_doc_hooks.on_ngo_doc_update",
        "on_trash": "mgrant_document_repository.events.ngo_doc_hooks.on_ngo_doc_delete",
    }
}
```

## Permissions

| Role | Read | Write | Create | Delete |
|------|------|-------|--------|--------|
| System Manager | Yes | Yes | Yes | Yes |
| Programme Manager | Yes | No | No | No |
| Senior Programme Manager | Yes | No | No | No |
| Finance Manager | Yes | No | No | No |
| NGO User | Own partner docs only | No | No | No |
| Donor User | Own donor projects only | No | No | No |

Row-level security via `permission_query_conditions` hook.

## Workspace Sidebar Placement

The module appears as "Document Repository" in the mGrant sidebar, positioned below "Entities Workspace" — linking directly to `/app/document-registry`.

## Installation

```bash
# Add app to bench
bench get-app https://github.com/sunandan89/mgrant-document-repository.git
bench --site your-site install-app mgrant_document_repository

# Run backfill for existing files
bench --site your-site execute mgrant_document_repository.install.backfill.run
```

## Non-Goals (v1)

- Document versioning
- In-browser document editing
- Approval workflows on documents
- Bulk upload to repository directly
- Full-text search inside document contents

## Future Enhancements (v2+)

- Direct upload from repository
- Tags/Labels for custom organization
- Expiry alerts (scheduled email notifications)
- Bulk download as ZIP
- Activity log (view/download tracking)
- Dashboard view with charts on workspace

## License

MIT
