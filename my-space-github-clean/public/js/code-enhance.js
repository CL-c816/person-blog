(function () {
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); resolve(); }
      catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }
  function enhance() {
    if (window.hljs) {
      document.querySelectorAll('pre.code-block code').forEach(function (el) {
        window.hljs.highlightElement(el);
      });
    }
    document.querySelectorAll('pre.code-block').forEach(function (pre) {
      if (pre.querySelector('.copy-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制代码');
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        var txt = code ? code.innerText : pre.innerText;
        copyText(txt).then(function () {
          btn.textContent = '已复制';
          setTimeout(function () { btn.textContent = '复制'; }, 1600);
        }).catch(function () {
          btn.textContent = '失败';
          setTimeout(function () { btn.textContent = '复制'; }, 1600);
        });
      });
      pre.appendChild(btn);
    });
  }
  if (document.readyState !== 'loading') { enhance(); }
  else { document.addEventListener('DOMContentLoaded', enhance); }
})();
