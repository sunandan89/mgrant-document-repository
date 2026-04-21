frappe.ui.form.on("Document Registry", {
    refresh: function (frm) {
        // Disable save — this is a read-only index, not the source of truth
        frm.disable_save();

        // Hide all standard Frappe form fields (NOT the tab itself)
        var fields_to_hide = [
            "file_name", "file_url", "column_break_file",
            "file_type", "file_extension", "file_size", "file_size_display",
            "source_section", "source_doctype", "source_name",
            "source_record_title", "column_break_source",
            "source_field", "source_category",
            "context_section", "partner", "partner_name",
            "project", "project_title", "column_break_context",
            "donor", "programme",
            "compliance_section", "document_number", "issuance_date",
            "column_break_compliance", "expiry_date", "compliance_status",
            "metadata_section", "uploaded_by", "uploaded_by_name",
            "column_break_metadata", "upload_date", "frappe_file", "is_private"
        ];
        frm.toggle_display(fields_to_hide, false);

        // Inject the custom card-based layout
        render_custom_form_layout(frm);

        // Custom action buttons
        if (frm.doc.source_doctype && frm.doc.source_name) {
            frm.add_custom_button(
                __("Go to Source Record"),
                function () {
                    frappe.set_route("Form", frm.doc.source_doctype, frm.doc.source_name);
                },
                null,
                "primary"
            );
        }

        if (frm.doc.file_url) {
            frm.add_custom_button(__("Download File"), function () {
                window.open(frm.doc.file_url, "_blank");
            });
        }

        frm.add_custom_button(__("Back to Repository"), function () {
            // Navigate to workspace CHB, not native list view
            frappe.set_route("Workspaces", "Document Repository");
        });
    },
});


// ── Helper functions ──

function esc(val) {
    if (!val) return "";
    return $("<span>").text(val).html();
}

function get_file_icon(file_type) {
    var map = {
        PDF: "📄", Document: "📝", Spreadsheet: "📊",
        Image: "🖼️", Video: "🎬", Presentation: "📽️", Other: "📎"
    };
    return map[file_type] || "📎";
}

function badge_html(label, type) {
    if (!label) return '<span style="color:#999;">—</span>';
    var palettes = {
        file_type: {
            PDF: "#e8f0fe|#1a56db", Document: "#e8f0fe|#1a56db",
            Spreadsheet: "#fef3e2|#b45309", Image: "#e6f4ea|#137333",
            Video: "#f3e8ff|#7c3aed", Presentation: "#e6f4ea|#137333"
        },
        source_category: {
            Details: "#e6f4ea|#137333", Documents: "#e6f4ea|#137333",
            "Due Diligence": "#fef3e2|#b45309",
            "Fund Request & Disbursement": "#f3e8ff|#7c3aed",
            "Budget Report": "#e8f0fe|#1a56db",
            Utilisation: "#f3e8ff|#7c3aed", Reporting: "#fef3e2|#b45309",
            Files: "#f3f3f3|#666", "Bank Details": "#f3f3f3|#666"
        },
        compliance_status: {
            Active: "#e6f4ea|#137333", Expired: "#fee2e2|#991b1b",
            Pending: "#fef3e2|#b45309", Rejected: "#fee2e2|#991b1b",
            NA: "#f3f3f3|#666"
        }
    };
    var pair = ((palettes[type] || {})[label]) || "#f3f3f3|#666";
    var p = pair.split("|");
    return '<span style="display:inline-block;background:' + p[0] +
        ';color:' + p[1] +
        ';padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:0.3px;">' +
        esc(label) + '</span>';
}

function field_row(label, value) {
    var v = value || '<span style="color:#aaa;">—</span>';
    return '<div style="margin-bottom:14px;">' +
        '<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8d99a6;margin-bottom:4px;">' + esc(label) + '</div>' +
        '<div style="font-size:13px;color:#1f2937;">' + v + '</div>' +
        '</div>';
}

function link_html(doctype, name, display) {
    if (!name) return '<span style="color:#aaa;">—</span>';
    var slug = doctype.toLowerCase().replace(/ /g, "-");
    var text = display || name;
    return '<a href="/app/' + slug + '/' + encodeURIComponent(name) +
        '" style="color:#2b5ea7;text-decoration:none;font-weight:500;">' + esc(text) + '</a>';
}

function card_html(icon, title, body_html) {
    return '<div style="background:#fff;border:1px solid #e4e4e4;border-radius:8px;margin-bottom:16px;overflow:hidden;">' +
        '<div class="dr-card-hdr" style="background:#fafbfc;padding:12px 16px;border-bottom:1px solid #e4e4e4;display:flex;align-items:center;font-weight:600;color:#374151;font-size:13px;cursor:pointer;">' +
        '<span style="margin-right:8px;">' + icon + '</span>' +
        '<span>' + title + '</span>' +
        '<span class="dr-card-arrow" style="margin-left:auto;transition:transform 0.2s;">▾</span>' +
        '</div>' +
        '<div class="dr-card-body" style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;">' +
        body_html +
        '</div></div>';
}


