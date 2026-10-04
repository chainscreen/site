(function() {
  const CLARITY_CONSENT_KEY = 'chainscreen_clarity_consent';
  const CLARITY_ID = 'vt0lkxwf5d';

  function loadClarity() {
    if (document.getElementById('clarity-script')) return;
    const script = document.createElement('script');
    script.id = 'clarity-script';
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
    document.head.appendChild(script);
  }

  function addClarityChoice() {
    if (localStorage.getItem(CLARITY_CONSENT_KEY) === 'accepted') {
      loadClarity();
      return;
    }
    if (localStorage.getItem(CLARITY_CONSENT_KEY)) return;
    const notice = document.createElement('aside');
    notice.setAttribute('role', 'dialog');
    notice.setAttribute('aria-label', 'Analytics preferences');
    notice.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;max-width:400px;padding:16px;background:#0c2340;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.25);font:14px/1.45 system-ui,sans-serif';
    notice.innerHTML = '<p style="margin:0 0 12px">We use Microsoft Clarity only with your consent to understand how visitors use this site. <a href="/privacy" style="color:#fff">Privacy policy</a></p><button type="button" data-clarity-choice="rejected">Reject</button> <button type="button" data-clarity-choice="accepted">Accept Clarity</button>';
    notice.querySelectorAll('[data-clarity-choice]').forEach((button) => {
      button.addEventListener('click', () => {
        const choice = button.dataset.clarityChoice;
        localStorage.setItem(CLARITY_CONSENT_KEY, choice);
        if (choice === 'accepted') loadClarity();
        notice.remove();
      });
    });
    document.body.appendChild(notice);
  }

  addClarityChoice();

  const VISITOR_COUNTER_ENDPOINT = '/api/online';
  const VISITOR_COUNTER_REFRESH_MS = 86_400_000;
  const VISITOR_COUNTER_STATE_KEY = 'chainscreenCloudflareMonthlyVisitorCounter';
  let inMemoryVisitorCounterState = null;

  if (!document.getElementById('nav-styles')) {
    const style = document.createElement('style');
    style.id = 'nav-styles';
    style.textContent = `
      .nav-toggle { display: none; background: none; border: none; cursor: pointer; padding: 8px; }
      .nav-toggle span { display: block; width: 20px; height: 2px; background: var(--text, #0f172a); margin: 4px 0; transition: 0.2s; }
      .nav-cta { color: var(--accent, #0c2340) !important; font-weight: 600 !important; }
      .nav-cta:hover { color: var(--accent-hover, #143a65) !important; }
      .visitor-counter { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-code, monospace); font-size: 11px; color: var(--text-muted, #94a3b8); white-space: nowrap; }
      .visitor-counter::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--teal, #0f766e); box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12); }
      .visitor-counter[hidden] { display: none; }
      @media (max-width: 768px) {
        .nav-toggle { display: block; }
        .nav-links { display: none; position: absolute; top: 100%; left: 0; right: 0; background: var(--bg, #fff); border-bottom: 1px solid var(--border, #e2e8f0); flex-direction: column; padding: 16px 24px; gap: 12px !important; z-index: 100; }
        .nav-open .nav-links { display: flex; }
        .header-inner { position: relative; }
      }
    `;
    document.head.appendChild(style);
  }

  const nav = `
  <div class="container header-inner">
    <a href="/" class="logo">chain<span>screen</span></a>
    <nav class="nav-links">
      <a href="/regulations/" class="nav-link">Regulations</a>
      <a href="/operations/" class="nav-link">Operations</a>
      <a href="/tools/" class="nav-link">Tools</a>
      <a href="/technical/" class="nav-link">Technical</a>
      <a href="/about" class="nav-link">About</a>
    </nav>
    <span class="visitor-counter" hidden title="Cloudflare monthly active users">
      <strong data-visitor-count>1</strong> MAU
    </span>
    <button class="nav-toggle" aria-label="Menu" onclick="this.closest('header').classList.toggle('nav-open')">
      <span></span><span></span><span></span>
    </button>
  </div>`;

  const header = document.querySelector('header');
  if (header) {
    header.innerHTML = nav;
    const path = location.pathname;
    header.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href !== '/' && path.startsWith(href)) {
        link.classList.add('active');
      }
    });
  }

  startVisitorCounter();

  function startVisitorCounter() {
    const visitorCounterElement = document.querySelector('.visitor-counter');
    const visitorCountElement = document.querySelector('[data-visitor-count]');
    if (!visitorCounterElement || !visitorCountElement) return;

    const cachedCounterState = getVisitorCounterState();
    if (
      cachedCounterState.visitorCount &&
      Date.now() - cachedCounterState.lastFetchAt < VISITOR_COUNTER_REFRESH_MS
    ) {
      visitorCountElement.textContent = String(cachedCounterState.visitorCount);
      visitorCounterElement.hidden = false;
      return;
    }

    const refreshVisitorCount = async () => {
      if (document.visibilityState === 'hidden') return;

      try {
        const counterState = getVisitorCounterState();
        const response = await fetch(VISITOR_COUNTER_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Visitor counter request failed');

        const counterData = await response.json();
        const visitorCount = Number(counterData.visitors);
        if (!Number.isFinite(visitorCount) || visitorCount < 1) {
          throw new Error('Visitor counter returned an invalid count');
        }

        saveVisitorCounterState({
          ...counterState,
          lastFetchAt: Date.now(),
          visitorCount,
        });
        visitorCountElement.textContent = String(visitorCount);
        visitorCounterElement.hidden = false;
      } catch {
        visitorCounterElement.hidden = true;
      }
    };

    refreshVisitorCount();
    window.setInterval(refreshVisitorCount, VISITOR_COUNTER_REFRESH_MS);
  }

  function getVisitorCounterState() {
    const fallbackState = {
      lastFetchAt: 0,
      visitorCount: 0,
    };

    try {
      const storedState = JSON.parse(window.localStorage.getItem(VISITOR_COUNTER_STATE_KEY) || 'null');
      if (
        storedState &&
        typeof storedState.lastFetchAt === 'number' &&
        typeof storedState.visitorCount === 'number'
      ) {
        return storedState;
      }

      saveVisitorCounterState(fallbackState);
      return fallbackState;
    } catch {
      if (!inMemoryVisitorCounterState) {
        inMemoryVisitorCounterState = fallbackState;
      }
      return inMemoryVisitorCounterState;
    }
  }

  function saveVisitorCounterState(counterState) {
    try {
      window.localStorage.setItem(VISITOR_COUNTER_STATE_KEY, JSON.stringify(counterState));
    } catch {
      inMemoryVisitorCounterState = counterState;
    }
  }

})();
