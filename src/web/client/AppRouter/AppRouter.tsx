import { Routes, Route } from "react-router-dom";
import Intro from "../pages/Welcome";
import { Projects } from "../pages/Projects";
//
//
//
import { DashUILayout } from "../pages/ProjectAdminLayout/DashUILayout";
import { SubPage } from "../pages/ProjectAdminLayout/SubPage/SubPage";
import { BlenderReceiver } from "../pages/ProjectAdminLayout/SubPage/BlenderReceiver";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Intro />} />
      <Route path="/projects" element={<Projects />} />
      <Route
        path="/projects/:projectID"
        element={
          <DashUILayout>
            <SubPage
              title="Dashboard"
              description="Overview of your project assets and activity"
            />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/props"
        element={
          <DashUILayout>
            <SubPage title="3D Props" description="Manage 3D prop assets" />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/environments"
        element={
          <DashUILayout>
            <SubPage
              title="Environments"
              description="Manage 3D environment scenes"
            />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/avatars"
        element={
          <DashUILayout>
            <SubPage
              title="Avatars"
              description="Manage 3D avatar and character files"
            />
          </DashUILayout>
        }
      />
      <Route
        path="/projects/:projectID/media"
        element={
          <DashUILayout>
            <SubPage
              title="Media"
              description="Manage textures, images, and media files"
            />
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
            <SubPage title="Settings" description="Settings page" />
          </DashUILayout>
        }
      />
      {/* <Route path="/projects/:projectID/editor" element={<ProjectEditor />} /> */}
    </Routes>
  );
}
