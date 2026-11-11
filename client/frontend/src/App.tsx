import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./Login";
import Register from "./Register";
import Dashboard from "./Dashboard";
import ReportIncident from "./ReportIncident";
import MyIncidents from "./MyIncidents";
import TrackIncident from "./TrackIncident";
import AdminAssignment from "./AdminAssignment";
import AdminClassification from "./AdminClassification";

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
      </Routes>
    </BrowserRouter>
  );
}

export default App;