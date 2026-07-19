import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Ban,
  Braces,
  Check,
  ChevronRight,
  CircleStop,
  Clipboard,
  Code2,
  Copy,
  ExternalLink,
  Github,
  KeyRound,
  Layers3,
  Menu,
  Play,
  RadioTower,
  RefreshCw,
  Route,
  ShieldCheck,
  TimerReset,
  Wrench,
  X,
} from 'lucide-react';
type ProviderId = 'openai' | 'anthropic' | 'gemini';
type RouteMode = 'direct' | 'app-fallback';
type LabStatus = 'idle' | 'routing' | 'fallback' | 'streaming' | 'complete' | 'aborted';

interface ProviderProfile {
  id: ProviderId;
  label: string;
  shortLabel: string;
  envPrefix: string;
  protocol: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
}

const providerProfiles: Record<ProviderId, ProviderProfile> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    shortLabel: 'OA',
    envPrefix: 'OPENAI',
    protocol: 'Chat Completions',
    response: 'One portable contract, streamed one delta at a time.',
    inputTokens: 14,
    outputTokens: 11,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    shortLabel: 'AN',
    envPrefix: 'ANTHROPIC',
    protocol: 'Messages',
    response: 'Provider-native detail stays in reach, without leaking into your app.',
    inputTokens: 16,
    outputTokens: 14,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    shortLabel: 'GM',
    envPrefix: 'GEMINI',
    protocol: 'Generate Content',
    response: 'Typed output, normalized metadata, and one clean event stream.',
    inputTokens: 13,
    outputTokens: 12,
  },
};

const statusLabels: Record<LabStatus, string> = {
  idle: 'Ready',
  routing: 'Routing',
  fallback: 'Fallback',
  streaming: 'Streaming',
  complete: 'Complete',
  aborted: 'Aborted',
};

const installCommand = 'npm install llm-conductor zod';
const providerOrder: ProviderId[] = ['openai', 'anthropic', 'gemini'];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function SectionKicker({ children }: { children: string }) {
  return (
    <p className="section-kicker">
      <span aria-hidden="true">/</span>
      {children}
    </p>
  );
}

