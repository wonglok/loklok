import { Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
import { ProjectsPage } from "./b3sync/app/projects/page";
import { SceneSyncEditor } from "./b3sync/app/projects/[projectID]/page";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/preview" element={<SceneSyncEditor />} />
      <Route path="/projects" element={<ProjectsPage />} />
    </Routes>
  );
}
