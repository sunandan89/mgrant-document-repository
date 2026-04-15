frappe.ui.form.on("Document Registry", {
    refresh: function (frm) {
        // Disable save since this is read-only (index, not source of truth)
        frm.disable_save();

        // Hide standard Frappe form sections
        frm.toggle_display(
            [
                "details_tab",
                "file_name",
                "file_url",
                "column_break_file",
                "file_type",
                "file_extension",
                "file_size",
                "file_size_display",
                "source_section",
                "source_doctype",
                "source_name",
                "source_record_title",
                "column_break_source",
                "source_field",
                "source_category",
                "context_section",
                "partner",
                "partner_name",
                "project",
                "project_title",
                "column_break_context",
                "donor",
                "programme",
                "compliance_section",
                "document_number",
                "issuance_date",
                "column_break_compliance",
                "expiry_date",
                "compliance_status",
                "metadata_section",
                "uploaded_by",
                "uploaded_by_name",
                "column_break_metadata",
                "upload_date",
                "frappe_file",
                "is_private",
            ],
            false
        );

        // Inject custom card-based layout
        render_custom_form_layout(frm);

        // "Go to Source Record" button
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

        // "Download File" button
        if (frm.doc.file_url) {
            frm.add_custom_button(__("Download File"), function () {
                window.open(frm.doc.file_url, "_blank");
            });
        }

        // "Back to List" button
        frm.add_custom_button(__("Back to List"), function () {
            frappe.set_route("List", "Document Registry");
        });
    },
});

function get_file_icon(file_type) {
    var icon_map = {
        PDF: "📄",
        Document: "📝",
        Spreadsheet: "📊",
        Image: "🖼️",
        Video: "🎬",
        Presentation: "📽️",
        Other: "📎",
    };
    return icon_map[file_type] || "📎";
}

function get_badge_color(value, type) {
    var colors = {
        file_type: {
            PDF: "#e8f0fe|#1a56db",
            Document: "#e8f0fe|#1a56db",
            Spreadsheet: "#fef3e2|#b45309",
            Image: "#e6f4ea|#137333",
            Video: "#f3e8ff|#7c3aed",
            Presentation: "#e6f4ea|#137333",
            Other: "#f3f3f3|#666666",
        },
        source_category: {
            Financial: "#e8f0fe|#1a56db",
            Documents: "#e6f4ea|#137333",
            Details: "#e6f4ea|#137333",
            Fund: "#f3e8ff|#7c3aed",
        },
        compliance_status: {
            Active: "#e6f4ea|#137333",
            Expired: "#fee2e2|#991b1b",
            Pending: "#fef3e2|#b45309",
            Rejected: "#fee2e2|#991b1b",
            NA: "#f3f3f3|#666666",
        },
    };

    var type_colors = colors[type] || {};
    var color_pair = type_colors[value] || "#f3f3f3|#666666";
    var parts = color_pair.split("|");
    return { bg: parts[0], text: parts[1] };
}

function render_badge(label, type) {
    if (!label) return "";
    var colors = get_badge_color(label, type);
    return `<span class="badge" style="
        display: inline-block;
        background-color: ${colors.bg};
        color: ${colors.text};
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
    ">${__( label)}</span>`;
}

function render_form_field(label, value, is_link, link_doctype, link_field) {
    if (!value) {
        return `<div class="form-field">
            <div class="field-label">${label}</div>
            <div class="field-value" style="color: #999;">—</div>
        </div>`;
    }

    var display_value = value;
    if (is_link && link_doctype && link_field) {
        display_value = `<a href="/app/${frappe.router.slug(link_doctype)}/${link_field}" style="color: #1a56db; text-decoration: none; font-weight: 500;">${frappe.utils.get_form_link_html(link_doctype, link_field, true, value)}</a>`;
    }

    return `<div class="form-field">
        <div class="field-label">${label}</div>
        <div class="field-value">${display_value}</div>
    </div>`;
}

