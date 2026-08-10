import { Routes, Route } from "react-router-dom";
import Intro from "../pages/Welcome";
// import { BlenderReceiver } from "../pages/BlenderReceiver";
import { Projects } from "../pages/Projects";
import { ProjectEditor } from "../pages/ProjectEditor";
import { DashUILayout } from "../pages/ProjectAdminLayout/DashUILayout";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Intro />} />
      {/* <Route path="/preview" element={<BlenderReceiver />} /> */}
      <Route path="/projects" element={<Projects />} />
      <Route
        path="/projects/:projectID"
        element={<DashUILayout>project</DashUILayout>}
      />
      <Route
        path="/projects/:projectID/receiver"
        element={<DashUILayout>receiver</DashUILayout>}
      />
      <Route path="/projects/:projectID/editor" element={<ProjectEditor />} />
    </Routes>
  );
}
