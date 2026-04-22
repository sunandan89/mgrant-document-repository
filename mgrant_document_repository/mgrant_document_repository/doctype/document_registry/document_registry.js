/**
 * Document Registry — Form Read-View Overlay
 *
 * Uses the Form Read-View Overlay pattern from mgrant-frappe-patterns
 * to render a clean presentation-mode detail page for Document Registry records.
 * Edit button restores the standard Frappe form. Back button returns to repository.
 */


// ═══════════════════════════════════════════════════════════════════
// CORE: Form Read-View Overlay (inlined from mgrant-frappe-patterns)
// ═══════════════════════════════════════════════════════════════════

function getTabWrapper(frm, tabFieldname) {
  if (frm.layout && frm.layout.tabs) {
    for (var i = 0; i < frm.layout.tabs.length; i++) {
      var tab = frm.layout.tabs[i];
      if (tab.df && tab.df.fieldname === tabFieldname) {
        if (tab.wrapper && tab.wrapper.length) return tab.wrapper;
        return null;
      }
    }
  }
  if (frm.fields_dict && frm.fields_dict[tabFieldname]) {
    var field = frm.fields_dict[tabFieldname];
    if (field.$wrapper && field.$wrapper.length) return field.$wrapper;
  }
  return null;
}

function buildReadViewOverlay(frm, options) {
  var tabFieldname = options.tabFieldname;
  var overlayClass = options.overlayClass || 'rv-overlay';

  var $tab = getTabWrapper(frm, tabFieldname);
  if (!$tab) return false;

  $tab.find('.' + overlayClass).remove();

  var editColor = options.editColor || '#B45309';
  var toolbar = '<div class="rv-overlay-toolbar">' +
    '<button class="btn btn-sm rv-overlay-btn-edit" style="' +
      'background:' + editColor + ' !important;color:white !important;' +
      'border:none !important;padding:7px 18px !important;border-radius:6px !important;' +
      'font-size:13px !important;font-weight:600 !important;cursor:pointer !important;">' +
      (options.editLabel || 'Edit') +
    '</button>';

  if (options.backUrl) {
    toolbar += '<button class="btn btn-sm rv-overlay-btn-back" style="' +
      'background:#F3F4F6 !important;color:#374151 !important;' +
      'border:1px solid #E5E7EB !important;padding:7px 16px !important;' +
      'border-radius:6px !important;font-size:13px !important;font-weight:500 !important;' +
      'cursor:pointer !important;">' +
      (options.backLabel || 'Back') +
    '</button>';
  }
  toolbar += '</div>';

  var css = options.renderCSS ? '<style>' + options.renderCSS() + '</style>' : '';
  var content = options.renderContent(frm);

  var html = '<div class="' + overlayClass + '">' +
    css +
    '<style>' +
    '.rv-overlay-toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:0 4px; }' +
    '</style>' +
    toolbar +
    content +
    '</div>';

  $tab.children().hide();
  $tab.prepend(html);

  $tab.find('.rv-overlay-btn-edit').on('click', function() {
    $tab.find('.' + overlayClass).remove();
    $tab.children().show();
    if (options.onEdit) options.onEdit(frm);
  });

  if (options.backUrl) {
    $tab.find('.rv-overlay-btn-back').on('click', function() {
      window.location.href = options.backUrl;
    });
  }

  return true;
}


// ═══════════════════════════════════════════════════════════════════
// DOCUMENT REGISTRY: Read-View Content
// ═══════════════════════════════════════════════════════════════════

function esc(val) {
  if (!val && val !== 0) return "";
  return $("<span>").text(val).html();
}

function fileIcon(fileType) {
  var icons = {
    PDF: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13l-2 4h4l-2 4"/></svg>',
    Document: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    Spreadsheet: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="12" y1="9" x2="12" y2="21"/></svg>',
    Image: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    Video: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DB2777" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    Presentation: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0891B2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h20v14H2z"/><path d="M8 21l4-4 4 4"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    Other: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  };
  return icons[fileType] || icons.Other;
}

function fileIconBg(fileType) {
  var map = {
    PDF: '#FEF2F2', Document: '#EFF6FF', Spreadsheet: '#ECFDF5',
    Image: '#F5F3FF', Video: '#FDF2F8', Presentation: '#ECFEFF', Other: '#F3F4F6'
  };
  return map[fileType] || '#F3F4F6';
}

function chipHtml(label, bgColor, textColor) {
  if (!label) return '';
  return '<span style="display:inline-block;background:' + bgColor +
    ';color:' + textColor + ';padding:3px 10px;border-radius:20px;' +
    'font-size:11.5px;font-weight:600;letter-spacing:0.2px;white-space:nowrap;">' +
    esc(label) + '</span>';
}

function complianceChip(status) {
  if (!status || status === 'NA') return chipHtml('N/A', '#F3F4F6', '#6B7280');
  var map = {
    Active: ['#DCFCE7', '#15803D'],
    Expired: ['#FEE2E2', '#991B1B'],
    Pending: ['#FEF3C7', '#92400E'],
    Rejected: ['#FEE2E2', '#991B1B']
  };
  var c = map[status] || ['#F3F4F6', '#6B7280'];
  return chipHtml(status, c[0], c[1]);
}

