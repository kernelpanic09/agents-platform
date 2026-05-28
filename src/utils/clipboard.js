/**
 * Copy text to clipboard with fallback for non-HTTPS contexts.
 * navigator.clipboard requires a secure context (HTTPS or localhost).
 * Falls back to execCommand('copy') for plain HTTP.
 */
export function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  // Fallback: create a temporary textarea
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  return new Promise((resolve, reject) => {
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    ok ? resolve() : reject(new Error('execCommand copy failed'));
  });
}
