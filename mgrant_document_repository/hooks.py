app_name = "mgrant_document_repository"
app_title = "mGrant Document Repository"
app_publisher = "Dhwani RIS"
app_description = "Central Document Repository for mGrant - aggregates documents across all modules"
app_email = "sunandan@dhwaniris.com"
app_license = "MIT"

# Module definition
modules = [
    {
        "module_name": "mGrant - Document Repository",
        "category": "Modules",
        "color": "#7b1a1a",
        "icon": "octicon octicon-file-directory",
        "type": "module",
        "label": "Document Repository",
    }
]

# Doc Events - sync File uploads to Document Registry
doc_events = {
    "File": {
        "after_insert": "mgrant_document_repository.mgrant_document_repository.events.file_hooks.on_file_create",
        "on_trash": "mgrant_document_repository.mgrant_document_repository.events.file_hooks.on_file_delete",
    },
    "NGO Documents": {
        "on_update": "mgrant_document_repository.mgrant_document_repository.events.ngo_doc_hooks.on_ngo_doc_update",
        "on_trash": "mgrant_document_repository.mgrant_document_repository.events.ngo_doc_hooks.on_ngo_doc_delete",
    },
}

# Permission query conditions for row-level security
permission_query_conditions = {
    "Document Registry": "mgrant_document_repository.mgrant_document_repository.doctype.document_registry.document_registry.get_permission_query_conditions",
}

has_permission = {
    "Document Registry": "mgrant_document_repository.mgrant_document_repository.doctype.document_registry.document_registry.has_permission",
}

# After install - populate default category mappings
after_install = "mgrant_document_repository.mgrant_document_repository.install.default_mappings.after_install"
