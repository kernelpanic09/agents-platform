import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import { SelectionProvider } from './context/SelectionContext';

const AgentProfile = lazy(() => import('./pages/AgentProfile'));
const AgencyAgentProfile = lazy(() => import('./pages/AgencyAgentProfile'));
const ComposePage = lazy(() => import('./pages/ComposePage'));
const SchedulesPage = lazy(() => import('./pages/SchedulesPage'));
const ScheduleDetailPage = lazy(() => import('./pages/ScheduleDetailPage'));
const RunDetailPage = lazy(() => import('./pages/RunDetailPage'));
const AllRunsPage = lazy(() => import('./pages/AllRunsPage'));
const RagPlayground = lazy(() => import('./pages/RagPlayground'));
const WorkflowsPage = lazy(() => import('./pages/WorkflowsPage'));
const PipelinesPage = lazy(() => import('./pages/PipelinesPage'));
const PipelineDetailPage = lazy(() => import('./pages/PipelineDetailPage'));
const CrewsPage = lazy(() => import('./pages/CrewsPage'));
const SkillsPage = lazy(() => import('./pages/SkillsPage'));
const ObservabilityPage = lazy(() => import('./pages/ObservabilityPage'));
const EvalPage = lazy(() => import('./pages/EvalPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const SuspenseLoader = (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <SelectionProvider>
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/agent/:id"
                element={<Suspense fallback={SuspenseLoader}><AgentProfile /></Suspense>}
              />
              <Route
                path="/agency/:id"
                element={<Suspense fallback={SuspenseLoader}><AgencyAgentProfile /></Suspense>}
              />
              <Route
                path="/compose"
                element={<Suspense fallback={SuspenseLoader}><ComposePage /></Suspense>}
              />
              <Route
                path="/schedules"
                element={<Suspense fallback={SuspenseLoader}><SchedulesPage /></Suspense>}
              />
              <Route
                path="/schedules/runs/:id"
                element={<Suspense fallback={SuspenseLoader}><RunDetailPage /></Suspense>}
              />
              <Route
                path="/schedules/:id"
                element={<Suspense fallback={SuspenseLoader}><ScheduleDetailPage /></Suspense>}
              />
              <Route
                path="/runs"
                element={<Suspense fallback={SuspenseLoader}><AllRunsPage /></Suspense>}
              />
              <Route
                path="/rag"
                element={<Suspense fallback={SuspenseLoader}><RagPlayground /></Suspense>}
              />
              <Route
                path="/workflows"
                element={<Suspense fallback={SuspenseLoader}><WorkflowsPage /></Suspense>}
              />
              <Route
                path="/pipelines"
                element={<Suspense fallback={SuspenseLoader}><PipelinesPage /></Suspense>}
              />
              <Route
                path="/pipelines/:id"
                element={<Suspense fallback={SuspenseLoader}><PipelineDetailPage /></Suspense>}
              />
              <Route
                path="/crews"
                element={<Suspense fallback={SuspenseLoader}><CrewsPage /></Suspense>}
              />
              <Route
                path="/skills"
                element={<Suspense fallback={SuspenseLoader}><SkillsPage /></Suspense>}
              />
              <Route
                path="/observability"
                element={<Suspense fallback={SuspenseLoader}><ObservabilityPage /></Suspense>}
              />
              <Route
                path="/eval"
                element={<Suspense fallback={SuspenseLoader}><EvalPage /></Suspense>}
              />
              <Route
                path="/settings"
                element={<Suspense fallback={SuspenseLoader}><SettingsPage /></Suspense>}
              />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </SelectionProvider>
    </BrowserRouter>
  );
}
