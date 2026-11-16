
import { useCallback, useEffect, useState } from "react";
import "./ManageServices.css";

interface Service {
    service_id: number;
    service_name: string;
    description: string | null;
    category: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

const initialForm = {
    service_name: "",
    description: "",
    category: ""
};

function ManageServices() {
    const [services, setServices] = useState<Service[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [showModal, setShowModal] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [formData, setFormData] = useState(initialForm);

    const token = localStorage.getItem("token");

    async function readResponse(response: Response) {
        const text = await response.text();

        try {
            return JSON.parse(text);
        } catch {
            throw new Error(
                `Server returned a non-JSON response (${response.status}). Check the API route.`
            );
        }
    }

    const fetchServices = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const response = await fetch(
                "http://localhost:8080/incidents/admin/services",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "Unable to fetch services");
            }

            setServices(data.services);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to fetch services"
            );
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchServices();
    }, [fetchServices]);

    const filteredServices = services.filter(service => {
        const searchMatch =
            service.service_name.toLowerCase().includes(search.toLowerCase()) ||
            (service.category || "").toLowerCase().includes(search.toLowerCase());

        const statusMatch =
            statusFilter === "" ||
            (statusFilter === "active" && service.is_active) ||
            (statusFilter === "inactive" && !service.is_active);

        return searchMatch && statusMatch;
    });

    function openCreateModal() {
        setEditingService(null);
        setFormData(initialForm);
        setError("");
        setShowModal(true);
    }

    function openEditModal(service: Service) {
        setEditingService(service);

        setFormData({
            service_name: service.service_name,
            description: service.description || "",
            category: service.category || ""
        });

        setError("");
        setShowModal(true);
    }

    async function saveService(e: React.FormEvent) {
        e.preventDefault();

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            const isEditing = editingService !== null;

            const url = isEditing
                ? `http://localhost:8080/incidents/admin/services/${editingService.service_id}`
                : "http://localhost:8080/incidents/admin/services";

            const response = await fetch(url, {
                method: isEditing ? "PATCH" : "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    service_name: formData.service_name.trim(),
                    description: formData.description.trim(),
                    category: formData.category.trim()
                })
            });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "Unable to save service");
            }

            setShowModal(false);
            setSuccess(
                isEditing
                    ? "Service updated successfully."
                    : "Service created successfully."
            );

            await fetchServices();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to save service"
            );
        } finally {
            setSaving(false);
        }
    }

    async function toggleStatus(service: Service) {
        const action = service.is_active ? "deactivate" : "activate";

        if (!window.confirm(
            `Are you sure you want to ${action} ${service.service_name}?`
        )) {
            return;
        }

        try {
            setError("");
            setSuccess("");

            const response = await fetch(
                `http://localhost:8080/incidents/admin/services/${service.service_id}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        is_active: !service.is_active
                    })
                }
            );

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "Unable to update service");
            }

            setSuccess(data.message);
            await fetchServices();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to update service"
            );
        }
    }

    return (
        <div className="manageServicesPage">

            <div className="manageServicesHeader">
                <div>
                    <h1>Manage Services</h1>
                    <p>Configure the IT services supported by your organization.</p>
                </div>

                <button
                    className="addServiceButton"
                    onClick={openCreateModal}
                >
                    + Add Service
                </button>
            </div>

            {error && (
                <div className="serviceMessage error">{error}</div>
            )}

            {success && (
                <div className="serviceMessage success">{success}</div>
            )}

            <div className="serviceSummary">
                <div className="serviceSummaryCard">
                    <span>Total Services</span>
                    <strong>{services.length}</strong>
                </div>

                <div className="serviceSummaryCard">
                    <span>Active Services</span>
                    <strong>
                        {services.filter(s => s.is_active).length}
                    </strong>
                </div>

                <div className="serviceSummaryCard">
                    <span>Inactive Services</span>
                    <strong>
                        {services.filter(s => !s.is_active).length}
                    </strong>
                </div>
            </div>

            <div className="serviceFilters">
                <input
                    type="text"
                    placeholder="Search services or categories..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>

            <div className="servicesTableContainer">
                {loading ? (
                    <p className="servicesEmpty">Loading services...</p>
                ) : filteredServices.length === 0 ? (
                    <p className="servicesEmpty">No services found.</p>
                ) : (
                    <table className="servicesTable">
                        <thead>
                            <tr>
                                <th>Service</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredServices.map(service => (
                                <tr key={service.service_id}>
                                    <td>
                                        <strong>{service.service_name}</strong>
                                    </td>

                                    <td>
                                        <span className="serviceCategory">
                                            {service.category || "Uncategorized"}
                                        </span>
                                    </td>

                                    <td className="serviceDescription">
                                        {service.description || "—"}
                                    </td>

                                    <td>
                                        <span className={
                                            service.is_active
                                                ? "serviceStatus active"
                                                : "serviceStatus inactive"
                                        }>
                                            {service.is_active ? "Active" : "Inactive"}
                                        </span>
                                    </td>

                                    <td>
                                        <div className="serviceActions">
                                            <button
                                                className="editServiceButton"
                                                onClick={() => openEditModal(service)}
                                            >
                                                Edit
                                            </button>

                                            <button
                                                className={
                                                    service.is_active
                                                        ? "deactivateServiceButton"
                                                        : "activateServiceButton"
                                                }
                                                onClick={() => toggleStatus(service)}
                                            >
                                                {service.is_active
                                                    ? "Deactivate"
                                                    : "Activate"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showModal && (
                <div
                    className="serviceModalOverlay"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="serviceModal"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="serviceModalHeader">
                            <h2>
                                {editingService ? "Edit Service" : "Add Service"}
                            </h2>

                            <button
                                className="closeServiceModal"
                                onClick={() => setShowModal(false)}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={saveService}>
                            <label>Service Name</label>
                            <input
                                type="text"
                                required
                                maxLength={100}
                                value={formData.service_name}
                                onChange={e => setFormData({
                                    ...formData,
                                    service_name: e.target.value
                                })}
                                placeholder="e.g. Network Infrastructure"
                            />

                            <label>Description</label>
                            <textarea
                                value={formData.description}
                                onChange={e => setFormData({
                                    ...formData,
                                    description: e.target.value
                                })}
                                placeholder="Describe the service..."
                                rows={4}
                            />

                            <label>Category</label>
                            <select
                                value={formData.category}
                                onChange={e => setFormData({
                                    ...formData,
                                    category: e.target.value
                                })}
                            >
                                <option value="">Select category</option>
                                <option value="NETWORK">Network</option>
                                <option value="DATABASE">Database</option>
                                <option value="SOFTWARE">Software</option>
                                <option value="HARDWARE">Hardware</option>
                                <option value="SECURITY">Security</option>
                                <option value="CLOUD">Cloud</option>
                                <option value="OTHER">Other</option>
                            </select>

                            <div className="serviceModalActions">
                                <button
                                    type="button"
                                    className="cancelServiceButton"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    className="addServiceButton"
                                    disabled={saving}
                                >
                                    {saving
                                        ? "Saving..."
                                        : editingService
                                            ? "Save Changes"
                                            : "Create Service"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}

export default ManageServices;
