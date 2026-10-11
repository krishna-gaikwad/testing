import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute: checks authentication and optional role restrictions.
 * If not authenticated, redirects to /login preserving intended destination.
 * If role is not allowed, redirects to safe default route.
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-sm text-slate-500 animate-pulse">
        Checking session authentication...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // If official trying citizen page or citizen trying official dashboard
    if (['reviewer', 'officer', 'supervisor'].includes(user.role)) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/my-complaints" replace />;
  }

  return children;
}
