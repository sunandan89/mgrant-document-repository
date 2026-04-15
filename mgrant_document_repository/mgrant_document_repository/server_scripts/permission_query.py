# Server Script: Document Registry - Permission Query
# Type: Permission Query
# DocType: Document Registry
# Event: Before Insert

user = frappe.session.user
if user == "Administrator":
    conditions = ""
else:
    role_docs = frappe.db.get_all("Has Role", filters={"parent": user}, fields=["role"])
    role_list = []
    for rd in role_docs:
        role_list.append(rd.role)

    full_access_roles = ["System Manager", "SPM", "PM", "HO Finance", "mGrant Partnerships"]
    has_full = False
    for r in full_access_roles:
        if r in role_list:
            has_full = True
            break

    if has_full:
        conditions = ""
    else:
        parts = []

        if "Partner NGO" in role_list:
            ngo = frappe.db.get_value("NGO", {"user": user}, "name")
            if ngo:
                parts.append("`tabDocument Registry`.partner = " + frappe.db.escape(ngo))

        if "Donor Admin" in role_list:
            donor = frappe.db.get_value("Donor", {"user": user}, "name")
            if donor:
                parts.append("`tabDocument Registry`.donor = " + frappe.db.escape(donor))

        if parts:
            conditions = "(" + " OR ".join(parts) + ")"
        else:
            conditions = "`tabDocument Registry`.name = ''"