function fileTypeChip(fileType) {
  var map = {
    PDF: ['#FEF2F2', '#DC2626'], Document: ['#EFF6FF', '#2563EB'],
    Spreadsheet: ['#ECFDF5', '#059669'], Image: ['#F5F3FF', '#7C3AED'],
    Video: ['#FDF2F8', '#DB2777'], Presentation: ['#ECFEFF', '#0891B2'],
    Other: ['#F3F4F6', '#6B7280']
  };
  var c = map[fileType] || map.Other;
  return chipHtml(fileType, c[0], c[1]);
}

function linkHtml(doctype, name, display) {
  if (!name) return '<span style="color:#9CA3AF;">—</span>';
  var slug = doctype.toLowerCase().replace(/ /g, "-");
  return '<a href="/app/' + slug + '/' + encodeURIComponent(name) +
    '" style="color:#2563EB;text-decoration:none;font-weight:500;font-size:13.5px;">' +
    esc(display || name) + '</a>';
}

function detailRow(label, valueHtml) {
  var v = valueHtml || '<span style="color:#D1D5DB;">—</span>';
  return '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #F3F4F6;">' +
    '<span style="font-size:12.5px;color:#6B7280;font-weight:500;min-width:140px;">' + esc(label) + '</span>' +
    '<span style="font-size:13.5px;color:#111827;text-align:right;flex:1;">' + v + '</span>' +
    '</div>';
}

function sectionCard(title, contentHtml, opts) {
  opts = opts || {};
  var icon = opts.icon || '';
  var headerBorder = opts.noBorder ? '' : 'border-bottom:1px solid #F3F4F6;';
  return '<div class="dr-section-card" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:16px;overflow:hidden;">' +
    '<div style="padding:14px 20px;' + headerBorder + 'display:flex;align-items:center;gap:8px;">' +
    (icon ? '<span style="display:flex;align-items:center;">' + icon + '</span>' : '') +
    '<span style="font-size:13.5px;font-weight:600;color:#374151;">' + esc(title) + '</span>' +
    '</div>' +
    '<div style="padding:4px 20px 12px 20px;">' + contentHtml + '</div>' +
    '</div>';
}


