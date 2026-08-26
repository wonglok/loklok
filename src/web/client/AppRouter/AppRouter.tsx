import { Routes, Route } from "react-router-dom";
import Intro from "../pages/Welcome";
import { Projects } from "../pages/Projects";
//
//
//
import { DashUILayout } from "../pages/ProjectAdminLayout/DashUILayout";
import { Dashboard } from "../pages/ProjectAdminLayout/SubPage/Dashboard";
import { AssetPage } from "../pages/ProjectAdminLayout/SubPage/AssetPage";
import { SettingsPage } from "../pages/ProjectAdminLayout/SubPage/SettingsPage";
import { BlenderReceiver } from "../pages/ProjectAdminLayout/SubPage/BloomGlowRender";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Intro />} />
      <Route path="/projects" element={<Projects />} />
      <Route
        path="/projects/:projectID"
        element={
          <DashUILayout>
            <Dashboard />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/props"
        element={
          <DashUILayout>
            <AssetPage type="props" />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/environments"
        element={
          <DashUILayout>
            <AssetPage type="environments" />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/avatars"
        element={
          <DashUILayout>
            <AssetPage type="avatars" />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/media"
        element={
          <DashUILayout>
            <AssetPage type="media" />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/receiver"
        element={
          <DashUILayout>
            {/*  */}
            {<BlenderReceiver />}
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/settings"
        element={
          <DashUILayout>
            <SettingsPage />
          </DashUILayout>
        }
      />
      {/* <Route path="/projects/:projectID/editor" element={<ProjectEditor />} /> */}
    </Routes>
  );
}
