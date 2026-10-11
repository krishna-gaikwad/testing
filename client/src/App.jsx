import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Report from './pages/Report';
import MyComplaints from './pages/MyComplaints';
import ComplaintDetail from './pages/ComplaintDetail';
import PublicMap from './pages/PublicMap';
import OfficialDashboard from './pages/OfficialDashboard';
import { CityProvider } from './context/CityContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <CityProvider>
        <LanguageProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route
                  path="report"
                  element={
                    <ProtectedRoute allowedRoles={['citizen']}>
                      <Report />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="my-complaints"
                  element={
                    <ProtectedRoute allowedRoles={['citizen']}>
                      <MyComplaints />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="complaints/:id"
                  element={
                    <ProtectedRoute>
                      <ComplaintDetail />
                    </ProtectedRoute>
                  }
                />
                <Route path="public-map" element={<PublicMap />} />
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute allowedRoles={['reviewer', 'officer', 'supervisor']}>
                      <OfficialDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </LanguageProvider>
      </CityProvider>
    </AuthProvider>
  );
}
