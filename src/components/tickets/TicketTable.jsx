import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { getList } from '../../lib/ticketsApi';
import { PRIORITY_CLS, TYPE_LABEL } from './ticketMeta';

const COLS = [
  { key: 'key',        label: 'Key',      sortable: true,  cls: 'w-24' },
  { key: 'title',      label: 'Title',    sortable: true,  cls: 'flex-1' },
  { key: 'status',     label: 'Status',   sortable: true,  cls: 'w-28' },
  { key: 'priority',   label: 'Priority', sortable: true,  cls: 'w-24' },
  { key: 'size',       label: 'Size',     sortable: false, cls: 'w-16' },
  { key: 'type',       label: 'Type',     sortable: false, cls: 'w-24' },
  { key: 'assignee',   label: 'Assignee', sortable: false, cls: 'w-28' },
  { key: 'updated_at', label: 'Updated',  sortable: true,  cls: 'w-28' },
];

function relTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TicketTable({ onOpen, reloadKey }) {
  const [tickets, setTickets] = useState([]);
  const [sortKey, setSortKey] = useState('updated_at');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    getList().then(setTickets).catch(() => setTickets([]));
  }, [reloadKey]);

  function handleSort(key) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  const sorted = [...tickets].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortAsc ? cmp : -cmp;
  });

  return (
    <div className="glass rounded-xl overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-zinc-800">
            {COLS.map(col => (
              <th
                key={col.key}
                className={`${col.cls} px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 ${
                  col.sortable ? 'cursor-pointer hover:text-zinc-300 select-none' : ''
                }`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    sortAsc
                      ? <ChevronUp size={10} className="text-accent-400" />
                      : <ChevronDown size={10} className="text-accent-400" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLS.length} className="px-3 py-8 text-center text-zinc-600">
                No tickets
              </td>
            </tr>
          )}
          {sorted.map((t, i) => (
            <tr
              key={t.id}
              onClick={() => onOpen(t.id)}
              className={`cursor-pointer transition-colors hover:bg-zinc-800/50 ${
                i !== sorted.length - 1 ? 'border-b border-zinc-800/60' : ''
              }`}
            >
              <td className="px-3 py-2.5 font-mono text-zinc-500">{t.key}</td>
              <td className="px-3 py-2.5 text-zinc-200 truncate max-w-0 w-full">{t.title}</td>
              <td className="px-3 py-2.5">
                <span className="text-zinc-400 capitalize">{t.status?.replace(/_/g, ' ')}</span>
              </td>
              <td className="px-3 py-2.5">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${PRIORITY_CLS[t.priority] || ''}`}>
                  {t.priority}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-zinc-500">{t.size || '—'}</td>
              <td className="px-3 py-2.5 text-zinc-500">{TYPE_LABEL[t.type] || t.type}</td>
              <td className="px-3 py-2.5 text-zinc-500 truncate">{t.assignee || '—'}</td>
              <td className="px-3 py-2.5 text-zinc-600">{relTime(t.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