function render_custom_form_layout(frm) {
    var doc = frm.doc;

    // Remove any previously injected custom layout
    $(frm.layout.wrapper).find(".custom-form-layout").remove();

    var html = `<div class="custom-form-layout" style="
        padding: 16px 0;
        background: #fff;
    ">
        <!-- File Preview Box -->
        <div class="file-preview-box" style="
            border: 2px dashed #e5e7eb;
            border-radius: 8px;
            padding: 32px;
            text-align: center;
            margin-bottom: 24px;
            background: #fafafa;
        ">
            <div style="font-size: 48px; margin-bottom: 12px;">
                ${get_file_icon(doc.file_type || "Other")}
            </div>
            <div style="
                font-size: 16px;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 8px;
            ">${frappe.utils.escape_html(doc.file_name || "—")}</div>
            <div style="
                font-size: 13px;
                color: #6b7280;
            ">
                ${doc.file_extension ? frappe.utils.escape_html(doc.file_extension.toUpperCase()) : "—"}
                ${doc.file_size_display ? "• " + frappe.utils.escape_html(doc.file_size_display) : ""}
                ${doc.upload_date ? "• " + frappe.utils.escape_html(doc.upload_date) : ""}
            </div>
        </div>

        <!-- File Details Card -->
        <div class="form-card" style="
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 16px;
            overflow: hidden;
        ">
            <div class="card-header" style="
                background: #f9fafb;
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                font-weight: 600;
                color: #374151;
                font-size: 14px;
                cursor: pointer;
            " onclick="toggle_card(this)">
                <span style="margin-right: 8px;">📋</span>
                <span>File Details</span>
                <span style="margin-left: auto; transition: transform 0.2s;">▼</span>
            </div>
            <div class="card-content" style="
                padding: 16px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            ">
                ${render_form_field("File Name", doc.file_name)}
                ${render_form_field("File Type", doc.file_type ? render_badge(doc.file_type, "file_type") : "—")}
                ${render_form_field("Extension", doc.file_extension)}
                ${render_form_field("File Size", doc.file_size_display)}
            </div>
        </div>

        <!-- Source Card -->
        <div class="form-card" style="
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 16px;
            overflow: hidden;
        ">
            <div class="card-header" style="
                background: #f9fafb;
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                font-weight: 600;
                color: #374151;
                font-size: 14px;
                cursor: pointer;
            " onclick="toggle_card(this)">
                <span style="margin-right: 8px;">🔗</span>
                <span>Source</span>
                <span style="margin-left: auto; transition: transform 0.2s;">▼</span>
            </div>
            <div class="card-content" style="
                padding: 16px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            ">
                ${render_form_field("Source Module", doc.source_doctype)}
                ${render_form_field("Source Record", doc.source_name)}
                ${render_form_field("Record Title", doc.source_record_title)}
                ${render_form_field("Source Field", doc.source_field)}
                ${render_form_field("Category", doc.source_category ? render_badge(doc.source_category, "source_category") : "—")}
            </div>
        </div>

        <!-- Context Card -->
        <div class="form-card" style="
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 16px;
            overflow: hidden;
        ">
            <div class="card-header" style="
                background: #f9fafb;
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                font-weight: 600;
                color: #374151;
                font-size: 14px;
                cursor: pointer;
            " onclick="toggle_card(this)">
                <span style="margin-right: 8px;">🏢</span>
                <span>Context</span>
                <span style="margin-left: auto; transition: transform 0.2s;">▼</span>
            </div>
            <div class="card-content" style="
                padding: 16px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            ">
                ${
                    doc.partner
                        ? `<div class="form-field">
                    <div class="field-label">Partner / NGO</div>
                    <div class="field-value"><a href="/app/ngo/${doc.partner}" style="color: #1a56db; text-decoration: none; font-weight: 500;">${frappe.utils.escape_html(doc.partner_name || doc.partner)}</a></div>
                </div>`
                        : render_form_field("Partner / NGO", null)
                }
                ${
                    doc.project
                        ? `<div class="form-field">
                    <div class="field-label">Project</div>
                    <div class="field-value"><a href="/app/project/${doc.project}" style="color: #1a56db; text-decoration: none; font-weight: 500;">${frappe.utils.escape_html(doc.project_title || doc.project)}</a></div>
                </div>`
                        : render_form_field("Project", null)
                }
                ${
                    doc.donor
                        ? `<div class="form-field">
                    <div class="field-label">Donor</div>
                    <div class="field-value"><a href="/app/donor/${doc.donor}" style="color: #1a56db; text-decoration: none; font-weight: 500;">${frappe.utils.escape_html(doc.donor)}</a></div>
                </div>`
                        : render_form_field("Donor", null)
                }
                ${
                    doc.programme
                        ? `<div class="form-field">
                    <div class="field-label">Programme</div>
                    <div class="field-value"><a href="/app/programme/${doc.programme}" style="color: #1a56db; text-decoration: none; font-weight: 500;">${frappe.utils.escape_html(doc.programme)}</a></div>
                </div>`
                        : render_form_field("Programme", null)
                }
            </div>
        </div>

        <!-- Compliance Card -->
        <div class="form-card" style="
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 16px;
            overflow: hidden;
        ">
            <div class="card-header" style="
                background: #f9fafb;
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                font-weight: 600;
                color: #374151;
                font-size: 14px;
                cursor: pointer;
            " onclick="toggle_card(this)">
                <span style="margin-right: 8px;">✓</span>
                <span>Compliance</span>
                <span style="margin-left: auto; transition: transform 0.2s;">▼</span>
            </div>
            <div class="card-content" style="
                padding: 16px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            ">
                ${render_form_field("Document Number", doc.document_number)}
                ${render_form_field("Issuance Date", doc.issuance_date)}
                ${render_form_field("Expiry Date", doc.expiry_date)}
                ${render_form_field("Compliance Status", doc.compliance_status ? render_badge(doc.compliance_status, "compliance_status") : "—")}
            </div>
        </div>

        <!-- Metadata Card -->
        <div class="form-card" style="
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            margin-bottom: 16px;
            overflow: hidden;
        ">
            <div class="card-header" style="
                background: #f9fafb;
                padding: 12px 16px;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                font-weight: 600;
                color: #374151;
                font-size: 14px;
                cursor: pointer;
            " onclick="toggle_card(this)">
                <span style="margin-right: 8px;">ℹ️</span>
                <span>Metadata</span>
                <span style="margin-left: auto; transition: transform 0.2s;">▼</span>
            </div>
            <div class="card-content" style="
                padding: 16px;
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            ">
                ${render_form_field("Uploaded By", doc.uploaded_by_name || doc.uploaded_by)}
                ${render_form_field("Upload Date", doc.upload_date)}
                ${render_form_field("Private", doc.is_private ? "Yes" : "No")}
                ${render_form_field("Frappe File ID", doc.frappe_file)}
            </div>
        </div>

        <style>
            .form-field {
                display: flex;
                flex-direction: column;
            }
            .field-label {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #6b7280;
                margin-bottom: 6px;
            }
            .field-value {
                font-size: 14px;
                color: #1f2937;
                word-break: break-word;
            }
        </style>
    </div>`;

    // Inject custom layout before form sections
    $(frm.layout.wrapper).find(".layout-main-section").prepend(html);
}

