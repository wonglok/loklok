import { Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
import { SceneSyncEditor } from "./b3sync/pages/SceneSyncEditor";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/preview" element={<SceneSyncEditor />} />
    </Routes>
  );
}
