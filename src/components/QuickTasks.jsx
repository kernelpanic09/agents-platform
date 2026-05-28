import { useState, useRef, useEffect } from 'react';
import { Zap, Copy, Check } from 'lucide-react';
import AgentAvatar from './AgentAvatar';
import { copyToClipboard } from '../utils/clipboard';

const QUICK_TASKS = [
  {
    agentName: 'Atlas',
    title: 'Quick Health Check',
    description: 'Check all nodes are Ready, system pods running, no pending/failed pods.',
    prompt: 'Run a quick health check: verify all K3s nodes are Ready, list any pods not in Running state across all namespaces, and check for recent warning events.',
  },
  {
    agentName: 'Sentinel',
    title: 'Check Monitoring Stack',
    description: 'Verify Prometheus, Grafana, Loki, and Uptime Kuma are healthy.',
    prompt: 'Check the monitoring stack health: verify Prometheus scrape targets are up, Grafana data sources are connected, Loki is collecting logs, and Uptime Kuma monitors are green. Check all pods in the monitoring namespace.',
  },
  {
    agentName: 'Bastion',
    title: 'Storage Health Check',
    description: 'Check Longhorn volumes, replicas, and node disk space.',
    prompt: 'Run a storage health check: verify all Longhorn volumes are healthy with correct replica counts, check node disk usage across all 3 nodes, and identify any degraded or faulted volumes.',
  },
  {
    agentName: 'Bastion',
    title: 'Backup Verification',
    description: 'Verify Longhorn recurring backups and recent backup status.',
    prompt: 'Verify backup health: check Longhorn recurring backup jobs are running, list the most recent backup for each volume with timestamps, and flag any volumes without recent backups.',
  },
  {
    agentName: 'Vault',
    title: 'Audit All Secrets',
    description: 'Scan namespaces for secrets and check for exposed credentials.',
    prompt: 'Audit Kubernetes secrets across all namespaces: list all secrets by namespace, check for any secrets mounted as environment variables in plain text, verify Vaultwarden is accessible, and flag any potential credential exposure.',
  },
  {
    agentName: 'Nexus',
    title: 'Media Stack Health',
    description: 'Check Sonarr, Radarr, Prowlarr, qBittorrent status.',
    prompt: 'Check the media stack health: verify Sonarr, Radarr, Prowlarr, and qBittorrent pods are running, check their web UIs are responsive, and report any failed downloads or indexer issues.',
  },
  {
    agentName: 'Atlas',
    title: 'Full Cluster Diagnostic',
    description: 'Comprehensive check of nodes, pods, resources, storage, and network.',
    prompt: 'Run a comprehensive cluster diagnostic: node status and conditions, all pods across namespaces, CPU/memory utilization (kubectl top nodes/pods), recent events and warnings, Longhorn storage status, and network connectivity between nodes.',
  },
  {
    agentName: 'Forge',
    title: 'Deploy Application',
    description: 'Build, push, and deploy an application via deploy.sh.',
    prompt: 'Help me deploy an application. Walk me through the deploy.sh process: verify the app source is ready, check the current deployed version, then run deploy.sh with the app name and commit message. Monitor the deployment until the new pod is healthy.',
  },
];

export default function QuickTasks({ agents }) {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const getAgent = (name) => agents.find(a => a.name === name);

  const buildPrompt = (task) => {
    const agent = getAgent(task.agentName);
    if (!agent) return task.prompt;

    const lines = [
      `You are ${agent.name}, the ${agent.title}.`,
      '',
      `**Task: ${task.title}**`,
      '',
      task.prompt,
    ];

    const sources = agent.knowledge_sources || [];
    if (sources.length > 0) {
      lines.push('');
      lines.push('**Relevant knowledge sources:**');
      sources.forEach(s => {
        if (s.path) lines.push(`- ${s.label}: \`${s.path}\``);
        else if (s.url) lines.push(`- ${s.label}: ${s.url}`);
      });
    }

    return lines.join('\n');
  };

  const copyTask = (task, idx) => {
    copyToClipboard(buildPrompt(task));
    setCopiedIdx(idx);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedIdx(null), 2000);
  };

  if (!agents.length) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} className="text-violet-400" />
        <h2 className="font-semibold text-lg text-zinc-200">Quick Tasks</h2>
        <div className="flex-1 h-px bg-zinc-800 ml-2" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_TASKS.map((task, i) => {
          const agent = getAgent(task.agentName);
          if (!agent) return null;
          return (
            <button
              key={i}
              onClick={() => copyTask(task, i)}
              className="quick-task-card glass glass-hover rounded-xl p-4 text-left transition-all group"
              style={{ '--agent-color': agent.color }}
              aria-label={`Copy "${task.title}" task prompt`}
            >
              <div className="flex items-center gap-2 mb-2">
                <AgentAvatar iconId={agent.icon_id} color={agent.color} size={24} />
                <span className="text-xs font-medium" style={{ color: agent.color }}>
                  {agent.name}
                </span>
                <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  {copiedIdx === i
                    ? <Check size={14} className="text-green-400" />
                    : <Copy size={14} className="text-zinc-500" />
                  }
                </div>
              </div>
              <h3 className="text-sm font-medium text-zinc-200 mb-1">{task.title}</h3>
              <p className="text-xs text-zinc-500 line-clamp-2">{task.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
