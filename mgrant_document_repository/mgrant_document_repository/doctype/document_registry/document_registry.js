frappe.ui.form.on("Document Registry", {
    refresh: function (frm) {
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

        // Make form read-only (this is an index, not the source of truth)
        frm.disable_save();
    },
});

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
