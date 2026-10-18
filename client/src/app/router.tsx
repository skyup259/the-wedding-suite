import { createBrowserRouter } from 'react-router';
import { ScaffoldPage } from './ScaffoldPage.js';
import { NotFoundPage } from './NotFoundPage.js';

export const router = createBrowserRouter([
  { path: '/', element: <ScaffoldPage /> },
  { path: '*', element: <NotFoundPage /> },
]);
