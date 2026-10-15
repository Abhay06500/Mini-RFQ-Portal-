import { Route, Routes } from 'react-router-dom';
import { AppLayout, RequireRole } from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import { NotFoundPage, UnauthorizedPage } from './pages/NotFoundPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import BuyerRfqListPage from './pages/buyer/BuyerRfqListPage';
import RfqFormPage from './pages/buyer/RfqFormPage';
import RfqDetailPage from './pages/rfq/RfqDetailPage';
import ComparePage from './pages/rfq/ComparePage';
import QuoteDetailPage from './pages/rfq/QuoteDetailPage';
import DiscoverPage from './pages/vendor/DiscoverPage';
import MyQuotesPage from './pages/vendor/MyQuotesPage';
import { ReviseQuotePage, SubmitQuotePage } from './pages/vendor/QuoteFormPage';
import UsersPage from './pages/admin/UsersPage';
import AllRfqsPage from './pages/admin/AllRfqsPage';

/**
 * Route map. Guards here only shape the UI. Every API call is authorized again on the server.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route element={<RequireRole />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />

          <Route element={<RequireRole roles={['BUYER']} />}>
            <Route path="buyer/rfqs" element={<BuyerRfqListPage />} />
            <Route path="buyer/rfqs/new" element={<RfqFormPage />} />
            <Route path="rfqs/:id/edit" element={<RfqFormPage />} />
          </Route>

          <Route element={<RequireRole roles={['VENDOR']} />}>
            <Route path="vendor/rfqs" element={<DiscoverPage />} />
            <Route path="vendor/quotes" element={<MyQuotesPage />} />
            <Route path="rfqs/:id/quote" element={<SubmitQuotePage />} />
            <Route path="quotes/:id/revise" element={<ReviseQuotePage />} />
          </Route>

          <Route element={<RequireRole roles={['BUYER', 'ADMIN']} />}>
            <Route path="rfqs/:id/compare" element={<ComparePage />} />
          </Route>

          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/rfqs" element={<AllRfqsPage />} />
          </Route>

          <Route path="rfqs/:id" element={<RfqDetailPage />} />
          <Route path="quotes/:id" element={<QuoteDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