function toggle_card(header_elem) {
    var content = $(header_elem).nextAll(".card-content").first();
    var arrow = $(header_elem).find("span:last");

    if (content.is(":visible")) {
        content.slideUp(200);
        arrow.css("transform", "rotate(-90deg)");
    } else {
        content.slideDown(200);
        arrow.css("transform", "rotate(0deg)");
    }
}

// List View settings
frappe.listview_settings["Document Registry"] = {
    add_fields: ["file_type", "compliance_status", "source_category"],

    get_indicator: function (doc) {
        // Compliance expired takes priority
        if (doc.compliance_status === "Expired") {
            return [__("Expired"), "red", "compliance_status,=,Expired"];
        }

        // File type indicators
        var type_map = {
            PDF: ["PDF", "blue"],
            Document: ["Document", "blue"],
            Spreadsheet: ["Spreadsheet", "orange"],
            Image: ["Image", "green"],
            Video: ["Video", "purple"],
            Presentation: ["Presentation", "cyan"],
        };

        if (type_map[doc.file_type]) {
            return [
                __(type_map[doc.file_type][0]),
                type_map[doc.file_type][1],
                "file_type,=," + doc.file_type,
            ];
        }

        return [__("Other"), "grey", "file_type,=,Other"];
    },

    formatters: {
        file_name: function (value, field, doc) {
            if (value && doc.file_url) {
                return `<a href="${doc.file_url}" target="_blank" title="Click to download">${value}</a>`;
            }
            return value;
        },
    },
};
