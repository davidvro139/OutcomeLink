import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./layout/AppLayout";
import { ReportingPeriodDetailPage } from "./pages/accreditation/ReportingPeriodDetailPage";
import { ReportingPeriodsPage } from "./pages/accreditation/ReportingPeriodsPage";
import { TrendsPage } from "./pages/accreditation/TrendsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EmployerAnalyticsPage } from "./pages/employers/EmployerAnalyticsPage";
import { EmployerDetailPage } from "./pages/employers/EmployerDetailPage";
import { EmployersListPage } from "./pages/employers/EmployersListPage";
import { FollowUpQueuePage } from "./pages/followups/FollowUpQueuePage";
import { ImportBatchPage } from "./pages/imports/ImportBatchPage";
import { ImportsPage } from "./pages/imports/ImportsPage";
import { LicensureQueuePage } from "./pages/licensure/LicensureQueuePage";
import { LoginPage } from "./pages/LoginPage";
import { ProgramDetailPage } from "./pages/programs/ProgramDetailPage";
import { ProgramsListPage } from "./pages/programs/ProgramsListPage";
import { ReportBuilderPage } from "./pages/reportBuilder/ReportBuilderPage";
import { ScheduledReportsPage } from "./pages/reportBuilder/ScheduledReportsPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { StudentDetailPage } from "./pages/students/StudentDetailPage";
import { StudentsListPage } from "./pages/students/StudentsListPage";
import { EmployerSurveyPage } from "./pages/surveys/EmployerSurveyPage";
import { GraduateSurveyPage } from "./pages/surveys/GraduateSurveyPage";
import { DataConnectionsPage } from "./pages/imports/DataConnectionsPage";
import { JobHistoryPage } from "./pages/jobs/JobHistoryPage";
import { UsersPage } from "./pages/users/UsersPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/survey/graduate/:token" element={<GraduateSurveyPage />} />
      <Route path="/survey/employer/:token" element={<EmployerSurveyPage />} />
      <Route path="/set-password/:token" element={<SetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />

        <Route path="/programs" element={<ProgramsListPage />} />
        <Route path="/programs/:id" element={<ProgramDetailPage />} />

        <Route path="/students" element={<StudentsListPage />} />
        <Route path="/students/:id" element={<StudentDetailPage />} />

        <Route path="/employers" element={<EmployersListPage />} />
        <Route path="/employers/analytics" element={<EmployerAnalyticsPage />} />
        <Route path="/employers/:id" element={<EmployerDetailPage />} />

        <Route path="/followups" element={<FollowUpQueuePage />} />
        <Route path="/licensure" element={<LicensureQueuePage />} />

        <Route path="/imports" element={<ImportsPage />} />
        <Route path="/imports/connections" element={<DataConnectionsPage />} />
        <Route path="/imports/:id" element={<ImportBatchPage />} />

        <Route path="/report-builder" element={<ReportBuilderPage />} />
        <Route path="/report-builder/scheduled" element={<ScheduledReportsPage />} />

        <Route path="/accreditation/reporting-periods" element={<ReportingPeriodsPage />} />
        <Route path="/accreditation/trends" element={<TrendsPage />} />
        <Route
          path="/accreditation/reporting-periods/:id"
          element={<ReportingPeriodDetailPage />}
        />

        <Route path="/users" element={<UsersPage />} />
        <Route path="/jobs" element={<JobHistoryPage />} />
      </Route>
    </Routes>
  );
}

export default App;
