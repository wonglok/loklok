import { Routes, Route } from "react-router-dom";
import Intro from "./pages/Welcome";
import { BlenderReceiver } from "./pages/BlenderReceiver";
import { Projects } from "./pages/Projects";
import { ProjectEditor } from "./pages/ProjectEditor";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Intro />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/preview" element={<BlenderReceiver />} />
      <Route path="/projects/:projectID" element={<ProjectEditor />} />
    </Routes>
  );
}
