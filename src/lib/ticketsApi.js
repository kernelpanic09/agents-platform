// src/lib/ticketsApi.js — global single-board ticket API helpers (no project params)
const j = (r) => r.json();

export const getBoard   = ()          => fetch('/api/tickets/board').then(j);
export const getList    = (params='') => fetch(`/api/tickets${params ? '?' + params : ''}`).then(j);
export const getGantt   = ()          => fetch('/api/tickets/gantt').then(j);
export const getTicket  = (id)        => fetch(`/api/tickets/${id}`).then(j);
export const getSummary = ()          => fetch('/api/tickets/summary').then(j);

export const createTicket = (body) =>
  fetch('/api/tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j);

export const patchTicket = (id, body) =>
  fetch(`/api/tickets/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(j);

export const commentTicket = (id, note) =>
  fetch(`/api/tickets/${id}/comment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ note }),
  }).then(j);

export const deleteTicket = (id) =>
  fetch(`/api/tickets/${id}`, { method: 'DELETE' }).then(j);

export const promoteActionItem = (slug, item_key) =>
  fetch('/api/tickets/from-action-item', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, item_key }),
  }).then(j);
