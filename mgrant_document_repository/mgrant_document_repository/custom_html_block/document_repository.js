(function() {
    // ── Shadow DOM helpers ──
    function _q(sel)    { return root_element.querySelector(sel); }
    function _qAll(sel) { return root_element.querySelectorAll(sel); }
    function _el(id)    { return root_element.querySelector('#' + id); }

    // ══════════════════════════════════════════════════════════════════
    //  Fuzzy Search — Trigram-based (from mgrant-frappe-patterns)
    // ══════════════════════════════════════════════════════════════════

    function trigrams(str) {
        var t = {};
        var s = '  ' + str.toLowerCase().replace(/\s+/g, ' ').trim() + '  ';
        for (var i = 0; i < s.length - 2; i++) {
            t[s.substr(i, 3)] = true;
        }
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
            var parts = val.toLowerCase().split(/\s+/);
            return parts.some(function(part) {
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
            var fieldValues = getFields(record);
            var hay = fieldValues.filter(Boolean).join(' ').toLowerCase();
            var fuzzyFields = fieldValues.filter(Boolean);
            return words.every(function(word) {
                if (hay.indexOf(word) !== -1) return true;
                return fuzzyMatchFields(word, fuzzyFields, threshold);
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  Shadow DOM Keyboard Fix (from mgrant-frappe-patterns)
    // ══════════════════════════════════════════════════════════════════

    function fixShadowDomKeyboard(inputEl, options) {
        if (!inputEl) return;
        var opts = options || {};
        var preventDefault = opts.preventDefault !== undefined ? opts.preventDefault : true;
        ['keydown', 'keypress', 'keyup'].forEach(function(evt) {
            inputEl.addEventListener(evt, function(e) {
                e.stopPropagation();
                if (opts.onEnter && e.type === 'keydown' && (e.key === 'Enter' || e.keyCode === 13)) {
                    if (preventDefault) e.preventDefault();
                    opts.onEnter(e);
                }
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  Client-side XLSX Export (from mgrant-frappe-patterns)
    // ══════════════════════════════════════════════════════════════════

    function loadXlsxLib() {
        return new Promise(function(resolve, reject) {
            if (window.XLSX && window.XLSX.utils && window.XLSX.utils.aoa_to_sheet) {
                resolve(); return;
            }
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
            s.onload = function() { resolve(); };
            s.onerror = function() { reject(new Error('Failed to load XLSX library')); };
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
        cell.s = s;
        return cell;
    }

    function autoWidth(ws, data) {
        if (!data || !data.length) return;
        var colCount = 0;
        data.forEach(function(row) { if (row.length > colCount) colCount = row.length; });
        var widths = [];
        for (var c = 0; c < colCount; c++) {
            var maxLen = 8;
            data.forEach(function(row) {
                if (row[c]) {
                    var val = row[c].v !== undefined ? String(row[c].v) : String(row[c]);
                    if (val.length > maxLen) maxLen = val.length;
                }
            });
            widths.push({ wch: Math.min(maxLen + 2, 45) });
        }
        ws['!cols'] = widths;
    }

    // ══════════════════════════════════════════════════════════════════
    //  JSZip Loader (for bulk download)
    // ══════════════════════════════════════════════════════════════════

    function loadJSZip() {
        return new Promise(function(resolve, reject) {
            if (window.JSZip) { resolve(window.JSZip); return; }
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
            s.onload = function() { resolve(window.JSZip); };
            s.onerror = function() { reject(new Error('Failed to load JSZip library')); };
            document.head.appendChild(s);
        });
    }

    // ── State ──
    var state = {
        filters: { module: '', category: '', filetype: '', compliance: '', search: '', dateFrom: '', dateTo: '' },
        sort: { field: 'upload_date', order: 'desc' },
        page: 1,
        pageSize: 20,
        totalCount: 0,
        data: [],
        allSearchData: [],
        searchMode: false,
        counts: { modules: {}, categories: {}, filetypes: {}, compliance: {} },
        totalSize: 0,
        lastUpload: null,
        selected: {},       // { docName: { file_name, file_url } }
        auditPage: 0,
        auditData: []
    };

    // ── Badge helpers ──
    function typeBadgeClass(t) {
        var map = { 'PDF': 'badge-pdf', 'Document': 'badge-document', 'Spreadsheet': 'badge-spreadsheet',
            'Image': 'badge-image', 'Video': 'badge-video', 'Presentation': 'badge-presentation' };
        return map[t] || 'badge-other';
    }

    function catBadgeClass(c) {
        var cl = (c || '').toLowerCase();
        if (cl.indexOf('detail') >= 0) return 'badge-cat-details';
        if (cl.indexOf('document') >= 0) return 'badge-cat-documents';
        if (cl.indexOf('due') >= 0 || cl.indexOf('diligence') >= 0) return 'badge-cat-due-diligence';
        if (cl.indexOf('fund') >= 0 || cl.indexOf('disbursement') >= 0) return 'badge-cat-fund';
        if (cl.indexOf('utilis') >= 0) return 'badge-cat-utilisation';
        if (cl.indexOf('report') >= 0 || cl.indexOf('budget') >= 0) return 'badge-cat-reporting';
        if (cl.indexOf('file') >= 0) return 'badge-cat-files';
        if (cl.indexOf('bank') >= 0) return 'badge-cat-bank';
        return 'badge-cat-default';
    }

    function fileIcon(type) {
        var map = {
            'PDF': ['PDF', 'fname-icon-pdf'], 'Document': ['DOC', 'fname-icon-doc'],
            'Spreadsheet': ['XLS', 'fname-icon-xls'], 'Image': ['IMG', 'fname-icon-img'],
            'Video': ['VID', 'fname-icon-vid'], 'Presentation': ['PPT', 'fname-icon-ppt']
        };
        return map[type] || ['FILE', 'fname-icon-other'];
    }

    function typeColorDot(type) {
        var map = {
            'PDF': '#DC2626', 'Document': '#2563EB', 'Spreadsheet': '#059669',
            'Image': '#7C3AED', 'Video': '#D97706', 'Presentation': '#EA580C'
        };
        return map[type] || '#6B7280';
    }

    function complianceColorDot(status) {
        var map = { 'Active': '#059669', 'Expired': '#DC2626', 'Pending': '#D97706', 'NA': '#9CA3AF' };
        return map[status] || '#9CA3AF';
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    function formatDate(d) {
        if (!d) return '—';
        var dt = new Date(d);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear();
    }

    function formatDateTime(d) {
        if (!d) return '—';
        var dt = new Date(d);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var h = dt.getHours(), m = dt.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear() + ', '
            + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    function relativeTime(d) {
        if (!d) return '—';
        var now = new Date();
        var dt = new Date(d);
        var diff = Math.floor((now - dt) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return formatDate(d);
    }

    function escapeHtml(s) {
        if (!s) return '';
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Build Frappe filters (server-side) ──
    function buildFilters() {
        var filters = [];
        if (state.filters.module) filters.push(['source_doctype', '=', state.filters.module]);
        if (state.filters.category) filters.push(['source_category', '=', state.filters.category]);
        if (state.filters.filetype) filters.push(['file_type', '=', state.filters.filetype]);
        if (state.filters.compliance) filters.push(['compliance_status', '=', state.filters.compliance]);
        if (state.filters.dateFrom) filters.push(['upload_date', '>=', state.filters.dateFrom]);
        if (state.filters.dateTo) filters.push(['upload_date', '<=', state.filters.dateTo]);
        return filters;
    }

    var FIELDS = ['name', 'file_name', 'file_url', 'file_type', 'file_extension',
                  'file_size', 'file_size_display', 'source_doctype', 'source_name',
                  'source_record_title', 'source_category', 'partner', 'partner_name',
                  'project', 'project_title', 'donor', 'upload_date', 'uploaded_by_name',
                  'compliance_status', 'frappe_file', 'programme'];

    // ══════════════════════════════════════════════════════════════════
    //  Selection / Bulk Download
    // ══════════════════════════════════════════════════════════════════

    function getSelectedCount() {
        return Object.keys(state.selected).length;
    }

    function updateSelectionBar() {
        var count = getSelectedCount();
        var bar = _el('selection-bar');
        if (count > 0) {
            bar.style.display = 'flex';
            _el('selection-count').textContent = count + ' selected';
        } else {
            bar.style.display = 'none';
        }
        // Update "select all" checkbox state
        var selectAll = _el('select-all');
        if (selectAll) {
            var rows = _el('doc-tbody').querySelectorAll('tr[data-name]');
            var allChecked = rows.length > 0;
            rows.forEach(function(r) {
                if (!state.selected[r.getAttribute('data-name')]) allChecked = false;
            });
            selectAll.checked = allChecked && rows.length > 0;
            selectAll.indeterminate = count > 0 && !allChecked;
        }
    }

    function clearSelection() {
        state.selected = {};
        _el('doc-tbody').querySelectorAll('.row-check').forEach(function(cb) { cb.checked = false; });
        _el('doc-tbody').querySelectorAll('tr.row-selected').forEach(function(r) { r.classList.remove('row-selected'); });
        updateSelectionBar();
    }

    // Select All checkbox
    var selectAllCb = _el('select-all');
    if (selectAllCb) {
        selectAllCb.addEventListener('change', function() {
            var checked = this.checked;
            _el('doc-tbody').querySelectorAll('tr[data-name]').forEach(function(row) {
                var name = row.getAttribute('data-name');
                var url = row.getAttribute('data-url');
                var fname = row.getAttribute('data-fname');
                var cb = row.querySelector('.row-check');
                if (cb) cb.checked = checked;
                if (checked) {
                    row.classList.add('row-selected');
                    if (url) state.selected[name] = { file_name: fname || name, file_url: url };
                } else {
                    row.classList.remove('row-selected');
                    delete state.selected[name];
                }
            });
            updateSelectionBar();
        });
    }

    // Clear selection button
    _el('btn-clear-selection').addEventListener('click', clearSelection);

    // Download ZIP button
    _el('btn-download-zip').addEventListener('click', function() {
        var files = [];
        for (var key in state.selected) {
            if (state.selected[key].file_url) {
                files.push(state.selected[key]);
            }
        }
        if (files.length === 0) {
            frappe.show_alert({ message: 'No downloadable files selected', indicator: 'orange' });
            return;
        }

        var btn = this;
        btn.disabled = true;
        btn.textContent = 'Preparing ZIP...';

        loadJSZip().then(function(JSZip) {
            var zip = new JSZip();
            var fetched = 0;
            var errors = 0;
            var total = files.length;

            // Track filenames to avoid duplicates
            var usedNames = {};
            function uniqueName(name) {
                if (!usedNames[name]) { usedNames[name] = 1; return name; }
                usedNames[name]++;
                var ext = name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '';
                var base = ext ? name.slice(0, name.lastIndexOf('.')) : name;
                return base + ' (' + usedNames[name] + ')' + ext;
            }

            files.forEach(function(f) {
                var url = f.file_url;
                // Make absolute URL
                if (url.startsWith('/')) url = window.location.origin + url;

                fetch(url, { credentials: 'include' }).then(function(resp) {
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    return resp.blob();
                }).then(function(blob) {
                    zip.file(uniqueName(f.file_name || 'file'), blob);
                    fetched++;
                    btn.textContent = 'Zipping ' + fetched + '/' + total + '...';
                    if (fetched + errors === total) finishZip();
                }).catch(function() {
                    errors++;
                    if (fetched + errors === total) finishZip();
                });
            });

            function finishZip() {
                if (fetched === 0) {
                    btn.disabled = false;
                    btn.textContent = 'Download ZIP';
                    frappe.show_alert({ message: 'Could not fetch any files', indicator: 'red' });
                    return;
                }
                zip.generateAsync({ type: 'blob' }).then(function(content) {
                    var a = document.createElement('a');
                    a.href = URL.createObjectURL(content);
                    var ts = new Date().toISOString().slice(0, 10);
                    a.download = 'Documents_' + ts + '.zip';
                    a.click();
                    URL.revokeObjectURL(a.href);
                    btn.disabled = false;
                    btn.textContent = 'Download ZIP';
                    var msg = fetched + ' files downloaded';
                    if (errors > 0) msg += ' (' + errors + ' failed)';
                    frappe.show_alert({ message: msg, indicator: errors > 0 ? 'orange' : 'green' });
                });
            }
        }).catch(function() {
            btn.disabled = false;
            btn.textContent = 'Download ZIP';
            frappe.show_alert({ message: 'Failed to load ZIP library', indicator: 'red' });
        });
    });

    // ── Fetch data ──
    function fetchData() {
        showSkeleton();
        var filters = buildFilters();
        var searchText = state.filters.search.trim();

        if (searchText) {
            state.searchMode = true;
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Document Registry', fields: FIELDS, filters: filters,
                    order_by: state.sort.field + ' ' + state.sort.order, limit_page_length: 0
                },
                async: true,
                callback: function(r) {
                    var all = r.message || [];
                    var filtered = fuzzyFilterRecords(all, searchText, function(rec) {
                        return [rec.file_name, rec.partner_name || rec.partner,
                                rec.source_record_title || rec.source_name, rec.source_category,
                                rec.source_doctype, rec.donor, rec.uploaded_by_name,
                                rec.project_title || rec.project];
                    });
                    state.allSearchData = filtered;
                    state.totalCount = filtered.length;
                    var start = (state.page - 1) * state.pageSize;
                    state.data = filtered.slice(start, start + state.pageSize);
                    renderTable();
                    renderPagination();
                    _el('stat-count').textContent = state.totalCount + ' document' + (state.totalCount !== 1 ? 's' : '');
                }
            });
        } else {
            state.searchMode = false;
            state.allSearchData = [];
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Document Registry', fields: FIELDS, filters: filters,
                    order_by: state.sort.field + ' ' + state.sort.order,
                    limit_start: (state.page - 1) * state.pageSize, limit_page_length: state.pageSize
                },
                async: true,
                callback: function(r) { state.data = r.message || []; renderTable(); }
            });
            frappe.call({
                method: 'frappe.client.get_count',
                args: { doctype: 'Document Registry', filters: filters },
                async: true,
                callback: function(r) {
                    state.totalCount = r.message || 0;
                    renderPagination();
                    _el('stat-count').textContent = state.totalCount + ' document' + (state.totalCount !== 1 ? 's' : '');
                }
            });
        }
    }

    // ── Fetch sidebar counts ──
    function fetchCounts() {
        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Document Registry', fields: ['source_doctype as label', 'count(name) as cnt'],
                    group_by: 'source_doctype', order_by: 'cnt desc', limit_page_length: 0 },
            async: true,
            callback: function(r) {
                state.counts.modules = {};
                var container = _el('module-items'); container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.modules[item.label] = item.cnt; total += item.cnt;
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label">' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-module-all').textContent = total;
                bindFilterClicks('module');
            }
        });

        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Document Registry', fields: ['source_category as label', 'count(name) as cnt'],
                    group_by: 'source_category', order_by: 'cnt desc', limit_page_length: 0 },
            async: true,
            callback: function(r) {
                state.counts.categories = {};
                var container = _el('category-items'); container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.categories[item.label] = item.cnt; total += item.cnt;
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label">' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-category-all').textContent = total;
                bindFilterClicks('category');
            }
        });

        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Document Registry', fields: ['file_type as label', 'count(name) as cnt'],
                    group_by: 'file_type', order_by: 'cnt desc', limit_page_length: 0 },
            async: true,
            callback: function(r) {
                state.counts.filetypes = {};
                var container = _el('filetype-items'); container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.filetypes[item.label] = item.cnt; total += item.cnt;
                    var dotColor = typeColorDot(item.label);
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label"><span class="color-dot" style="background:' + dotColor + ';"></span>' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-filetype-all').textContent = total;
                bindFilterClicks('filetype');
            }
        });

        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Document Registry', fields: ['compliance_status as label', 'count(name) as cnt'],
                    group_by: 'compliance_status', order_by: 'cnt desc', limit_page_length: 0 },
            async: true,
            callback: function(r) {
                state.counts.compliance = {};
                var container = _el('compliance-items'); container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.compliance[item.label] = item.cnt; total += item.cnt;
                    var dotColor = complianceColorDot(item.label);
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label"><span class="color-dot" style="background:' + dotColor + ';"></span>' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-compliance-all').textContent = total;
                bindFilterClicks('compliance');
            }
        });

        frappe.call({
            method: 'frappe.client.get_list',
            args: { doctype: 'Document Registry', fields: ['sum(file_size) as total_size', 'max(upload_date) as last_upload'],
                    limit_page_length: 1 },
            async: true,
            callback: function(r) {
                var d = (r.message || [{}])[0];
                state.totalSize = d.total_size || 0;
                state.lastUpload = d.last_upload;
                _el('stat-size').textContent = 'Total: ' + formatSize(state.totalSize);
                _el('stat-last').textContent = 'Last upload: ' + relativeTime(d.last_upload);
                _el('stat-last').title = d.last_upload ? formatDate(d.last_upload) : '';
            }
        });
    }

    // ── Bind sidebar filter clicks ──
    function bindFilterClicks(group) {
        var groupEl = _q('.filter-group[data-group="' + group + '"]');
        if (!groupEl) return;
        var stateKey = group;
        var allItems = groupEl.querySelectorAll('.filter-item');
        allItems.forEach(function(item) {
            var clone = item.cloneNode(true);
            item.parentNode.replaceChild(clone, item);
        });
        var items = groupEl.querySelectorAll('.filter-item');
        items.forEach(function(item) {
            item.addEventListener('click', function() {
                var val = this.getAttribute('data-value') || '';
                state.filters[stateKey] = val;
                items.forEach(function(i) { i.classList.remove('active'); });
                this.classList.add('active');
                state.page = 1;
                fetchData();
                renderActiveFilters();
            });
        });
    }

    // ── Render active filter pills ──
    function renderActiveFilters() {
        var container = _el('active-filters');
        var html = '';
        if (state.filters.module) html += '<span class="filter-pill">Module: ' + escapeHtml(state.filters.module) + ' <span class="pill-remove" data-clear="module">&times;</span></span>';
        if (state.filters.category) html += '<span class="filter-pill">Category: ' + escapeHtml(state.filters.category) + ' <span class="pill-remove" data-clear="category">&times;</span></span>';
        if (state.filters.filetype) html += '<span class="filter-pill">Type: ' + escapeHtml(state.filters.filetype) + ' <span class="pill-remove" data-clear="filetype">&times;</span></span>';
        if (state.filters.compliance) html += '<span class="filter-pill">Status: ' + escapeHtml(state.filters.compliance) + ' <span class="pill-remove" data-clear="compliance">&times;</span></span>';
        if (state.filters.search) html += '<span class="filter-pill">Search: "' + escapeHtml(state.filters.search) + '" <span class="pill-remove" data-clear="search">&times;</span></span>';
        if (state.filters.dateFrom || state.filters.dateTo) {
            var label = 'Date: ';
            if (state.filters.dateFrom && state.filters.dateTo) label += state.filters.dateFrom + ' to ' + state.filters.dateTo;
            else if (state.filters.dateFrom) label += 'from ' + state.filters.dateFrom;
            else label += 'until ' + state.filters.dateTo;
            html += '<span class="filter-pill">' + label + ' <span class="pill-remove" data-clear="date">&times;</span></span>';
        }
        container.innerHTML = html;

        container.querySelectorAll('.pill-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var key = this.getAttribute('data-clear');
                if (key === 'date') {
                    state.filters.dateFrom = ''; state.filters.dateTo = '';
                    var fromEl = _el('date-from'); var toEl = _el('date-to');
                    if (fromEl) fromEl.value = ''; if (toEl) toEl.value = '';
                } else { state.filters[key] = ''; }
                state.page = 1;
                if (key !== 'search' && key !== 'date') {
                    var groupEl = _q('.filter-group[data-group="' + key + '"]');
                    if (groupEl) {
                        groupEl.querySelectorAll('.filter-item').forEach(function(i) { i.classList.remove('active'); });
                        var allItem = groupEl.querySelector('.filter-item[data-value=""]');
                        if (allItem) allItem.classList.add('active');
                    }
                }
                if (key === 'search') _el('search-input').value = '';
                fetchData(); renderActiveFilters();
            });
        });
    }

    // ── Render table ──
    function renderTable() {
        var tbody = _el('doc-tbody');
        if (!state.data || state.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">'
                + '<div class="empty-state-icon">📁</div>'
                + '<div class="empty-state-text">No documents found matching your filters</div>'
                + '</div></td></tr>';
            updateSelectionBar();
            return;
        }

        var html = '';
        state.data.forEach(function(doc) {
            var icon = fileIcon(doc.file_type);
            var sourceRoute = doc.source_doctype && doc.source_name
                ? '/app/' + doc.source_doctype.toLowerCase().replace(/ /g, '-') + '/' + encodeURIComponent(doc.source_name)
                : '#';
            var isSelected = !!state.selected[doc.name];
            var isImage = doc.file_type === 'Image' && doc.file_url;
            var isPdf = doc.file_type === 'PDF' && doc.file_url;
            var previewHtml = '';
            if (isImage) {
                previewHtml = '<div class="file-preview"><img src="' + escapeHtml(doc.file_url) + '" alt="preview" />'
                    + '<div class="file-preview-info">' + escapeHtml(doc.file_size_display || '') + '</div></div>';
            } else if (isPdf) {
                previewHtml = '<div class="file-preview"><div style="display:flex;align-items:center;gap:8px;padding:12px;">'
                    + '<span style="font-size:32px;">📄</span><div><div style="font-size:12px;font-weight:600;color:#1E40AF;">PDF Document</div>'
                    + '<div style="font-size:11px;color:#6B7280;">' + escapeHtml(doc.file_size_display || '') + '</div></div></div></div>';
            }
            var cellClass = (isImage || isPdf) ? 'fname-cell file-preview-trigger' : 'fname-cell';

            html += '<tr data-name="' + escapeHtml(doc.name) + '" data-url="' + escapeHtml(doc.file_url || '') + '" data-fname="' + escapeHtml(doc.file_name || '') + '"'
                + (isSelected ? ' class="row-selected"' : '') + '>'
                + '<td class="col-check"><input type="checkbox" class="row-check"' + (isSelected ? ' checked' : '') + ' /></td>'
                + '<td class="col-fname"><div class="' + cellClass + '">'
                + '<div class="fname-icon ' + icon[1] + '">' + icon[0] + '</div>'
                + '<span class="fname-text" title="' + escapeHtml(doc.file_name) + '">' + escapeHtml(doc.file_name) + '</span>'
                + previewHtml + '</div></td>'
                + '<td class="col-type"><span class="badge ' + typeBadgeClass(doc.file_type) + '">' + escapeHtml(doc.file_type) + '</span></td>'
                + '<td class="col-source"><a class="source-link" href="' + sourceRoute + '">' + escapeHtml(doc.source_record_title || doc.source_name || '') + '</a></td>'
                + '<td class="col-partner">' + escapeHtml(doc.partner_name || doc.partner || '') + '</td>'
                + '<td class="col-category"><span class="badge ' + catBadgeClass(doc.source_category) + '">' + escapeHtml(doc.source_category || '') + '</span></td>'
                + '<td class="col-date">' + formatDate(doc.upload_date) + '</td>'
                + '<td class="col-actions">'
                + (doc.file_url ? '<a class="dl-btn" href="' + escapeHtml(doc.file_url) + '" download title="Download">↓</a>' : '<span class="dl-btn dl-btn-disabled">↓</span>')
                + '</td></tr>';
        });
        tbody.innerHTML = html;

        // Bind checkbox clicks
        tbody.querySelectorAll('.row-check').forEach(function(cb) {
            cb.addEventListener('change', function(e) {
                e.stopPropagation();
                var row = this.closest('tr');
                var name = row.getAttribute('data-name');
                var url = row.getAttribute('data-url');
                var fname = row.getAttribute('data-fname');
                if (this.checked) {
                    row.classList.add('row-selected');
                    if (url) state.selected[name] = { file_name: fname || name, file_url: url };
                } else {
                    row.classList.remove('row-selected');
                    delete state.selected[name];
                }
                updateSelectionBar();
            });
        });

        // Bind row clicks — navigate to form (skip checkbox, source link, download)
        tbody.querySelectorAll('tr').forEach(function(row) {
            row.addEventListener('click', function(e) {
                if (e.target.closest('.source-link') || e.target.closest('.dl-btn') || e.target.closest('.row-check') || e.target.tagName === 'INPUT') return;
                var name = this.getAttribute('data-name');
                if (name) window.location.href = '/app/document-registry/' + name;
            });
        });

        updateSelectionBar();
    }

    // ── Show loading skeleton ──
    function showSkeleton() {
        var tbody = _el('doc-tbody');
        var html = '';
        for (var i = 0; i < 8; i++) {
            html += '<tr class="skeleton-row">';
            for (var j = 0; j < 8; j++) {
                var w = [20, 180, 70, 130, 100, 90, 80, 40][j];
                html += '<td><div class="skeleton-cell" style="width:' + w + 'px;"></div></td>';
            }
            html += '</tr>';
        }
        tbody.innerHTML = html;
    }

    // ── Render pagination ──
    function renderPagination() {
        var totalPages = Math.ceil(state.totalCount / state.pageSize) || 1;
        var start = state.totalCount > 0 ? (state.page - 1) * state.pageSize + 1 : 0;
        var end = Math.min(state.page * state.pageSize, state.totalCount);
        _el('page-info').textContent = state.totalCount > 0
            ? 'Showing ' + start + ' – ' + end + ' of ' + state.totalCount : 'No documents';
        var controls = _el('page-controls');
        var html = '<button class="page-btn" data-page="prev"' + (state.page <= 1 ? ' disabled' : '') + '>‹</button>';
        var startPage = Math.max(1, state.page - 2);
        var endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
        for (var p = startPage; p <= endPage; p++) {
            html += '<button class="page-btn' + (p === state.page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
        }
        html += '<button class="page-btn" data-page="next"' + (state.page >= totalPages ? ' disabled' : '') + '>›</button>';
        controls.innerHTML = html;
        controls.querySelectorAll('.page-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var pg = this.getAttribute('data-page');
                var tp = Math.ceil(state.totalCount / state.pageSize) || 1;
                if (pg === 'prev') state.page = Math.max(1, state.page - 1);
                else if (pg === 'next') state.page = Math.min(tp, state.page + 1);
                else state.page = parseInt(pg);
                if (state.searchMode && state.allSearchData.length > 0) {
                    var s = (state.page - 1) * state.pageSize;
                    state.data = state.allSearchData.slice(s, s + state.pageSize);
                    renderTable(); renderPagination();
                } else { fetchData(); }
            });
        });
    }

    // ── Sorting ──
    _qAll('#doc-table thead th[data-sort]').forEach(function(th) {
        th.addEventListener('click', function() {
            var field = this.getAttribute('data-sort');
            if (state.sort.field === field) state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
            else { state.sort.field = field; state.sort.order = 'asc'; }
            _qAll('#doc-table thead th').forEach(function(h) { h.classList.remove('sorted-asc', 'sorted-desc'); });
            this.classList.add('sorted-' + state.sort.order);
            state.page = 1; fetchData();
        });
    });

    // ── Search with Awesomebar fix ──
    var searchInput = _el('search-input');
    var searchTimer;
    fixShadowDomKeyboard(searchInput, {
        onEnter: function() {
            clearTimeout(searchTimer);
            state.filters.search = searchInput.value.trim();
            state.page = 1; fetchData(); renderActiveFilters();
        }
    });
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        var val = this.value.trim();
        searchTimer = setTimeout(function() {
            state.filters.search = val; state.page = 1; fetchData(); renderActiveFilters();
        }, 400);
    });

    // ── Date range filter ──
    var dateFrom = _el('date-from'); var dateTo = _el('date-to');
    if (dateFrom) {
        fixShadowDomKeyboard(dateFrom);
        dateFrom.addEventListener('change', function() { state.filters.dateFrom = this.value; state.page = 1; fetchData(); renderActiveFilters(); });
    }
    if (dateTo) {
        fixShadowDomKeyboard(dateTo);
        dateTo.addEventListener('change', function() { state.filters.dateTo = this.value; state.page = 1; fetchData(); renderActiveFilters(); });
    }

    // ── Export (Client-side XLSX) ──
    _el('btn-export').addEventListener('click', function() {
        var btn = this; btn.disabled = true; btn.textContent = 'Exporting...';
        var filters = buildFilters();
        if (state.filters.search) filters.push(['file_name', 'like', '%' + state.filters.search + '%']);
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['file_name', 'file_type', 'file_extension', 'source_doctype', 'source_name',
                         'source_record_title', 'source_category', 'partner_name', 'project_title',
                         'donor', 'programme', 'upload_date', 'file_size_display', 'compliance_status', 'uploaded_by_name'],
                filters: filters, order_by: state.sort.field + ' ' + state.sort.order, limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                var records = r.message || [];
                if (state.filters.search) {
                    records = fuzzyFilterRecords(records, state.filters.search, function(rec) {
                        return [rec.file_name, rec.partner_name, rec.source_record_title, rec.source_category,
                                rec.source_doctype, rec.donor, rec.uploaded_by_name, rec.project_title];
                    });
                }
                loadXlsxLib().then(function() {
                    var hf = { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } };
                    var hc = '4338CA';
                    var data = [[ sc('File Name',{font:hf,fill:hc}), sc('Type',{font:hf,fill:hc}), sc('Source Module',{font:hf,fill:hc}),
                        sc('Source Record',{font:hf,fill:hc}), sc('Category',{font:hf,fill:hc}), sc('Partner',{font:hf,fill:hc}),
                        sc('Project',{font:hf,fill:hc}), sc('Donor',{font:hf,fill:hc}), sc('Programme',{font:hf,fill:hc}),
                        sc('Upload Date',{font:hf,fill:hc}), sc('File Size',{font:hf,fill:hc}), sc('Compliance',{font:hf,fill:hc}),
                        sc('Uploaded By',{font:hf,fill:hc}) ]];
                    records.forEach(function(rec) {
                        data.push([ sc(rec.file_name||''), sc(rec.file_type||''), sc(rec.source_doctype||''),
                            sc(rec.source_record_title||rec.source_name||''), sc(rec.source_category||''), sc(rec.partner_name||''),
                            sc(rec.project_title||''), sc(rec.donor||''), sc(rec.programme||''), sc(rec.upload_date||''),
                            sc(rec.file_size_display||''), sc(rec.compliance_status||''), sc(rec.uploaded_by_name||'') ]);
                    });
                    var ws = XLSX.utils.aoa_to_sheet(data); autoWidth(ws, data);
                    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Document Registry');
                    XLSX.writeFile(wb, 'Document_Registry_' + new Date().toISOString().slice(0,10) + '.xlsx');
                    btn.disabled = false; btn.textContent = 'Export';
                    frappe.show_alert({ message: records.length + ' records exported', indicator: 'green' });
                }).catch(function() { btn.disabled = false; btn.textContent = 'Export';
                    frappe.show_alert({ message: 'Export failed', indicator: 'red' }); });
            }
        });
    });

    // ── Upload button ──
    var uploadBtn = _el('btn-upload');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
            var TRACKED_DTS = ['Project', 'Grant', 'NGO', 'Proposal', 'Fund Request',
                'Vendor', 'NGO Due Diligence', 'Quarterly Utilisation Report',
                'Fund Disbursement', 'Bank Details Update Request', 'RFP'];
            var d = new frappe.ui.Dialog({
                title: 'Upload Document',
                fields: [
                    { fieldname: 'info_html', fieldtype: 'HTML',
                      options: '<p style="color:#6B7280;font-size:13px;margin-bottom:8px;">Select the source record where you want to upload a document. You will be taken to that record\'s form to attach the file.</p>' },
                    { fieldname: 'source_doctype', fieldtype: 'Select', label: 'Module', options: TRACKED_DTS.join('\n'), reqd: 1 },
                    { fieldname: 'source_name', fieldtype: 'Dynamic Link', label: 'Record', options: 'source_doctype', reqd: 1 }
                ],
                primary_action_label: 'Go to Record',
                primary_action: function(values) { d.hide(); frappe.set_route('Form', values.source_doctype, values.source_name); }
            });
            d.show();
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  Audit Log — Built on Frappe's Version doctype
    // ══════════════════════════════════════════════════════════════════

    var AUDIT_PAGE_SIZE = 30;

    function openAuditLog() {
        state.auditPage = 0;
        state.auditData = [];
        _el('audit-log-panel').style.display = 'block';
        _el('audit-log-list').innerHTML = '<div class="audit-empty">Loading activity log...</div>';
        _el('main-layout').style.display = 'none';
        _el('active-filters').style.display = 'none';
        _el('selection-bar').style.display = 'none';
        fetchAuditLog(false);
    }

    function closeAuditLog() {
        _el('audit-log-panel').style.display = 'none';
        _el('main-layout').style.display = 'flex';
        _el('active-filters').style.display = '';
    }

    function fetchAuditLog(append) {
        // Fetch both: Document Registry creation events + Version change events
        // We merge them into a single timeline sorted by date

        var done = 0;
        var creations = [];
        var versions = [];

        // 1. Get Document Registry records (each = an upload event)
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['name', 'file_name', 'file_type', 'source_doctype', 'source_name',
                         'source_record_title', 'partner_name', 'uploaded_by_name', 'upload_date', 'creation'],
                order_by: 'creation desc',
                limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                creations = (r.message || []).map(function(rec) {
                    return {
                        type: 'upload',
                        timestamp: rec.creation,
                        user: rec.uploaded_by_name || 'System',
                        docname: rec.name,
                        file_name: rec.file_name,
                        file_type: rec.file_type,
                        source_doctype: rec.source_doctype,
                        source_name: rec.source_name,
                        source_title: rec.source_record_title || rec.source_name,
                        partner_name: rec.partner_name
                    };
                });
                done++;
                if (done === 2) mergeAndRender(creations, versions, append);
            }
        });

        // 2. Get Version records (each = a field change)
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Version',
                filters: [['ref_doctype', '=', 'Document Registry']],
                fields: ['name', 'docname', 'owner', 'creation', 'data'],
                order_by: 'creation desc',
                limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                (r.message || []).forEach(function(v) {
                    var parsed = null;
                    try { parsed = JSON.parse(v.data); } catch(e) {}
                    if (!parsed) return;
                    // Skip Version records that are just creation (no meaningful changes)
                    var hasChanges = (parsed.changed && parsed.changed.length > 0)
                        || (parsed.added && parsed.added.length > 0)
                        || (parsed.removed && parsed.removed.length > 0);
                    if (!hasChanges) return;
                    versions.push({
                        type: 'change',
                        timestamp: v.creation,
                        user: v.owner,
                        docname: v.docname,
                        changes: parsed.changed || [],
                        added: parsed.added || [],
                        removed: parsed.removed || []
                    });
                });
                done++;
                if (done === 2) mergeAndRender(creations, versions, append);
            }
        });
    }

    function mergeAndRender(creations, versions, append) {
        // Merge and sort by timestamp descending
        var all = creations.concat(versions);
        all.sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        state.auditData = all;
        var total = all.length;
        var showCount = Math.min((state.auditPage + 1) * AUDIT_PAGE_SIZE, total);
        var slice = all.slice(0, showCount);

        _el('audit-count').textContent = total + ' events';

        if (slice.length === 0) {
            _el('audit-log-list').innerHTML = '<div class="audit-empty">No activity recorded yet</div>';
            _el('btn-audit-more').style.display = 'none';
            return;
        }

        var html = '';
        slice.forEach(function(entry) {
            if (entry.type === 'upload') {
                html += '<div class="audit-entry">'
                    + '<div class="audit-icon audit-icon-upload">↑</div>'
                    + '<div class="audit-body">'
                    + '<div class="audit-headline"><strong>' + escapeHtml(entry.user) + '</strong> uploaded '
                    + '<a href="/app/document-registry/' + escapeHtml(entry.docname) + '">' + escapeHtml(entry.file_name) + '</a>';
                if (entry.source_title) {
                    html += ' to <strong>' + escapeHtml(entry.source_doctype) + '</strong>: ' + escapeHtml(entry.source_title);
                }
                html += '</div>'
                    + '<div class="audit-meta">' + formatDateTime(entry.timestamp) + '</div>'
                    + '</div></div>';
            } else if (entry.type === 'change') {
                html += '<div class="audit-entry">'
                    + '<div class="audit-icon audit-icon-change">~</div>'
                    + '<div class="audit-body">'
                    + '<div class="audit-headline"><strong>' + escapeHtml(entry.user) + '</strong> modified '
                    + '<a href="/app/document-registry/' + escapeHtml(entry.docname) + '">' + escapeHtml(entry.docname) + '</a></div>'
                    + '<div class="audit-meta">' + formatDateTime(entry.timestamp) + '</div>';
                if (entry.changes.length > 0) {
                    html += '<div class="audit-changes">';
                    entry.changes.forEach(function(ch) {
                        // ch = [field_name, old_value, new_value]
                        var field = ch[0] || '';
                        var oldVal = ch[1] !== null && ch[1] !== undefined ? String(ch[1]) : '(empty)';
                        var newVal = ch[2] !== null && ch[2] !== undefined ? String(ch[2]) : '(empty)';
                        html += '<div class="field-change"><strong>' + escapeHtml(field.replace(/_/g, ' ')) + '</strong>: '
                            + '<span class="old-val">' + escapeHtml(oldVal) + '</span> → '
                            + '<span class="new-val">' + escapeHtml(newVal) + '</span></div>';
                    });
                    html += '</div>';
                }
                html += '</div></div>';
            }
        });

        _el('audit-log-list').innerHTML = html;
        _el('btn-audit-more').style.display = showCount < total ? 'inline-block' : 'none';
    }

    // Audit log button
    _el('btn-audit-log').addEventListener('click', openAuditLog);
    _el('btn-audit-close').addEventListener('click', closeAuditLog);
    _el('btn-audit-more').addEventListener('click', function() {
        state.auditPage++;
        mergeAndRender(
            state.auditData.filter(function(e) { return e.type === 'upload'; }),
            state.auditData.filter(function(e) { return e.type === 'change'; }),
            true
        );
    });

    // Audit log export
    _el('btn-audit-export').addEventListener('click', function() {
        var btn = this; btn.disabled = true; btn.textContent = 'Exporting...';

        loadXlsxLib().then(function() {
            var hf = { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } };
            var hc = '4338CA';
            var data = [[ sc('Timestamp',{font:hf,fill:hc}), sc('Action',{font:hf,fill:hc}), sc('User',{font:hf,fill:hc}),
                sc('Document',{font:hf,fill:hc}), sc('File Name',{font:hf,fill:hc}), sc('Details',{font:hf,fill:hc}) ]];

            state.auditData.forEach(function(entry) {
                var details = '';
                if (entry.type === 'upload') {
                    details = 'Uploaded to ' + (entry.source_doctype || '') + ': ' + (entry.source_title || '');
                } else if (entry.type === 'change' && entry.changes) {
                    details = entry.changes.map(function(ch) {
                        return (ch[0] || '').replace(/_/g, ' ') + ': "' + (ch[1] || '') + '" → "' + (ch[2] || '') + '"';
                    }).join('; ');
                }
                data.push([
                    sc(entry.timestamp || ''),
                    sc(entry.type === 'upload' ? 'Upload' : 'Modification'),
                    sc(entry.user || ''),
                    sc(entry.docname || ''),
                    sc(entry.file_name || entry.docname || ''),
                    sc(details)
                ]);
            });

            var ws = XLSX.utils.aoa_to_sheet(data); autoWidth(ws, data);
            var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Activity Log');
            XLSX.writeFile(wb, 'Document_Repository_Audit_' + new Date().toISOString().slice(0,10) + '.xlsx');
            btn.disabled = false; btn.textContent = 'Export';
            frappe.show_alert({ message: state.auditData.length + ' events exported', indicator: 'green' });
        }).catch(function() {
            btn.disabled = false; btn.textContent = 'Export';
            frappe.show_alert({ message: 'Export failed', indicator: 'red' });
        });
    });

    // ── Keyboard navigation ──
    root_element.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT') return;
        var tbody = _el('doc-tbody');
        var rows = tbody.querySelectorAll('tr[data-name]');
        if (!rows.length) return;
        var focused = tbody.querySelector('tr.kb-focused');
        var idx = -1;
        if (focused) rows.forEach(function(r, i) { if (r === focused) idx = i; });

        if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault();
            if (focused) focused.classList.remove('kb-focused');
            idx = Math.min(idx + 1, rows.length - 1);
            rows[idx].classList.add('kb-focused');
            rows[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault();
            if (focused) focused.classList.remove('kb-focused');
            idx = Math.max(idx - 1, 0);
            rows[idx].classList.add('kb-focused');
            rows[idx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && focused) {
            var name = focused.getAttribute('data-name');
            if (name) window.location.href = '/app/document-registry/' + name;
        } else if (e.key === 'd' && focused) {
            var url = focused.getAttribute('data-url');
            if (url) window.open(url, '_blank');
        } else if (e.key === 'x' && focused) {
            // Toggle selection via keyboard
            var cb = focused.querySelector('.row-check');
            if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        } else if (e.key === '/') {
            e.preventDefault(); searchInput.focus();
        }
    });

    // ── Initial load ──
    fetchCounts();
    fetchData();

})();
