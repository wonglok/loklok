import { Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
import { SceneSyncEditor } from "./b3sync/app/receiver/page";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/receiver" element={<SceneSyncEditor />} />
    </Routes>
  );
}