function render_custom_form_layout(frm) {
    var doc = frm.doc;

    // Remove any previously injected layout (avoid duplicates on re-render)
    $(frm.page.main).find(".dr-custom-layout").remove();

    // ── File Preview Box ──
    var preview = '<div style="background:#f8fafb;border:2px dashed #d8dee4;border-radius:8px;padding:36px;text-align:center;margin-bottom:20px;">' +
        '<div style="font-size:48px;margin-bottom:10px;">' + get_file_icon(doc.file_type || "Other") + '</div>' +
        '<div style="font-size:16px;font-weight:600;color:#1a1a1a;margin-bottom:6px;">' + esc(doc.file_name || "—") + '</div>' +
        '<div style="font-size:12.5px;color:#8d99a6;">' +
            (doc.file_extension ? esc(doc.file_extension.toUpperCase()) : "") +
            (doc.file_size_display ? " &bull; " + esc(doc.file_size_display) : "") +
            (doc.upload_date ? " &bull; Uploaded " + esc(doc.upload_date) : "") +
            (doc.uploaded_by_name ? " by " + esc(doc.uploaded_by_name) : "") +
        '</div></div>';

    // ── File Details Card ──
    var details_body =
        field_row("File Name", esc(doc.file_name)) +
        field_row("File Type", badge_html(doc.file_type, "file_type")) +
        field_row("Extension", esc(doc.file_extension)) +
        field_row("File Size", esc(doc.file_size_display)) +
        field_row("Private", doc.is_private ? "Yes" : "No") +
        field_row("Upload Date", esc(doc.upload_date));

    // ── Source Card ──
    var source_body =
        field_row("Source Module", link_html("DocType", doc.source_doctype, doc.source_doctype)) +
        field_row("Source Record", doc.source_doctype && doc.source_name
            ? link_html(doc.source_doctype, doc.source_name, doc.source_record_title || doc.source_name)
            : null) +
        field_row("Source Field / Tab", esc(doc.source_field)) +
        field_row("Category", badge_html(doc.source_category, "source_category"));

    // ── Context Card ──
    var context_body =
        field_row("Partner / NGO", link_html("NGO", doc.partner, doc.partner_name || doc.partner)) +
        field_row("Project", link_html("Project", doc.project, doc.project_title || doc.project)) +
        field_row("Donor", link_html("Donor", doc.donor, doc.donor)) +
        field_row("Programme", link_html("Programme", doc.programme, doc.programme));

    // ── Compliance Card ──
    var compliance_body =
        field_row("Document Number", esc(doc.document_number)) +
        field_row("Compliance Status", badge_html(doc.compliance_status, "compliance_status")) +
        field_row("Issuance Date", esc(doc.issuance_date)) +
        field_row("Expiry Date", esc(doc.expiry_date));

    // ── Metadata Card ──
    var metadata_body =
        field_row("Uploaded By", esc(doc.uploaded_by_name || doc.uploaded_by)) +
        field_row("Upload Date", esc(doc.upload_date)) +
        field_row("Private", doc.is_private ? "Yes" : "No") +
        field_row("Frappe File ID", doc.frappe_file
            ? '<span style="font-family:monospace;font-size:12px;color:#6b7280;">' + esc(doc.frappe_file) + '</span>'
            : null);

    // ── Assemble full layout ──
    var full_html = '<div class="dr-custom-layout" style="padding:20px 0;">' +
        preview +
        card_html("📋", "File Details", details_body) +
        card_html("🔗", "Source", source_body) +
        card_html("🏢", "Context", context_body) +
        card_html("🛡", "Compliance", compliance_body) +
        card_html("📊", "Metadata", metadata_body) +
        '</div>';

    // Inject into the form — try multiple selectors for Frappe v15/v16 compatibility
    var $target = $(frm.page.main).find(".form-layout");
    if (!$target.length) {
        $target = $(frm.layout.wrapper);
    }
    if (!$target.length) {
        $target = $(frm.page.main);
    }
    $target.prepend(full_html);

    // Bind card collapse/expand
    $(frm.page.main).find(".dr-card-hdr").on("click", function () {
        var $body = $(this).next(".dr-card-body");
        var $arrow = $(this).find(".dr-card-arrow");
        if ($body.is(":visible")) {
            $body.slideUp(200);
            $arrow.css("transform", "rotate(-90deg)");
        } else {
            $body.slideDown(200);
            $arrow.css("transform", "rotate(0deg)");
        }
    });
}


// ── List View Settings ──

frappe.listview_settings["Document Registry"] = {
    add_fields: ["file_type", "compliance_status", "source_category"],

    get_indicator: function (doc) {
        if (doc.compliance_status === "Expired") {
            return [__("Expired"), "red", "compliance_status,=,Expired"];
        }
        var type_map = {
            PDF: ["PDF", "blue"], Document: ["Document", "blue"],
            Spreadsheet: ["Spreadsheet", "orange"], Image: ["Image", "green"],
            Video: ["Video", "purple"], Presentation: ["Presentation", "cyan"]
        };
        if (type_map[doc.file_type]) {
            return [__(type_map[doc.file_type][0]), type_map[doc.file_type][1],
                "file_type,=," + doc.file_type];
        }
        return [__("Other"), "grey", "file_type,=,Other"];
    },

    formatters: {
        file_name: function (value, field, doc) {
            if (value && doc.file_url) {
                return '<a href="' + doc.file_url + '" target="_blank" title="Click to download">' + value + '</a>';
            }
            return value;
        }
    }
};
