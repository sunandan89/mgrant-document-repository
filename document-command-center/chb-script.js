(function() {
  'use strict';

  // ── Shadow DOM helpers ──
  function _q(sel)    { return root_element.querySelector(sel); }
  function _qAll(sel) { return root_element.querySelectorAll(sel); }
  function _el(id)    { return root_element.querySelector('#' + id); }

  // ══════════════════════════════════════════════════════════════
  //  PATTERNS (inlined from mgrant-frappe-patterns)
  // ══════════════════════════════════════════════════════════════

  // ── Fuzzy Search ──
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
  function fuzzyFilterRecords(records, searchText, getFields) {
    if (!searchText || !searchText.trim()) return records;
    var words = searchText.toLowerCase().trim().split(/\s+/);
    return records.filter(function(record) {
      var fv = getFields(record);
      var hay = fv.filter(Boolean).join(' ').toLowerCase();
      return words.every(function(word) {
        if (hay.indexOf(word) !== -1) return true;
        return fuzzyMatchFields(word, fv.filter(Boolean), 0.3);
      });
    });
  }

  // ── Keyboard Fix ──
  function fixShadowDomKeyboard(inputEl, options) {
    if (!inputEl) return;
    var opts = options || {};
    ['keydown', 'keypress', 'keyup'].forEach(function(evt) {
      inputEl.addEventListener(evt, function(e) {
        e.stopPropagation();
        if (opts.onEnter && e.type === 'keydown' && (e.key === 'Enter' || e.keyCode === 13)) {
          e.preventDefault(); opts.onEnter(e);
        }
      });
    });
  }

  // ── JSZip ──
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
      if (window.XLSX && window.XLSX.utils) { resolve(); return; }
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

  // ── Utilities ──
  function formatIN(n) { return new Intl.NumberFormat('en-IN').format(n); }
  function formatINR(n) {
    if (!n) return '';
    var num = parseFloat(n);
    if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
    return '₹' + new Intl.NumberFormat('en-IN').format(num);
  }
  function escHtml(s) { return !s ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escAttr(s) { return escHtml(s).replace(/'/g, '&#39;'); }
  function debounce(fn, ms) { var t; return function() { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ══════════════════════════════════════════════════════════════
  //  CONFIGURATION
  // ══════════════════════════════════════════════════════════════

  // Document columns for the compliance matrix
  // Maps source_field values from Document Registry to column labels
  // mandatory = counts towards compliance score
  var DOC_COLUMNS = [
    { key: 'pan',          label: 'PAN',      shortLabel: 'PAN',     mandatory: true,  sourceFields: ['custom_pan', 'pan'] },
    { key: '80g',          label: '80G',      shortLabel: '80G',     mandatory: true,  sourceFields: ['custom_80g', 'g80_certificate'] },
    { key: '12a',          label: '12A',      shortLabel: '12A',     mandatory: true,  sourceFields: ['custom_12a', 'a12_certificate'] },
    { key: 'csr1',         label: 'CSR-1',    shortLabel: 'CSR-1',   mandatory: true,  sourceFields: ['custom_csr_1', 'csr_1_form'] },
    { key: 'trust_deed',   label: 'Trust Deed',shortLabel: 'Trust',  mandatory: true,  sourceFields: ['custom_trust_deed', 'trust_deed', 'custom_society_reg'] },
    { key: 'fcra',         label: 'FCRA',     shortLabel: 'FCRA',    mandatory: true,  sourceFields: ['custom_fcra', 'fcra'] },
    { key: 'gst',          label: 'GST',      shortLabel: 'GST',     mandatory: false, sourceFields: ['custom_gst', 'gst'] },
    { key: 'balance_sheet',label: 'Bal. Sheet',shortLabel: 'Bal.Sh',  mandatory: true,  sourceFields: ['custom_latest_3_years_financial_statement', 'yrs_balance_sheet'] },
    { key: 'annual_report',label: 'Annual Rpt',shortLabel: 'Ann.Rpt', mandatory: true,  sourceFields: ['custom_annual_report', 'yrs_annual_report'] },
    { key: 'coc',          label: 'Code of Conduct',shortLabel: 'CoC',mandatory: false, sourceFields: ['custom_code_of_conduct', 'code_of_conduct_attachment'] },
    { key: 'dd_report',    label: 'DD Report', shortLabel: 'DD Rpt',  mandatory: false, sourceFields: ['custom_due_diligence_report'] },
    { key: 'mou',          label: 'MoU',       shortLabel: 'MoU',    mandatory: true,  sourceFields: ['mou_file', 'grant_agreement_mou', 'custom_upload_mou'] }
  ];

  var MANDATORY_COUNT = DOC_COLUMNS.filter(function(d) { return d.mandatory; }).length;

  // Theme code → display name resolver
  var THEME_NAMES = {};

  // ══════════════════════════════════════════════════════════════
  //  STATE
  // ══════════════════════════════════════════════════════════════

  var STATE = {
    allNGOs: [],          // processed NGO records with doc states
    filteredNGOs: [],
    ngoGrants: {},        // ngoId → [grant records]
    docsByNgo: {},        // ngoId → [doc registry records]
    expandedNgo: null,
    thematicAreas: [],
    // Grants tab
    allGrants: [],        // processed grant records with docs + reporting
    filteredGrants: [],
    grantDocs: {},        // grantId → [doc registry records]
    grantReports: {},     // grantId → [reporting records]
    expandedGrant: null,
    allReporting: [],     // raw reporting records
    // GAF / Proposals tab
    allProposals: [],     // processed proposal records
    filteredProposals: [],
    expandedProposal: null,
    // Vendors tab
    allVendors: [],       // processed vendor records
    filteredVendors: [],
    expandedVendor: null
  };

  function resolveThemeName(code) {
    if (!code) return '';
    return THEME_NAMES[code] || code;
  }

  // ══════════════════════════════════════════════════════════════
  //  DATA LOADING
  // ══════════════════════════════════════════════════════════════

  function apiCall(method, args) {
    return new Promise(function(resolve, reject) {
      frappe.call({
        method: method, args: args, async: true,
        callback: function(r) { resolve(r.message || r); },
        error: function(e) { reject(e); }
      });
    });
  }

  function loadData() {
    return Promise.all([
      // 1. All NGOs (primary entity — 26 records on staging)
      apiCall('frappe.client.get_list', {
        doctype: 'NGO',
        fields: ['name', 'ngo_name', 'ngo_status', 'state_name', 'district_name',
                 'primary_domain', 'is_due_diligence_cleared', 'due_diligence_validation'],
        limit_page_length: 0
      }),
      // 2. All Grants (with full details for Grants tab)
      apiCall('frappe.client.get_list', {
        doctype: 'Grant',
        fields: ['name', 'ngo', 'grant_name', 'grant_status', 'donor',
                 'start_date', 'end_date', 'mou_signing_date', 'grant_agreement_mou'],
        filters: { docstatus: ['!=', 2] },
        limit_page_length: 0
      }),
      // 3. All Document Registry records
      apiCall('frappe.client.get_list', {
        doctype: 'Document Registry',
        fields: ['name', 'file_name', 'file_url', 'source_doctype', 'source_name',
                 'source_record_title', 'source_category', 'source_field',
                 'partner', 'partner_name', 'project', 'project_title',
                 'compliance_status', 'expiry_date', 'upload_date',
                 'file_type', 'file_extension'],
        limit_page_length: 0
      }),
      // 4. Programmes (for thematic area filter + theme name resolution)
      apiCall('frappe.client.get_list', {
        doctype: 'Programme',
        fields: ['name', 'programme_name'],
        limit_page_length: 0
      }).catch(function() { return []; }),
      // 5. Try to fetch NGO Theme records for primary_domain resolution
      apiCall('frappe.client.get_list', {
        doctype: 'NGO',
        fields: ['primary_domain'],
        group_by: 'primary_domain',
        limit_page_length: 0
      }).catch(function() { return []; }),
      // 6. All Reporting records (for Grants tab reporting schedule)
      apiCall('frappe.client.get_list', {
        doctype: 'Reporting',
        fields: ['name', 'grant', 'report_name', 'due_date',
                 'submission_date', 'closure_status', 'ngo'],
        limit_page_length: 0
      }).catch(function() { return []; }),
      // 7. All Proposals (for GAF / Proposals tab)
      apiCall('frappe.client.get_list', {
        doctype: 'Proposal',
        fields: ['name', 'proposal_name', 'project_name', 'ngo', 'ngo_name',
                 'programme', 'theme', 'donor', 'donor_name', 'year',
                 'start_date', 'end_date', 'total_planned_budget', 'wf_state',
                 'upload_draft_mou_here', 'mou_signed_document',
                 'mou_signing_date', 'mou_verified',
                 'implementation_type', 'funding_type'],
        filters: { docstatus: ['!=', 2] },
        limit_page_length: 0
      }).catch(function() { return []; }),
      // 8. All Vendors (for Vendors tab)
      apiCall('frappe.client.get_list', {
        doctype: 'Vendor',
        fields: ['name', 'vendor_name', 'vendor_status', 'state_name',
                 'district_name', 'registration_number', 'pan_number',
                 'registration_certificate', 'pan_copy_upload',
                 'is_due_diligence_cleared', 'due_diligence_validation',
                 'email', 'contact_first_name', 'contact_last_name',
                 'designation', 'is_blacklisted'],
        limit_page_length: 0
      }).catch(function() { return []; })
    ]);
  }

  // ══════════════════════════════════════════════════════════════
  //  DATA PROCESSING
  // ══════════════════════════════════════════════════════════════

  function processData(results) {
    var ngos = results[0] || [];
    var grants = results[1] || [];
    var docRegistry = results[2] || [];
    var themes = results[3] || [];

    // Build theme name lookup from Programmes
    themes.forEach(function(t) {
      if (t.name && t.programme_name) THEME_NAMES[t.name] = t.programme_name;
    });
    // Fallback: readable names for known THEME-XXX codes on staging
    var fallbackThemes = {
      'THEME-009': 'Education', 'THEME-010': 'Health & Nutrition',
      'THEME-011': 'Environment & Livelihoods', 'THEME-012': 'Rural Development',
      'THEME-015': 'Sustainability & Climate', 'THEME-016': 'Women Empowerment',
      'THEME-017': 'Livelihoods & Skilling'
    };
    Object.keys(fallbackThemes).forEach(function(k) {
      if (!THEME_NAMES[k]) THEME_NAMES[k] = fallbackThemes[k];
    });

    // Build NGO → grants map
    var ngoGrants = {};
    grants.forEach(function(g) {
      if (!g.ngo) return;
      if (!ngoGrants[g.ngo]) ngoGrants[g.ngo] = [];
      ngoGrants[g.ngo].push(g);
    });
    STATE.ngoGrants = ngoGrants;

    // Build NGO → docs map from Document Registry (using partner field)
    var docsByNgo = {};
    docRegistry.forEach(function(doc) {
      var ngoId = doc.partner;
      if (!ngoId) return;
      if (!docsByNgo[ngoId]) docsByNgo[ngoId] = [];
      docsByNgo[ngoId].push(doc);
    });
    STATE.docsByNgo = docsByNgo;

    // Build a lookup: for each NGO, which doc columns are filled?
    // Match source_field from Document Registry to our DOC_COLUMNS
    STATE.allNGOs = ngos.map(function(ngo) {
      var docs = docsByNgo[ngo.name] || [];
      var grantList = ngoGrants[ngo.name] || [];
      var docStates = {};
      var docFiles = {};  // key → doc registry record (for slideout)
      var mandatoryUploaded = 0;
      var expiringCount = 0;

      DOC_COLUMNS.forEach(function(col) {
        // Find if any doc in registry matches this column's source_fields
        var match = null;
        for (var i = 0; i < docs.length; i++) {
          var sf = docs[i].source_field || '';
          if (col.sourceFields.indexOf(sf) !== -1) {
            match = docs[i];
            break;
          }
        }

        if (match) {
          // Check expiry
          if (match.expiry_date) {
            var exp = new Date(match.expiry_date);
            var now = new Date();
            var threshold = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
            if (exp <= now) {
              docStates[col.key] = col.mandatory ? 'missing' : 'optional_missing';
            } else if (exp <= threshold) {
              docStates[col.key] = 'expiring';
              expiringCount++;
              if (col.mandatory) mandatoryUploaded++;
            } else {
              docStates[col.key] = 'ok';
              if (col.mandatory) mandatoryUploaded++;
            }
          } else if (match.compliance_status === 'Pending') {
            docStates[col.key] = 'pending';
            // Pending doesn't count as uploaded for score
          } else if (match.compliance_status === 'Expired') {
            docStates[col.key] = col.mandatory ? 'missing' : 'optional_missing';
          } else {
            docStates[col.key] = 'ok';
            if (col.mandatory) mandatoryUploaded++;
          }
          docFiles[col.key] = match;
        } else {
          docStates[col.key] = col.mandatory ? 'missing' : 'optional_missing';
        }
      });

      var score = MANDATORY_COUNT > 0 ? Math.round((mandatoryUploaded / MANDATORY_COUNT) * 100) : 0;
      var location = [ngo.state_name, ngo.district_name].filter(Boolean).join(', ');

      return {
        name: ngo.name,
        ngo_name: ngo.ngo_name || ngo.name,
        ngo_status: ngo.ngo_status || '',
        domain: ngo.primary_domain || '',
        location: location,
        ddCleared: ngo.is_due_diligence_cleared,
        score: score,
        mandatoryUploaded: mandatoryUploaded,
        expiringCount: expiringCount,
        docStates: docStates,
        docFiles: docFiles,
        grantCount: grantList.length,
        totalDocs: docs.length
      };
    });

    // Sort by score ascending (worst compliance first, then alphabetical)
    STATE.allNGOs.sort(function(a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return (a.ngo_name || '').localeCompare(b.ngo_name || '');
    });

    // Build thematic area list from unique NGO primary_domain values
    var themeSet = {};
    ngos.forEach(function(n) { if (n.primary_domain) themeSet[n.primary_domain] = true; });
    STATE.thematicAreas = Object.keys(themeSet).sort();
    STATE.filteredNGOs = STATE.allNGOs.slice();

    // ── Grants tab processing ──
    var reporting = results[5] || [];
    STATE.allReporting = reporting;

    // Build Grant → docs map (docs where source_doctype = 'Grant' or project = grantId)
    var grantDocs = {};
    docRegistry.forEach(function(doc) {
      var grantId = null;
      if (doc.source_doctype === 'Grant') {
        grantId = doc.source_name;
      } else if (doc.project) {
        // project field links to Grant ID
        grantId = doc.project;
      }
      if (grantId) {
        if (!grantDocs[grantId]) grantDocs[grantId] = [];
        grantDocs[grantId].push(doc);
      }
    });
    STATE.grantDocs = grantDocs;

    // Build Grant → reporting map
    var grantReports = {};
    reporting.forEach(function(r) {
      if (!r.grant) return;
      if (!grantReports[r.grant]) grantReports[r.grant] = [];
      grantReports[r.grant].push(r);
    });
    STATE.grantReports = grantReports;

    // Build NGO name lookup
    var ngoNameMap = {};
    ngos.forEach(function(n) { ngoNameMap[n.name] = n.ngo_name || n.name; });

    // Process grants
    STATE.allGrants = grants.map(function(g) {
      var docs = grantDocs[g.name] || [];
      var reports = grantReports[g.name] || [];
      var ngoName = ngoNameMap[g.ngo] || g.ngo || '';

      // Group docs by source_category
      var sanctioningDocs = docs.filter(function(d) {
        return d.source_category === 'Sanctioning'
            || d.source_field === 'custom_upload_mou'
            || d.source_field === 'grant_agreement_mou'
            || d.source_field === 'mou_file'
            || d.source_field === 'custom_board_note'
            || d.source_field === 'custom_upload_sanction_letter';
      });
      var monitoringDocs = docs.filter(function(d) {
        return d.source_category === 'Monitoring'
            || d.source_field === 'quarterly_fuc'
            || d.source_field === 'annual_audited_fuc'
            || d.source_field === 'field_visit_report';
      });
      var fundFlowDocs = docs.filter(function(d) {
        return d.source_category === 'Fund Flow'
            || d.source_field === 'fund_request_doc'
            || d.source_field === 'fund_disbursement_memo';
      });
      // Other docs that don't fit above categories (avoid double-counting)
      var categorized = {};
      sanctioningDocs.concat(monitoringDocs).concat(fundFlowDocs).forEach(function(d) { categorized[d.name] = true; });
      var otherDocs = docs.filter(function(d) { return !categorized[d.name]; });

      // Count reports
      var reportsDue = reports.filter(function(r) { return !r.submission_date; }).length;
      var reportsSubmitted = reports.filter(function(r) { return !!r.submission_date; }).length;

      // Determine FY from start_date
      var fy = '';
      if (g.start_date) {
        var y = parseInt(g.start_date.split('-')[0]);
        var m = parseInt(g.start_date.split('-')[1]);
        fy = m >= 4 ? 'FY ' + y + '-' + String(y + 1).slice(2) : 'FY ' + (y - 1) + '-' + String(y).slice(2);
      }

      return {
        name: g.name,
        grant_name: g.grant_name || g.name,
        ngo: g.ngo,
        ngo_name: ngoName,
        grant_status: g.grant_status || 'Active',
        donor: g.donor,
        start_date: g.start_date,
        end_date: g.end_date,
        mou_signing_date: g.mou_signing_date,
        fy: fy,
        totalDocs: docs.length,
        sanctioningDocs: sanctioningDocs,
        monitoringDocs: monitoringDocs,
        fundFlowDocs: fundFlowDocs,
        otherDocs: otherDocs,
        reports: reports,
        reportsDue: reportsDue,
        reportsSubmitted: reportsSubmitted
      };
    });

    // Sort grants: Active first, then by start_date descending
    STATE.allGrants.sort(function(a, b) {
      if (a.grant_status !== b.grant_status) {
        return a.grant_status === 'Active' ? -1 : 1;
      }
      return (b.start_date || '').localeCompare(a.start_date || '');
    });

    STATE.filteredGrants = STATE.allGrants.slice();

    // ── GAF / Proposals tab processing ──
    var proposals = results[6] || [];

    // Workflow state categorization
    var WF_APPROVED = ['Approved'];
    var WF_GAF_APPROVED = ['GAF Approved'];
    var WF_IN_REVIEW = ['Pending at PM', 'Pending at SPM', 'Pending at PL'];
    var WF_SUBMITTED = ['Proposal Submitted'];
    var WF_REJECTED = ['Rejected'];
    var WF_PENDING = ['Pending'];

    STATE.allProposals = proposals.map(function(p) {
      var ngoLabel = p.ngo_name || ngoNameMap[p.ngo] || p.ngo || '';
      var hasDraftMou = !!(p.upload_draft_mou_here && p.upload_draft_mou_here !== '');
      var hasSignedMou = !!(p.mou_signed_document && p.mou_signed_document !== '');
      var mouVerified = !!p.mou_verified;

      // Determine workflow category
      var wfCategory = 'pending';
      var ws = p.wf_state || '';
      if (WF_APPROVED.indexOf(ws) !== -1) wfCategory = 'approved';
      else if (WF_GAF_APPROVED.indexOf(ws) !== -1) wfCategory = 'gaf_approved';
      else if (WF_IN_REVIEW.indexOf(ws) !== -1) wfCategory = 'in_review';
      else if (WF_SUBMITTED.indexOf(ws) !== -1) wfCategory = 'submitted';
      else if (WF_REJECTED.indexOf(ws) !== -1) wfCategory = 'rejected';

      // MoU status
      var mouStatus = 'none';
      if (hasSignedMou) mouStatus = 'signed';
      else if (hasDraftMou) mouStatus = 'draft_only';

      // Budget formatted
      var budgetStr = '';
      if (p.total_planned_budget) {
        budgetStr = formatINR(p.total_planned_budget);
      }

      // FY from year field or start_date
      var fy = p.year || '';
      if (!fy && p.start_date) {
        var y = parseInt(p.start_date.split('-')[0]);
        var m = parseInt(p.start_date.split('-')[1]);
        fy = m >= 4 ? 'FY ' + y + '-' + String(y + 1).slice(2) : 'FY ' + (y - 1) + '-' + String(y).slice(2);
      }

      return {
        name: p.name,
        proposal_name: p.proposal_name || p.project_name || p.name,
        ngo: p.ngo,
        ngo_name: ngoLabel,
        programme: p.programme || '',
        theme: p.theme || '',
        donor: p.donor || '',
        donor_name: p.donor_name || p.donor || '',
        year: fy,
        start_date: p.start_date,
        end_date: p.end_date,
        budget: p.total_planned_budget || 0,
        budgetStr: budgetStr,
        wf_state: ws,
        wfCategory: wfCategory,
        hasDraftMou: hasDraftMou,
        hasSignedMou: hasSignedMou,
        draftMouUrl: p.upload_draft_mou_here || '',
        signedMouUrl: p.mou_signed_document || '',
        mouSigningDate: p.mou_signing_date || '',
        mouVerified: mouVerified,
        mouStatus: mouStatus,
        implementation_type: p.implementation_type || '',
        funding_type: p.funding_type || ''
      };
    });

    // Sort: Approved first, then GAF Approved, In Review, Submitted, Pending, Rejected last
    var wfOrder = { approved: 0, gaf_approved: 1, in_review: 2, submitted: 3, pending: 4, rejected: 5 };
    STATE.allProposals.sort(function(a, b) {
      var oa = wfOrder[a.wfCategory] !== undefined ? wfOrder[a.wfCategory] : 9;
      var ob = wfOrder[b.wfCategory] !== undefined ? wfOrder[b.wfCategory] : 9;
      if (oa !== ob) return oa - ob;
      return (b.budget || 0) - (a.budget || 0);
    });

    STATE.filteredProposals = STATE.allProposals.slice();

    // ── Vendors tab processing ──
    var vendorRecords = results[7] || [];

    // Vendor compliance doc columns
    var VENDOR_DOC_COLS = [
      { key: 'reg_cert', label: 'Registration Certificate', field: 'registration_certificate', mandatory: true },
      { key: 'pan', label: 'PAN Copy', field: 'pan_copy_upload', mandatory: true }
    ];
    var VENDOR_MANDATORY_COUNT = VENDOR_DOC_COLS.filter(function(c) { return c.mandatory; }).length;

    // Also check Document Registry for vendor-sourced docs
    var vendorDocs = {};
    docRegistry.forEach(function(doc) {
      if (doc.source_doctype === 'Vendor' && doc.source_name) {
        if (!vendorDocs[doc.source_name]) vendorDocs[doc.source_name] = [];
        vendorDocs[doc.source_name].push(doc);
      }
    });

    STATE.allVendors = vendorRecords.map(function(v) {
      var location = [v.state_name, v.district_name].filter(Boolean).join(', ');
      var contact = [v.contact_first_name, v.contact_last_name].filter(Boolean).join(' ');
      var regDocs = vendorDocs[v.name] || [];

      // Check doc columns directly from vendor fields
      var docStates = {};
      var mandatoryUploaded = 0;
      VENDOR_DOC_COLS.forEach(function(col) {
        var val = v[col.field];
        if (val && val !== '') {
          docStates[col.key] = 'ok';
          if (col.mandatory) mandatoryUploaded++;
        } else {
          docStates[col.key] = col.mandatory ? 'missing' : 'optional_missing';
        }
      });

      // DD expiry check
      var ddExpiring = false;
      if (v.is_due_diligence_cleared === 'Yes' && v.due_diligence_validation) {
        var exp = new Date(v.due_diligence_validation);
        var now = new Date();
        var threshold = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
        if (exp <= now) ddExpiring = false; // already expired
        else if (exp <= threshold) ddExpiring = true;
      }

      var score = VENDOR_MANDATORY_COUNT > 0 ? Math.round((mandatoryUploaded / VENDOR_MANDATORY_COUNT) * 100) : 0;

      return {
        name: v.name,
        vendor_name: v.vendor_name || v.name,
        vendor_status: v.vendor_status || '',
        location: location,
        contact: contact,
        designation: v.designation || '',
        email: v.email || '',
        registration_number: v.registration_number || '',
        pan_number: v.pan_number || '',
        ddCleared: v.is_due_diligence_cleared === 'Yes',
        ddExpiry: v.due_diligence_validation || '',
        ddExpiring: ddExpiring,
        isBlacklisted: !!v.is_blacklisted,
        docStates: docStates,
        score: score,
        mandatoryUploaded: mandatoryUploaded,
        mandatoryTotal: VENDOR_MANDATORY_COUNT,
        regCertUrl: v.registration_certificate || '',
        panUrl: v.pan_copy_upload || '',
        registryDocs: regDocs
      };
    });

    // Sort: non-compliant first, then alphabetical
    STATE.allVendors.sort(function(a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return (a.vendor_name || '').localeCompare(b.vendor_name || '');
    });

    STATE.filteredVendors = STATE.allVendors.slice();
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDERING
  // ══════════════════════════════════════════════════════════════

  function renderKPIs() {
    var ngos = STATE.filteredNGOs;
    var total = ngos.length;
    var fullyCompliant = ngos.filter(function(n) { return n.score === 100; }).length;
    var complianceRate = total > 0 ? Math.round((fullyCompliant / total) * 100) : 0;
    var expiring = 0, missingMandatory = 0;
    ngos.forEach(function(n) {
      expiring += n.expiringCount;
      missingMandatory += (MANDATORY_COUNT - n.mandatoryUploaded);
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

    // Header
    var hRow = '<tr>';
    hRow += '<th class="stf-frozen stf-frozen-last" style="width:260px; text-align:left;">NGO Partner</th>';
    hRow += '<th style="width:70px;">Score</th>';
    DOC_COLUMNS.forEach(function(col) {
      var star = col.mandatory ? '<span style="color:#DC2626;"> ★</span>' : '<span style="color:#9CA3AF;font-size:9px;display:block;">optional</span>';
      hRow += '<th style="width:80px;" title="' + escHtml(col.label) + (col.mandatory ? ' (Mandatory)' : ' (Optional)') + '">'
            + col.shortLabel + star + '</th>';
    });
    hRow += '<th style="width:50px;">⬇</th>';
    hRow += '</tr>';
    thead.innerHTML = hRow;

    // Empty state
    if (ngos.length === 0) {
      tbody.innerHTML = '';
      _el('ngo-empty').style.display = 'flex';
      _el('ngo-table-footer').style.display = 'none';
      return;
    }

    _el('ngo-empty').style.display = 'none';
    _el('ngo-table-footer').style.display = 'block';
    _el('ngo-showing').textContent = 'Showing ' + formatIN(ngos.length) + ' of ' + formatIN(STATE.allNGOs.length) + ' NGO partners';

    // Body rows
    var html = '';
    ngos.forEach(function(ngo, idx) {
      var isExpanded = STATE.expandedNgo === ngo.name;
      var rowClass = ngo.score === 100 ? 'row-ok' : (ngo.score >= 60 ? '' : 'row-warn');

      html += '<tr class="' + rowClass + '">';

      // NGO name cell with sub-info (domain · location · grants)
      var subParts = [resolveThemeName(ngo.domain), ngo.location, ngo.grantCount > 0 ? ngo.grantCount + ' grant' + (ngo.grantCount > 1 ? 's' : '') : ''].filter(Boolean);
      html += '<td class="stf-frozen stf-frozen-last ngo-name-cell" data-ngo-idx="' + idx + '">'
            + '<span class="expand-arrow' + (isExpanded ? ' open' : '') + '">&#9654;</span>'
            + '<span class="ngo-name-text">' + escHtml(ngo.ngo_name) + '</span>'
            + (subParts.length ? '<br><span class="ngo-sub">' + escHtml(subParts.join(' · ')) + '</span>' : '')
            + '</td>';

      // Score — show as X/N mandatory
      var scoreClass = ngo.score === 100 ? 'score-full' : (ngo.score >= 60 ? 'score-partial' : 'score-critical');
      html += '<td><span class="score-chip ' + scoreClass + '">' + ngo.mandatoryUploaded + '/' + MANDATORY_COUNT + '</span></td>';

      // Document cells
      DOC_COLUMNS.forEach(function(col) {
        var state = ngo.docStates[col.key];
        var cellClass, cellText, clickAttr = '';

        if (state === 'ok') {
          cellClass = 'c-ok';
          cellText = '✓';
          clickAttr = ' data-action="view-doc" data-col="' + col.key + '" data-ngo-idx="' + idx + '"';
        } else if (state === 'expiring') {
          cellClass = 'c-exp';
          cellText = '⚠';
          clickAttr = ' data-action="view-doc" data-col="' + col.key + '" data-ngo-idx="' + idx + '"';
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

      // Download column
      var dlFiles = collectNgoFiles(ngo);
      if (dlFiles.length > 0) {
        html += '<td><span class="dl-cell" data-action="zip-ngo" data-ngo-idx="' + idx + '" title="Download all as ZIP">⬇</span></td>';
      } else {
        html += '<td></td>';
      }

      html += '</tr>';

      // Expand row
      if (isExpanded) {
        html += buildExpandRow(ngo, DOC_COLUMNS.length + 3);
      }
    });

    tbody.innerHTML = html;
    bindMatrixEvents();
  }

  function buildExpandRow(ngo, colSpan) {
    var html = '<tr class="expand-row"><td colspan="' + colSpan + '">';
    html += '<div class="expand-content">';

    // Section 1: All documents from Document Registry for this NGO
    var docs = STATE.docsByNgo[ngo.name] || [];
    var ddDocs = docs.filter(function(d) { return d.source_category === 'Due Diligence' || d.source_category === 'Documents'; });
    var grantDocs = docs.filter(function(d) { return d.source_doctype === 'Grant'; });
    var otherDocs = docs.filter(function(d) { return d.source_category !== 'Due Diligence' && d.source_category !== 'Documents' && d.source_doctype !== 'Grant'; });

    if (ddDocs.length > 0) {
      html += '<div class="expand-section-title">Due Diligence &amp; Organisation Documents</div>';
      html += '<div class="expand-doc-grid">';
      ddDocs.forEach(function(doc) {
        html += buildDocCard(doc);
      });
      html += '</div>';
    }

    // Grant-wise documents
    var grants = STATE.ngoGrants[ngo.name] || [];
    if (grants.length > 0) {
      grants.forEach(function(grant) {
        var gDocs = docs.filter(function(d) { return d.source_name === grant.name; });
        html += '<div class="expand-section-title">'
              + 'Grant Documents <span class="grant-badge">' + escHtml(grant.grant_name || grant.name) + '</span>'
              + '</div>';
        if (gDocs.length > 0) {
          html += '<div class="expand-doc-grid">';
          gDocs.forEach(function(doc) { html += buildDocCard(doc); });
          html += '</div>';
        } else {
          html += '<div style="font-size:13px;color:#9CA3AF;padding:8px 0;">No documents uploaded for this grant yet</div>';
        }
      });
    }

    if (otherDocs.length > 0) {
      html += '<div class="expand-section-title">Other Documents</div>';
      html += '<div class="expand-doc-grid">';
      otherDocs.forEach(function(doc) { html += buildDocCard(doc); });
      html += '</div>';
    }

    if (docs.length === 0) {
      html += '<div style="font-size:13px;color:#9CA3AF;padding:16px 0;text-align:center;">No documents found for this partner</div>';
    }

    // Actions
    var allFiles = collectNgoFiles(ngo);
    if (allFiles.length > 0) {
      html += '<div class="expand-actions">';
      html += '<button class="btn-primary" data-action="zip-expand" data-ngo-name="' + escAttr(ngo.name) + '">Download All as ZIP (' + allFiles.length + ' files)</button>';
      html += '</div>';
    }

    html += '</div></td></tr>';
    return html;
  }

  function buildDocCard(doc) {
    var hasUrl = doc.file_url && doc.file_url !== '';
    var cardClass = 'expand-doc-card' + (hasUrl ? ' uploaded' : ' missing');
    var icon, statusHtml;

    if (doc.compliance_status === 'Expired') {
      cardClass = 'expand-doc-card expiring';
      icon = '<span class="expand-doc-icon" style="color:#D97706;">⚠</span>';
      statusHtml = '<span class="expand-doc-status" style="color:#D97706;">Expired</span>';
    } else if (hasUrl) {
      icon = '<span class="expand-doc-icon" style="color:#16A34A;">✓</span>';
      statusHtml = '<span class="expand-doc-status" style="color:#16A34A;">View</span>';
    } else {
      icon = '<span class="expand-doc-icon">—</span>';
      statusHtml = '<span class="expand-doc-status">Missing</span>';
    }

    var clickAttr = hasUrl ? ' data-action="view-reg-doc" data-doc-name="' + escAttr(doc.name) + '"' : '';
    var label = doc.source_field ? humanizeField(doc.source_field) : (doc.file_name || doc.name);

    return '<div class="' + cardClass + '"' + clickAttr + '>'
         + icon
         + '<span class="expand-doc-label">' + escHtml(label) + '</span>'
         + statusHtml
         + '</div>';
  }

  function humanizeField(field) {
    // Convert source_field like "custom_80g" to "80G"
    var map = {
      'custom_80g': '80G Certificate', 'custom_12a': '12A Certificate',
      'custom_pan': 'PAN', 'custom_csr_1': 'CSR-1 Form',
      'custom_trust_deed': 'Trust Deed', 'custom_society_reg': 'Society Registration',
      'custom_fcra': 'FCRA', 'custom_gst': 'GST Certificate',
      'custom_latest_3_years_financial_statement': 'Financial Statements (3yr)',
      'custom_annual_report': 'Annual Report', 'custom_code_of_conduct': 'Code of Conduct',
      'custom_due_diligence_report': 'DD Report', 'custom_upload_mou': 'MoU',
      'mou_file': 'MoU', 'grant_agreement_mou': 'Grant Agreement/MoU',
      'supporting_document': 'Supporting Document'
    };
    return map[field] || field.replace(/^custom_/, '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  }

  function collectNgoFiles(ngo) {
    var docs = STATE.docsByNgo[ngo.name] || [];
    return docs.filter(function(d) { return d.file_url; }).map(function(d) {
      return { file_name: d.file_name || d.name, file_url: d.file_url };
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  EVENT HANDLING
  // ══════════════════════════════════════════════════════════════

  function bindMatrixEvents() {
    // NGO name click → expand
    _qAll('.ngo-name-cell').forEach(function(cell) {
      cell.addEventListener('click', function() {
        var idx = parseInt(cell.getAttribute('data-ngo-idx'));
        var ngo = STATE.filteredNGOs[idx];
        if (!ngo) return;
        STATE.expandedNgo = STATE.expandedNgo === ngo.name ? null : ngo.name;
        renderMatrix();
      });
    });

    // Document cell click → slideout
    _qAll('[data-action="view-doc"]').forEach(function(cell) {
      cell.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(cell.getAttribute('data-ngo-idx'));
        var colKey = cell.getAttribute('data-col');
        var ngo = STATE.filteredNGOs[idx];
        if (!ngo) return;
        var doc = ngo.docFiles[colKey];
        if (!doc || !doc.file_url) return;
        var col = DOC_COLUMNS.find(function(c) { return c.key === colKey; });
        openSlideout(col ? col.label : colKey, doc.file_url, ngo.ngo_name, doc.source_doctype || 'Document Registry', doc.name);
      });
    });

    // Expand-row doc card click → slideout
    _qAll('[data-action="view-reg-doc"]').forEach(function(card) {
      card.addEventListener('click', function(e) {
        e.stopPropagation();
        var docName = card.getAttribute('data-doc-name');
        var doc = findDocByName(docName);
        if (doc && doc.file_url) {
          openSlideout(doc.file_name || doc.name, doc.file_url, doc.partner_name || '', doc.source_doctype || 'Document Registry', doc.name);
        }
      });
    });

    // ZIP download from table column
    _qAll('[data-action="zip-ngo"]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(el.getAttribute('data-ngo-idx'));
        var ngo = STATE.filteredNGOs[idx];
        if (!ngo) return;
        downloadNgoZip(ngo, el);
      });
    });

    // ZIP download from expand actions
    _qAll('[data-action="zip-expand"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var ngoId = btn.getAttribute('data-ngo-name');
        var ngo = STATE.allNGOs.find(function(n) { return n.name === ngoId; });
        if (ngo) downloadNgoZip(ngo, btn);
      });
    });
  }

  function findDocByName(name) {
    for (var ngoId in STATE.docsByNgo) {
      var docs = STATE.docsByNgo[ngoId];
      for (var i = 0; i < docs.length; i++) {
        if (docs[i].name === name) return docs[i];
      }
    }
    return null;
  }

  function downloadNgoZip(ngo, el) {
    var files = collectNgoFiles(ngo);
    if (!files.length) return;
    var origHtml = el.innerHTML;
    el.style.opacity = '0.5';

    files.forEach(function(f) { logDownload(ngo.ngo_name, f.file_name, 'ZIP bulk download'); });

    bulkDownloadZip(files, {
      zipName: (ngo.ngo_name || ngo.name).replace(/[^a-zA-Z0-9]/g, '_') + '_Documents.zip',
      onComplete: function(result) {
        el.style.opacity = '1';
        el.innerHTML = origHtml;
        frappe.show_alert({ message: result.fetched + ' files downloaded as ZIP', indicator: result.errors > 0 ? 'orange' : 'green' });
      },
      onError: function(err) {
        el.style.opacity = '1';
        el.innerHTML = origHtml;
        frappe.show_alert({ message: 'ZIP failed: ' + err.message, indicator: 'red' });
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  SLIDEOUT
  // ══════════════════════════════════════════════════════════════

  function openSlideout(docLabel, fileUrl, entityName, entityDoctype, entityId) {
    var overlay = _el('dcc-slideout');
    _el('slideout-title').textContent = docLabel;

    var fileName = fileUrl ? fileUrl.split('/').pop().split('?')[0] : 'Unknown';
    var fullUrl = fileUrl && fileUrl.charAt(0) === '/' ? window.location.origin + fileUrl : fileUrl;

    _el('slideout-body').innerHTML =
      '<div class="slideout-doc-name">' + escHtml(fileName) + '</div>'
      + '<div class="slideout-doc-meta">Entity: ' + escHtml(entityName) + '</div>'
      + '<div class="slideout-actions">'
      + '<button class="slideout-btn" id="slideout-preview"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zm0 12a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z" fill="#6B7280"/></svg><div><div class="slideout-btn-label">Preview</div><div class="slideout-btn-sub">Open in new tab</div></div></button>'
      + '<button class="slideout-btn" id="slideout-download"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 14v3h14v-3M10 3v10m0 0l-4-4m4 4l4-4" stroke="#6B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><div><div class="slideout-btn-label">Download</div><div class="slideout-btn-sub">' + escHtml(fileName) + '</div></div></button>'
      + '<button class="slideout-btn" id="slideout-goto"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M11 3h6v6M17 3L7 13M15 11v6H3V5h6" stroke="#6B7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><div><div class="slideout-btn-label">Go to Source</div><div class="slideout-btn-sub">' + escHtml(entityDoctype) + ': ' + escHtml(entityId) + '</div></div></button>'
      + '</div>';

    overlay.style.display = 'block';

    _el('slideout-preview').onclick = function() {
      logDownload(entityName, docLabel, 'Preview');
      window.open(fullUrl, '_blank');
    };
    _el('slideout-download').onclick = function() {
      logDownload(entityName, docLabel, 'Download');
      var a = document.createElement('a'); a.href = fullUrl; a.download = fileName; a.click();
    };
    _el('slideout-goto').onclick = function() {
      if (entityDoctype && entityId) {
        window.open('/app/' + entityDoctype.toLowerCase().replace(/ /g, '-') + '/' + entityId, '_blank');
      }
    };
  }

  function closeSlideout() { _el('dcc-slideout').style.display = 'none'; }

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
              action: actionType || 'Download', document: docLabel,
              entity: entityName, source: 'Document Command Center',
              timestamp: new Date().toISOString()
            }),
            reference_doctype: 'Document Registry',
            user: frappe.session.user
          }
        }, async: true
      });
    } catch(e) { console.warn('Audit log failed:', e); }
  }

  // ══════════════════════════════════════════════════════════════
  //  FILTERS
  // ══════════════════════════════════════════════════════════════

  function applyFilters() {
    var search = (_el('ngo-search').value || '').trim();
    var themeFilter = _el('ngo-filter-theme').value;
    var compliance = _el('ngo-filter-compliance').value;
    var filtered = STATE.allNGOs.slice();

    if (search) {
      filtered = fuzzyFilterRecords(filtered, search, function(ngo) {
        return [ngo.ngo_name || '', ngo.name || '', resolveThemeName(ngo.domain) || '', ngo.location || ''];
      });
    }

    if (themeFilter) {
      filtered = filtered.filter(function(n) { return n.domain === themeFilter; });
    }

    if (compliance === 'full') {
      filtered = filtered.filter(function(n) { return n.score === 100; });
    } else if (compliance === 'partial') {
      filtered = filtered.filter(function(n) { return n.score >= 50 && n.score < 100; });
    } else if (compliance === 'critical') {
      filtered = filtered.filter(function(n) { return n.score < 50; });
    }

    STATE.filteredNGOs = filtered;

    var activeCount = (search ? 1 : 0) + (themeFilter ? 1 : 0) + (compliance ? 1 : 0);
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
    btn.disabled = true; btn.textContent = 'Exporting...';

    loadXlsxLib().then(function() {
      var data = [];
      var header = [
        sc('NGO Partner', { font: { name: 'Arial', sz: 11, bold: true }, fill: 'E6E6E6' }),
        sc('Score', { font: { name: 'Arial', sz: 11, bold: true }, fill: 'E6E6E6' })
      ];
      DOC_COLUMNS.forEach(function(col) {
        header.push(sc(col.label + (col.mandatory ? ' ★' : ''), { font: { name: 'Arial', sz: 11, bold: true }, fill: 'E6E6E6' }));
      });
      data.push(header);

      STATE.filteredNGOs.forEach(function(ngo) {
        var row = [sc(ngo.ngo_name), sc(ngo.mandatoryUploaded + '/' + MANDATORY_COUNT)];
        DOC_COLUMNS.forEach(function(col) {
          var state = ngo.docStates[col.key];
          var label = state === 'ok' ? 'Uploaded' : (state === 'expiring' ? 'Expiring' : (state === 'missing' ? 'Missing' : (state === 'pending' ? 'Pending' : 'N/A')));
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
      btn.textContent = 'Export'; btn.disabled = false;
      frappe.show_alert({ message: 'Excel exported', indicator: 'green' });
    }).catch(function(err) {
      btn.textContent = 'Export'; btn.disabled = false;
      frappe.show_alert({ message: 'Export failed: ' + err.message, indicator: 'red' });
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  GRANTS TAB — Phase 2
  // ══════════════════════════════════════════════════════════════

  function renderGrantKPIs() {
    var grants = STATE.filteredGrants;
    var activeCount = grants.filter(function(g) { return g.grant_status === 'Active'; }).length;
    var totalDocs = 0, reportsDue = 0, reportsSubmitted = 0;
    grants.forEach(function(g) {
      totalDocs += g.totalDocs;
      reportsDue += g.reportsDue;
      reportsSubmitted += g.reportsSubmitted;
    });

    _el('kpi-total-grants').textContent = formatIN(activeCount);
    _el('kpi-grant-docs').textContent = formatIN(totalDocs);
    _el('kpi-reports-due').textContent = formatIN(reportsDue);
    _el('kpi-reports-submitted').textContent = formatIN(reportsSubmitted);
  }

  function renderGrantCards() {
    var grants = STATE.filteredGrants;
    var container = _el('grant-cards-container');
    var emptyEl = _el('grant-empty');
    var footerEl = _el('grant-table-footer');

    if (grants.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = 'flex';
      footerEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    footerEl.style.display = 'block';
    _el('grant-showing').textContent = 'Showing ' + formatIN(grants.length) + ' of ' + formatIN(STATE.allGrants.length) + ' grants';

    var html = '';
    grants.forEach(function(grant, idx) {
      var isOpen = STATE.expandedGrant === grant.name;
      var cardClass = 'grant-card' + (isOpen ? ' open' : '');

      // Badge: doc count + optional warning for overdue reports
      var badgeClass = 'g-badge';
      var overdueReports = grant.reports.filter(function(r) { return !r.submission_date && r.due_date && r.due_date < new Date().toISOString().slice(0,10); });
      if (overdueReports.length > 0) badgeClass = 'g-badge danger';
      else if (grant.reportsDue > 0) badgeClass = 'g-badge warn';

      // Sub info: NGO · FY · Theme · Status
      var subParts = [grant.ngo_name, grant.fy, grant.grant_status].filter(Boolean);

      html += '<div class="' + cardClass + '" data-grant-idx="' + idx + '">';
      html += '<div class="grant-hdr" data-action="toggle-grant" data-grant-idx="' + idx + '">';
      html += '<span class="g-arrow">&#9654;</span>';
      html += '<div class="g-info">';
      html += '<h3>' + escHtml(grant.grant_name) + '</h3>';
      html += '<div class="g-sub">' + escHtml(subParts.join(' · ')) + '</div>';
      html += '</div>';
      html += '<div class="g-badges">';
      html += '<span class="' + badgeClass + '">' + grant.totalDocs + ' doc' + (grant.totalDocs !== 1 ? 's' : '') + '</span>';
      if (overdueReports.length > 0) {
        html += '<span class="g-badge danger">' + overdueReports.length + ' overdue</span>';
      }
      html += '</div>';
      html += '</div>';

      // Body — only render if open
      if (isOpen) {
        html += '<div class="grant-body">';
        html += buildGrantBody(grant);
        html += '</div>';
      }

      html += '</div>';
    });

    container.innerHTML = html;
    bindGrantEvents();
  }

  function buildGrantBody(grant) {
    var html = '';

    // Phase 1: Sanctioning
    if (grant.sanctioningDocs.length > 0) {
      html += '<div class="phase phase-sanctioning">';
      html += '<div class="phase-bar pb-sanctioning"></div>';
      html += '<div class="phase-lbl">Sanctioning / Grant Setup</div>';
      html += '<div class="phase-docs">';
      grant.sanctioningDocs.forEach(function(doc) { html += buildGrantDocChip(doc, grant); });
      html += '</div></div>';
    }

    // Phase 2: Fund Flow
    if (grant.fundFlowDocs.length > 0) {
      html += '<div class="phase phase-fundflow">';
      html += '<div class="phase-bar pb-fundflow"></div>';
      html += '<div class="phase-lbl">Fund Flow</div>';
      html += '<div class="phase-docs">';
      grant.fundFlowDocs.forEach(function(doc) { html += buildGrantDocChip(doc, grant); });
      html += '</div></div>';
    }

    // Phase 3: Monitoring
    if (grant.monitoringDocs.length > 0) {
      html += '<div class="phase phase-monitoring">';
      html += '<div class="phase-bar pb-monitoring"></div>';
      html += '<div class="phase-lbl">Monitoring &amp; Reporting</div>';
      html += '<div class="phase-docs">';
      grant.monitoringDocs.forEach(function(doc) { html += buildGrantDocChip(doc, grant); });
      html += '</div></div>';
    }

    // Phase 4: Other docs
    if (grant.otherDocs.length > 0) {
      html += '<div class="phase">';
      html += '<div class="phase-bar pb-other"></div>';
      html += '<div class="phase-lbl">Other Documents</div>';
      html += '<div class="phase-docs">';
      grant.otherDocs.forEach(function(doc) { html += buildGrantDocChip(doc, grant); });
      html += '</div></div>';
    }

    // No docs at all
    if (grant.totalDocs === 0 && grant.reports.length === 0) {
      html += '<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:13px;">No documents or reports found for this grant</div>';
    }

    // Reporting schedule
    if (grant.reports.length > 0) {
      html += '<div class="grant-reporting">';
      html += '<div class="grant-reporting-title">Reporting Schedule</div>';

      // Sort: overdue first, then due, then submitted
      var sortedReports = grant.reports.slice().sort(function(a, b) {
        var today = new Date().toISOString().slice(0,10);
        var aOver = !a.submission_date && a.due_date && a.due_date < today;
        var bOver = !b.submission_date && b.due_date && b.due_date < today;
        if (aOver !== bOver) return aOver ? -1 : 1;
        var aDue = !a.submission_date;
        var bDue = !b.submission_date;
        if (aDue !== bDue) return aDue ? -1 : 1;
        return (a.due_date || '').localeCompare(b.due_date || '');
      });

      sortedReports.forEach(function(r) {
        var today = new Date().toISOString().slice(0,10);
        var isOverdue = !r.submission_date && r.due_date && r.due_date < today;
        var isDue = !r.submission_date && !isOverdue;
        var isSubmitted = !!r.submission_date;
        var isDelayed = r.closure_status === 'Delayed';

        var statusClass, statusText;
        if (isOverdue) { statusClass = 'rs-overdue'; statusText = 'Overdue'; }
        else if (isDue) { statusClass = 'rs-due'; statusText = 'Due'; }
        else if (isDelayed) { statusClass = 'rs-delayed'; statusText = 'Delayed'; }
        else { statusClass = 'rs-submitted'; statusText = 'Submitted'; }

        var dueStr = r.due_date ? formatDate(r.due_date) : '';

        html += '<div class="report-row">';
        html += '<span class="report-name">' + escHtml(r.report_name || r.name) + '</span>';
        html += '<span class="report-due">' + (dueStr ? 'Due: ' + dueStr : '') + '</span>';
        html += '<span class="report-status ' + statusClass + '">' + statusText + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Download bar
    var allFiles = collectGrantFiles(grant);
    if (allFiles.length > 0) {
      html += '<div class="grant-dl">';
      html += '<a data-action="zip-grant" data-grant-name="' + escAttr(grant.name) + '">⬇ Download all ' + allFiles.length + ' docs</a>';
      html += '</div>';
    }

    return html;
  }

  function buildGrantDocChip(doc, grant) {
    var hasUrl = doc.file_url && doc.file_url !== '';
    var chipClass = 'doc-chip';
    var statusClass, statusText;

    if (hasUrl) {
      chipClass += ' chip-ok';
      statusClass = 's-ok';
      statusText = '✓ Uploaded';
    } else {
      chipClass += ' chip-empty';
      statusClass = 's-empty';
      statusText = 'Missing';
    }

    var icon = getDocIcon(doc.source_field, doc.file_type);
    var label = humanizeGrantDocField(doc.source_field, doc.file_name);
    var dateStr = doc.upload_date ? formatDate(doc.upload_date) : '';
    var clickAttr = hasUrl ? ' data-action="view-grant-doc" data-doc-name="' + escAttr(doc.name) + '"' : '';

    return '<div class="' + chipClass + '"' + clickAttr + '>'
         + '<span class="dc-icon">' + icon + '</span>'
         + '<div class="dc-content">'
         + '<div class="dc-name">' + escHtml(label) + '</div>'
         + '<div class="dc-meta">' + escHtml(dateStr) + (doc.file_name ? ' · ' + escHtml(doc.file_name) : '') + '</div>'
         + '</div>'
         + '<span class="dc-status ' + statusClass + '">' + statusText + '</span>'
         + '</div>';
  }

  function getDocIcon(sourceField, fileType) {
    var sf = (sourceField || '').toLowerCase();
    if (sf.indexOf('mou') !== -1 || sf.indexOf('board_note') !== -1 || sf.indexOf('sanction') !== -1) return '📋';
    if (sf.indexOf('fuc') !== -1 || sf.indexOf('quarterly') !== -1) return '📊';
    if (sf.indexOf('annual') !== -1) return '📈';
    if (sf.indexOf('field_visit') !== -1) return '🏘';
    if (sf.indexOf('fund_request') !== -1) return '💰';
    if (sf.indexOf('fund_disbursement') !== -1 || sf.indexOf('disbursement') !== -1) return '🏦';
    if (fileType === 'PDF') return '📄';
    if (fileType === 'Spreadsheet') return '📊';
    return '📄';
  }

  function humanizeGrantDocField(field, fileName) {
    var grantMap = {
      'custom_board_note': 'Board Note',
      'custom_upload_mou': 'Signed MoU',
      'custom_upload_sanction_letter': 'Sanction Letter',
      'grant_agreement_mou': 'Grant Agreement / MoU',
      'mou_file': 'MoU',
      'quarterly_fuc': 'Quarterly FUC',
      'annual_audited_fuc': 'Annual Audited FUC',
      'field_visit_report': 'Field Visit Report',
      'fund_request_doc': 'Fund Request',
      'fund_disbursement_memo': 'Fund Disbursement Memo'
    };
    if (field && grantMap[field]) return grantMap[field];
    if (field) return field.replace(/^custom_/, '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    return fileName || 'Document';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      var parts = dateStr.split('-');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return parseInt(parts[2]) + ' ' + months[parseInt(parts[1]) - 1] + ' ' + parts[0];
    } catch(e) { return dateStr; }
  }

  function collectGrantFiles(grant) {
    var allDocs = grant.sanctioningDocs.concat(grant.monitoringDocs).concat(grant.fundFlowDocs).concat(grant.otherDocs);
    return allDocs.filter(function(d) { return d.file_url; }).map(function(d) {
      return { file_name: d.file_name || d.name, file_url: d.file_url };
    });
  }

  function bindGrantEvents() {
    // Toggle grant cards
    _qAll('[data-action="toggle-grant"]').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-grant-idx'));
        var grant = STATE.filteredGrants[idx];
        if (!grant) return;
        STATE.expandedGrant = STATE.expandedGrant === grant.name ? null : grant.name;
        renderGrantCards();
      });
    });

    // Doc chip clicks → slideout
    _qAll('[data-action="view-grant-doc"]').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var docName = chip.getAttribute('data-doc-name');
        var doc = findDocByName(docName);
        if (doc && doc.file_url) {
          var label = humanizeGrantDocField(doc.source_field, doc.file_name);
          openSlideout(label, doc.file_url, doc.partner_name || '', doc.source_doctype || 'Document Registry', doc.name);
        }
      });
    });

    // ZIP download for grant
    _qAll('[data-action="zip-grant"]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var grantName = el.getAttribute('data-grant-name');
        var grant = STATE.allGrants.find(function(g) { return g.name === grantName; });
        if (!grant) return;
        var files = collectGrantFiles(grant);
        if (!files.length) return;
        files.forEach(function(f) { logDownload(grant.grant_name, f.file_name, 'Grant ZIP download'); });
        bulkDownloadZip(files, {
          zipName: (grant.grant_name || grant.name).replace(/[^a-zA-Z0-9]/g, '_') + '_Documents.zip',
          onComplete: function(result) {
            frappe.show_alert({ message: result.fetched + ' files downloaded as ZIP', indicator: result.errors > 0 ? 'orange' : 'green' });
          },
          onError: function(err) {
            frappe.show_alert({ message: 'ZIP failed: ' + err.message, indicator: 'red' });
          }
        });
      });
    });
  }

  // ── Grants Tab Filters ──
  function applyGrantFilters() {
    var search = (_el('grant-search').value || '').trim();
    var statusFilter = _el('grant-filter-status').value;
    var filtered = STATE.allGrants.slice();

    if (search) {
      filtered = fuzzyFilterRecords(filtered, search, function(g) {
        return [g.grant_name || '', g.ngo_name || '', g.name || '', g.fy || ''];
      });
    }

    if (statusFilter) {
      filtered = filtered.filter(function(g) { return g.grant_status === statusFilter; });
    }

    STATE.filteredGrants = filtered;

    var activeCount = (search ? 1 : 0) + (statusFilter ? 1 : 0);
    var resetBtn = _el('grant-reset');
    if (activeCount > 0) {
      resetBtn.style.display = 'inline-flex';
      _el('grant-filter-count').textContent = activeCount;
    } else {
      resetBtn.style.display = 'none';
    }

    renderGrantKPIs();
    renderGrantCards();
  }

  function resetGrantFilters() {
    _el('grant-search').value = '';
    _el('grant-filter-status').value = '';
    STATE.expandedGrant = null;
    applyGrantFilters();
  }

  // ══════════════════════════════════════════════════════════════
  //  GAF / PROPOSALS TAB — Phase 3
  // ══════════════════════════════════════════════════════════════

  function getWfBadgeClass(wfCategory) {
    var map = {
      approved: 'wf-approved', gaf_approved: 'wf-gaf-approved',
      in_review: 'wf-pending-pm', submitted: 'wf-submitted',
      rejected: 'wf-rejected', pending: 'wf-pending'
    };
    return map[wfCategory] || 'wf-pending';
  }

  function getWfBadgeLabel(wfState) {
    // Short readable label
    var map = {
      'Approved': 'Approved',
      'GAF Approved': 'GAF Approved',
      'Pending at PM': 'At PM',
      'Pending at SPM': 'At SPM',
      'Pending at PL': 'At PL',
      'Proposal Submitted': 'Submitted',
      'Rejected': 'Rejected',
      'Pending': 'Pending'
    };
    return map[wfState] || wfState || 'Unknown';
  }

  function getMouPillClass(mouStatus) {
    if (mouStatus === 'signed') return 'mou-signed';
    if (mouStatus === 'draft_only') return 'mou-draft';
    return 'mou-none';
  }

  function getMouPillLabel(mouStatus) {
    if (mouStatus === 'signed') return '✓ MoU Signed';
    if (mouStatus === 'draft_only') return 'Draft MoU';
    return 'No MoU';
  }

  function renderGafKPIs() {
    var proposals = STATE.filteredProposals;
    var total = proposals.length;
    var approved = proposals.filter(function(p) {
      return p.wfCategory === 'approved' || p.wfCategory === 'gaf_approved';
    }).length;
    var inReview = proposals.filter(function(p) {
      return p.wfCategory === 'in_review' || p.wfCategory === 'submitted';
    }).length;
    var mouSigned = proposals.filter(function(p) {
      return p.mouStatus === 'signed';
    }).length;

    _el('kpi-total-gafs').textContent = formatIN(total);
    _el('kpi-total-gafs').title = total + ' proposals';
    _el('kpi-gafs-approved').textContent = formatIN(approved);
    _el('kpi-gafs-approved').title = approved + ' approved proposals';
    _el('kpi-gafs-review').textContent = formatIN(inReview);
    _el('kpi-gafs-review').title = inReview + ' proposals under review';
    _el('kpi-gafs-mou').textContent = formatIN(mouSigned);
    _el('kpi-gafs-mou').title = mouSigned + ' proposals with signed MoU';
  }

  function renderGafCards() {
    var proposals = STATE.filteredProposals;
    var container = _el('gaf-cards-container');
    var emptyEl = _el('gaf-empty');
    var footerEl = _el('gaf-table-footer');

    if (proposals.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = 'flex';
      footerEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    footerEl.style.display = 'block';
    _el('gaf-showing').textContent = 'Showing ' + formatIN(proposals.length) + ' of ' + formatIN(STATE.allProposals.length) + ' proposals';

    var html = '';
    proposals.forEach(function(p, idx) {
      var isOpen = STATE.expandedProposal === p.name;
      var cardClass = 'gaf-card' + (isOpen ? ' open' : '');

      // Sub info: NGO · Year · Budget
      var subParts = [p.ngo_name, p.year, p.budgetStr].filter(Boolean);

      html += '<div class="' + cardClass + '" data-gaf-idx="' + idx + '">';
      html += '<div class="gaf-hdr" data-action="toggle-gaf" data-gaf-idx="' + idx + '">';
      html += '<span class="g-arrow">&#9654;</span>';
      html += '<div class="g-info">';
      html += '<h3>' + escHtml(p.proposal_name) + '</h3>';
      html += '<div class="g-sub">' + escHtml(subParts.join(' · ')) + '</div>';
      html += '</div>';
      html += '<div class="g-badges">';
      html += '<span class="wf-badge ' + getWfBadgeClass(p.wfCategory) + '">' + getWfBadgeLabel(p.wf_state) + '</span>';
      html += '<span class="mou-pill ' + getMouPillClass(p.mouStatus) + '">' + getMouPillLabel(p.mouStatus) + '</span>';
      html += '</div>';
      html += '</div>';

      // Body — only render if open
      if (isOpen) {
        html += '<div class="gaf-body">';
        html += buildGafBody(p);
        html += '</div>';
      }

      html += '</div>';
    });

    container.innerHTML = html;
    bindGafEvents();
  }

  function buildGafBody(p) {
    var html = '';

    // Detail grid
    html += '<div class="gaf-detail-grid">';
    html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Proposal ID</span><span class="gaf-detail-value">' + escHtml(p.name) + '</span></div>';
    html += '<div class="gaf-detail-item"><span class="gaf-detail-label">NGO Partner</span><span class="gaf-detail-value">' + escHtml(p.ngo_name) + '</span></div>';
    if (p.donor_name) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Donor</span><span class="gaf-detail-value">' + escHtml(p.donor_name) + '</span></div>';
    if (p.programme) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Programme</span><span class="gaf-detail-value">' + escHtml(resolveThemeName(p.programme) || p.programme) + '</span></div>';
    if (p.budgetStr) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Planned Budget</span><span class="gaf-detail-value">' + p.budgetStr + '</span></div>';
    if (p.year) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Year</span><span class="gaf-detail-value">' + escHtml(p.year) + '</span></div>';
    if (p.start_date) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Start Date</span><span class="gaf-detail-value">' + formatDate(p.start_date) + '</span></div>';
    if (p.end_date) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">End Date</span><span class="gaf-detail-value">' + formatDate(p.end_date) + '</span></div>';
    if (p.wf_state) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Workflow Status</span><span class="gaf-detail-value"><span class="wf-badge ' + getWfBadgeClass(p.wfCategory) + '">' + escHtml(p.wf_state) + '</span></span></div>';
    if (p.implementation_type) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Implementation</span><span class="gaf-detail-value">' + escHtml(p.implementation_type) + '</span></div>';
    if (p.funding_type) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Funding Type</span><span class="gaf-detail-value">' + escHtml(p.funding_type) + '</span></div>';
    html += '</div>';

    // MoU Section
    html += '<div class="mou-section">';
    html += '<div class="mou-section-title">MoU Documents</div>';
    html += '<div class="mou-cards">';

    // Draft MoU card
    if (p.hasDraftMou) {
      html += '<div class="mou-card has-file" data-action="view-mou" data-url="' + escAttr(p.draftMouUrl) + '" data-label="Draft MoU — ' + escAttr(p.proposal_name) + '">';
      html += '<span class="mou-icon">📄</span>';
      html += '<div class="mou-info">';
      html += '<div class="mou-label">Draft MoU</div>';
      html += '<div class="mou-meta">' + getFileName(p.draftMouUrl) + '</div>';
      html += '</div>';
      html += '<span class="mou-status ms-ok">✓ Available</span>';
      html += '</div>';
    } else {
      html += '<div class="mou-card no-file">';
      html += '<span class="mou-icon">📄</span>';
      html += '<div class="mou-info">';
      html += '<div class="mou-label">Draft MoU</div>';
      html += '<div class="mou-meta">Not uploaded</div>';
      html += '</div>';
      html += '<span class="mou-status ms-missing">—</span>';
      html += '</div>';
    }

    // Signed MoU card
    if (p.hasSignedMou) {
      var verifiedBadge = p.mouVerified ? '✓ Verified' : '✓ Uploaded';
      var verifiedClass = p.mouVerified ? 'ms-verified' : 'ms-ok';
      html += '<div class="mou-card has-file" data-action="view-mou" data-url="' + escAttr(p.signedMouUrl) + '" data-label="Signed MoU — ' + escAttr(p.proposal_name) + '">';
      html += '<span class="mou-icon">📝</span>';
      html += '<div class="mou-info">';
      html += '<div class="mou-label">Signed MoU</div>';
      html += '<div class="mou-meta">' + getFileName(p.signedMouUrl);
      if (p.mouSigningDate) html += ' · Signed: ' + formatDate(p.mouSigningDate);
      html += '</div>';
      html += '</div>';
      html += '<span class="mou-status ' + verifiedClass + '">' + verifiedBadge + '</span>';
      html += '</div>';
    } else {
      html += '<div class="mou-card no-file">';
      html += '<span class="mou-icon">📝</span>';
      html += '<div class="mou-info">';
      html += '<div class="mou-label">Signed MoU</div>';
      html += '<div class="mou-meta">Not uploaded</div>';
      html += '</div>';
      html += '<span class="mou-status ms-missing">—</span>';
      html += '</div>';
    }

    html += '</div>'; // .mou-cards
    html += '</div>'; // .mou-section

    // Link to source record
    html += '<div class="grant-dl">';
    html += '<a href="/app/proposal/' + encodeURIComponent(p.name) + '" target="_blank">Open Proposal →</a>';
    html += '</div>';

    return html;
  }

  function getFileName(url) {
    if (!url) return '';
    var parts = url.split('/');
    var fn = parts[parts.length - 1] || '';
    // Decode and truncate
    try { fn = decodeURIComponent(fn); } catch(e) {}
    if (fn.length > 40) fn = fn.substring(0, 37) + '...';
    return fn;
  }

  function bindGafEvents() {
    // Toggle expand
    _qAll('[data-action="toggle-gaf"]').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-gaf-idx'));
        var p = STATE.filteredProposals[idx];
        if (!p) return;
        STATE.expandedProposal = STATE.expandedProposal === p.name ? null : p.name;
        renderGafCards();
      });
    });

    // View MoU in slideout
    _qAll('[data-action="view-mou"]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var url = el.getAttribute('data-url');
        var label = el.getAttribute('data-label') || 'MoU Document';
        openMouSlideout(url, label);
      });
    });
  }

  function openMouSlideout(url, label) {
    _el('slideout-title').textContent = label;
    var body = _el('slideout-body');

    var fn = getFileName(url);
    var ext = fn.split('.').pop().toLowerCase();
    var isImage = ['jpg','jpeg','png','gif','webp'].indexOf(ext) !== -1;
    var isPdf = ext === 'pdf';

    var html = '<div class="slideout-doc-name">' + escHtml(fn) + '</div>';
    html += '<div class="slideout-doc-meta">Attached to proposal</div>';

    // Preview
    if (isImage) {
      html += '<img src="' + escAttr(url) + '" style="width:100%;border-radius:8px;margin:16px 0;border:1px solid var(--gray-200);" />';
    } else if (isPdf) {
      html += '<iframe src="' + escAttr(url) + '" style="width:100%;height:400px;border-radius:8px;margin:16px 0;border:1px solid var(--gray-200);"></iframe>';
    }

    html += '<div class="slideout-actions">';
    html += '<a class="slideout-btn" href="' + escAttr(url) + '" download>';
    html += '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 14v3h14v-3M10 3v10m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    html += '<div><div class="slideout-btn-label">Download</div><div class="slideout-btn-sub">' + escHtml(fn) + '</div></div>';
    html += '</a>';
    html += '<a class="slideout-btn" href="' + escAttr(url) + '" target="_blank">';
    html += '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M11 3h6v6M17 3L8 12M14 11v5a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    html += '<div><div class="slideout-btn-label">Open in new tab</div><div class="slideout-btn-sub">Full view</div></div>';
    html += '</a>';
    html += '</div>';

    body.innerHTML = html;
    _el('dcc-slideout').style.display = 'block';

    // Log audit
    try {
      logDownloadAudit(fn, url, 'MoU Document', label);
    } catch(e) {}
  }

  // ── GAF Filters ──

  function applyGafFilters() {
    var search = (_el('gaf-search').value || '').trim();
    var wfFilter = _el('gaf-filter-wfstate').value;
    var mouFilter = _el('gaf-filter-mou').value;
    var filtered = STATE.allProposals.slice();

    if (search) {
      filtered = fuzzyFilterRecords(filtered, search, function(p) {
        return [p.proposal_name || '', p.name || '', p.ngo_name || '', p.donor_name || '', p.year || ''];
      });
    }

    if (wfFilter === 'approved') {
      filtered = filtered.filter(function(p) { return p.wfCategory === 'approved' || p.wfCategory === 'gaf_approved'; });
    } else if (wfFilter === 'in_review') {
      filtered = filtered.filter(function(p) { return p.wfCategory === 'in_review' || p.wfCategory === 'submitted'; });
    } else if (wfFilter === 'rejected') {
      filtered = filtered.filter(function(p) { return p.wfCategory === 'rejected'; });
    } else if (wfFilter === 'pending') {
      filtered = filtered.filter(function(p) { return p.wfCategory === 'pending'; });
    }

    if (mouFilter === 'signed') {
      filtered = filtered.filter(function(p) { return p.mouStatus === 'signed'; });
    } else if (mouFilter === 'draft_only') {
      filtered = filtered.filter(function(p) { return p.mouStatus === 'draft_only'; });
    } else if (mouFilter === 'none') {
      filtered = filtered.filter(function(p) { return p.mouStatus === 'none'; });
    }

    STATE.filteredProposals = filtered;

    var activeCount = (search ? 1 : 0) + (wfFilter ? 1 : 0) + (mouFilter ? 1 : 0);
    var resetBtn = _el('gaf-reset');
    if (activeCount > 0) {
      resetBtn.style.display = 'inline-flex';
      _el('gaf-filter-count').textContent = activeCount;
    } else {
      resetBtn.style.display = 'none';
    }

    renderGafKPIs();
    renderGafCards();
  }

  function resetGafFilters() {
    _el('gaf-search').value = '';
    _el('gaf-filter-wfstate').value = '';
    _el('gaf-filter-mou').value = '';
    STATE.expandedProposal = null;
    applyGafFilters();
  }

  // ══════════════════════════════════════════════════════════════
  //  VENDORS TAB — Phase 4
  // ══════════════════════════════════════════════════════════════

  function getVsClass(status) {
    if (status === 'Current Grantee') return 'vs-current';
    if (status === 'Prospect') return 'vs-prospect';
    return 'vs-former';
  }

  function renderVendorKPIs() {
    var vendors = STATE.filteredVendors;
    var total = vendors.length;
    var ddCleared = vendors.filter(function(v) { return v.ddCleared; }).length;
    var totalDocs = 0, missingDocs = 0;
    vendors.forEach(function(v) {
      totalDocs += v.mandatoryUploaded;
      missingDocs += (v.mandatoryTotal - v.mandatoryUploaded);
    });

    _el('kpi-total-vendors').textContent = formatIN(total);
    _el('kpi-total-vendors').title = total + ' vendors';
    _el('kpi-vendor-dd-cleared').textContent = formatIN(ddCleared);
    _el('kpi-vendor-dd-cleared').title = ddCleared + ' vendors with DD cleared';
    _el('kpi-vendor-docs').textContent = formatIN(totalDocs);
    _el('kpi-vendor-docs').title = totalDocs + ' compliance docs uploaded';
    _el('kpi-vendor-missing').textContent = formatIN(missingDocs);
    _el('kpi-vendor-missing').title = missingDocs + ' mandatory docs missing';
  }

  function renderVendorCards() {
    var vendors = STATE.filteredVendors;
    var container = _el('vendor-cards-container');
    var emptyEl = _el('vendor-empty');
    var footerEl = _el('vendor-table-footer');

    if (vendors.length === 0) {
      container.innerHTML = '';
      emptyEl.style.display = 'flex';
      footerEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    footerEl.style.display = 'block';
    _el('vendor-showing').textContent = 'Showing ' + formatIN(vendors.length) + ' of ' + formatIN(STATE.allVendors.length) + ' vendors';

    var html = '';
    vendors.forEach(function(v, idx) {
      var isOpen = STATE.expandedVendor === v.name;
      var cardClass = 'vendor-card' + (isOpen ? ' open' : '');

      var subParts = [v.location, v.contact, v.designation].filter(Boolean);

      html += '<div class="' + cardClass + '" data-vendor-idx="' + idx + '">';
      html += '<div class="vendor-hdr" data-action="toggle-vendor" data-vendor-idx="' + idx + '">';
      html += '<span class="g-arrow">&#9654;</span>';
      html += '<div class="g-info">';
      html += '<h3>' + escHtml(v.vendor_name) + '</h3>';
      html += '<div class="g-sub">' + escHtml(subParts.join(' · ')) + '</div>';
      html += '</div>';
      html += '<div class="g-badges">';
      // DD badge
      if (v.ddCleared) {
        html += '<span class="dd-badge dd-yes">DD ✓</span>';
      } else {
        html += '<span class="dd-badge dd-no">DD ✗</span>';
      }
      // Status badge
      html += '<span class="vs-badge ' + getVsClass(v.vendor_status) + '">' + escHtml(v.vendor_status || 'Unknown') + '</span>';
      // Score chip
      var scoreClass = v.score === 100 ? 'score-full' : (v.score >= 50 ? 'score-partial' : 'score-critical');
      html += '<span class="score-chip ' + scoreClass + '">' + v.mandatoryUploaded + '/' + v.mandatoryTotal + '</span>';
      html += '</div>';
      html += '</div>';

      if (isOpen) {
        html += '<div class="vendor-body">';
        html += buildVendorBody(v);
        html += '</div>';
      }

      html += '</div>';
    });

    container.innerHTML = html;
    bindVendorEvents();
  }

  function buildVendorBody(v) {
    var html = '';

    // Detail grid
    html += '<div class="gaf-detail-grid">';
    html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Vendor ID</span><span class="gaf-detail-value">' + escHtml(v.name) + '</span></div>';
    if (v.registration_number) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Registration No.</span><span class="gaf-detail-value">' + escHtml(v.registration_number) + '</span></div>';
    if (v.pan_number) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">PAN</span><span class="gaf-detail-value">' + escHtml(v.pan_number) + '</span></div>';
    if (v.email) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Email</span><span class="gaf-detail-value">' + escHtml(v.email) + '</span></div>';
    if (v.contact) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Contact Person</span><span class="gaf-detail-value">' + escHtml(v.contact) + (v.designation ? ' (' + escHtml(v.designation) + ')' : '') + '</span></div>';
    if (v.location) html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Location</span><span class="gaf-detail-value">' + escHtml(v.location) + '</span></div>';

    // DD status
    var ddHtml = '';
    if (v.ddCleared) {
      ddHtml = '<span class="dd-badge dd-yes">Cleared</span>';
      if (v.ddExpiry) {
        ddHtml += ' &nbsp; Valid until: ' + formatDate(v.ddExpiry);
        if (v.ddExpiring) ddHtml += ' <span style="color:var(--amber-600);font-weight:600;">⚠ Expiring soon</span>';
      }
    } else {
      ddHtml = '<span class="dd-badge dd-no">Not Cleared</span>';
    }
    html += '<div class="gaf-detail-item"><span class="gaf-detail-label">Due Diligence</span><span class="gaf-detail-value">' + ddHtml + '</span></div>';
    html += '</div>';

    // Compliance Documents section
    html += '<div class="mou-section">';
    html += '<div class="mou-section-title">Compliance Documents</div>';
    html += '<div class="vendor-doc-grid">';

    // Registration Certificate
    if (v.regCertUrl) {
      html += '<div class="mou-card has-file" data-action="view-mou" data-url="' + escAttr(v.regCertUrl) + '" data-label="Registration Certificate — ' + escAttr(v.vendor_name) + '">';
      html += '<span class="mou-icon">📋</span>';
      html += '<div class="mou-info"><div class="mou-label">Registration Certificate</div>';
      html += '<div class="mou-meta">' + getFileName(v.regCertUrl) + '</div></div>';
      html += '<span class="mou-status ms-ok">✓ Uploaded</span>';
      html += '</div>';
    } else {
      html += '<div class="mou-card no-file">';
      html += '<span class="mou-icon">📋</span>';
      html += '<div class="mou-info"><div class="mou-label">Registration Certificate</div>';
      html += '<div class="mou-meta">Not uploaded</div></div>';
      html += '<span class="mou-status ms-missing">✗ Missing</span>';
      html += '</div>';
    }

    // PAN Copy
    if (v.panUrl) {
      html += '<div class="mou-card has-file" data-action="view-mou" data-url="' + escAttr(v.panUrl) + '" data-label="PAN Copy — ' + escAttr(v.vendor_name) + '">';
      html += '<span class="mou-icon">🆔</span>';
      html += '<div class="mou-info"><div class="mou-label">PAN Copy</div>';
      html += '<div class="mou-meta">' + getFileName(v.panUrl) + '</div></div>';
      html += '<span class="mou-status ms-ok">✓ Uploaded</span>';
      html += '</div>';
    } else {
      html += '<div class="mou-card no-file">';
      html += '<span class="mou-icon">🆔</span>';
      html += '<div class="mou-info"><div class="mou-label">PAN Copy</div>';
      html += '<div class="mou-meta">Not uploaded</div></div>';
      html += '<span class="mou-status ms-missing">✗ Missing</span>';
      html += '</div>';
    }

    // Any additional docs from Document Registry
    if (v.registryDocs.length > 0) {
      v.registryDocs.forEach(function(doc) {
        var hasUrl = doc.file_url && doc.file_url !== '';
        if (hasUrl) {
          html += '<div class="mou-card has-file" data-action="view-mou" data-url="' + escAttr(doc.file_url) + '" data-label="' + escAttr(doc.file_name || doc.source_field || 'Document') + '">';
          html += '<span class="mou-icon">📄</span>';
          html += '<div class="mou-info"><div class="mou-label">' + escHtml(doc.source_field || doc.file_name || 'Document') + '</div>';
          html += '<div class="mou-meta">' + getFileName(doc.file_url) + '</div></div>';
          html += '<span class="mou-status ms-ok">✓</span>';
          html += '</div>';
        }
      });
    }

    html += '</div>'; // vendor-doc-grid
    html += '</div>'; // mou-section

    // Link to source
    html += '<div class="grant-dl">';
    html += '<a href="/app/vendor/' + encodeURIComponent(v.name) + '" target="_blank">Open Vendor Record →</a>';
    html += '</div>';

    return html;
  }

  function bindVendorEvents() {
    _qAll('[data-action="toggle-vendor"]').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-vendor-idx'));
        var v = STATE.filteredVendors[idx];
        if (!v) return;
        STATE.expandedVendor = STATE.expandedVendor === v.name ? null : v.name;
        renderVendorCards();
      });
    });

    // MoU slideout is reused (view-mou action is bound globally via delegation or already bound)
    // Re-bind view-mou for vendor cards specifically
    _qAll('#tab-vendors [data-action="view-mou"]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var url = el.getAttribute('data-url');
        var label = el.getAttribute('data-label') || 'Vendor Document';
        openMouSlideout(url, label);
      });
    });
  }

  // ── Vendor Filters ──

  function applyVendorFilters() {
    var search = (_el('vendor-search').value || '').trim();
    var ddFilter = _el('vendor-filter-dd').value;
    var statusFilter = _el('vendor-filter-status').value;
    var filtered = STATE.allVendors.slice();

    if (search) {
      filtered = fuzzyFilterRecords(filtered, search, function(v) {
        return [v.vendor_name || '', v.name || '', v.location || '', v.contact || '', v.email || ''];
      });
    }

    if (ddFilter === 'Yes') {
      filtered = filtered.filter(function(v) { return v.ddCleared; });
    } else if (ddFilter === 'No') {
      filtered = filtered.filter(function(v) { return !v.ddCleared; });
    }

    if (statusFilter) {
      filtered = filtered.filter(function(v) { return v.vendor_status === statusFilter; });
    }

    STATE.filteredVendors = filtered;

    var activeCount = (search ? 1 : 0) + (ddFilter ? 1 : 0) + (statusFilter ? 1 : 0);
    var resetBtn = _el('vendor-reset');
    if (activeCount > 0) {
      resetBtn.style.display = 'inline-flex';
      _el('vendor-filter-count').textContent = activeCount;
    } else {
      resetBtn.style.display = 'none';
    }

    renderVendorKPIs();
    renderVendorCards();
  }

  function resetVendorFilters() {
    _el('vendor-search').value = '';
    _el('vendor-filter-dd').value = '';
    _el('vendor-filter-status').value = '';
    STATE.expandedVendor = null;
    applyVendorFilters();
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
  //  INIT
  // ══════════════════════════════════════════════════════════════

  function init() {
    loadData().then(function(results) {
      processData(results);

      _el('dcc-loading').style.display = 'none';
      _el('dcc-main').style.display = 'block';

      setupTabs();

      // Populate thematic area filter with resolved names
      var sel = _el('ngo-filter-theme');
      STATE.thematicAreas.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t; opt.textContent = resolveThemeName(t);
        sel.appendChild(opt);
      });

      // Keyboard fix
      fixShadowDomKeyboard(_el('ngo-search'), { onEnter: function() { applyFilters(); } });

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

      // ── Grants tab setup ──
      fixShadowDomKeyboard(_el('grant-search'), { onEnter: function() { applyGrantFilters(); } });
      _el('grant-search').addEventListener('input', debounce(applyGrantFilters, 300));
      _el('grant-filter-status').addEventListener('change', applyGrantFilters);
      _el('grant-reset').addEventListener('click', resetGrantFilters);

      // ── GAF tab setup ──
      fixShadowDomKeyboard(_el('gaf-search'), { onEnter: function() { applyGafFilters(); } });
      _el('gaf-search').addEventListener('input', debounce(applyGafFilters, 300));
      _el('gaf-filter-wfstate').addEventListener('change', applyGafFilters);
      _el('gaf-filter-mou').addEventListener('change', applyGafFilters);
      _el('gaf-reset').addEventListener('click', resetGafFilters);

      // ── Vendors tab setup ──
      fixShadowDomKeyboard(_el('vendor-search'), { onEnter: function() { applyVendorFilters(); } });
      _el('vendor-search').addEventListener('input', debounce(applyVendorFilters, 300));
      _el('vendor-filter-dd').addEventListener('change', applyVendorFilters);
      _el('vendor-filter-status').addEventListener('change', applyVendorFilters);
      _el('vendor-reset').addEventListener('click', resetVendorFilters);

      renderKPIs();
      renderMatrix();
      renderGrantKPIs();
      renderGrantCards();
      renderGafKPIs();
      renderGafCards();
      renderVendorKPIs();
      renderVendorCards();
    }).catch(function(err) {
      console.error('Document Command Center load error:', err);
      _el('dcc-loading').innerHTML = '<div style="padding:40px;text-align:center;color:#DC2626;">'
        + '<div style="font-size:16px;font-weight:600;">Failed to load data</div>'
        + '<div style="font-size:13px;color:#6B7280;margin-top:8px;">' + escHtml(String(err)) + '</div>'
        + '<button class="btn-primary" style="margin-top:16px;" onclick="location.reload()">Retry</button>'
        + '</div>';
    });
  }

  init();

})();