function ProductSite() {
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [routeMode, setRouteMode] = useState<RouteMode>('direct');
  const [labStatus, setLabStatus] = useState<LabStatus>('idle');
  const [streamText, setStreamText] = useState('');
  const [events, setEvents] = useState<string[]>(['ready / local simulation']);
  const [usage, setUsage] = useState<{ input: number; output: number } | null>(null);
  const [resolvedProvider, setResolvedProvider] = useState<ProviderId | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const timers = useRef<number[]>([]);
  const copyTimer = useRef<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const activeProvider = providerProfiles[provider];
  const fallbackProviderId = providerOrder[(providerOrder.indexOf(provider) + 1) % providerOrder.length];
  const fallbackProvider = providerProfiles[fallbackProviderId];
  const displayProvider = providerProfiles[resolvedProvider ?? provider];

  const clearStreamTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  useEffect(() => () => {
    clearStreamTimers();
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const addEvent = (event: string) => {
    setEvents((current) => [...current, event]);
  };

  const finishStream = (profile: ProviderProfile) => {
    setStreamText(profile.response);
    setResolvedProvider(profile.id);
    setUsage({ input: profile.inputTokens, output: profile.outputTokens });
    setEvents((current) => [
      ...current,
      `usage / ${profile.inputTokens + profile.outputTokens} tokens`,
      'done / stop',
    ]);
    setLabStatus('complete');
  };

  const runSimulation = () => {
    clearStreamTimers();
    const primary = providerProfiles[provider];
    const target = routeMode === 'app-fallback' ? fallbackProvider : primary;
    setStreamText('');
    setUsage(null);
    setResolvedProvider(null);
    setEvents([`request / ${primary.label} / ${primary.protocol}`]);
    setLabStatus('routing');

    if (prefersReducedMotion) {
      setEvents(routeMode === 'app-fallback'
        ? [
            `request / ${primary.label} / ${primary.protocol}`,
            'RATE_LIMIT / retryable',
            `app_fallback / ${target.label}`,
            'text_delta / normalized',
          ]
        : [
            `request / ${primary.label} / ${primary.protocol}`,
            'text_delta / normalized',
          ]);
      finishStream(target);
      return;
    }

    const schedule = (callback: () => void, delay: number) => {
      timers.current.push(window.setTimeout(callback, delay));
    };
    const streamStart = routeMode === 'app-fallback' ? 760 : 260;

    if (routeMode === 'app-fallback') {
      schedule(() => {
        setLabStatus('fallback');
        addEvent('RATE_LIMIT / retryable');
      }, 260);
      schedule(() => addEvent(`app_fallback / ${target.label}`), 520);
    }

    schedule(() => {
      setLabStatus('streaming');
      addEvent('text_delta / normalized');
    }, streamStart);

    const words = target.response.split(' ');
    words.forEach((word, index) => {
      schedule(() => {
        setStreamText((current) => `${current}${current ? ' ' : ''}${word}`);
      }, streamStart + 160 + index * 78);
    });
    schedule(() => finishStream(target), streamStart + 260 + words.length * 78);
  };

  const abortSimulation = () => {
    if (labStatus !== 'routing' && labStatus !== 'fallback' && labStatus !== 'streaming') return;
    clearStreamTimers();
    setUsage(null);
    setEvents((current) => [...current, 'ABORTED / caller signal']);
    setLabStatus('aborted');
  };

  const selectProvider = (nextProvider: ProviderId) => {
    clearStreamTimers();
    setProvider(nextProvider);
    setLabStatus('idle');
    setStreamText('');
    setUsage(null);
    setResolvedProvider(null);
    setEvents(['ready / local simulation']);
  };

  const selectRouteMode = (nextMode: RouteMode) => {
    clearStreamTimers();
    setRouteMode(nextMode);
    setLabStatus('idle');
    setStreamText('');
    setUsage(null);
    setResolvedProvider(null);
    setEvents(['ready / local simulation']);
  };

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = installCommand;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2_000);
  };

  const codeSnippet = routeMode === 'direct'
    ? `const conductor = new Conductor({
  provider: '${provider}',
  apiKey: requireEnv('${activeProvider.envPrefix}_API_KEY'),
  model: requireEnv('${activeProvider.envPrefix}_MODEL'),
});

for await (const event of conductor.user(prompt).stream()) {
  if (event.type === 'text_delta') render(event.delta);
  if (event.type === 'done') inspect(event.response);
}`
    : `// App-owned policy: the SDK does not fail over automatically.
const routes = [
  { provider: '${provider}', model: requireEnv('${activeProvider.envPrefix}_MODEL') },
  { provider: '${fallbackProviderId}', model: requireEnv('${fallbackProvider.envPrefix}_MODEL') },
] as const;

for (const route of routes) {
  try {
    await streamWith(new Conductor({
      ...route,
      apiKey: keyFor(route.provider),
    }));
    break;
  } catch (error) {
    if (!isRetryable(error)) throw error;
  }
}`;

  return (
    <div className="product-site">
      <a className="skip-link" href="#main-content">Skip to content</a>

      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#top" aria-label="LLM Conductor home">
            <BrandMark />
            <span className="brand-name">LLM CONDUCTOR</span>
          </a>
          <button
            className="mobile-menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <nav
            className={`main-nav${menuOpen ? ' nav-open' : ''}`}
            id="primary-navigation"
            aria-label="Primary navigation"
          >
            <a href="#lab" onClick={() => setMenuOpen(false)}>Route lab</a>
            <a href="#parity" onClick={() => setMenuOpen(false)}>Parity</a>
            <a href="#reliability" onClick={() => setMenuOpen(false)}>Reliability</a>
            <a href="#tooling" onClick={() => setMenuOpen(false)}>Tooling</a>
          </nav>
          <a
            className="header-github"
            href="https://github.com/onuracar-dev/llm-conductor"
            target="_blank"
            rel="noreferrer"
            aria-label="Open LLM Conductor on GitHub"
          >
            <Github size={17} aria-hidden="true" />
            <span>GitHub</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="main-content">
        <section className="hero" id="top">
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-orbit hero-orbit-one" aria-hidden="true" />
          <div className="hero-orbit hero-orbit-two" aria-hidden="true" />
          <div className="content-boundary hero-layout">
            <div className="hero-copy">
              <div className="version-chip">
                <span className="live-dot" aria-hidden="true" />
                v1.1 · production-oriented core
              </div>
              <h1>Conduct every model from one clean score.</h1>
              <p className="hero-lede">
                A small TypeScript layer for prompt history, structured output, tools,
                resilient requests, and normalized streams across three provider protocols.
              </p>
              <div className="hero-actions">
                <a className="primary-button" href="#lab">
                  Open route lab
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
                <button className="install-button" type="button" onClick={copyInstall}>
                  {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                  <span>{copied ? 'Copied' : 'Copy install'}</span>
                  <code>{installCommand}</code>
                </button>
              </div>
              <ul className="hero-facts" aria-label="Package facts">
                <li><Check size={14} aria-hidden="true" /> One runtime dependency</li>
                <li><Check size={14} aria-hidden="true" /> ESM + CommonJS</li>
                <li><Check size={14} aria-hidden="true" /> No live API calls in tests</li>
              </ul>
            </div>

            <div className="hero-router" role="img" aria-label="One Conductor request routed explicitly to OpenAI, Anthropic, or Gemini">
              <div className="router-topline">
                <span>explicit route / normalized return</span>
                <Activity size={16} aria-hidden="true" />
              </div>
              <div className="router-stage">
                <div className="input-node">
                  <span className="node-label">MESSAGE[]</span>
                  <strong>Build once</strong>
                  <small>system → user → run</small>
                </div>
                <div className="route-line route-line-in"><span /></div>
                <div className="conductor-node">
                  <BrandMark />
                  <strong>Conductor</strong>
                  <small>typed contract</small>
                </div>
                <div className="provider-rail">
                  {(Object.values(providerProfiles)).map((profile, index) => (
                    <div className="provider-route" key={profile.id}>
                      <span className={`route-wire wire-${index + 1}`}><i /></span>
                      <span className="provider-node" data-provider={profile.id}>
                        <b>{profile.shortLabel}</b>
                        {profile.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="router-footer">
                <span><i className="legend-text" /> text_delta</span>
                <span><i className="legend-tool" /> tool_call</span>
                <span><i className="legend-meta" /> usage + raw</span>
              </div>
            </div>
          </div>
        </section>

        <div className="manifest-strip" aria-label="Project principles">
          <div className="content-boundary manifest-track">
            <span>Explicit model</span><i aria-hidden="true" />
            <span>Portable core</span><i aria-hidden="true" />
            <span>Native detail retained</span><i aria-hidden="true" />
            <span>No hidden execution</span>
          </div>
        </div>

        <section className="section lab-section" id="lab">
          <div className="content-boundary">
            <div className="section-heading lab-heading">
              <div>
                <SectionKicker>interactive contract</SectionKicker>
                <h2>Route lab</h2>
              </div>
              <p>
                Switch the adapter and routing policy, then watch the same event contract resolve locally.
                The fallback path is application logic; this simulation makes zero network requests.
              </p>
            </div>

            <div className="lab-frame">
              <div className="lab-sidebar">
                <div className="lab-sidebar-heading">
                  <Route size={18} aria-hidden="true" />
                  <span>Select an explicit route</span>
                </div>
                <div className="provider-selector" role="group" aria-label="Provider route">
                  {Object.values(providerProfiles).map((profile) => (
                    <button
                      type="button"
                      className="provider-button"
                      data-provider={profile.id}
                      aria-pressed={provider === profile.id}
                      onClick={() => selectProvider(profile.id)}
                      key={profile.id}
                    >
                      <span className="provider-monogram">{profile.shortLabel}</span>
                      <span>
                        <strong>{profile.label}</strong>
                        <small>{profile.protocol}</small>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <div className="strategy-selector" role="group" aria-label="Routing policy">
                  <span>Routing policy</span>
                  <button
                    type="button"
                    aria-pressed={routeMode === 'direct'}
                    onClick={() => selectRouteMode('direct')}
                  >
                    Direct route
                  </button>
                  <button
                    type="button"
                    aria-pressed={routeMode === 'app-fallback'}
                    onClick={() => selectRouteMode('app-fallback')}
                  >
                    App-owned fallback
                  </button>
                </div>
                <div className="route-truth">
                  <Ban size={17} aria-hidden="true" />
                  <p>
                    <strong>{routeMode === 'direct' ? 'No automatic failover.' : 'Fallback stays application-owned.'}</strong>
                    {routeMode === 'direct'
                      ? ' Routing stays visible and under your control.'
                      : ` This demo catches a retryable failure, then explicitly routes from ${activeProvider.label} to ${fallbackProvider.label}.`}
                  </p>
                </div>
              </div>

              <div className="lab-main">
                <div className="lab-toolbar">
                  <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
                  <span className="lab-file">stream.route.ts</span>
                  <span className="local-badge">LOCAL ONLY</span>
                </div>
                <div className="lab-panels">
                  <div className="code-pane">
                    <div className="pane-label">
                      <Code2 size={15} aria-hidden="true" /> SDK input
                    </div>
                    <pre><code>{codeSnippet}</code></pre>
                  </div>
                  <div className="stream-pane">
                    <div className="stream-head">
                      <div className="pane-label">
                        <RadioTower size={15} aria-hidden="true" /> normalized stream
                      </div>
                      <span className={`lab-status status-${labStatus}`} aria-live="polite">
                        <i aria-hidden="true" />
                        {statusLabels[labStatus]}
                      </span>
                    </div>
                    <div className="prompt-row">
                      <span aria-hidden="true">›</span>
                      Explain the portability boundary in one sentence.
                    </div>
                    <div className="stream-output" aria-label="Simulated streamed response">
                      {streamText || <span className="stream-placeholder">Response deltas will resolve here.</span>}
                      {(labStatus === 'routing' || labStatus === 'fallback' || labStatus === 'streaming') && <i className="stream-caret" aria-hidden="true" />}
                    </div>
                    <div className="event-log" aria-label="Stream event log">
                      {events.map((event, index) => (
                        <span
                          key={`${event}-${index}`}
                          className={event.startsWith('ABORTED')
                            ? 'event-aborted'
                            : event.startsWith('RATE_LIMIT') ? 'event-warning' : ''}
                        >
                          <b>{String(index + 1).padStart(2, '0')}</b>
                          {event}
                        </span>
                      ))}
                    </div>
                    <div className="stream-meta">
                      <span>provider <b>{resolvedProvider ? displayProvider.label : `${activeProvider.label} selected`}</b></span>
                      <span>model <b>${displayProvider.envPrefix}_MODEL</b></span>
                      <span>usage <b>{usage ? `${usage.input} in / ${usage.output} out` : '—'}</b></span>
                    </div>
                  </div>
                </div>
                <div className="lab-actions">
                  <button className="run-button" type="button" onClick={runSimulation}>
                    <Play size={16} fill="currentColor" aria-hidden="true" />
                    {routeMode === 'direct' ? 'Run local stream' : 'Run fallback demo'}
                  </button>
                  <button
                    className="abort-button"
                    type="button"
                    onClick={abortSimulation}
                    disabled={labStatus !== 'routing' && labStatus !== 'fallback' && labStatus !== 'streaming'}
                  >
                    <CircleStop size={16} aria-hidden="true" />
                    Abort stream
                  </button>
                  <span className="lab-safety">
                    <ShieldCheck size={15} aria-hidden="true" /> no fetch · no key input
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section parity-section" id="parity">
          <div className="content-boundary">
            <div className="section-heading">
              <div>
                <SectionKicker>same surface, honest edges</SectionKicker>
                <h2>Parity without pretending providers are identical.</h2>
              </div>
              <p>
                Portable primitives are normalized. Everything provider-specific is still
                available through <code>raw</code> and opaque tool metadata.
              </p>
            </div>

            <div className="parity-grid">
              <article className="feature-card feature-card-lead">
                <span className="feature-number">01</span>
                <RadioTower size={24} aria-hidden="true" />
                <h3>One stream union</h3>
                <p>Render four durable event shapes instead of three incompatible transports.</p>
                <div className="event-stack" aria-label="Normalized event types">
                  <code>text_delta</code>
                  <code>tool_call_delta</code>
                  <code>usage</code>
                  <code>done</code>
                </div>
              </article>
              <article className="feature-card">
                <span className="feature-number">02</span>
                <Braces size={24} aria-hidden="true" />
                <h3>Zod at the boundary</h3>
                <p>Request structured output, parse JSON, and fail with actionable validation issues.</p>
                <code className="inline-code">.withSchema(ReleaseNote)</code>
              </article>
              <article className="feature-card feature-card-dark">
                <span className="feature-number">03</span>
                <Wrench size={24} aria-hidden="true" />
                <h3>Tools stay yours</h3>
                <p>Declare portable schemas. Conductor returns calls; your trusted application validates and executes them.</p>
                <span className="micro-note">No hidden auto-execution</span>
              </article>
            </div>

            <div className="parity-table-wrap" tabIndex={0} aria-label="Provider capability comparison">
              <table className="parity-table">
                <caption>Built-in provider capability coverage in LLM Conductor v1.1</caption>
                <thead>
                  <tr>
                    <th scope="col">Portable capability</th>
                    <th scope="col"><span className="table-provider oa">OA</span>OpenAI</th>
                    <th scope="col"><span className="table-provider an">AN</span>Anthropic</th>
                    <th scope="col"><span className="table-provider gm">GM</span>Gemini</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Text + history', 'Chat Completions', 'Messages', 'Generate Content'],
                    ['Structured output', 'JSON Schema', 'Formatter tool', 'Response schema'],
                    ['Client tools', 'Function calls', 'Tool use', 'Function calls'],
                    ['Streaming', 'SSE', 'Named SSE', 'SSE chunks'],
                    ['Usage + raw', 'Normalized', 'Normalized', 'Normalized'],
                  ].map((row) => (
                    <tr key={row[0]}>
                      <th scope="row">{row[0]}</th>
                      {row.slice(1).map((cell) => <td key={cell}><Check size={14} aria-hidden="true" />{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="section reliability-section" id="reliability">
          <div className="content-boundary reliability-layout">
            <div className="reliability-copy">
              <SectionKicker>failure is part of the score</SectionKicker>
              <h2>Resilience you can inspect.</h2>
              <p>
                Failures become a stable <code>ConductorError</code>, with provider,
                status, request ID, retryability, and safe-to-inspect details.
              </p>
              <div className="reliability-list">
                <div>
                  <TimerReset size={20} aria-hidden="true" />
                  <span><strong>30s</strong> default timeout, per attempt</span>
                </div>
                <div>
                  <RefreshCw size={20} aria-hidden="true" />
                  <span><strong>2</strong> retries after the first attempt</span>
                </div>
                <div>
                  <CircleStop size={20} aria-hidden="true" />
                  <span><strong>AbortSignal</strong> remains caller-controlled</span>
                </div>
              </div>
            </div>

            <div className="retry-board" aria-label="Example retry sequence: rate limited, backoff, then successful stream">
              <div className="retry-board-head">
                <span>request trace</span>
                <code>trace_7F2A</code>
              </div>
              <div className="retry-step retry-failed">
                <span className="attempt-index">01</span>
                <div><strong>429 RATE_LIMIT</strong><small>retryable · request req_A1</small></div>
                <span className="attempt-time">148ms</span>
              </div>
              <div className="backoff-line">
                <span /><b>Retry-After 0.8s</b><span />
              </div>
              <div className="retry-step retry-success">
                <span className="attempt-index">02</span>
                <div><strong>200 STREAMING</strong><small>text_delta → usage → done</small></div>
                <span className="attempt-time">912ms</span>
              </div>
              <div className="retry-code">
                <pre><code>{`retry: {
  maxRetries: 2,
  initialDelayMs: 250,
  maxDelayMs: 4_000,
  jitter: true,
}`}</code></pre>
              </div>
              <p className="retry-caveat">
                A timed-out request may still have reached the provider. Retries can duplicate work or cost;
                mid-stream failures are never replayed automatically.
              </p>
            </div>
          </div>
        </section>

        <section className="section tooling-section" id="tooling">
          <div className="content-boundary">
            <div className="section-heading tooling-heading">
              <div>
                <SectionKicker>application-owned execution</SectionKicker>
                <h2>A clean tool-call handoff.</h2>
              </div>
              <p>
                The model proposes. Your code validates, authorizes, executes, and returns the result.
              </p>
            </div>

            <div className="tool-flow">
              <article>
                <span>1</span>
                <Braces size={21} aria-hidden="true" />
                <h3>Declare</h3>
                <p>Use a Zod schema or plain JSON Schema.</p>
              </article>
              <i className="flow-arrow" aria-hidden="true"><ArrowRight /></i>
              <article>
                <span>2</span>
                <ShieldCheck size={21} aria-hidden="true" />
                <h3>Inspect</h3>
                <p>Validate arguments and authorize the action.</p>
              </article>
              <i className="flow-arrow" aria-hidden="true"><ArrowRight /></i>
              <article>
                <span>3</span>
                <RefreshCw size={21} aria-hidden="true" />
                <h3>Continue</h3>
                <p>Return the result with <code>toolResult()</code>.</p>
              </article>
            </div>

            <div className="tool-code-grid">
              <div className="code-card">
                <div className="code-card-head">
                  <span>tools.ts</span>
                  <span className="code-language">TypeScript</span>
                </div>
                <pre><code>{`const first = await conductor
  .user('Weather in Istanbul?')
  .withTools([{
    name: 'get_weather',
    parameters: z.object({ city: z.string() }),
  }])
  .runWithMetadata();

for (const call of first.toolCalls ?? []) {
  const result = await authorizeThenRun(call);
  conductor.toolResult(call, result);
}`}</code></pre>
              </div>

              <div className="metadata-card">
                <div className="metadata-head">
                  <Layers3 size={20} aria-hidden="true" />
                  <div>
                    <span>ProviderResponse</span>
                    <strong>Portable first. Native when needed.</strong>
                  </div>
                </div>
                <dl>
                  <div><dt>content</dt><dd>typed result</dd></div>
                  <div><dt>usage</dt><dd>input · output · total</dd></div>
                  <div><dt>toolCalls</dt><dd>id · name · arguments</dd></div>
                  <div><dt>finishReason</dt><dd>normalized string</dd></div>
                  <div><dt>responseId</dt><dd>provider response</dd></div>
                  <div><dt>requestId</dt><dd>HTTP trace header</dd></div>
                  <div><dt>raw</dt><dd>provider-native payload</dd></div>
                </dl>
                <p><ShieldCheck size={15} aria-hidden="true" /> Gemini thought signatures are retained as opaque tool metadata.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section adapter-section" id="adapters">
          <div className="content-boundary adapter-layout">
            <div className="adapter-copy">
              <SectionKicker>escape hatch included</SectionKicker>
              <h2>Your provider can speak the contract too.</h2>
              <p>
                Bring a gateway, local model, test double, or future provider through a tiny adapter.
                Streaming is optional; the original three-argument adapter remains compatible.
              </p>
              <ul>
                <li><Check size={15} aria-hidden="true" /> Injectable <code>fetch</code></li>
                <li><Check size={15} aria-hidden="true" /> Configurable <code>baseURL</code> and headers</li>
                <li><Check size={15} aria-hidden="true" /> Raw metadata remains yours</li>
              </ul>
            </div>
            <div className="adapter-code">
              <div className="code-card-head">
                <span>local-provider.ts</span>
                <span className="code-language">9 lines</span>
              </div>
              <pre><code>{`const local: LLMProvider = {
  name: 'internal-gateway',
  async chat(messages, options) {
    const raw = await callGateway({
      messages,
      model: options.model,
    });
    return { content: raw.answer, raw };
  },
};

new Conductor({ provider: local });`}</code></pre>
            </div>
          </div>
        </section>

        <section className="section security-section" id="security">
          <div className="content-boundary security-card">
            <div className="security-icon" aria-hidden="true"><KeyRound /></div>
            <div className="security-copy">
              <SectionKicker>trust boundary</SectionKicker>
              <h2>Keys stay server-side.</h2>
              <p>
                This website is a local-only product demo. It has no API-key field and sends no model request.
                Use LLM Conductor in a trusted server environment; never ship provider credentials in browser code.
              </p>
            </div>
            <div className="security-checks">
              <span><Check aria-hidden="true" /> Validate tool arguments</span>
              <span><Check aria-hidden="true" /> Authorize every action</span>
              <span><Check aria-hidden="true" /> Redact prompts and raw logs</span>
            </div>
          </div>
        </section>

        <section className="closing-section">
          <div className="content-boundary closing-layout">
            <div>
              <SectionKicker>keep the abstraction honest</SectionKicker>
              <h2>Small enough to inspect.<br />Useful enough to keep.</h2>
            </div>
            <div className="closing-actions">
              <button className="closing-install" type="button" onClick={copyInstall}>
                <Clipboard size={18} aria-hidden="true" />
                <span>{copied ? 'Copied to clipboard' : installCommand}</span>
              </button>
              <a
                href="https://github.com/onuracar-dev/llm-conductor"
                target="_blank"
                rel="noreferrer"
              >
                Read the source <Github size={17} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="content-boundary footer-layout">
          <div className="brand footer-brand"><BrandMark /><span>LLM CONDUCTOR</span></div>
          <p>Type-safe orchestration for provider-portable text workflows.</p>
          <div className="footer-links">
            <a href="#lab">Lab</a>
            <a href="#security">Security</a>
            <a href="https://github.com/onuracar-dev/llm-conductor/blob/main/README.md" target="_blank" rel="noreferrer">Docs</a>
          </div>
          <span className="footer-license">MIT · v1.1</span>
        </div>
      </footer>
    </div>
  );
}

export default ProductSite;
