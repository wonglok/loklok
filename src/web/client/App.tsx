import { Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
import { BlenderReceiver } from "./pages/BlenderReceiver";
import { Projects } from "./pages/Projects";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/preview" element={<BlenderReceiver />} />
      <Route path="/projects" element={<Projects />} />
    </Routes>
  );
}
