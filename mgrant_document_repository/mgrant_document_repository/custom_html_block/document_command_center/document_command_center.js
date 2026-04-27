(function() {
  'use strict';

  // ── Shadow DOM helpers ──
  function _q(sel)    { return root_element.querySelector(sel); }
  function _qAll(sel) { return root_element.querySelectorAll(sel); }
  function _el(id)    { return root_element.querySelector('#' + id); }

  // ══════════════════════════════════════════════════════════════
  //  PATTERNS from mgrant-frappe-patterns (inlined for CHB)
  // ══════════════════════════════════════════════════════════════

  // ── Fuzzy Search (trigram-based) ──
  function trigrams(str) {
    var t = {};
    var s = '  ' + str.toLowerCase().replace(/\s+/g, ' ').trim() + '  ';
    for (var i = 0; i < s.length - 2; i++) { t[s.substr(i, 3)] = true; }
    return t;
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    var tA = trigrams(a), tB = trigrams(b);
    var shared = 0, total = 0;
    for (var k in tA) { total++; if (tB[k]) shared++; }
    for (var k in tB) { if (!tA[k]) total++; }
    return total ? shared / total : 0;
  }
  function fuzzyMatchFields(word, fieldValues, threshold) {
    if (threshold === undefined) threshold = 0.3;
    return fieldValues.some(function(val) {
      if (!val) return false;
      return val.toLowerCase().split(/\s+/).some(function(part) {
        return similarity(word, part) > threshold;
      });
    });
  }
  function fuzzyFilterRecords(records, searchText, getFields, options) {
    if (!searchText || !searchText.trim()) return records;
    var opts = options || {};
    var threshold = opts.threshold !== undefined ? opts.threshold : 0.3;
    var words = searchText.toLowerCase().trim().split(/\s+/);
    return records.filter(function(record) {
      var fv = getFields(record);
      var hay = fv.filter(Boolean).join(' ').toLowerCase();
      return words.every(function(word) {
        if (hay.indexOf(word) !== -1) return true;
        return fuzzyMatchFields(word, fv.filter(Boolean), threshold);
      });
    });
  }

  // ── Shadow DOM Keyboard Fix ──
  function fixShadowDomKeyboard(inputEl, options) {
    if (!inputEl) return;
    var opts = options || {};
    ['keydown', 'keypress', 'keyup'].forEach(function(evt) {
      inputEl.addEventListener(evt, function(e) {
        e.stopPropagation();
        if (opts.onEnter && e.type === 'keydown' && (e.key === 'Enter' || e.keyCode === 13)) {
          e.preventDefault();
          opts.onEnter(e);
        }
      });
    });
  }

  // ── JSZip Bulk Download ──
  function loadJSZip() {
    return new Promise(function(resolve, reject) {
      if (window.JSZip) { resolve(window.JSZip); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      s.onload = function() { resolve(window.JSZip); };
      s.onerror = function() { reject(new Error('Failed to load JSZip')); };
      document.head.appendChild(s);
    });
  }
  function uniqueFileName(name, usedNames) {
    if (!usedNames[name]) { usedNames[name] = 1; return name; }
    usedNames[name]++;
    var ext = name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '';
    var base = ext ? name.slice(0, name.lastIndexOf('.')) : name;
    return base + ' (' + usedNames[name] + ')' + ext;
  }
  function bulkDownloadZip(files, options) {
    var opts = options || {};
    if (!files || !files.length) { if (opts.onError) opts.onError(new Error('No files')); return Promise.resolve(); }
    return loadJSZip().then(function(JSZip) {
      var zip = new JSZip(), fetched = 0, errors = 0, total = files.length, usedNames = {};
      return new Promise(function(resolve) {
        function done() {
          if (fetched + errors < total) return;
          if (!fetched) { if (opts.onError) opts.onError(new Error('No files fetched')); resolve(); return; }
          zip.generateAsync({ type: 'blob' }).then(function(content) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            a.download = opts.zipName || 'Documents_' + new Date().toISOString().slice(0,10) + '.zip';
            a.click(); URL.revokeObjectURL(a.href);
            if (opts.onComplete) opts.onComplete({ fetched: fetched, errors: errors, total: total });
            resolve();
          });
        }
        files.forEach(function(f) {
          if (!f.file_url) { errors++; done(); return; }
          var url = f.file_url.charAt(0) === '/' ? window.location.origin + f.file_url : f.file_url;
          fetch(url, { credentials: 'include' }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
          }).then(function(blob) {
            zip.file(uniqueFileName(f.file_name || 'file', usedNames), blob);
            fetched++;
            if (opts.onProgress) opts.onProgress(fetched, errors, total);
            done();
          }).catch(function() { errors++; done(); });
        });
      });
    }).catch(function(err) { if (opts.onError) opts.onError(err); });
  }

  // ── XLSX Export ──
  function loadXlsxLib() {
    return new Promise(function(resolve, reject) {
      if (window.XLSX && window.XLSX.utils && window.XLSX.utils.aoa_to_sheet) { resolve(); return; }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error('Failed to load XLSX lib')); };
      document.head.appendChild(s);
    });
  }
  function sc(value, opts) {
    opts = opts || {};
    var cell = { v: value, t: typeof value === 'number' ? 'n' : 's' };
    var s = {};
    s.font = opts.font || { name: 'Arial', sz: 11 };
    if (opts.fill) s.fill = { fgColor: { rgb: opts.fill } };
    s.alignment = opts.alignment || { vertical: 'center' };
    if (opts.border !== false) {
      var thin = { style: 'thin', color: { rgb: '000000' } };
      s.border = opts.border || { top: thin, bottom: thin, left: thin, right: thin };
    }
    if (opts.numFmt) { s.numFmt = opts.numFmt; cell.z = opts.numFmt; }
    cell.s = s; return cell;
  }
  function autoWidth(ws, data) {
    if (!data || !data.length) return;
    var colCount = 0;
    data.forEach(function(row) { if (row.length > colCount) colCount = row.length; });
    var widths = [];
    for (var c = 0; c < colCount; c++) {
      var maxLen = 8;
      data.forEach(function(row) {
        if (row[c]) { var val = row[c].v !== undefined ? String(row[c].v) : String(row[c]); if (val.length > maxLen) maxLen = val.length; }
      });
      widths.push({ wch: Math.min(maxLen + 2, 40) });
    }
    ws['!cols'] = widths;
  }

  // ── Indian Number Formatting ──
  function formatIN(n) { return new Intl.NumberFormat('en-IN').format(n); }

  // ══════════════════════════════════════════════════════════════
  //  CONFIGURATION
  // ══════════════════════════════════════════════════════════════

  // DD document fields from NGO Due Diligence DocType
  // Each: { field, label, mandatory, expiryField }
  // expiryField maps to the date_of_expiry column for that document
  var DD_DOC_FIELDS = [
    { field: 'pan',                       label: 'PAN',                   mandatory: true,  expiryField: 'date_of_expiry' },
    { field: 'g80_certificate',           label: '80G Certificate',       mandatory: true,  expiryField: 'g80_date_of_expiry' },
    { field: 'a12_certificate',           label: '12A Certificate',       mandatory: true,  expiryField: 'a12_date_of_expiry' },
    { field: 'csr_1_form',               label: 'CSR-1 Form',            mandatory: true,  expiryField: 'csr_date_of_expiry' },
    { field: 'trust_deed',               label: 'Trust Deed / MoA',      mandatory: true,  expiryField: 'trust_deed_date_of_expiry' },
    { field: 'fcra',                      label: 'FCRA',                  mandatory: false, expiryField: 'fcra_date_of_expiry' },
    { field: 'gst',                       label: 'GST Certificate',       mandatory: false, expiryField: 'gst_date_of_expiry' },
    { field: 'yrs_balance_sheet',         label: 'Balance Sheet (3yr)',   mandatory: true,  expiryField: 'balance_sheet_date_of_expiry' },
    { field: 'yrs_annual_report',         label: 'Annual Report (3yr)',   mandatory: true,  expiryField: 'annual_report_date_of_expiry' },
    { field: 'code_of_conduct_attachment',label: 'Code of Conduct',       mandatory: false, expiryField: null }
  ];

  var EXPIRY_WINDOW_DAYS = 60; // warn if expiring within this many days

  var MANDATORY_COUNT = DD_DOC_FIELDS.filter(function(d) { return d.mandatory; }).length;

  // ══════════════════════════════════════════════════════════════
  //  STATE
  // ══════════════════════════════════════════════════════════════

  var STATE = {
    allNGOs: [],         // raw NGO Due Diligence records
    ngoGrants: {},       // ngo_name → [grant records]
    ngoGrantDocs: {},    // ngo_name → { grantId: [doc_registry records] }
    filteredNGOs: [],
    expandedNgo: null,
    thematicAreas: []
  };

  // ══════════════════════════════════════════════════════════════
  //  DATA LOADING
  // ══════════════════════════════════════════════════════════════

  function apiCall(method, args) {
    return new Promise(function(resolve, reject) {
      frappe.call({
        method: method,
        args: args,
        async: true,
        callback: function(r) { resolve(r.message || r); },
        error: function(e) { reject(e); }
      });
    });
  }

  function loadData() {
    return Promise.all([
      // 1. All NGO Due Diligence records (field is "ngo", not "ngo_partner")
      apiCall('frappe.client.get_list', {
        doctype: 'NGO Due Diligence',
        fields: ['name', 'ngo', 'ngo_name', 'status', 'due_diligence_validation']
          .concat(DD_DOC_FIELDS.map(function(d) { return d.field; }))
          .concat(DD_DOC_FIELDS.filter(function(d) { return d.expiryField; }).map(function(d) { return d.expiryField; })),
        limit_page_length: 0
      }),
      // 2. All Grants (field is "ngo", not "ngo_partner")
      apiCall('frappe.client.get_list', {
        doctype: 'Grant',
        fields: ['name', 'ngo', 'grant_name', 'grant_status'],
        filters: { docstatus: ['!=', 2] },
        limit_page_length: 0
      }),
      // 3. All Document Registry records (for grant-wise docs in expand)
      apiCall('frappe.client.get_list', {
        doctype: 'Document Registry',
        fields: ['name', 'file_name', 'file_url', 'source_doctype', 'source_name',
                 'source_record_title', 'source_category', 'partner', 'partner_name',
                 'compliance_status', 'expiry_date', 'upload_date'],
        limit_page_length: 0
      }),
      // 4. Thematic areas (from custom_project_theme or Programme)
      apiCall('frappe.client.get_list', {
        doctype: 'Programme',
        fields: ['name'],
        limit_page_length: 0
      }).catch(function() { return []; })
    ]);
  }

  // ══════════════════════════════════════════════════════════════
  //  DATA PROCESSING
  // ══════════════════════════════════════════════════════════════

  function processData(results) {
    var ddRecords = results[0] || [];
    var grants = results[1] || [];
    var docRegistry = results[2] || [];
    var themes = results[3] || [];

    // Build NGO → grants map (field is "ngo" on Grant DocType)
    var ngoGrants = {};
    grants.forEach(function(g) {
      var ngoId = g.ngo;
      if (!ngoId) return;
      if (!ngoGrants[ngoId]) ngoGrants[ngoId] = [];
      ngoGrants[ngoId].push(g);
    });
    STATE.ngoGrants = ngoGrants;

    // Build NGO → grant → docs map from Document Registry
    // Doc Registry uses: source_doctype, source_name, partner (Link to NGO)
    var ngoGrantDocs = {};
    docRegistry.forEach(function(doc) {
      // Docs linked to Grant via source_doctype
      if (doc.source_doctype === 'Grant' && doc.source_name) {
        var gr = grants.find(function(g) { return g.name === doc.source_name; });
        if (gr && gr.ngo) {
          var ngoId = gr.ngo;
          if (!ngoGrantDocs[ngoId]) ngoGrantDocs[ngoId] = {};
          if (!ngoGrantDocs[ngoId][gr.name]) ngoGrantDocs[ngoId][gr.name] = [];
          ngoGrantDocs[ngoId][gr.name].push(doc);
        }
      }
      // Also capture docs linked directly to partner NGO (not via Grant)
      else if (doc.partner && !doc.source_doctype) {
        if (!ngoGrantDocs[doc.partner]) ngoGrantDocs[doc.partner] = {};
        if (!ngoGrantDocs[doc.partner]['_general']) ngoGrantDocs[doc.partner]['_general'] = [];
        ngoGrantDocs[doc.partner]['_general'].push(doc);
      }
    });
    STATE.ngoGrantDocs = ngoGrantDocs;

    // Process DD records — add computed compliance info
    var today = new Date();
    var expiryThreshold = new Date(today.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    STATE.allNGOs = ddRecords.map(function(dd) {
      var mandatoryUploaded = 0;
      var totalUploaded = 0;
      var expiringCount = 0;
      var docStates = {};

      DD_DOC_FIELDS.forEach(function(df) {
        var val = dd[df.field];
        var hasFile = val && val !== '' && val !== 'null';
        if (hasFile) {
          totalUploaded++;
          if (df.mandatory) mandatoryUploaded++;

          // Check expiry date if available
          var expiryVal = df.expiryField ? dd[df.expiryField] : null;
          if (expiryVal) {
            var expiryDate = new Date(expiryVal);
            if (expiryDate <= today) {
              // Already expired — treat as missing for mandatory
              docStates[df.field] = df.mandatory ? 'missing' : 'optional_missing';
              if (df.mandatory) mandatoryUploaded--;
              totalUploaded--;
            } else if (expiryDate <= expiryThreshold) {
              docStates[df.field] = 'expiring';
              expiringCount++;
            } else {
              docStates[df.field] = 'ok';
            }
          } else {
            docStates[df.field] = 'ok';
          }
        } else {
          docStates[df.field] = df.mandatory ? 'missing' : 'optional_missing';
        }
      });

      var score = MANDATORY_COUNT > 0 ? Math.round((mandatoryUploaded / MANDATORY_COUNT) * 100) : 0;
      // Use dd.ngo (Link field to NGO DocType)
      var ngoId = dd.ngo || '';
      var ngoLabel = dd.ngo_name || ngoId || dd.name;
      var grantCount = (ngoGrants[ngoId] || []).length;

      return {
        name: dd.name,
        ngo: ngoId,
        ngo_label: ngoLabel,
        score: score,
        mandatoryUploaded: mandatoryUploaded,
        mandatoryTotal: MANDATORY_COUNT,
        totalUploaded: totalUploaded,
        expiringCount: expiringCount,
        docStates: docStates,
        grantCount: grantCount,
        raw: dd
      };
    });

    // Sort by score ascending (worst compliance first)
    STATE.allNGOs.sort(function(a, b) { return a.score - b.score; });

    // Thematic areas
    STATE.thematicAreas = themes.map(function(t) { return t.name; }).sort();

    STATE.filteredNGOs = STATE.allNGOs.slice();
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDERING
  // ══════════════════════════════════════════════════════════════

  function renderKPIs() {
    var ngos = STATE.filteredNGOs;
    var total = ngos.length;
    var fullyCompliant = ngos.filter(function(n) { return n.score === 100; }).length;
    var complianceRate = total > 0 ? Math.round((fullyCompliant / total) * 100) : 0;
    var expiring = 0;
    var missingMandatory = 0;
    ngos.forEach(function(n) { expiring += n.expiringCount; });
    ngos.forEach(function(n) {
      missingMandatory += (n.mandatoryTotal - n.mandatoryUploaded);
    });

    _el('kpi-total-ngos').textContent = formatIN(total);
    _el('kpi-total-ngos').title = total + ' NGO partners';
    _el('kpi-compliance-rate').textContent = complianceRate + '%';
    _el('kpi-compliance-rate').title = fullyCompliant + ' of ' + total + ' fully compliant';
    _el('kpi-expiring').textContent = formatIN(expiring);
    _el('kpi-expiring').title = expiring + ' documents expiring in 60 days';
    _el('kpi-missing').textContent = formatIN(missingMandatory);
    _el('kpi-missing').title = missingMandatory + ' mandatory documents missing across all NGOs';
  }

  function renderMatrix() {
    var ngos = STATE.filteredNGOs;
    var thead = _el('ngo-matrix-head');
    var tbody = _el('ngo-matrix-body');

    // ── Header ──
    var hRow = '<tr>';
    hRow += '<th class="stf-frozen stf-frozen-last" style="width:240px; text-align:left;">NGO Partner</th>';
    hRow += '<th style="width:80px;">Score</th>';
    DD_DOC_FIELDS.forEach(function(df) {
      var star = df.mandatory ? ' ★' : '';
      hRow += '<th style="width:110px;" title="' + df.label + (df.mandatory ? ' (Mandatory)' : ' (Optional)') + '">'
            + df.label + star + '</th>';
    });
    hRow += '</tr>';
    thead.innerHTML = hRow;

    // ── Empty state check ──
    if (ngos.length === 0) {
      tbody.innerHTML = '';
      _el('ngo-empty').style.display = 'flex';
      _el('ngo-table-footer').style.display = 'none';
      return;
    }

    _el('ngo-empty').style.display = 'none';
    _el('ngo-table-footer').style.display = 'block';
    _el('ngo-showing').textContent = 'Showing ' + formatIN(ngos.length) + ' of ' + formatIN(STATE.allNGOs.length) + ' NGO partners';

    // ── Body rows ──
    var html = '';
    ngos.forEach(function(ngo, idx) {
      var rowId = 'ngo-row-' + idx;
      var isExpanded = STATE.expandedNgo === ngo.name;

      // Main row
      html += '<tr id="' + rowId + '">';
      html += '<td class="stf-frozen stf-frozen-last ngo-name-cell" data-ngo-idx="' + idx + '">'
            + '<span class="expand-arrow' + (isExpanded ? ' open' : '') + '">&#9654;</span>'
            + escHtml(ngo.ngo_label)
            + (ngo.grantCount > 0 ? ' <span style="font-size:11px;color:#6B7280;">(' + ngo.grantCount + ' grant' + (ngo.grantCount > 1 ? 's' : '') + ')</span>' : '')
            + '</td>';

      // Score chip
      var scoreClass = ngo.score === 100 ? 'score-full' : (ngo.score >= 60 ? 'score-partial' : 'score-critical');
      html += '<td><span class="score-chip ' + scoreClass + '">' + ngo.score + '%</span></td>';

      // Document cells
      DD_DOC_FIELDS.forEach(function(df) {
        var state = ngo.docStates[df.field];
        var fileUrl = ngo.raw[df.field];
        var cellClass, cellText, clickAttr = '';

        if (state === 'ok') {
          cellClass = 'c-ok';
          cellText = '✓';
          clickAttr = ' data-action="view-doc" data-field="' + df.field + '" data-ngo-idx="' + idx + '"';
        } else if (state === 'expiring') {
          cellClass = 'c-exp';
          cellText = '⚠';
          clickAttr = ' data-action="view-doc" data-field="' + df.field + '" data-ngo-idx="' + idx + '"';
        } else if (state === 'pending') {
          cellClass = 'c-pending';
          cellText = '⏳';
        } else if (state === 'missing') {
          cellClass = 'c-miss';
          cellText = '✗';
        } else {
          cellClass = 'c-opt';
          cellText = '—';
        }

        html += '<td class="' + cellClass + '"' + clickAttr + '>' + cellText + '</td>';
      });

      html += '</tr>';

      // Expand row (if expanded)
      if (isExpanded) {
        html += buildExpandRow(ngo, DD_DOC_FIELDS.length + 2);
      }
    });

    tbody.innerHTML = html;

    // Bind click events
    bindMatrixEvents();
  }

  function buildExpandRow(ngo, colSpan) {
    var html = '<tr class="expand-row"><td colspan="' + colSpan + '">';
    html += '<div class="expand-content">';

    // Section 1: Due Diligence Documents
    html += '<div class="expand-section-title">Due Diligence Documents</div>';
    html += '<div class="expand-doc-grid">';
    DD_DOC_FIELDS.forEach(function(df) {
      var state = ngo.docStates[df.field];
      var cardClass = 'expand-doc-card';
      var icon = '', statusText = '', clickAttr = '';

      if (state === 'ok') {
        cardClass += ' uploaded';
        icon = '<span class="expand-doc-icon" style="color:#16A34A;">✓</span>';
        statusText = '<span class="expand-doc-status" style="color:#16A34A;">Uploaded</span>';
        clickAttr = ' data-action="view-doc" data-field="' + df.field + '" data-ngo-name="' + escAttr(ngo.name) + '"';
      } else if (state === 'expiring') {
        cardClass += ' expiring';
        icon = '<span class="expand-doc-icon" style="color:#D97706;">⚠</span>';
        statusText = '<span class="expand-doc-status" style="color:#D97706;">Expiring</span>';
        clickAttr = ' data-action="view-doc" data-field="' + df.field + '" data-ngo-name="' + escAttr(ngo.name) + '"';
      } else if (state === 'missing') {
        cardClass += ' missing';
        icon = '<span class="expand-doc-icon">✗</span>';
        statusText = '<span class="expand-doc-status" style="color:#EF4444;">Missing ★</span>';
      } else {
        cardClass += ' optional-missing';
        icon = '<span class="expand-doc-icon">—</span>';
        statusText = '<span class="expand-doc-status">Optional</span>';
      }

      html += '<div class="' + cardClass + '"' + clickAttr + '>'
            + icon
            + '<span class="expand-doc-label">' + df.label + '</span>'
            + statusText
            + '</div>';
    });
    html += '</div>';

    // Section 2: Grant-wise Documents (if NGO has grants)
    var grants = STATE.ngoGrants[ngo.ngo] || [];
    if (grants.length > 0) {
      grants.forEach(function(grant) {
        var grantLabel = grant.grant_name || grant.name;
        html += '<div class="expand-section-title">'
              + 'Grant Documents <span class="grant-badge">' + escHtml(grantLabel) + '</span>'
              + '</div>';

        var grantDocs = (STATE.ngoGrantDocs[ngo.ngo] || {})[grant.name] || [];
        if (grantDocs.length > 0) {
          html += '<div class="expand-doc-grid">';
          grantDocs.forEach(function(doc) {
            html += '<div class="expand-doc-card uploaded" data-action="view-grant-doc" data-doc-name="' + escAttr(doc.name) + '">'
                  + '<span class="expand-doc-icon" style="color:#16A34A;">✓</span>'
                  + '<span class="expand-doc-label">' + escHtml(doc.file_name || doc.source_record_title || doc.name) + '</span>'
                  + '<span class="expand-doc-status" style="color:#16A34A;">View</span>'
                  + '</div>';
          });
          html += '</div>';
        } else {
          html += '<div style="font-size:13px;color:#9CA3AF;padding:8px 0;">No documents uploaded for this grant yet</div>';
        }
      });
    }

    // Actions: Download All as ZIP
    var allFiles = collectNgoFiles(ngo);
    if (allFiles.length > 0) {
      html += '<div class="expand-actions">';
      html += '<button class="btn-primary" data-action="zip-ngo" data-ngo-name="' + escAttr(ngo.ngo_label) + '">Download All as ZIP (' + allFiles.length + ' files)</button>';
      html += '</div>';
    }

    html += '</div></td></tr>';
    return html;
  }

  function collectNgoFiles(ngo) {
    var files = [];
    // DD docs
    DD_DOC_FIELDS.forEach(function(df) {
      var val = ngo.raw[df.field];
      if (val && val !== '' && val !== 'null') {
        files.push({ file_name: df.label + getExt(val), file_url: val });
      }
    });
    // Grant docs
    var grants = STATE.ngoGrants[ngo.ngo] || [];
    grants.forEach(function(grant) {
      var gDocs = (STATE.ngoGrantDocs[ngo.ngo] || {})[grant.name] || [];
      gDocs.forEach(function(doc) {
        if (doc.file_url) {
          files.push({ file_name: doc.file_name || doc.name, file_url: doc.file_url });
        }
      });
    });
    return files;
  }

  function getExt(url) {
    if (!url) return '';
    var m = url.match(/(\.[a-zA-Z0-9]+)(\?|$)/);
    return m ? m[1] : '';
  }

  // ══════════════════════════════════════════════════════════════
  //  EVENT HANDLING
  // ══════════════════════════════════════════════════════════════

  function bindMatrixEvents() {
    // NGO name click → toggle expand
    _qAll('.ngo-name-cell').forEach(function(cell) {
      cell.addEventListener('click', function() {
        var idx = parseInt(cell.getAttribute('data-ngo-idx'));
        var ngo = STATE.filteredNGOs[idx];
        if (!ngo) return;
        if (STATE.expandedNgo === ngo.name) {
          STATE.expandedNgo = null;
        } else {
          STATE.expandedNgo = ngo.name;
        }
        renderMatrix();
      });
    });

    // Document cell click → slideout
    _qAll('[data-action="view-doc"]').forEach(function(cell) {
      cell.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(cell.getAttribute('data-ngo-idx'));
        var field = cell.getAttribute('data-field');
        var ngoName = cell.getAttribute('data-ngo-name');

        var ngo;
        if (idx >= 0 && !isNaN(idx)) {
          ngo = STATE.filteredNGOs[idx];
        } else if (ngoName) {
          ngo = STATE.allNGOs.find(function(n) { return n.name === ngoName; });
        }
        if (!ngo || !field) return;

        var df = DD_DOC_FIELDS.find(function(d) { return d.field === field; });
        if (!df) return;
        var fileUrl = ngo.raw[field];
        if (!fileUrl) return;

        openSlideout(df.label, fileUrl, ngo.ngo_label, 'NGO Due Diligence', ngo.name);
      });
    });

    // Grant doc click → slideout
    _qAll('[data-action="view-grant-doc"]').forEach(function(card) {
      card.addEventListener('click', function(e) {
        e.stopPropagation();
        var docName = card.getAttribute('data-doc-name');
        var doc = (STATE.allNGOs.length > 0) ? findDocRegistryByName(docName) : null;
        if (doc) {
          openSlideout(doc.file_name || doc.source_record_title || doc.name, doc.file_url, doc.source_name || doc.partner_name || '', doc.source_doctype || 'Document Registry', doc.name);
        }
      });
    });

    // ZIP download buttons
    _qAll('[data-action="zip-ngo"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var ngoName = btn.getAttribute('data-ngo-name');
        var ngo = STATE.allNGOs.find(function(n) { return n.ngo_label === ngoName; });
        if (!ngo) return;
        var files = collectNgoFiles(ngo);
        var origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparing ZIP...';

        // Audit log each file
        files.forEach(function(f) {
          logDownload(ngoName, f.file_name, 'ZIP bulk download');
        });

        bulkDownloadZip(files, {
          zipName: ngoName.replace(/[^a-zA-Z0-9]/g, '_') + '_Documents.zip',
          onProgress: function(fetched, errors, total) {
            btn.textContent = 'Zipping ' + fetched + '/' + total + '...';
          },
          onComplete: function(result) {
            btn.textContent = origText;
            btn.disabled = false;
            frappe.show_alert({
              message: result.fetched + ' files downloaded as ZIP',
              indicator: result.errors > 0 ? 'orange' : 'green'
            });
          },
          onError: function(err) {
            btn.textContent = origText;
            btn.disabled = false;
            frappe.show_alert({ message: 'ZIP download failed: ' + err.message, indicator: 'red' });
          }
        });
      });
    });
  }

  function findDocRegistryByName(name) {
    // Search through grant docs in state
    for (var ngo in STATE.ngoGrantDocs) {
      for (var grant in STATE.ngoGrantDocs[ngo]) {
        var docs = STATE.ngoGrantDocs[ngo][grant];
        var found = docs.find(function(d) { return d.name === name; });
        if (found) return found;
      }
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════
  //  SLIDEOUT
  // ══════════════════════════════════════════════════════════════

  function openSlideout(docLabel, fileUrl, entityName, entityDoctype, entityId) {
    var overlay = _el('dcc-slideout');
    var title = _el('slideout-title');
    var body = _el('slideout-body');

    title.textContent = docLabel;

    var fileName = fileUrl ? fileUrl.split('/').pop().split('?')[0] : 'Unknown';
    var fullUrl = fileUrl && fileUrl.charAt(0) === '/' ? window.location.origin + fileUrl : fileUrl;

    body.innerHTML = '<div class="slideout-doc-name">' + escHtml(fileName) + '</div>'
      + '<div class="slideout-doc-meta">Entity: ' + escHtml(entityName) + '</div>'
      + '<div class="slideout-actions">'
      + '<button class="slideout-btn" id="slideout-preview">'
      + '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" fill="#6B7280"/></svg>'
      + '<div><div class="slideout-btn-label">Preview</div><div class="slideout-btn-sub">Open in new tab</div></div>'
      + '</button>'
      + '<button class="slideout-btn" id="slideout-download">'
      + '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 14v3h14v-3M10 3v10m0 0l-4-4m4 4l4-4" stroke="#6B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<div><div class="slideout-btn-label">Download</div><div class="slideout-btn-sub">' + escHtml(fileName) + '</div></div>'
      + '</button>'
      + '<button class="slideout-btn" id="slideout-goto">'
      + '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M11 3h6v6M17 3L7 13M15 11v6H3V5h6" stroke="#6B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '<div><div class="slideout-btn-label">Go to Source</div><div class="slideout-btn-sub">' + escHtml(entityDoctype) + ': ' + escHtml(entityId) + '</div></div>'
      + '</button>'
      + '</div>';

    overlay.style.display = 'block';

    // Bind slideout actions
    _el('slideout-preview').onclick = function() {
      logDownload(entityName, docLabel, 'Preview');
      window.open(fullUrl, '_blank');
    };
    _el('slideout-download').onclick = function() {
      logDownload(entityName, docLabel, 'Download');
      var a = document.createElement('a');
      a.href = fullUrl;
      a.download = fileName;
      a.click();
    };
    _el('slideout-goto').onclick = function() {
      if (entityDoctype && entityId) {
        window.open('/app/' + entityDoctype.toLowerCase().replace(/ /g, '-') + '/' + entityId, '_blank');
      }
    };
  }

  function closeSlideout() {
    _el('dcc-slideout').style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════
  //  AUDIT LOG (NFR-1)
  // ══════════════════════════════════════════════════════════════

  function logDownload(entityName, docLabel, actionType) {
    try {
      frappe.call({
        method: 'frappe.client.insert',
        args: {
          doc: {
            doctype: 'Activity Log',
            subject: 'Document downloaded: ' + docLabel,
            content: JSON.stringify({
              action: actionType || 'Download',
              document: docLabel,
              entity: entityName,
              source: 'Document Command Center',
              timestamp: new Date().toISOString()
            }),
            reference_doctype: 'Document Registry',
            reference_name: '',
            user: frappe.session.user
          }
        },
        async: true
      });
    } catch(e) {
      console.warn('Audit log failed:', e);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  FILTERS
  // ══════════════════════════════════════════════════════════════

  function applyFilters() {
    var search = (_el('ngo-search').value || '').trim();
    var theme = _el('ngo-filter-theme').value;
    var compliance = _el('ngo-filter-compliance').value;

    var filtered = STATE.allNGOs.slice();

    // Fuzzy search
    if (search) {
      filtered = fuzzyFilterRecords(filtered, search, function(ngo) {
        return [ngo.ngo_label || '', ngo.ngo || '', ngo.name || ''];
      });
    }

    // Compliance filter
    if (compliance === 'full') {
      filtered = filtered.filter(function(n) { return n.score === 100; });
    } else if (compliance === 'partial') {
      filtered = filtered.filter(function(n) { return n.score >= 50 && n.score < 100; });
    } else if (compliance === 'critical') {
      filtered = filtered.filter(function(n) { return n.score < 50; });
    }

    // Thematic area — requires grant → thematic area lookup (Phase 2 enhancement)
    // For now, filter placeholder

    STATE.filteredNGOs = filtered;

    // Show/hide reset button
    var activeCount = (search ? 1 : 0) + (theme ? 1 : 0) + (compliance ? 1 : 0);
    var resetBtn = _el('ngo-reset');
    if (activeCount > 0) {
      resetBtn.style.display = 'inline-flex';
      _el('ngo-filter-count').textContent = activeCount;
    } else {
      resetBtn.style.display = 'none';
    }

    renderKPIs();
    renderMatrix();
  }

  function resetFilters() {
    _el('ngo-search').value = '';
    _el('ngo-filter-theme').value = '';
    _el('ngo-filter-compliance').value = '';
    STATE.expandedNgo = null;
    applyFilters();
  }

  // ══════════════════════════════════════════════════════════════
  //  XLSX EXPORT
  // ══════════════════════════════════════════════════════════════

  function exportXlsx() {
    var btn = _el('ngo-export-xlsx');
    btn.disabled = true;
    btn.textContent = 'Exporting...';

    loadXlsxLib().then(function() {
      var data = [];
      // Header row
      var header = [
        sc('NGO Partner', { font: { name: 'Arial', sz: 11, bold: true }, fill: 'E6E6E6' }),
        sc('Score', { font: { name: 'Arial', sz: 11, bold: true }, fill: 'E6E6E6' })
      ];
      DD_DOC_FIELDS.forEach(function(df) {
        header.push(sc(df.label + (df.mandatory ? ' ★' : ''), { font: { name: 'Arial', sz: 11, bold: true }, fill: 'E6E6E6' }));
      });
      data.push(header);

      // Data rows
      STATE.filteredNGOs.forEach(function(ngo) {
        var row = [
          sc(ngo.ngo_label),
          sc(ngo.score, { numFmt: '0"%"' })
        ];
        DD_DOC_FIELDS.forEach(function(df) {
          var state = ngo.docStates[df.field];
          var label = state === 'ok' ? 'Uploaded' : (state === 'expiring' ? 'Expiring' : (state === 'missing' ? 'Missing' : 'N/A'));
          var fill = state === 'ok' ? 'DCFCE7' : (state === 'expiring' ? 'FEF3C7' : (state === 'missing' ? 'FFE4E6' : 'F3F4F6'));
          row.push(sc(label, { fill: fill }));
        });
        data.push(row);
      });

      var ws = XLSX.utils.aoa_to_sheet(data);
      autoWidth(ws, data);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'NGO Compliance');
      XLSX.writeFile(wb, 'NGO_Compliance_Matrix_' + new Date().toISOString().slice(0,10) + '.xlsx');

      btn.textContent = 'Export';
      btn.disabled = false;
      frappe.show_alert({ message: 'Excel exported successfully', indicator: 'green' });
    }).catch(function(err) {
      btn.textContent = 'Export';
      btn.disabled = false;
      frappe.show_alert({ message: 'Export failed: ' + err.message, indicator: 'red' });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  TAB SWITCHING
  // ══════════════════════════════════════════════════════════════

  function setupTabs() {
    _qAll('.tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _qAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        btn.classList.add('active');
        _qAll('.tab-pane').forEach(function(p) { p.style.display = 'none'; });
        var pane = _el('tab-' + btn.getAttribute('data-tab'));
        if (pane) pane.style.display = 'block';
      });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  UTILITIES
  // ══════════════════════════════════════════════════════════════

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) {
    return escHtml(s).replace(/'/g, '&#39;');
  }

  // ══════════════════════════════════════════════════════════════
  //  POPULATE THEMATIC AREA FILTER
  // ══════════════════════════════════════════════════════════════

  function populateThemeFilter() {
    var sel = _el('ngo-filter-theme');
    STATE.thematicAreas.forEach(function(t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════

  function init() {
    loadData().then(function(results) {
      processData(results);

      // Hide skeleton, show main
      _el('dcc-loading').style.display = 'none';
      _el('dcc-main').style.display = 'block';

      // Setup
      setupTabs();
      populateThemeFilter();

      // Keyboard fix on search input
      fixShadowDomKeyboard(_el('ngo-search'), {
        onEnter: function() { applyFilters(); }
      });

      // Bind filters
      _el('ngo-search').addEventListener('input', debounce(applyFilters, 300));
      _el('ngo-filter-theme').addEventListener('change', applyFilters);
      _el('ngo-filter-compliance').addEventListener('change', applyFilters);
      _el('ngo-reset').addEventListener('click', resetFilters);
      _el('ngo-export-xlsx').addEventListener('click', exportXlsx);

      // Slideout close
      _el('slideout-close').addEventListener('click', closeSlideout);
      _el('dcc-slideout').addEventListener('click', function(e) {
        if (e.target === _el('dcc-slideout')) closeSlideout();
      });

      // Initial render
      renderKPIs();
      renderMatrix();
    }).catch(function(err) {
      console.error('Document Command Center load error:', err);
      _el('dcc-loading').innerHTML = '<div style="padding:40px;text-align:center;color:#DC2626;">'
        + '<div style="font-size:16px;font-weight:600;">Failed to load data</div>'
        + '<div style="font-size:13px;color:#6B7280;margin-top:8px;">' + escHtml(String(err)) + '</div>'
        + '<button class="btn-primary" style="margin-top:16px;" onclick="location.reload()">Retry</button>'
        + '</div>';
    });
  }

  function debounce(fn, ms) {
    var timer;
    return function() {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  }

  // Start
  init();

})();
