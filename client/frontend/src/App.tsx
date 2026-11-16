import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";
import Register from "./Register";
import Dashboard from "./Dashboard";
import ReportIncident from "./ReportIncident";
import MyIncidents from "./MyIncidents";
import TrackIncident from "./TrackIncident";
import AdminAssignment from "./AdminAssignment";
import AdminClassification from "./AdminClassification";
import TechnicianIncident from "./TechnicianIncident";
import AdminIncident from "./AdminIncident";
import AdminSLA from "./AdminSLA";
import AdminSLAConfig from "./AdminSLAConfig";
import ManageUsers from "./ManageUsers";
import ManageTechnicians from "./ManageTechnicians";
import ManageServices from "./ManageServices";
import AdminReports from "./AdminReports";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path = "/dashboard" element={<Dashboard />} />
        <Route path = "/report-incident" element={<ReportIncident />} />
        <Route path = "/my-incidents" element = {<MyIncidents />} />
        <Route path = "/track-incident/:id" element = {<TrackIncident />} />
        <Route path="/admin/assignments" element={<AdminAssignment />} />
       <Route path="/admin/classification" element={<AdminClassification />} /> 
        <Route path="/technician/incidents/:id" element={<TechnicianIncident />} />
        <Route path="/admin/incidents" element={<AdminIncident />} />
        <Route path="/admin/sla" element={<AdminSLA />} />
        <Route path="/admin/sla-config" element={<AdminSLAConfig />} />
        <Route path="/admin/users" element={<ManageUsers />} />
        <Route path="/admin/technicians" element={<ManageTechnicians />} />
        <Route path="/admin/services" element={<ManageServices />} />
        <Route path="/admin/reports" element={<AdminReports />} />
       
      </Routes>
    </BrowserRouter>
  );
}

export default App;