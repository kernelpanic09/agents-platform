import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bot, Calendar, Home, History, Database, GitBranch, Waypoints,
  Users, Activity, FlaskConical, Settings, Wand2, Newspaper, Menu, X,
  PanelLeftClose, PanelLeftOpen, Sun, Moon, Variable, KanbanSquare,
} from 'lucide-react';

// Grouped left-nav. Monitor first (Reports/Schedules/Runs), then authoring (Build)
// and the AI/ops tools (Intelligence). Settings is pinned to the footer.
const GROUPS = [
  {
    label: 'Monitor',
    items: [
      { to: '/reports', label: 'Reports', icon: Newspaper, match: (p) => p === '/reports' || p.startsWith('/reports/') },
      { to: '/schedules', label: 'Schedules', icon: Calendar, match: (p) => p === '/schedules' || p.startsWith('/schedules/') },
      { to: '/runs', label: 'Runs', icon: History, match: (p) => p === '/runs' },
      { to: '/tickets', label: 'Tickets', icon: KanbanSquare, match: (p) => p === '/tickets' || p.startsWith('/tickets/') },
    ],
  },
  {
    label: 'Build',
    items: [
      { to: '/', label: 'Directory', icon: Home, match: (p) => p === '/' || p.startsWith('/agent/') || p.startsWith('/agency/') || p === '/compose' },
      { to: '/crews', label: 'Crews', icon: Users, match: (p) => p === '/crews' },
      { to: '/skills', label: 'Skills', icon: Wand2, match: (p) => p === '/skills' },
      { to: '/variables', label: 'Variables', icon: Variable, match: (p) => p === '/variables' },
      { to: '/pipelines', label: 'Pipelines', icon: Waypoints, match: (p) => p === '/pipelines' || p.startsWith('/pipelines/') },
      { to: '/workflows', label: 'Workflows', icon: GitBranch, match: (p) => p === '/workflows' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/rag', label: 'RAG', icon: Database, match: (p) => p === '/rag' },
      { to: '/eval', label: 'Eval', icon: FlaskConical, match: (p) => p === '/eval' },
      { to: '/observability', label: 'Observe', icon: Activity, match: (p) => p === '/observability' },
    ],
  },
];

const SETTINGS_ITEM = { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p === '/settings' };

function Brand({ collapsed, onNavigate }) {
  return (
    <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 shrink-0 overflow-hidden">
      <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-[3px] bg-accent-400 text-surface">
        <Bot size={16} strokeWidth={2.5} />
      </span>
      {!collapsed && <span className="font-semibold text-[15px] tracking-tight text-zinc-100 whitespace-nowrap">Agents</span>}
    </Link>
  );
}

function NavItem({ item, active, collapsed, onNavigate }) {
  const { icon: Icon, to, label } = item;
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={`group relative flex items-center gap-2.5 rounded-[3px] text-[13px] leading-5 transition-colors ${
        collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[7px]'
      } ${
        active ? 'text-accent-300 bg-accent-400/[0.08] font-medium' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent-400" />}
      <Icon size={15} strokeWidth={2} className={active ? 'text-accent-400' : 'text-zinc-500 group-hover:text-zinc-300'} />
      {!collapsed && <span className="whitespace-nowrap">{label}</span>}
    </Link>
  );
}

function SidebarBody({ pathname, collapsed, onNavigate, onToggle, light, onToggleTheme }) {
  return (
    <>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-5">
        {GROUPS.map((g) => (
          <div key={g.label}>
            {collapsed ? (
              <div className="mx-2 mb-1.5 border-t border-zinc-800/70" />
            ) : (
              <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{g.label}</div>
            )}
            <div className="space-y-px">
              {g.items.map((it) => (
                <NavItem key={it.to} item={it} active={it.match(pathname)} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-2 py-2 border-t border-zinc-800 space-y-px">
        <NavItem item={SETTINGS_ITEM} active={SETTINGS_ITEM.match(pathname)} collapsed={collapsed} onNavigate={onNavigate} />
        <button
          onClick={onToggleTheme}
          aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
          title={light ? 'Dark mode' : 'Light mode'}
          className={`w-full flex items-center gap-2.5 rounded-[3px] text-[13px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors ${
            collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[7px]'
          }`}
        >
          {light ? <Moon size={15} strokeWidth={2} /> : <Sun size={15} strokeWidth={2} />}
          {!collapsed && <span>{light ? 'Dark mode' : 'Light mode'}</span>}
        </button>
        {onToggle && (
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
            className={`w-full flex items-center gap-2.5 rounded-[3px] text-[13px] text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors ${
              collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[7px]'
            }`}
          >
            {collapsed ? <PanelLeftOpen size={15} strokeWidth={2} /> : (<><PanelLeftClose size={15} strokeWidth={2} /><span>Collapse</span></>)}
          </button>
        )}
        {!collapsed && (
          <a
            href="https://github.com/kernelpanic09/agents-platform"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-2.5 pt-1 font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors select-none"
            title="Version"
          >
            {import.meta.env.VITE_APP_VERSION || 'dev'}
          </a>
        )}
      </div>
    </>
  );
}

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('agents-sidebar-collapsed') === '1'; } catch { return false; }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('agents-sidebar-collapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  const close = () => setOpen(false);

  const [light, setLight] = useState(() => {
    try { return document.documentElement.classList.contains('light'); } catch { return false; }
  });
  const toggleTheme = () =>
    setLight((v) => {
      const next = !v;
      try {
        document.documentElement.classList.toggle('light', next);
        localStorage.setItem('agents-theme', next ? 'light' : 'dark');
      } catch { /* ignore */ }
      return next;
    });

  return (
    <div className="min-h-screen bg-surface text-white">
      {/* Desktop: fixed left rail (collapsible) */}
      <aside
        className={`hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-surface-raised border-r border-zinc-800 transition-[width] duration-200 ease-out ${
          collapsed ? 'w-14' : 'w-48'
        }`}
      >
        <div className={`flex items-center h-14 border-b border-zinc-800 ${collapsed ? 'justify-center px-0' : 'px-3'}`}>
          <Brand collapsed={collapsed} />
        </div>
        <SidebarBody pathname={pathname} collapsed={collapsed} onToggle={toggleCollapsed} light={light} onToggleTheme={toggleTheme} />
      </aside>

      {/* Mobile: top bar + drawer toggle */}
      <header className="md:hidden sticky top-0 z-40 flex items-center gap-3 h-14 px-4 bg-surface-raised border-b border-zinc-800">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="-ml-1.5 p-1.5 rounded-[3px] text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <Menu size={20} />
        </button>
        <Brand />
      </header>

      {/* Mobile drawer (always full labels) */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={close} />
          <aside className="absolute inset-y-0 left-0 w-60 flex flex-col bg-surface-raised border-r border-zinc-800">
            <div className="flex items-center justify-between h-14 px-3 border-b border-zinc-800">
              <Brand onNavigate={close} />
              <button onClick={close} aria-label="Close navigation" className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <SidebarBody pathname={pathname} collapsed={false} onNavigate={close} light={light} onToggleTheme={toggleTheme} />
          </aside>
        </div>
      )}

      {/* Content */}
      <main className={`min-h-screen transition-[padding] duration-200 ease-out ${collapsed ? 'md:pl-14' : 'md:pl-48'}`}>
        <div className="px-5 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
