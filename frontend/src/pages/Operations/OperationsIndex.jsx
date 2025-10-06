import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * OperationsIndex component: Acts as the default landing page for the /operations route.
 * It immediately redirects the user to the default workflow page, Backup History.
 */
export default function OperationsIndex() {
  // Redirect to the desired default page for the Operations section.
  return <Navigate to="/operations/backups" replace />;
}
