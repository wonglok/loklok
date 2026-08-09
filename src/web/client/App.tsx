import { Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
import { SceneSyncEditor } from "@effectnode/b3sync";
import "@effectnode/b3sync/styles.css";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/preview" element={<SceneSyncEditor />} />
    </Routes>
  );
}
