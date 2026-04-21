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

    // ── State ──
    var state = {
        filters: { module: '', category: '', filetype: '', compliance: '', search: '', dateFrom: '', dateTo: '' },
        sort: { field: 'upload_date', order: 'desc' },
        page: 1,
        pageSize: 20,
        totalCount: 0,
        data: [],
        allSearchData: [],   // holds full dataset when fuzzy search is active
        searchMode: false,   // true = client-side fuzzy; false = server-side
        counts: { modules: {}, categories: {}, filetypes: {}, compliance: {} },
        totalSize: 0,
        lastUpload: null
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

    function complianceBadgeClass(s) {
        var map = { 'Active': 'badge-comp-active', 'Expired': 'badge-comp-expired',
            'Pending': 'badge-comp-pending', 'NA': 'badge-comp-na' };
        return map[s] || 'badge-comp-na';
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
        // Search is handled client-side (fuzzy) when active — NOT added to server filters
        return filters;
    }

    var FIELDS = ['name', 'file_name', 'file_url', 'file_type', 'file_extension',
                  'file_size', 'file_size_display', 'source_doctype', 'source_name',
                  'source_record_title', 'source_category', 'partner', 'partner_name',
                  'project', 'project_title', 'donor', 'upload_date', 'uploaded_by_name',
                  'compliance_status', 'frappe_file', 'programme'];

    // ── Fetch data ──
    function fetchData() {
        showSkeleton();
        var filters = buildFilters();
        var searchText = state.filters.search.trim();

        if (searchText) {
            // Fuzzy search mode: fetch ALL matching sidebar filters, then filter client-side
            state.searchMode = true;
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Document Registry',
                    fields: FIELDS,
                    filters: filters,
                    order_by: state.sort.field + ' ' + state.sort.order,
                    limit_page_length: 0
                },
                async: true,
                callback: function(r) {
                    var all = r.message || [];
                    // Apply fuzzy search
                    var filtered = fuzzyFilterRecords(all, searchText, function(rec) {
                        return [
                            rec.file_name,
                            rec.partner_name || rec.partner,
                            rec.source_record_title || rec.source_name,
                            rec.source_category,
                            rec.source_doctype,
                            rec.donor,
                            rec.uploaded_by_name,
                            rec.project_title || rec.project
                        ];
                    });
                    state.allSearchData = filtered;
                    state.totalCount = filtered.length;
                    // Client-side pagination
                    var start = (state.page - 1) * state.pageSize;
                    state.data = filtered.slice(start, start + state.pageSize);
                    renderTable();
                    renderPagination();
                    _el('stat-count').textContent = state.totalCount + ' document' + (state.totalCount !== 1 ? 's' : '');
                }
            });
        } else {
            // Normal server-side mode
            state.searchMode = false;
            state.allSearchData = [];
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Document Registry',
                    fields: FIELDS,
                    filters: filters,
                    order_by: state.sort.field + ' ' + state.sort.order,
                    limit_start: (state.page - 1) * state.pageSize,
                    limit_page_length: state.pageSize
                },
                async: true,
                callback: function(r) {
                    state.data = r.message || [];
                    renderTable();
                }
            });

            // Get total count for pagination
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
        // Module counts
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['source_doctype as label', 'count(name) as cnt'],
                group_by: 'source_doctype', order_by: 'cnt desc', limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                state.counts.modules = {};
                var container = _el('module-items');
                container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.modules[item.label] = item.cnt;
                    total += item.cnt;
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label">' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-module-all').textContent = total;
                bindFilterClicks('module');
            }
        });

        // Category counts
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['source_category as label', 'count(name) as cnt'],
                group_by: 'source_category', order_by: 'cnt desc', limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                state.counts.categories = {};
                var container = _el('category-items');
                container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.categories[item.label] = item.cnt;
                    total += item.cnt;
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label">' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-category-all').textContent = total;
                bindFilterClicks('category');
            }
        });

        // File type counts (with colored dots)
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['file_type as label', 'count(name) as cnt'],
                group_by: 'file_type', order_by: 'cnt desc', limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                state.counts.filetypes = {};
                var container = _el('filetype-items');
                container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.filetypes[item.label] = item.cnt;
                    total += item.cnt;
                    var dotColor = typeColorDot(item.label);
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label"><span class="color-dot" style="background:' + dotColor + ';"></span>' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-filetype-all').textContent = total;
                bindFilterClicks('filetype');
            }
        });

        // Compliance status counts (with colored dots)
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['compliance_status as label', 'count(name) as cnt'],
                group_by: 'compliance_status', order_by: 'cnt desc', limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                state.counts.compliance = {};
                var container = _el('compliance-items');
                container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    if (!item.label) return;
                    state.counts.compliance[item.label] = item.cnt;
                    total += item.cnt;
                    var dotColor = complianceColorDot(item.label);
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '">'
                        + '<span class="filter-label"><span class="color-dot" style="background:' + dotColor + ';"></span>' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-compliance-all').textContent = total;
                bindFilterClicks('compliance');
            }
        });

        // Total size and last upload
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['sum(file_size) as total_size', 'max(upload_date) as last_upload'],
                limit_page_length: 1
            },
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

    // ── Bind sidebar filter clicks (handles both "All" and dynamic items) ──
    function bindFilterClicks(group) {
        var groupEl = _q('.filter-group[data-group="' + group + '"]');
        if (!groupEl) return;

        // Map group name to state key
        var stateKey = group;
        if (group === 'filetype') stateKey = 'filetype';

        var allItems = groupEl.querySelectorAll('.filter-item');
        allItems.forEach(function(item) {
            // Remove old listeners by cloning
            var clone = item.cloneNode(true);
            item.parentNode.replaceChild(clone, item);
        });

        // Re-query after cloning
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
        if (state.filters.module) {
            html += '<span class="filter-pill">Module: ' + escapeHtml(state.filters.module)
                + ' <span class="pill-remove" data-clear="module">&times;</span></span>';
        }
        if (state.filters.category) {
            html += '<span class="filter-pill">Category: ' + escapeHtml(state.filters.category)
                + ' <span class="pill-remove" data-clear="category">&times;</span></span>';
        }
        if (state.filters.filetype) {
            html += '<span class="filter-pill">Type: ' + escapeHtml(state.filters.filetype)
                + ' <span class="pill-remove" data-clear="filetype">&times;</span></span>';
        }
        if (state.filters.compliance) {
            html += '<span class="filter-pill">Status: ' + escapeHtml(state.filters.compliance)
                + ' <span class="pill-remove" data-clear="compliance">&times;</span></span>';
        }
        if (state.filters.search) {
            html += '<span class="filter-pill">Search: "' + escapeHtml(state.filters.search)
                + '" <span class="pill-remove" data-clear="search">&times;</span></span>';
        }
        if (state.filters.dateFrom || state.filters.dateTo) {
            var label = 'Date: ';
            if (state.filters.dateFrom && state.filters.dateTo) label += state.filters.dateFrom + ' to ' + state.filters.dateTo;
            else if (state.filters.dateFrom) label += 'from ' + state.filters.dateFrom;
            else label += 'until ' + state.filters.dateTo;
            html += '<span class="filter-pill">' + label
                + ' <span class="pill-remove" data-clear="date">&times;</span></span>';
        }
        container.innerHTML = html;

        // Bind remove clicks
        container.querySelectorAll('.pill-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var key = this.getAttribute('data-clear');
                if (key === 'date') {
                    state.filters.dateFrom = '';
                    state.filters.dateTo = '';
                    var fromEl = _el('date-from');
                    var toEl = _el('date-to');
                    if (fromEl) fromEl.value = '';
                    if (toEl) toEl.value = '';
                } else {
                    state.filters[key] = '';
                }
                state.page = 1;

                // Reset sidebar active state
                if (key !== 'search' && key !== 'date') {
                    var gname = key;
                    var groupEl = _q('.filter-group[data-group="' + gname + '"]');
                    if (groupEl) {
                        groupEl.querySelectorAll('.filter-item').forEach(function(i) { i.classList.remove('active'); });
                        var allItem = groupEl.querySelector('.filter-item[data-value=""]');
                        if (allItem) allItem.classList.add('active');
                    }
                }
                if (key === 'search') _el('search-input').value = '';

                fetchData();
                renderActiveFilters();
            });
        });
    }

    // ── Render table ──
    function renderTable() {
        var tbody = _el('doc-tbody');
        if (!state.data || state.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">'
                + '<div class="empty-state-icon">📁</div>'
                + '<div class="empty-state-text">No documents found matching your filters</div>'
                + '</div></td></tr>';
            return;
        }

        var html = '';
        state.data.forEach(function(doc) {
            var icon = fileIcon(doc.file_type);
            var sourceRoute = doc.source_doctype && doc.source_name
                ? '/app/' + doc.source_doctype.toLowerCase().replace(/ /g, '-') + '/' + encodeURIComponent(doc.source_name)
                : '#';

            html += '<tr data-name="' + escapeHtml(doc.name) + '" data-url="' + escapeHtml(doc.file_url || '') + '">'
                + '<td class="col-fname"><div class="fname-cell">'
                + '<div class="fname-icon ' + icon[1] + '">' + icon[0] + '</div>'
                + '<span class="fname-text" title="' + escapeHtml(doc.file_name) + '">' + escapeHtml(doc.file_name) + '</span>'
                + '</div></td>'
                + '<td class="col-type"><span class="badge ' + typeBadgeClass(doc.file_type) + '">' + escapeHtml(doc.file_type) + '</span></td>'
                + '<td class="col-source"><a class="source-link" href="' + sourceRoute + '">' + escapeHtml(doc.source_record_title || doc.source_name || '') + '</a></td>'
                + '<td class="col-partner">' + escapeHtml(doc.partner_name || doc.partner || '') + '</td>'
                + '<td class="col-category"><span class="badge ' + catBadgeClass(doc.source_category) + '">' + escapeHtml(doc.source_category || '') + '</span></td>'
                + '<td class="col-date">' + formatDate(doc.upload_date) + '</td>'
                + '<td class="col-actions">'
                + (doc.file_url
                    ? '<a class="dl-btn" href="' + escapeHtml(doc.file_url) + '" download title="Download file">↓</a>'
                    : '<span class="dl-btn dl-btn-disabled">↓</span>')
                + '</td>'
                + '</tr>';
        });
        tbody.innerHTML = html;

        // Bind row clicks — navigate to Document Registry form
        tbody.querySelectorAll('tr').forEach(function(row) {
            row.addEventListener('click', function(e) {
                if (e.target.closest('.source-link') || e.target.closest('.dl-btn')) return;
                var name = this.getAttribute('data-name');
                if (name) window.location.href = '/app/document-registry/' + name;
            });
        });
    }

    // ── Show loading skeleton ──
    function showSkeleton() {
        var tbody = _el('doc-tbody');
        var html = '';
        for (var i = 0; i < 8; i++) {
            html += '<tr class="skeleton-row">';
            for (var j = 0; j < 7; j++) {
                var w = [180, 70, 130, 100, 90, 80, 40][j];
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
            ? 'Showing ' + start + ' – ' + end + ' of ' + state.totalCount
            : 'No documents';

        var controls = _el('page-controls');
        var html = '';
        html += '<button class="page-btn" data-page="prev"' + (state.page <= 1 ? ' disabled' : '') + '>‹</button>';
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
                var totalPages = Math.ceil(state.totalCount / state.pageSize) || 1;
                if (pg === 'prev') state.page = Math.max(1, state.page - 1);
                else if (pg === 'next') state.page = Math.min(totalPages, state.page + 1);
                else state.page = parseInt(pg);

                if (state.searchMode && state.allSearchData.length > 0) {
                    // Client-side pagination for fuzzy search results
                    var start = (state.page - 1) * state.pageSize;
                    state.data = state.allSearchData.slice(start, start + state.pageSize);
                    renderTable();
                    renderPagination();
                } else {
                    fetchData();
                }
            });
        });
    }

    // ── Sorting ──
    _qAll('#doc-table thead th[data-sort]').forEach(function(th) {
        th.addEventListener('click', function() {
            var field = this.getAttribute('data-sort');
            if (state.sort.field === field) {
                state.sort.order = state.sort.order === 'asc' ? 'desc' : 'asc';
            } else {
                state.sort.field = field;
                state.sort.order = 'asc';
            }
            _qAll('#doc-table thead th').forEach(function(h) {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            this.classList.add('sorted-' + state.sort.order);
            state.page = 1;
            fetchData();
        });
    });

    // ── Search with Awesomebar fix ──
    var searchInput = _el('search-input');
    var searchTimer;

    fixShadowDomKeyboard(searchInput, {
        onEnter: function() {
            clearTimeout(searchTimer);
            state.filters.search = searchInput.value.trim();
            state.page = 1;
            fetchData();
            renderActiveFilters();
        }
    });

    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        var val = this.value.trim();
        searchTimer = setTimeout(function() {
            state.filters.search = val;
            state.page = 1;
            fetchData();
            renderActiveFilters();
        }, 400);
    });

    // ── Date range filter inputs ──
    var dateFrom = _el('date-from');
    var dateTo = _el('date-to');
    if (dateFrom) {
        fixShadowDomKeyboard(dateFrom);
        dateFrom.addEventListener('change', function() {
            state.filters.dateFrom = this.value;
            state.page = 1;
            fetchData();
            renderActiveFilters();
        });
    }
    if (dateTo) {
        fixShadowDomKeyboard(dateTo);
        dateTo.addEventListener('change', function() {
            state.filters.dateTo = this.value;
            state.page = 1;
            fetchData();
            renderActiveFilters();
        });
    }

    // ── Export (Client-side XLSX) ──
    _el('btn-export').addEventListener('click', function() {
        var btn = this;
        btn.disabled = true;
        btn.textContent = 'Exporting...';

        var filters = buildFilters();
        // If search is active, add a loose server-side LIKE filter to reduce payload
        if (state.filters.search) {
            filters.push(['file_name', 'like', '%' + state.filters.search + '%']);
        }

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['file_name', 'file_type', 'file_extension', 'source_doctype', 'source_name',
                         'source_record_title', 'source_category', 'partner_name', 'project_title',
                         'donor', 'programme', 'upload_date', 'file_size_display', 'compliance_status',
                         'uploaded_by_name'],
                filters: filters,
                order_by: state.sort.field + ' ' + state.sort.order,
                limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                var records = r.message || [];
                if (state.filters.search) {
                    records = fuzzyFilterRecords(records, state.filters.search, function(rec) {
                        return [rec.file_name, rec.partner_name, rec.source_record_title,
                                rec.source_category, rec.source_doctype, rec.donor, rec.uploaded_by_name,
                                rec.project_title];
                    });
                }

                loadXlsxLib().then(function() {
                    var hdrFont = { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } };
                    var hdrFill = '4338CA';
                    var data = [[
                        sc('File Name', { font: hdrFont, fill: hdrFill }),
                        sc('Type', { font: hdrFont, fill: hdrFill }),
                        sc('Source Module', { font: hdrFont, fill: hdrFill }),
                        sc('Source Record', { font: hdrFont, fill: hdrFill }),
                        sc('Category', { font: hdrFont, fill: hdrFill }),
                        sc('Partner', { font: hdrFont, fill: hdrFill }),
                        sc('Project', { font: hdrFont, fill: hdrFill }),
                        sc('Donor', { font: hdrFont, fill: hdrFill }),
                        sc('Programme', { font: hdrFont, fill: hdrFill }),
                        sc('Upload Date', { font: hdrFont, fill: hdrFill }),
                        sc('File Size', { font: hdrFont, fill: hdrFill }),
                        sc('Compliance', { font: hdrFont, fill: hdrFill }),
                        sc('Uploaded By', { font: hdrFont, fill: hdrFill })
                    ]];

                    records.forEach(function(rec) {
                        data.push([
                            sc(rec.file_name || ''),
                            sc(rec.file_type || ''),
                            sc(rec.source_doctype || ''),
                            sc(rec.source_record_title || rec.source_name || ''),
                            sc(rec.source_category || ''),
                            sc(rec.partner_name || ''),
                            sc(rec.project_title || ''),
                            sc(rec.donor || ''),
                            sc(rec.programme || ''),
                            sc(rec.upload_date || ''),
                            sc(rec.file_size_display || ''),
                            sc(rec.compliance_status || ''),
                            sc(rec.uploaded_by_name || '')
                        ]);
                    });

                    var ws = XLSX.utils.aoa_to_sheet(data);
                    autoWidth(ws, data);
                    var wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Document Registry');
                    var ts = new Date().toISOString().slice(0,10);
                    XLSX.writeFile(wb, 'Document_Registry_' + ts + '.xlsx');

                    btn.disabled = false;
                    btn.textContent = 'Export';
                    frappe.show_alert({ message: records.length + ' records exported', indicator: 'green' });
                }).catch(function() {
                    btn.disabled = false;
                    btn.textContent = 'Export';
                    frappe.show_alert({ message: 'Export failed — could not load library', indicator: 'red' });
                });
            }
        });
    });

    // ── Keyboard navigation ──
    root_element.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT') return; // don't interfere with inputs
        var tbody = _el('doc-tbody');
        var rows = tbody.querySelectorAll('tr[data-name]');
        if (!rows.length) return;

        var focused = tbody.querySelector('tr.kb-focused');
        var idx = -1;
        if (focused) {
            rows.forEach(function(r, i) { if (r === focused) idx = i; });
        }

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
        } else if (e.key === '/') {
            e.preventDefault();
            searchInput.focus();
        }
    });

    // ── Initial load ──
    fetchCounts();
    fetchData();

})();