function renderDocRegistryContent(frm) {
  var doc = frm.doc;
  var html = '<div style="max-width:860px;margin:0 auto;padding:0 4px;">';

  // ── Hero: File Identity Banner ──
  var isImage = doc.file_type === 'Image';
  var previewBg = fileIconBg(doc.file_type);

  html += '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;margin-bottom:20px;">';

  // Image preview or icon
  if (isImage && doc.file_url) {
    html += '<div style="background:#FAFAFA;text-align:center;padding:24px;border-bottom:1px solid #F3F4F6;">' +
      '<img src="' + esc(doc.file_url) + '" style="max-width:100%;max-height:320px;border-radius:8px;object-fit:contain;" />' +
      '</div>';
  } else {
    html += '<div style="text-align:center;padding:32px 24px 20px 24px;background:' + previewBg + ';">' +
      '<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.08);">' +
      fileIcon(doc.file_type || 'Other') +
      '</div>' +
      '</div>';
  }

  // File name + meta line
  html += '<div style="padding:20px 24px;">';
  html += '<div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:8px;line-height:1.35;word-break:break-word;">' +
    esc(doc.file_name || '—') + '</div>';

  // Chips row: file type + category + compliance
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:12px;">';
  html += fileTypeChip(doc.file_type);
  if (doc.source_category) {
    html += chipHtml(doc.source_category, '#EDE9FE', '#6D28D9');
  }
  if (doc.compliance_status && doc.compliance_status !== 'NA') {
    html += complianceChip(doc.compliance_status);
  }
  if (doc.is_private) {
    html += chipHtml('Private', '#FEF3C7', '#92400E');
  }
  html += '</div>';

  // Meta line: extension, size, date, uploader
  var metaParts = [];
  if (doc.file_extension) metaParts.push(esc(doc.file_extension.toUpperCase()));
  if (doc.file_size_display) metaParts.push(esc(doc.file_size_display));
  if (doc.upload_date) metaParts.push('Uploaded ' + esc(doc.upload_date));
  if (doc.uploaded_by_name) metaParts.push('by ' + esc(doc.uploaded_by_name));
  if (metaParts.length) {
    html += '<div style="font-size:12.5px;color:#9CA3AF;line-height:1.5;">' + metaParts.join(' &middot; ') + '</div>';
  }

  // Download button
  if (doc.file_url) {
    html += '<div style="margin-top:16px;">' +
      '<a href="' + esc(doc.file_url) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;' +
      'background:#EFF6FF;color:#2563EB;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;' +
      'border:1px solid #BFDBFE;transition:background 0.15s;">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      'Download File</a></div>';
  }

  html += '</div></div>';  // close file identity banner


  // ── Source & Origin ──
  var sourceRows = '';
  sourceRows += detailRow('Source Module', '<span style="font-weight:600;">' + esc(doc.source_doctype) + '</span>');
  if (doc.source_name) {
    sourceRows += detailRow('Source Record', linkHtml(doc.source_doctype, doc.source_name, doc.source_record_title || doc.source_name));
  }
  if (doc.source_field) {
    sourceRows += detailRow('Source Field / Tab', esc(doc.source_field));
  }
  sourceRows += detailRow('Category', doc.source_category ? chipHtml(doc.source_category, '#EDE9FE', '#6D28D9') : null);

  var sourceIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  html += sectionCard('Source', sourceRows, { icon: sourceIcon });


  // ── Context ──
  var hasContext = doc.partner || doc.project || doc.donor || doc.programme;
  if (hasContext) {
    var ctxRows = '';
    if (doc.partner) {
      ctxRows += detailRow('Partner / NGO', linkHtml('NGO', doc.partner, doc.partner_name || doc.partner));
    }
    if (doc.project) {
      ctxRows += detailRow('Project', linkHtml('Project', doc.project, doc.project_title || doc.project));
    }
    if (doc.donor) {
      ctxRows += detailRow('Donor', linkHtml('Donor', doc.donor, doc.donor));
    }
    if (doc.programme) {
      ctxRows += detailRow('Programme', linkHtml('Programme', doc.programme, doc.programme));
    }

    var ctxIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
    html += sectionCard('Context', ctxRows, { icon: ctxIcon });
  }


  // ── Compliance (only if there's meaningful compliance data) ──
  var hasCompliance = doc.compliance_status && doc.compliance_status !== 'NA';
  var hasComplianceDetails = doc.document_number || doc.issuance_date || doc.expiry_date || hasCompliance;
  if (hasComplianceDetails) {
    var compRows = '';
    compRows += detailRow('Status', complianceChip(doc.compliance_status));
    if (doc.document_number) {
      compRows += detailRow('Document Number', '<span style="font-family:\'SF Mono\',SFMono-Regular,Menlo,monospace;font-size:12.5px;">' + esc(doc.document_number) + '</span>');
    }
    if (doc.issuance_date) {
      compRows += detailRow('Issued', esc(doc.issuance_date));
    }
    if (doc.expiry_date) {
      compRows += detailRow('Expires', esc(doc.expiry_date));
    }

    var compIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    html += sectionCard('Compliance', compRows, { icon: compIcon });
  }


  // ── Metadata (collapsed by default — always show, lighter treatment) ──
  var metaRows = '';
  metaRows += detailRow('Uploaded By', esc(doc.uploaded_by_name || doc.uploaded_by));
  metaRows += detailRow('Upload Date', esc(doc.upload_date));
  metaRows += detailRow('Private', doc.is_private ? 'Yes' : 'No');
  metaRows += detailRow('Frappe File ID', doc.frappe_file
    ? '<span style="font-family:\'SF Mono\',SFMono-Regular,Menlo,monospace;font-size:12px;color:#6B7280;">' + esc(doc.frappe_file) + '</span>'
    : null);
  metaRows += detailRow('Registry ID', '<span style="font-family:\'SF Mono\',SFMono-Regular,Menlo,monospace;font-size:12px;color:#6B7280;">' + esc(doc.name) + '</span>');

  var metaIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  html += sectionCard('Metadata', metaRows, { icon: metaIcon });


  html += '</div>';  // close max-width wrapper
  return html;
}

function renderDocRegistryCSS() {
  return '' +
    '.dr-section-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }' +
    '.dr-section-card { transition: box-shadow 0.15s ease; }' +
    '.rv-overlay { background: #F9FAFB; padding: 20px 0; min-height: 400px; }' +
    '.rv-overlay a:hover { text-decoration: underline !important; }';
}


// ═══════════════════════════════════════════════════════════════════
// FORM EVENT: Wire it all up
// ═══════════════════════════════════════════════════════════════════

frappe.ui.form.on("Document Registry", {
  refresh: function (frm) {
    if (frm.is_new()) return;

    // Disable save — read-only index
    frm.disable_save();

    // Apply overlay after a short delay to ensure tabs are rendered
    setTimeout(function () {
      buildReadViewOverlay(frm, {
        tabFieldname: 'details_tab',
        editLabel: 'Edit Fields',
        backLabel: 'Back to Repository',
        backUrl: '/app/document-repository',
        editColor: '#2563EB',

        renderContent: renderDocRegistryContent,
        renderCSS: renderDocRegistryCSS,

        onEdit: function (frm) {
          // When switching to edit mode, add a helper button to go back to read view
          frm.add_custom_button(__("Read View"), function () {
            frm.refresh();
          });
        }
      });
    }, 100);

    // Custom action buttons on the form header
    if (frm.doc.source_doctype && frm.doc.source_name) {
      frm.add_custom_button(
        __("Go to Source"),
        function () {
          frappe.set_route("Form", frm.doc.source_doctype, frm.doc.source_name);
        },
        null,
        "primary"
      );
    }
  },
});


// ═══════════════════════════════════════════════════════════════════
// LIST VIEW SETTINGS
// ═══════════════════════════════════════════════════════════════════

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
