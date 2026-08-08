import { Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
import { ProjectsPage } from "./b3sync/app/projects/page";
import { SceneSyncEditor } from "./b3sync/app/projects/[projectID]/page";
import { ViewerPage } from "./b3sync/app/viewer/[projectID]/page";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route
        path="/projects/:projectID"
        element={<SceneSyncEditor></SceneSyncEditor>}
      ></Route>
      <Route
        path="/viewer/:projectID"
        element={<ViewerPage></ViewerPage>}
      ></Route>
      <Route path="/projects" element={<ProjectsPage />} />
    </Routes>
  );
}
