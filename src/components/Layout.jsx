import { Link, useLocation } from 'react-router-dom';
import { Bot, Calendar, Home, History, Database, GitBranch, Waypoints, Activity, FlaskConical, Settings } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Directory', icon: Home, match: (p) => p === '/' || p.startsWith('/agent/') || p.startsWith('/agency/') || p === '/compose' },
  { to: '/schedules', label: 'Schedules', icon: Calendar, match: (p) => p === '/schedules' || p.startsWith('/schedules/') },
  { to: '/runs', label: 'Runs', icon: History, match: (p) => p === '/runs' },
  { to: '/rag', label: 'RAG', icon: Database, match: (p) => p === '/rag' },
  { to: '/workflows', label: 'Workflows', icon: GitBranch, match: (p) => p === '/workflows' },
  { to: '/pipelines', label: 'Pipelines', icon: Waypoints, match: (p) => p === '/pipelines' || p.startsWith('/pipelines/') },
  { to: '/observability', label: 'Observe', icon: Activity, match: (p) => p === '/observability' },
  { to: '/eval', label: 'Eval', icon: FlaskConical, match: (p) => p === '/eval' },
  { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p === '/settings' },
];

export default function Layout({ children }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-surface text-white">
      <header className="sticky top-0 z-50 glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot className="text-white" size={18} />
            </div>
            <span className="font-semibold text-lg tracking-tight">Agents</span>
          </Link>
          <nav className="flex items-center gap-1 ml-2 sm:ml-4">
            {NAV.map(({ to, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    active ? 'bg-violet-600/20 text-violet-200' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
      <a
        href="https://github.com/kernelpanic09/agents-platform"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-3 left-3 z-40 text-[10px] font-mono px-2 py-1 rounded-md bg-zinc-900 border border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20 transition-colors select-none"
        title="Version"
      >
        {import.meta.env.VITE_APP_VERSION || 'dev'}
      </a>
    </div>
  );
}
