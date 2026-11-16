import { useCallback, useEffect, useState } from "react";
import "./ManageTechnicians.css";

interface Skill {
    skill_id?: number;
    skill_name: string;
    proficiency: number;
}

interface Technician {
    user_id: number;
    username: string;
    email: string;
    experience_years: number;
    is_available: boolean;
    max_workload: number;
    current_workload: number;
    skills: Skill[];
}

function ManageTechnicians() {
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [selected, setSelected] = useState<Technician | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const [profile, setProfile] = useState({
        experience_years: 0,
        is_available: true,
        max_workload: 10
    });

    const [skillName, setSkillName] = useState("");
    const [skillProficiency, setSkillProficiency] = useState(1);

    const token = localStorage.getItem("token");

    const fetchTechnicians = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const response = await fetch(
                "http://localhost:8080/incidents/admin/technicians",
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to load technicians");
            }

            setTechnicians(data.technicians);

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to load technicians"
            );
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchTechnicians();
    }, [fetchTechnicians]);

    function openTechnician(technician: Technician) {
        setSelected(technician);

        setProfile({
            experience_years: Number(technician.experience_years),
            is_available: technician.is_available,
            max_workload: Number(technician.max_workload)
        });

        setSkillName("");
        setSkillProficiency(1);
        setError("");
        setSuccess("");
    }

    async function saveProfile() {
        if (!selected) return;

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            const response = await fetch(
                `http://localhost:8080/incidents/admin/technicians/${selected.user_id}/profile`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(profile)
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to update profile");
            }

            setSuccess("Technician profile updated.");
            await fetchTechnicians();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to update profile"
            );
        } finally {
            setSaving(false);
        }
    }

    async function addSkill(e: React.FormEvent) {
        e.preventDefault();

        if (!selected || !skillName.trim()) return;

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            const response = await fetch(
                `http://localhost:8080/incidents/admin/technicians/${selected.user_id}/skills`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        skill_name: skillName.trim(),
                        proficiency: skillProficiency
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to add skill");
            }

            setSkillName("");
            setSkillProficiency(1);
            setSuccess("Skill added successfully.");

            await refreshSelected();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to add skill"
            );
        } finally {
            setSaving(false);
        }
    }

    async function refreshSelected() {
        await fetchTechnicians();

        // Refresh the selected technician using the latest API data.
        const response = await fetch(
            "http://localhost:8080/incidents/admin/technicians",
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (response.ok) {
            const updated = data.technicians.find(
                (t: Technician) => t.user_id === selected?.user_id
            );

            if (updated) {
                setSelected(updated);
                setProfile({
                    experience_years: Number(updated.experience_years),
                    is_available: updated.is_available,
                    max_workload: Number(updated.max_workload)
                });
            }
        }
    }

    async function updateSkill(skill: Skill, proficiency: number) {
        if (!selected || !skill.skill_id) return;

        try {
            setSaving(true);
            setError("");

            const response = await fetch(
                `http://localhost:8080/incidents/admin/technicians/${selected.user_id}/skills/${skill.skill_id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ proficiency })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to update skill");
            }

            setSuccess("Skill proficiency updated.");
            await refreshSelected();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to update skill"
            );
        } finally {
            setSaving(false);
        }
    }

    async function deleteSkill(skill: Skill) {
        if (!selected || !skill.skill_id) return;

        if (!window.confirm(`Remove ${skill.skill_name} from this technician?`)) {
            return;
        }

        try {
            setSaving(true);
            setError("");

            const response = await fetch(
                `http://localhost:8080/incidents/admin/technicians/${selected.user_id}/skills/${skill.skill_id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to remove skill");
            }

            setSuccess("Skill removed.");
            await refreshSelected();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to remove skill"
            );
        } finally {
            setSaving(false);
        }
    }

    async function toggleAvailability(technician: Technician) {
        const newAvailability = !technician.is_available;

        try {
            setError("");
            setSuccess("");

            const response = await fetch(
                `http://localhost:8080/incidents/admin/technicians/${technician.user_id}/profile`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        experience_years: Number(technician.experience_years),
                        is_available: newAvailability,
                        max_workload: Number(technician.max_workload)
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to update availability");
            }

            setSuccess("Technician availability updated.");
            await fetchTechnicians();

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unable to update availability"
            );
        }
    }

    return (
        <div className="manageTechniciansPage">

            <div className="manageTechniciansHeader">
                <div>
                    <h1>Manage Technicians</h1>
                    <p>Manage technician profiles, skills and workload.</p>
                </div>

                <button
                    className="refreshTechniciansButton"
                    onClick={fetchTechnicians}
                >
                    ↻ Refresh
                </button>
            </div>

            {error && <div className="technicianMessage error">{error}</div>}
            {success && <div className="technicianMessage success">{success}</div>}

            <div className="technicianSummary">
                <div className="technicianSummaryCard">
                    <span>Total Technicians</span>
                    <strong>{technicians.length}</strong>
                </div>

                <div className="technicianSummaryCard">
                    <span>Available</span>
                    <strong>
                        {technicians.filter(t => t.is_available).length}
                    </strong>
                </div>

                <div className="technicianSummaryCard">
                    <span>Unavailable</span>
                    <strong>
                        {technicians.filter(t => !t.is_available).length}
                    </strong>
                </div>
            </div>

            <div className="techniciansTableContainer">
                {loading ? (
                    <p className="techniciansEmpty">Loading technicians...</p>
                ) : technicians.length === 0 ? (
                    <p className="techniciansEmpty">No technicians found.</p>
                ) : (
                    <table className="techniciansTable">
                        <thead>
                            <tr>
                                <th>Technician</th>
                                <th>Experience</th>
                                <th>Skills</th>
                                <th>Workload</th>
                                <th>Availability</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {technicians.map(technician => (
                                <tr key={technician.user_id}>
                                    <td>
                                        <div className="technicianIdentity">
                                            <strong>{technician.username}</strong>
                                            <span>{technician.email}</span>
                                        </div>
                                    </td>

                                    <td>{technician.experience_years} years</td>

                                    <td>
                                        <div className="technicianSkillTags">
                                            {technician.skills.length === 0 ? (
                                                <span className="noSkills">No skills</span>
                                            ) : (
                                                technician.skills.map((skill, index) => (
                                                    <span key={skill.skill_id ?? index}>
                                                        {skill.skill_name}
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </td>

                                    <td>
                                        <div className="technicianWorkload">
                                            <strong>
                                                {technician.current_workload} / {technician.max_workload}
                                            </strong>

                                            <div className="workloadBar">
                                                <div
                                                    style={{
                                                        width: `${Math.min(
                                                            100,
                                                            Number(technician.current_workload) /
                                                            Math.max(1, Number(technician.max_workload)) * 100
                                                        )}%`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </td>

                                    <td>
                                        <button
                                            className={`availabilityToggle ${
                                                technician.is_available ? "available" : "unavailable"
                                            }`}
                                            onClick={() => toggleAvailability(technician)}
                                        >
                                            {technician.is_available ? "Available" : "Unavailable"}
                                        </button>
                                    </td>

                                    <td>
                                        <button
                                            className="editTechnicianButton"
                                            onClick={() => openTechnician(technician)}
                                        >
                                            Manage
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selected && (
                <div
                    className="technicianModalOverlay"
                    onClick={() => setSelected(null)}
                >
                    <div
                        className="technicianModal"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="technicianModalHeader">
                            <div>
                                <h2>{selected.username}</h2>
                                <p>{selected.email}</p>
                            </div>

                            <button
                                className="closeTechnicianModal"
                                onClick={() => setSelected(null)}
                            >
                                ×
                            </button>
                        </div>

                        <section className="technicianEditSection">
                            <h3>Technician Profile</h3>

                            <label>Experience (years)</label>
                            <input
                                type="number"
                                min="0"
                                value={profile.experience_years}
                                onChange={e => setProfile({
                                    ...profile,
                                    experience_years: Number(e.target.value)
                                })}
                            />

                            <label>Maximum Workload</label>
                            <input
                                type="number"
                                min="1"
                                value={profile.max_workload}
                                onChange={e => setProfile({
                                    ...profile,
                                    max_workload: Number(e.target.value)
                                })}
                            />

                            <label className="availabilityCheckbox">
                                <input
                                    type="checkbox"
                                    checked={profile.is_available}
                                    onChange={e => setProfile({
                                        ...profile,
                                        is_available: e.target.checked
                                    })}
                                />
                                Available for assignments
                            </label>

                            <button
                                className="saveTechnicianButton"
                                onClick={saveProfile}
                                disabled={saving}
                            >
                                {saving ? "Saving..." : "Save Profile"}
                            </button>
                        </section>

                        <section className="technicianEditSection">
                            <h3>Skills</h3>

                            {selected.skills.length === 0 ? (
                                <p className="noSkills">No skills added yet.</p>
                            ) : (
                                <div className="technicianSkillList">
                                    {selected.skills.map((skill, index) => (
                                        <div
                                            className="technicianSkillRow"
                                            key={skill.skill_id ?? index}
                                        >
                                            <strong>{skill.skill_name}</strong>

                                            <select
                                                value={skill.proficiency}
                                                disabled={saving}
                                                onChange={e =>
                                                    updateSkill(
                                                        skill,
                                                        Number(e.target.value)
                                                    )
                                                }
                                            >
                                                {[1, 2, 3, 4, 5].map(level => (
                                                    <option key={level} value={level}>
                                                        Level {level}
                                                    </option>
                                                ))}
                                            </select>

                                            <button
                                                className="removeSkillButton"
                                                disabled={saving}
                                                onClick={() => deleteSkill(skill)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <form className="addSkillForm" onSubmit={addSkill}>
                                <input
                                    type="text"
                                    placeholder="Skill name (e.g. Networking)"
                                    value={skillName}
                                    onChange={e => setSkillName(e.target.value)}
                                    required
                                />

                                <select
                                    value={skillProficiency}
                                    onChange={e =>
                                        setSkillProficiency(Number(e.target.value))
                                    }
                                >
                                    {[1, 2, 3, 4, 5].map(level => (
                                        <option key={level} value={level}>
                                            Level {level}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    type="submit"
                                    className="addSkillButton"
                                    disabled={saving}
                                >
                                    Add Skill
                                </button>
                            </form>
                        </section>

                    </div>
                </div>
            )}

        </div>
    );
}

export default ManageTechnicians;
