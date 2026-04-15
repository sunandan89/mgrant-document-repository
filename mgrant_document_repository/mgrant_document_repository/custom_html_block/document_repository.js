(function() {
    // ── Shadow DOM helpers ──
    function _q(sel)    { return root_element.querySelector(sel); }
    function _qAll(sel) { return root_element.querySelectorAll(sel); }
    function _el(id)    { return root_element.querySelector('#' + id); }

    // ── State ──
    var state = {
        filters: { module: '', category: '', filetype: '', search: '' },
        sort: { field: 'upload_date', order: 'desc' },
        page: 1,
        pageSize: 20,
        totalCount: 0,
        data: [],
        counts: { modules: {}, categories: {}, filetypes: {} },
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
        if (cl.indexOf('report') >= 0) return 'badge-cat-reporting';
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

    function escapeHtml(s) {
        if (!s) return '';
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── Build Frappe filters ──
    function buildFilters() {
        var filters = [];
        if (state.filters.module) filters.push(['source_doctype', '=', state.filters.module]);
        if (state.filters.category) filters.push(['source_category', '=', state.filters.category]);
        if (state.filters.filetype) filters.push(['file_type', '=', state.filters.filetype]);
        if (state.filters.search) filters.push(['file_name', 'like', '%' + state.filters.search + '%']);
        return filters;
    }

    // ── Fetch data ──
    function fetchData() {
        showSkeleton();
        var filters = buildFilters();

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['name', 'file_name', 'file_url', 'file_type', 'file_extension',
                         'file_size', 'file_size_display', 'source_doctype', 'source_name',
                         'source_record_title', 'source_category', 'partner', 'partner_name',
                         'project', 'project_title', 'donor', 'upload_date', 'uploaded_by_name',
                         'compliance_status', 'frappe_file'],
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

    // ── Fetch sidebar counts ──
    function fetchCounts() {
        // Module counts
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['source_doctype as label', 'count(name) as cnt'],
                group_by: 'source_doctype',
                order_by: 'cnt desc',
                limit_page_length: 0
            },
            async: true,
            callback: function(r) {
                state.counts.modules = {};
                var container = _el('module-items');
                container.innerHTML = '';
                var total = 0;
                (r.message || []).forEach(function(item) {
                    state.counts.modules[item.label] = item.cnt;
                    total += item.cnt;
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '" data-group="module">'
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
                group_by: 'source_category',
                order_by: 'cnt desc',
                limit_page_length: 0
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
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '" data-group="category">'
                        + '<span class="filter-label">' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-category-all').textContent = total;
                bindFilterClicks('category');
            }
        });

        // File type counts
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Document Registry',
                fields: ['file_type as label', 'count(name) as cnt'],
                group_by: 'file_type',
                order_by: 'cnt desc',
                limit_page_length: 0
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
                    container.innerHTML += '<div class="filter-item" data-value="' + escapeHtml(item.label) + '" data-group="filetype">'
                        + '<span class="filter-label">' + escapeHtml(item.label) + '</span>'
                        + '<span class="filter-count">' + item.cnt + '</span></div>';
                });
                _el('count-filetype-all').textContent = total;
                bindFilterClicks('filetype');
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
                _el('stat-size').textContent = 'Total size: ' + formatSize(state.totalSize);
                _el('stat-last').textContent = 'Last upload: ' + (d.last_upload ? formatDate(d.last_upload) : '—');
            }
        });
    }

    // ── Bind sidebar filter clicks ──
    function bindFilterClicks(group) {
        var groupEl = _q('.filter-group[data-group="' + group + '"]');
        if (!groupEl) return;
        var items = groupEl.querySelectorAll('.filter-item');
        items.forEach(function(item) {
            item.addEventListener('click', function() {
                var val = this.getAttribute('data-value') || '';
                // Update state
                if (group === 'module') state.filters.module = val;
                else if (group === 'category') state.filters.category = val;
                else if (group === 'filetype') state.filters.filetype = val;

                // Update active class
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
            html += '<span class="filter-pill">Module = ' + escapeHtml(state.filters.module)
                + ' <span class="pill-remove" data-clear="module">×</span></span>';
        }
        if (state.filters.category) {
            html += '<span class="filter-pill">Category = ' + escapeHtml(state.filters.category)
                + ' <span class="pill-remove" data-clear="category">×</span></span>';
        }
        if (state.filters.filetype) {
            html += '<span class="filter-pill">File Type = ' + escapeHtml(state.filters.filetype)
                + ' <span class="pill-remove" data-clear="filetype">×</span></span>';
        }
        if (state.filters.search) {
            html += '<span class="filter-pill">Search = "' + escapeHtml(state.filters.search)
                + '" <span class="pill-remove" data-clear="search">×</span></span>';
        }
        container.innerHTML = html;

        // Bind remove clicks
        container.querySelectorAll('.pill-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var key = this.getAttribute('data-clear');
                state.filters[key] = '';
                state.page = 1;

                // Reset sidebar active state
                if (key !== 'search') {
                    var groupEl = _q('.filter-group[data-group="' + key + '"]');
                    if (groupEl) {
                        groupEl.querySelectorAll('.filter-item').forEach(function(i) { i.classList.remove('active'); });
                        groupEl.querySelector('.filter-item[data-value=""]').classList.add('active');
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

            html += '<tr data-name="' + escapeHtml(doc.name) + '">'
                + '<td class="col-fname"><div class="fname-cell">'
                + '<div class="fname-icon ' + icon[1] + '">' + icon[0] + '</div>'
                + '<span class="fname-text" title="' + escapeHtml(doc.file_name) + '">' + escapeHtml(doc.file_name) + '</span>'
                + '</div></td>'
                + '<td class="col-type"><span class="badge ' + typeBadgeClass(doc.file_type) + '">' + escapeHtml(doc.file_type) + '</span></td>'
                + '<td class="col-source"><a class="source-link" href="' + sourceRoute + '">' + escapeHtml(doc.source_record_title || doc.source_name) + '</a></td>'
                + '<td class="col-partner">' + escapeHtml(doc.partner_name || doc.partner || '') + '</td>'
                + '<td class="col-category"><span class="badge ' + catBadgeClass(doc.source_category) + '">' + escapeHtml(doc.source_category || '') + '</span></td>'
                + '<td class="col-date">' + formatDate(doc.upload_date) + '</td>'
                + '<td class="col-size" style="text-align:right;">' + escapeHtml(doc.file_size_display || formatSize(doc.file_size)) + '</td>'
                + '</tr>';
        });
        tbody.innerHTML = html;

        // Bind row clicks — navigate to Document Registry form
        tbody.querySelectorAll('tr').forEach(function(row) {
            row.addEventListener('click', function(e) {
                if (e.target.closest('.source-link')) return; // don't intercept source link clicks
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
                var w = [180, 70, 130, 100, 90, 80, 60][j];
                html += '<td><div class="skeleton-cell" style="width:' + w + 'px;"></div></td>';
            }
            html += '</tr>';
        }
        tbody.innerHTML = html;
    }

    // ── Render pagination ──
    function renderPagination() {
        var totalPages = Math.ceil(state.totalCount / state.pageSize) || 1;
        var start = (state.page - 1) * state.pageSize + 1;
        var end = Math.min(state.page * state.pageSize, state.totalCount);

        _el('page-info').textContent = state.totalCount > 0
            ? 'Showing ' + start + ' – ' + end + ' of ' + state.totalCount
            : 'No documents';

        var controls = _el('page-controls');
        var html = '';

        // Previous button
        html += '<button class="page-btn" data-page="prev"' + (state.page <= 1 ? ' disabled' : '') + '>‹</button>';

        // Page numbers
        var startPage = Math.max(1, state.page - 2);
        var endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

        for (var p = startPage; p <= endPage; p++) {
            html += '<button class="page-btn' + (p === state.page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
        }

        // Next button
        html += '<button class="page-btn" data-page="next"' + (state.page >= totalPages ? ' disabled' : '') + '>›</button>';

        controls.innerHTML = html;

        // Bind pagination clicks
        controls.querySelectorAll('.page-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var pg = this.getAttribute('data-page');
                if (pg === 'prev') state.page = Math.max(1, state.page - 1);
                else if (pg === 'next') state.page = Math.min(totalPages, state.page + 1);
                else state.page = parseInt(pg);
                fetchData();
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

            // Update sort indicators
            _qAll('#doc-table thead th').forEach(function(h) {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            this.classList.add('sorted-' + state.sort.order);

            state.page = 1;
            fetchData();
        });
    });

    // ── Search ──
    var searchTimer;
    _el('search-input').addEventListener('input', function() {
        clearTimeout(searchTimer);
        var val = this.value.trim();
        searchTimer = setTimeout(function() {
            state.filters.search = val;
            state.page = 1;
            fetchData();
            renderActiveFilters();
        }, 400);
    });

    // ── Export ──
    _el('btn-export').addEventListener('click', function() {
        var filters = buildFilters();
        var url = '/api/method/frappe.client.get_list?doctype=Document+Registry'
            + '&fields=["file_name","file_type","source_doctype","source_name","source_record_title","source_category","partner_name","project_title","upload_date","file_size_display"]'
            + '&filters=' + encodeURIComponent(JSON.stringify(filters))
            + '&order_by=' + state.sort.field + '+' + state.sort.order
            + '&limit_page_length=0&as_list=1';
        window.open(url, '_blank');
    });

    // ── Initial load ──
    fetchCounts();
    fetchData();

})();
