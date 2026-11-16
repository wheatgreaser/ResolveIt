
import { useCallback, useEffect, useState } from "react";
import "./ManageUsers.css";

interface User {
    user_id: number;
    username: string;
    email: string;
    full_name: string | null;
    role: "EMPLOYEE" | "TECHNICIAN" | "ADMIN";
    is_active: boolean;
    created_at: string;
}

function ManageUsers() {
    const [users, setUsers] = useState<User[]>([]);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        username: "",
        email: "",
        full_name: "",
        password: "",
        role: "EMPLOYEE"
    });

    const token = localStorage.getItem("token");

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const params = new URLSearchParams();

            if (search.trim()) params.set("search", search.trim());
            if (roleFilter) params.set("role", roleFilter);
            if (statusFilter) params.set("status", statusFilter);

            const response = await fetch(
                `http://localhost:8080/auth/admin/users?${params}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to retrieve users");
            }

            setUsers(data.users);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong"
            );
        } finally {
            setLoading(false);
        }
    }, [search, roleFilter, statusFilter, token]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    async function createUser(e: React.FormEvent) {
        e.preventDefault();

        try {
            setSubmitting(true);
            setError("");
            setSuccess("");

            const response = await fetch(
                "http://localhost:8080/auth/admin/users",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(formData)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to create user");
            }

            setSuccess("User created successfully");

            setFormData({
                username: "",
                email: "",
                full_name: "",
                password: "",
                role: "EMPLOYEE"
            });

            setShowCreateModal(false);
            await fetchUsers();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong"
            );
        } finally {
            setSubmitting(false);
        }
    }

    async function changeRole(user: User, newRole: string) {
        if (user.role === newRole) return;

        const confirmed = window.confirm(
            `Change ${user.username}'s role to ${newRole}?`
        );

        if (!confirmed) return;

        try {
            setError("");
            setSuccess("");

            const response = await fetch(
                `http://localhost:8080/auth/admin/users/${user.user_id}/role`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ role: newRole })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to change role");
            }

            setSuccess(data.message);
            await fetchUsers();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong"
            );
        }
    }

    async function toggleUserStatus(user: User) {
        const action = user.is_active ? "deactivate" : "activate";

        if (!window.confirm(`Are you sure you want to ${action} ${user.username}?`)) {
            return;
        }

        try {
            setError("");
            setSuccess("");

            const response = await fetch(
                `http://localhost:8080/auth/admin/users/${user.user_id}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        is_active: !user.is_active
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to update account");
            }

            setSuccess(data.message);
            await fetchUsers();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong"
            );
        }
    }

    return (
        <div className="manageUsersPage">

            <div className="manageUsersHeader">
                <div>
                    <h1>Manage Users</h1>
                    <p>Manage employee, technician and administrator accounts.</p>
                </div>

                <button
                    className="createUserButton"
                    onClick={() => setShowCreateModal(true)}
                >
                    + Create User
                </button>
            </div>

            {error && <div className="userMessage error">{error}</div>}
            {success && <div className="userMessage success">{success}</div>}

            <div className="userFilters">

                <input
                    type="text"
                    placeholder="Search username, email or name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                >
                    <option value="">All Roles</option>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="TECHNICIAN">Technician</option>
                    <option value="ADMIN">Admin</option>
                </select>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>

            </div>

            <div className="usersTableContainer">
                {loading ? (
                    <p className="usersEmpty">Loading users...</p>
                ) : users.length === 0 ? (
                    <p className="usersEmpty">No users found.</p>
                ) : (
                    <table className="usersTable">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {users.map(user => (
                                <tr key={user.user_id}>
                                    <td>
                                        <div className="userIdentity">
                                            <strong>
                                                {user.full_name || user.username}
                                            </strong>
                                            <span>@{user.username}</span>
                                        </div>
                                    </td>

                                    <td>{user.email}</td>

                                    <td>
                                        <select
                                            className="roleSelect"
                                            value={user.role}
                                            onChange={(e) =>
                                                changeRole(user, e.target.value)
                                            }
                                        >
                                            <option value="EMPLOYEE">Employee</option>
                                            <option value="TECHNICIAN">Technician</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                    </td>

                                    <td>
                                        <span className={
                                            user.is_active
                                                ? "userStatus active"
                                                : "userStatus inactive"
                                        }>
                                            {user.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>

                                    <td>
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>

                                    <td>
                                        <button
                                            className={
                                                user.is_active
                                                    ? "userAction deactivate"
                                                    : "userAction activate"
                                            }
                                            onClick={() => toggleUserStatus(user)}
                                        >
                                            {user.is_active ? "Deactivate" : "Activate"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showCreateModal && (
                <div className="userModalOverlay">
                    <div className="userModal">

                        <div className="userModalHeader">
                            <h2>Create User</h2>

                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="closeModalButton"
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={createUser}>

                            <label>Full Name</label>
                            <input
                                type="text"
                                value={formData.full_name}
                                onChange={e => setFormData({
                                    ...formData,
                                    full_name: e.target.value
                                })}
                                placeholder="Enter full name"
                            />

                            <label>Username</label>
                            <input
                                type="text"
                                required
                                value={formData.username}
                                onChange={e => setFormData({
                                    ...formData,
                                    username: e.target.value
                                })}
                                placeholder="Enter username"
                            />

                            <label>Email</label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={e => setFormData({
                                    ...formData,
                                    email: e.target.value
                                })}
                                placeholder="Enter email"
                            />

                            <label>Password</label>
                            <input
                                type="password"
                                required
                                minLength={8}
                                value={formData.password}
                                onChange={e => setFormData({
                                    ...formData,
                                    password: e.target.value
                                })}
                                placeholder="Minimum 8 characters"
                            />

                            <label>Role</label>
                            <select
                                value={formData.role}
                                onChange={e => setFormData({
                                    ...formData,
                                    role: e.target.value
                                })}
                            >
                                <option value="EMPLOYEE">Employee</option>
                                <option value="TECHNICIAN">Technician</option>
                                <option value="ADMIN">Admin</option>
                            </select>

                            <div className="userModalActions">
                                <button
                                    type="button"
                                    className="cancelUserButton"
                                    onClick={() => setShowCreateModal(false)}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    className="createUserButton"
                                    disabled={submitting}
                                >
                                    {submitting ? "Creating..." : "Create User"}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}

export default ManageUsers;
