// Kokoro SDK — iframe 内の mini-app に注入される JavaScript。
// 親ウィンドウ（Kokoro OS）と postMessage で通信し、Note/LLM/User API を露出する。

export const KOKORO_SDK_CLIENT_SCRIPT = `
(function() {
  if (window.kokoro) return;
  var _pending = new Map();
  var _timeoutMs = 120000;

  function _forwardError(kind, message, stack) {
    try {
      window.parent.postMessage({
        type: 'kokoro:runtime-error',
        kind: kind,
        message: String(message || ''),
        stack: String(stack || ''),
        at: Date.now(),
      }, '*');
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('error', function(e) {
    _forwardError('error', e.message, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    var stk = reason && reason.stack ? reason.stack : '';
    _forwardError('unhandledrejection', msg, stk);
  });

  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || msg.type !== 'kokoro:response') return;
    var resolver = _pending.get(msg.id);
    if (!resolver) return;
    _pending.delete(msg.id);
    if (msg.ok) resolver.resolve(msg.data);
    else resolver.reject(new Error(msg.error || 'Unknown error'));
  });

  function _genId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function _call(method, args) {
    var id = _genId();
    return new Promise(function(resolve, reject) {
      _pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({ type: 'kokoro:request', id: id, method: method, args: args || {} }, '*');
      setTimeout(function() {
        if (_pending.has(id)) {
          _pending.delete(id);
          reject(new Error('Request timeout: ' + method));
        }
      }, _timeoutMs);
    });
  }

  window.kokoro = {
    version: '0.1.0',
    notes: {
      list: function(args) { return _call('notes.list', args || {}); },
      get: function(id) { return _call('notes.get', { id: id }); },
      create: function(args) { return _call('notes.create', args || {}); },
      update: function(id, patch) { return _call('notes.update', { id: id, patch: patch }); },
    },
    user: {
      me: function() { return _call('user.me', {}); },
    },
    llm: {
      complete: function(args) { return _call('llm.complete', args || {}); },
    },
  };
})();
`;

export function injectSdkIntoHtml(html: string): string {
  const scriptTag = `<script>${KOKORO_SDK_CLIENT_SCRIPT}</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${scriptTag}</head>`);
  }
  if (html.match(/<body[^>]*>/)) {
    return html.replace(/<body([^>]*)>/, `<body$1>${scriptTag}`);
  }
  return scriptTag + html;
}
