import { openExternalUrl, isBrowserCdpReady, syncChromeProfile, getBrowserTargets } from "./tauriFs";

export interface BrowserDomElement {
  id: number;
  tag: string;
  type?: string;
  text?: string;
  selector: string;
  isVisible: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

export interface FastBrowserSnapshot {
  url: string;
  title: string;
  timestamp: number;
  elements: BrowserDomElement[];
  latencyMs: number;
  screenshot?: string;
}

export interface CapturedApiExchange {
  requestId: string;
  url: string;
  method: string;
  status: number;
  mimeType: string;
  timestamp: number;
  data?: unknown;
}

export interface PreFlightRequest {
  requestId: string;
  url: string;
  method: string;
  postData?: string;
  headers: Record<string, string>;
  timestamp: number;
}

export interface BrowserActionResult {
  success: boolean;
  action: string;
  target?: string;
  latencyMs: number;
  durationMs: number;
  data?: unknown;
  screenshot?: string;
  networkSummary?: CapturedApiExchange[];
  preFlightRequired?: PreFlightRequest;
  error?: string;
}

export type MediaControlAction = "play" | "pause" | "mute" | "fullscreen";

interface CdpTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

/**
 * FastBrowserEngine: Sub-25ms Chrome DevTools Protocol (CDP - Port 9222) controller.
 * Revolutionary Capabilities:
 *  1. Session Hijack & Profile Tethering (Zero-Login / Zero-CAPTCHA)
 *  2. Network-First Reverse Scraping (Direct API JSON Interception from RAM)
 *  3. Dry-Run / Pre-Flight Sandbox (Mutating Request Interception - Toggleable)
 *  4. Co-Pilot Collision Avoidance (Live Human-AI Hand-Off)
 *  5. Ghost Cursor with Smooth Apple-like Visual Indicators
 *  6. Vision Snapshot (Ultra-Fast Base64 Capture)
 */
export class FastBrowserEngine {
  private activeUrl: string = "https://www.google.com";
  private cdpPort: number = 9222;
  private ws: WebSocket | null = null;
  private messageId: number = 1;
  private pendingRequests: Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  > = new Map();
  private isConnecting: boolean = false;
  private activeTargetId: string | null = null;

  // 1. Network-First Reverse Scraping Buffer (RAM API Interception)
  private capturedApiExchanges: CapturedApiExchange[] = [];
  private readonly MAX_CAPTURED_EXCHANGES = 35;

  // 2. Dry-Run / Pre-Flight Sandbox State
  private dryRunEnabled: boolean = false;
  private pendingPreFlights: Map<string, PreFlightRequest> = new Map();
  private preFlightListeners: Array<(req: PreFlightRequest) => void> = [];

  // 3. Live Browser View & Cached Visual Frame
  private lastScreenshot: string | null = null;

  constructor(initialUrl?: string, port = 9222, dryRunEnabled = false) {
    if (initialUrl) this.activeUrl = initialUrl;
    this.cdpPort = port;
    this.dryRunEnabled = dryRunEnabled;
  }

  public getUrl(): string {
    return this.activeUrl;
  }

  public getActiveTargetId(): string | null {
    return this.activeTargetId;
  }

  public isDryRunEnabled(): boolean {
    return this.dryRunEnabled;
  }

  public getLastScreenshot(): string | null {
    return this.lastScreenshot;
  }

  /**
   * Dispatches an interactive mouse click at relative coordinates (0.0 to 1.0) on the active page
   */
  public async clickAtRatio(xRatio: number, yRatio: number): Promise<void> {
    await this.ensureConnected();
    const viewport = await this.evaluate<{ w: number; h: number }>(`
      ({ w: window.innerWidth || 1280, h: window.innerHeight || 720 })
    `).catch(() => ({ w: 1280, h: 720 }));

    const x = Math.round(xRatio * viewport.w);
    const y = Math.round(yRatio * viewport.h);

    await this.sendCdpCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    }).catch(() => {});

    await this.sendCdpCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 200));
    await this.captureScreenshot(65);
  }

  public async goBack(): Promise<void> {
    await this.evaluate("window.history.back()").catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    await this.captureScreenshot(65);
  }

  public async goForward(): Promise<void> {
    await this.evaluate("window.history.forward()").catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    await this.captureScreenshot(65);
  }

  /**
   * Toggles the Dry-Run / Pre-Flight Sandbox
   */
  public async setDryRunEnabled(enabled: boolean): Promise<void> {
    this.dryRunEnabled = enabled;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (enabled) {
        await this.enableFetchInterception();
      } else {
        await this.disableFetchInterception();
      }
    }
  }

  /**
   * Registers a callback triggered whenever a mutating request is paused for pre-flight review
   */
  public onPreFlight(callback: (req: PreFlightRequest) => void): () => void {
    this.preFlightListeners.push(callback);
    return () => {
      this.preFlightListeners = this.preFlightListeners.filter((l) => l !== callback);
    };
  }

  /**
   * Returns list of currently intercepted pre-flight requests awaiting user decision
   */
  public getPendingPreFlights(): PreFlightRequest[] {
    return Array.from(this.pendingPreFlights.values());
  }

  /**
   * Approves an intercepted pre-flight request, allowing it to reach the target server
   */
  public async approvePreFlight(requestId: string): Promise<void> {
    if (this.pendingPreFlights.has(requestId)) {
      this.pendingPreFlights.delete(requestId);
      await this.sendCdpCommand("Fetch.continueRequest", { requestId }).catch(() => {});
    }
  }

  /**
   * Rejects an intercepted pre-flight request, blocking network transmission safely
   */
  public async rejectPreFlight(requestId: string, reason = "Aborted"): Promise<void> {
    if (this.pendingPreFlights.has(requestId)) {
      this.pendingPreFlights.delete(requestId);
      await this.sendCdpCommand("Fetch.failRequest", {
        requestId,
        errorReason: reason,
      }).catch(() => {});
    }
  }

  /**
   * Returns captured JSON API payloads from Network-First Reverse Scraping
   */
  public getCapturedApiExchanges(filter?: string): CapturedApiExchange[] {
    if (!filter) return [...this.capturedApiExchanges];
    const lower = filter.toLowerCase();
    return this.capturedApiExchanges.filter(
      (e) =>
        e.url.toLowerCase().includes(lower) ||
        JSON.stringify(e.data || "").toLowerCase().includes(lower)
    );
  }

  /**
   * Sends a raw CDP JSON-RPC command over WebSocket
   */
  public async sendCdpCommand<T = any>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    await this.ensureConnected();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP WebSocket is not open");
    }

    const id = this.messageId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`CDP command '${method}' timed out after 8000ms`));
        }
      }, 8000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Ensures Chrome is running, profile session is tethered, and WebSocket connection is active
   */
  public async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
      }
    }

    this.isConnecting = true;
    try {
      // Feature 1: Profile Session Tethering (Sync user cookies and session keys)
      await syncChromeProfile().catch((e) => {
        console.warn("Chrome session tethering notice:", e);
      });

      let targets = await this.fetchTargets();

      if (!targets || targets.length === 0) {
        const cdpReady = await isBrowserCdpReady().catch(() => false);
        // Only launch Chrome if CDP port 9222 is NOT already ready
        if (!cdpReady) {
          await openExternalUrl(this.activeUrl);
        }

        for (let attempt = 0; attempt < 12; attempt++) {
          await new Promise((r) => setTimeout(r, 500));
          targets = await this.fetchTargets();
          if (targets && targets.some((t) => t.type === "page" && t.webSocketDebuggerUrl)) {
            break;
          }
        }
      }

      if (!targets || targets.length === 0) {
        throw new Error(
          `Could not connect to Chrome Remote Debugging on port ${this.cdpPort}. Ensure Chrome is launched.`
        );
      }

      // Stick with the active target if still valid, to avoid erratic tab switching
      const existingActive = this.activeTargetId
        ? targets.find((t) => t.id === this.activeTargetId && t.type === "page" && t.webSocketDebuggerUrl)
        : null;

      const pageTarget =
        existingActive ||
        targets.find(
          (t) =>
            t.type === "page" &&
            t.webSocketDebuggerUrl &&
            !t.url.startsWith("chrome-extension://") &&
            !t.url.startsWith("chrome://")
        ) ||
        targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl) ||
        targets[0];

      if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
        throw new Error("No navigable page target found with WebSocket debugger URL.");
      }

      this.activeTargetId = pageTarget.id;
      if (pageTarget.url && !pageTarget.url.startsWith("chrome://")) {
        this.activeUrl = pageTarget.url;
      }

      await this.connectWebSocket(pageTarget.webSocketDebuggerUrl);

      // Initialize Core CDP Domains
      await this.sendCdpCommand("Page.enable").catch(() => {});
      await this.sendCdpCommand("Runtime.enable").catch(() => {});
      await this.sendCdpCommand("DOM.enable").catch(() => {});

      // Feature 2: Enable Network Domain for Network-First Reverse Scraping
      await this.sendCdpCommand("Network.enable", {
        maxTotalBufferSize: 10000000,
        maxResourceBufferSize: 5000000,
      }).catch(() => {});

      // Feature 3: Enable Fetch Domain for Dry-Run Pre-Flight if active
      if (this.dryRunEnabled) {
        await this.enableFetchInterception();
      }

      // Feature 4: Inject Ghost Cursor & Co-Pilot Collision Avoidance
      await this.injectGhostCursor();
    } finally {
      this.isConnecting = false;
    }
  }

  private async enableFetchInterception(): Promise<void> {
    try {
      await this.sendCdpCommand("Fetch.enable", {
        patterns: [
          { requestStage: "Request", urlPattern: "*", resourceType: "XHR" },
          { requestStage: "Request", urlPattern: "*", resourceType: "Fetch" },
          { requestStage: "Request", urlPattern: "*", resourceType: "Document" },
        ],
      });
    } catch (e) {
      console.warn("Fetch.enable error:", e);
    }
  }

  private async disableFetchInterception(): Promise<void> {
    try {
      // Continue any pending requests first
      for (const reqId of this.pendingPreFlights.keys()) {
        await this.sendCdpCommand("Fetch.continueRequest", { requestId: reqId }).catch(() => {});
      }
      this.pendingPreFlights.clear();
      await this.sendCdpCommand("Fetch.disable");
    } catch (e) {
      console.warn("Fetch.disable error:", e);
    }
  }

  private async fetchTargets(): Promise<CdpTarget[] | null> {
    try {
      // 1. Native Tauri Rust TCP inspection (Zero-CORS, direct socket on 127.0.0.1:9222)
      const nativeTargets = await getBrowserTargets();
      if (nativeTargets && Array.isArray(nativeTargets) && nativeTargets.length > 0) {
        return nativeTargets as CdpTarget[];
      }

      // 2. Direct fetch fallback for non-Tauri / Node environments
      const isReady = await isBrowserCdpReady().catch(() => false);
      if (!isReady && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        return null;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`http://127.0.0.1:${this.cdpPort}/json`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      return (await res.json()) as CdpTarget[];
    } catch {
      return null;
    }
  }

  private connectWebSocket(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws) {
          try {
            this.ws.close();
          } catch {}
          this.ws = null;
        }

        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("WebSocket connection timeout to " + wsUrl));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeout);
          this.ws = ws;
          resolve();
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle standard RPC responses
            if (typeof data.id === "number" && this.pendingRequests.has(data.id)) {
              const pending = this.pendingRequests.get(data.id)!;
              this.pendingRequests.delete(data.id);
              if (data.error) {
                pending.reject(new Error(data.error.message || JSON.stringify(data.error)));
              } else {
                pending.resolve(data.result);
              }
              return;
            }

            // Feature 2: Network-First Reverse Scraping Handler
            if (data.method === "Network.responseReceived") {
              const params = data.params || {};
              const response = params.response || {};
              const mimeType = String(response.mimeType || "");
              const url = String(response.url || "");

              const isJsonApi =
                mimeType.includes("json") ||
                url.includes("/api/") ||
                url.includes("/graphql") ||
                url.includes("/v1/") ||
                url.endsWith(".json");

              if (isJsonApi && params.requestId) {
                this.extractResponseBody(params.requestId, url, response.status, mimeType);
              }
            }

            // Feature 3: Dry-Run / Pre-Flight Request Interception Handler
            if (data.method === "Fetch.requestPaused") {
              const params = data.params || {};
              const req = params.request || {};
              const method = String(req.method || "GET").toUpperCase();
              const requestId = params.requestId;

              const isMutating = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

              if (this.dryRunEnabled && isMutating) {
                const preFlight: PreFlightRequest = {
                  requestId,
                  url: req.url,
                  method,
                  postData: req.postData,
                  headers: req.headers || {},
                  timestamp: Date.now(),
                };

                this.pendingPreFlights.set(requestId, preFlight);

                // Notify UI listeners
                for (const listener of this.preFlightListeners) {
                  try {
                    listener(preFlight);
                  } catch (err) {
                    console.warn("Pre-flight listener error:", err);
                  }
                }
              } else {
                // Non-mutating or dry-run disabled: allow immediately
                this.sendCdpCommand("Fetch.continueRequest", { requestId }).catch(() => {});
              }
            }
          } catch (e) {
            console.warn("CDP message dispatch error:", e);
          }
        };

        ws.onerror = (err) => {
          console.warn("CDP WebSocket error:", err);
        };

        ws.onclose = () => {
          this.ws = null;
          for (const pending of this.pendingRequests.values()) {
            pending.reject(new Error("CDP WebSocket connection closed"));
          }
          this.pendingRequests.clear();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Retrieves JSON response body directly from browser RAM via Network.getResponseBody
   */
  private async extractResponseBody(
    requestId: string,
    url: string,
    status: number,
    mimeType: string
  ): Promise<void> {
    try {
      const res = await this.sendCdpCommand<{ body: string; base64Encoded: boolean }>(
        "Network.getResponseBody",
        { requestId }
      );
      if (!res?.body) return;

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(res.body);
      } catch {
        parsed = res.body.slice(0, 500);
      }

      const exchange: CapturedApiExchange = {
        requestId,
        url,
        method: "GET",
        status,
        mimeType,
        timestamp: Date.now(),
        data: parsed,
      };

      this.capturedApiExchanges.push(exchange);
      if (this.capturedApiExchanges.length > this.MAX_CAPTURED_EXCHANGES) {
        this.capturedApiExchanges.shift();
      }
    } catch {
      // Ignored for streams or evicted bodies
    }
  }

  /**
   * Feature 4: Injects Ghost Cursor and Co-Pilot Collision Avoidance Runtime
   */
  private async injectGhostCursor(): Promise<void> {
    const script = `
      (function() {
        if (window.__conductorGhostCursorReady) return;
        window.__conductorGhostCursorReady = true;

        if (!document.getElementById('conductor-ghost-styles')) {
          const style = document.createElement('style');
          style.id = 'conductor-ghost-styles';
          style.textContent = \`
            #conductor-ghost-cursor {
              position: fixed;
              pointer-events: none;
              z-index: 2147483647;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: radial-gradient(circle at 35% 35%, #3b82f6, #1d4ed8);
              border: 2px solid #ffffff;
              box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 0 16px rgba(59, 130, 246, 0.65);
              transform: translate(-50%, -50%);
              transition: left 0.32s cubic-bezier(0.16, 1, 0.3, 1), top 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
              opacity: 0;
            }
            #conductor-ghost-cursor.visible {
              opacity: 1;
            }
            #conductor-ghost-cursor.human-intervening {
              opacity: 0.25 !important;
              filter: grayscale(0.8);
            }
            #conductor-ghost-cursor .cursor-badge {
              position: absolute;
              left: 28px;
              top: -2px;
              background: rgba(15, 23, 42, 0.92);
              backdrop-filter: blur(12px);
              color: #f8fafc;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              font-size: 11px;
              font-weight: 500;
              padding: 2.5px 8.5px;
              border-radius: 9999px;
              white-space: nowrap;
              border: 1px solid rgba(255, 255, 255, 0.16);
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
              pointer-events: none;
              transition: all 0.2s ease;
            }
            #conductor-ghost-cursor .cursor-badge.intervening {
              background: rgba(220, 38, 38, 0.92);
              border-color: rgba(255, 255, 255, 0.3);
            }
            @keyframes conductor-halo-expand {
              0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.95; }
              100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
            }
            .conductor-click-halo {
              position: fixed;
              pointer-events: none;
              z-index: 2147483646;
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border: 2px solid #3b82f6;
              background: rgba(59, 130, 246, 0.25);
              animation: conductor-halo-expand 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          \`;
          (document.head || document.documentElement).appendChild(style);
        }

        let cursor = document.getElementById('conductor-ghost-cursor');
        if (!cursor) {
          cursor = document.createElement('div');
          cursor.id = 'conductor-ghost-cursor';
          cursor.innerHTML = '<span class="cursor-badge">Conductor</span>';
          (document.body || document.documentElement).appendChild(cursor);
        }

        // Feature 4: Co-Pilot Collision Avoidance (Live Human-AI Hand-Off)
        window.__humanIntervening = false;
        let __humanDebounce = null;
        const onHumanInteraction = function() {
          window.__humanIntervening = true;
          if (cursor) {
            cursor.classList.add('human-intervening');
            const badge = cursor.querySelector('.cursor-badge');
            if (badge) {
              badge.textContent = 'Co-Pilot: Human Intervening...';
              badge.classList.add('intervening');
            }
          }
          clearTimeout(__humanDebounce);
          __humanDebounce = setTimeout(function() {
            window.__humanIntervening = false;
            if (cursor) {
              cursor.classList.remove('human-intervening');
              const badge = cursor.querySelector('.cursor-badge');
              if (badge) {
                badge.textContent = 'Conductor';
                badge.classList.remove('intervening');
              }
            }
          }, 1800);
        };

        window.addEventListener('mousemove', onHumanInteraction, { passive: true });
        window.addEventListener('mousedown', onHumanInteraction, { passive: true });
        window.addEventListener('keydown', onHumanInteraction, { passive: true });
        window.addEventListener('wheel', onHumanInteraction, { passive: true });

        window.__animateGhostCursor = function(x, y, label) {
          if (!cursor) cursor = document.getElementById('conductor-ghost-cursor');
          if (!cursor) return;
          cursor.style.left = x + 'px';
          cursor.style.top = y + 'px';
          cursor.classList.add('visible');
          const badge = cursor.querySelector('.cursor-badge');
          if (badge && label && !window.__humanIntervening) {
            badge.textContent = label;
          }

          clearTimeout(window.__ghostHideTimeout);
          window.__ghostHideTimeout = setTimeout(function() {
            if (cursor && !window.__humanIntervening) cursor.classList.remove('visible');
          }, 3500);
        };

        window.__pulseGhostClick = function(x, y) {
          const halo = document.createElement('div');
          halo.className = 'conductor-click-halo';
          halo.style.left = x + 'px';
          halo.style.top = y + 'px';
          (document.body || document.documentElement).appendChild(halo);
          setTimeout(function() { halo.remove(); }, 650);
        };
      })();
    `;
    await this.evaluate(script).catch(() => {});
  }

  /**
   * Feature 4: Yields execution if user is actively touching physical mouse/keyboard
   */
  private async waitForHumanYield(maxWaitMs = 5000): Promise<void> {
    const startTime = performance.now();
    while (performance.now() - startTime < maxWaitMs) {
      const isIntervening = await this.evaluate<boolean>("Boolean(window.__humanIntervening)").catch(() => false);
      if (!isIntervening) return;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  /**
   * Evaluates JavaScript in the browser context via Runtime.evaluate
   */
  public async evaluate<T = any>(expression: string): Promise<T> {
    const res = await this.sendCdpCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        "Evaluation exception";
      throw new Error(desc);
    }
    return res?.result?.value as T;
  }

  /**
   * Captures a JPEG screenshot of the current page
   */
  public async captureScreenshot(quality = 65): Promise<string> {
    try {
      const res = await this.sendCdpCommand<{ data: string }>("Page.captureScreenshot", {
        format: "jpeg",
        quality,
      });
      const dataUri = `data:image/jpeg;base64,${res.data}`;
      this.lastScreenshot = dataUri;
      return dataUri;
    } catch (e) {
      console.warn("captureScreenshot notice:", e);
      return "";
    }
  }

  /**
   * Navigates the browser to the specified URL
   */
  public async navigate(url: string): Promise<FastBrowserSnapshot> {
    const startTime = performance.now();
    this.activeUrl = url;

    try {
      await this.ensureConnected();
      await this.sendCdpCommand("Page.navigate", { url });

      await new Promise((r) => setTimeout(r, 1200));
      await this.injectGhostCursor();

      const title =
        (await this.evaluate<string>("document.title").catch(() => url)) || url;
      const screenshot = await this.captureScreenshot(65);

      const latencyMs = Math.round(performance.now() - startTime);
      return {
        url,
        title,
        timestamp: Date.now(),
        elements: [],
        latencyMs,
        screenshot,
      };
    } catch (err) {
      console.warn("CDP navigate notice, checking fallback:", err);
      // NEVER spawn a new tab if CDP is already listening on port 9222!
      const isReady = await isBrowserCdpReady().catch(() => false);
      if (!isReady) {
        await openExternalUrl(url);
      }
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        url,
        title: `Chrome: ${url}`,
        timestamp: Date.now(),
        elements: [],
        latencyMs,
      };
    }
  }

  /**
   * Macro: search_and_select with Co-Pilot yield & Network API capture
   */
  public async searchAndSelect(
    query: string,
    index?: number,
    targetUrl?: string
  ): Promise<BrowserActionResult> {
    const startTime = performance.now();
    await this.ensureConnected();

    const cleanQuery = query.replace(/^search\s+(for\s+)?/i, "").trim();
    const isYouTubeSearch =
      (targetUrl && targetUrl.includes("youtube")) ||
      cleanQuery.toLowerCase().includes("youtube") ||
      this.activeUrl.includes("youtube.com");

    const queryForSearch = isYouTubeSearch
      ? cleanQuery.replace(/(?:on\s+youtube|in\s+youtube|youtube\s*('?da|'ta)?|youtube)\s*/gi, "").trim() || cleanQuery
      : cleanQuery;

    // Direct accelerated navigation for YouTube or Google if not already on search results
    if (isYouTubeSearch && !this.activeUrl.includes("youtube.com/results")) {
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(queryForSearch)}`;
      await this.navigate(ytUrl);
      await new Promise((r) => setTimeout(r, 1200));
    } else if (
      !isYouTubeSearch &&
      (targetUrl?.includes("google") || this.activeUrl.includes("google.com")) &&
      !this.activeUrl.includes("/search")
    ) {
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(queryForSearch)}`;
      await this.navigate(googleUrl);
      await new Promise((r) => setTimeout(r, 1000));
    }

    await this.injectGhostCursor();
    await this.waitForHumanYield();

    const expr = `
      (async function() {
        const query = ${JSON.stringify(queryForSearch)};
        const targetIndex = ${typeof index === "number" ? index : "null"};

        // Result selectors prioritized by platform
        const resultSelectors = [
          'ytd-video-renderer a#video-title',
          'a#video-title',
          'ytd-rich-item-renderer a#video-title-link',
          '#search a:has(h3)',
          '.g a:has(h3)',
          '.g a',
          '#search a h3',
          'main a[href]:has(h2, h3)',
          'article a[href]',
          '.result__title a',
          'a[data-testid="result-title-a"]'
        ];

        let resultElements = [];
        for (const sel of resultSelectors) {
          const found = Array.from(document.querySelectorAll(sel)).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
          });
          if (found.length > 0) {
            resultElements = found;
            break;
          }
        }

        // If targetIndex is requested and results are already present
        if (targetIndex !== null && resultElements.length > 0) {
          const clampedIndex = Math.max(0, Math.min(targetIndex, resultElements.length - 1));
          const targetEl = resultElements[clampedIndex];
          const rect = targetEl.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;

          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Select #' + (clampedIndex + 1));
          if (window.__pulseGhostClick) window.__pulseGhostClick(x, y);

          targetEl.click();
          return {
            selected: true,
            index: clampedIndex,
            title: (targetEl.innerText || targetEl.textContent || 'Result link').trim(),
            href: targetEl.href || targetEl.closest('a')?.href || '',
            totalResults: resultElements.length
          };
        }

        // Fallback: locate search bar if not on search results page yet
        const searchSelectors = [
          'input#search',
          'input[name="search_query"]',
          'ytd-searchbox input',
          'input[name="q"]',
          'textarea[name="q"]',
          'input[type="search"]',
          'input[name="search"]',
          'input[name="query"]',
          'input[role="combobox"]',
          'input[aria-label*="search" i]',
          'input[placeholder*="search" i]',
          'input[aria-label*="ara" i]',
          'input[placeholder*="ara" i]',
          'input[type="text"]'
        ];

        let searchInput = null;
        for (const sel of searchSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            searchInput = el;
            break;
          }
        }

        if (searchInput) {
          const rect = searchInput.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;

          searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Typing: ' + query);
          if (window.__pulseGhostClick) window.__pulseGhostClick(x, y);

          searchInput.focus();
          searchInput.value = query;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));

          const ytBtn = document.getElementById('search-icon-legacy');
          const form = searchInput.closest('form');
          if (ytBtn) {
            ytBtn.click();
          } else if (form) {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
            else form.submit();
          } else {
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          }

          return {
            searched: true,
            query,
            inputFound: true,
            message: 'Query typed into search bar and submitted'
          };
        }

        return {
          searched: false,
          error: 'No suitable search bar or result links found on page'
        };
      })()
    `;

    const evalResult = await this.evaluate(expr);
    await new Promise((r) => setTimeout(r, 1200));

    // If we performed a search and an index was requested, try selecting now if not already selected
    if (evalResult?.searched && typeof index === "number" && !evalResult.selected) {
      const selectExpr = `
        (function() {
          const targetIndex = ${index};
          const resultSelectors = [
            'ytd-video-renderer a#video-title',
            'a#video-title',
            'ytd-rich-item-renderer a#video-title-link',
            '#search a:has(h3)',
            '.g a:has(h3)',
            '.g a',
            '#search a h3'
          ];
          for (const sel of resultSelectors) {
            const found = Array.from(document.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
            if (found.length > 0) {
              const clamped = Math.max(0, Math.min(targetIndex, found.length - 1));
              const el = found[clamped];
              const rect = el.getBoundingClientRect();
              const x = rect.left + rect.width / 2;
              const y = rect.top + rect.height / 2;
              if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Select #' + (clamped + 1));
              if (window.__pulseGhostClick) window.__pulseGhostClick(x, y);
              el.click();
              return {
                selected: true,
                index: clamped,
                title: (el.innerText || el.textContent || '').trim(),
                href: el.href || el.closest('a')?.href || '',
                totalResults: found.length
              };
            }
          }
          return null;
        })()
      `;
      const secondResult = await this.evaluate(selectExpr).catch(() => null);
      if (secondResult?.selected) {
        Object.assign(evalResult, secondResult);
      }
    }

    const screenshot = await this.captureScreenshot(65);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: Boolean(evalResult?.searched || evalResult?.selected),
      action: `search_and_select: "${query}"${typeof index === "number" ? ` (index: ${index})` : ""}`,
      data: evalResult,
      screenshot,
      networkSummary: this.capturedApiExchanges.slice(-3),
      latencyMs,
      durationMs: latencyMs,
    };
  }

  /**
   * Macro: control_media with Co-Pilot yield
   */
  public async controlMedia(action: MediaControlAction): Promise<BrowserActionResult> {
    const startTime = performance.now();
    await this.ensureConnected();
    await this.injectGhostCursor();
    await this.waitForHumanYield();

    const expr = `
      (function() {
        const action = ${JSON.stringify(action)};
        const ytPlayer = document.getElementById('movie_player');
        const video = document.querySelector('video') || document.querySelector('audio');

        let mediaState = { found: false };

        if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
          mediaState.found = true;
          mediaState.player = 'youtube';

          const rect = ytPlayer.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Media: ' + action);
          if (window.__pulseGhostClick) window.__pulseGhostClick(x, y);

          if (action === 'play') ytPlayer.playVideo();
          else if (action === 'pause') ytPlayer.pauseVideo();
          else if (action === 'mute') {
            if (ytPlayer.isMuted()) ytPlayer.unMute();
            else ytPlayer.mute();
          } else if (action === 'fullscreen') {
            const fsBtn = document.querySelector('.ytp-fullscreen-button');
            if (fsBtn) fsBtn.click();
          }

          mediaState.currentTime = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
          mediaState.duration = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
          mediaState.isMuted = ytPlayer.isMuted ? ytPlayer.isMuted() : false;
          mediaState.stateCode = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : 0;
          return { success: true, mediaState, action };
        }

        if (video) {
          mediaState.found = true;
          mediaState.player = 'html5';

          const rect = video.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Media: ' + action);
          if (window.__pulseGhostClick) window.__pulseGhostClick(x, y);

          if (action === 'play') video.play();
          else if (action === 'pause') video.pause();
          else if (action === 'mute') video.muted = !video.muted;
          else if (action === 'fullscreen') {
            if (video.requestFullscreen) video.requestFullscreen();
          }

          mediaState.paused = video.paused;
          mediaState.currentTime = Math.round(video.currentTime);
          mediaState.duration = Math.round(video.duration || 0);
          mediaState.muted = video.muted;
          mediaState.volume = video.volume;
          return { success: true, mediaState, action };
        }

        return { success: false, error: 'No video or audio player detected on page', action };
      })()
    `;

    const evalResult = await this.evaluate(expr);
    const screenshot = await this.captureScreenshot(60);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: evalResult?.success ?? false,
      action: `control_media (${action})`,
      data: evalResult,
      screenshot,
      latencyMs,
      durationMs: latencyMs,
    };
  }

  /**
   * Macro: extract_readable_text
   */
  public async extractReadableText(): Promise<BrowserActionResult> {
    const startTime = performance.now();
    await this.ensureConnected();

    const expr = `
      (function() {
        const title = document.title || "";
        const url = location.href;
        const clone = document.body.cloneNode(true);

        const removeSelectors = [
          'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
          'nav', 'footer', 'header', 'aside',
          '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
          '.ad', '.ads', '.advertisement', '.cookie-banner', '.popup', '#cookie-notice'
        ];
        for (const sel of removeSelectors) {
          clone.querySelectorAll(sel).forEach(el => el.remove());
        }

        const contentPieces = [];
        clone.querySelectorAll('h1, h2, h3, h4, p, li, pre, code').forEach(el => {
          const text = el.innerText ? el.innerText.trim() : '';
          if (!text || text.length < 3) return;

          const tag = el.tagName.toLowerCase();
          if (tag === 'h1') contentPieces.push('\\n# ' + text + '\\n');
          else if (tag === 'h2') contentPieces.push('\\n## ' + text + '\\n');
          else if (tag === 'h3') contentPieces.push('\\n### ' + text + '\\n');
          else if (tag === 'li') contentPieces.push('- ' + text);
          else if (tag === 'pre' || tag === 'code') contentPieces.push('\\n\`\`\`\\n' + text + '\\n\`\`\`\\n');
          else contentPieces.push(text);
        });

        let extracted = contentPieces.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
        if (extracted.length > 3800) {
          extracted = extracted.slice(0, 3800) + '\\n\\n...[Page text truncated for brevity]';
        }

        return {
          title,
          url,
          text: extracted,
          characterCount: extracted.length
        };
      })()
    `;

    const data = await this.evaluate(expr);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      action: "extract_readable_text",
      data,
      latencyMs,
      durationMs: latencyMs,
    };
  }

  /**
   * Macro: scroll with Co-Pilot yield
   */
  public async scroll(
    direction: "up" | "down" = "down",
    amount: number = 600
  ): Promise<BrowserActionResult> {
    const startTime = performance.now();
    await this.ensureConnected();
    await this.injectGhostCursor();
    await this.waitForHumanYield();

    const expr = `
      (function() {
        const delta = ${direction === "down" ? amount : -amount};
        window.scrollBy({ top: delta, behavior: 'smooth' });

        const x = window.innerWidth / 2;
        const y = window.innerHeight / 2;
        if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Scroll ' + ${JSON.stringify(direction)});

        return {
          scrollY: Math.round(window.scrollY),
          maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight)
        };
      })()
    `;

    const data = await this.evaluate(expr);
    await new Promise((r) => setTimeout(r, 350));
    const screenshot = await this.captureScreenshot(60);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      action: `scroll (${direction}, ${amount}px)`,
      data,
      screenshot,
      latencyMs,
      durationMs: latencyMs,
    };
  }

  /**
   * Clicks an element with animated Ghost Cursor, intelligent fallbacks & Co-Pilot yield
   */
  public async click(target: string): Promise<BrowserActionResult> {
    const startTime = performance.now();
    await this.ensureConnected();
    await this.injectGhostCursor();
    await this.waitForHumanYield();

    const expr = `
      (function() {
        const target = ${JSON.stringify(target)};

        function findTarget(sel) {
          // 1. Direct CSS selector
          try {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
          } catch {}

          const lower = sel.toLowerCase();

          // 2. Search submit button fallbacks (YouTube, Google, standard forms)
          if (lower.includes('submit') || lower.includes('search') || lower.includes('btn') || lower.includes('button')) {
            const searchBtnCandidates = [
              'button#search-icon-legacy',
              '#search-icon-legacy',
              'ytd-searchbox button',
              'button[type="submit"]',
              'input[type="submit"]',
              'button[aria-label*="search" i]',
              'button[aria-label*="ara" i]'
            ];
            for (const s of searchBtnCandidates) {
              const el = document.querySelector(s);
              if (el && el.offsetParent !== null) return el;
            }
          }

          // 3. Video / result link fallbacks (YouTube videos, Google search items)
          if (lower.includes('video') || lower.includes('result') || lower.includes('item') || lower.includes('title')) {
            const resultCandidates = [
              'ytd-video-renderer a#video-title',
              'a#video-title',
              'ytd-rich-item-renderer a#video-title-link',
              '#search a:has(h3)',
              '.g a:has(h3)',
              '.g a',
              '#search a h3'
            ];
            for (const s of resultCandidates) {
              const el = document.querySelector(s);
              if (el && el.offsetParent !== null) return el;
            }
          }

          // 4. Case-insensitive text match in buttons, links, inputs
          const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"]'))
            .filter(el => el.offsetParent !== null);
          const textMatch = candidates.find(c => (c.innerText || c.textContent || '').trim().toLowerCase().includes(lower));
          if (textMatch) return textMatch;

          // 5. Token match against element attributes (id, class, aria-label)
          const cleanTokens = sel.replace(/[^a-zA-Z0-9_-]/g, ' ').trim().split(/\s+/).filter(Boolean);
          for (const token of cleanTokens) {
            const attrMatch = candidates.find(c => {
              const str = (c.id + ' ' + (c.className || '') + ' ' + (c.getAttribute('aria-label') || '')).toLowerCase();
              return str.includes(token.toLowerCase());
            });
            if (attrMatch) return attrMatch;
          }

          return null;
        }

        const el = findTarget(target);
        if (!el) return { success: false, error: 'Element not found for selector or text: ' + target };

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Click');
        if (window.__pulseGhostClick) window.__pulseGhostClick(x, y);

        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.click();

        return {
          success: true,
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.textContent || '').slice(0, 40)
        };
      })()
    `;

    const data = await this.evaluate(expr);
    await new Promise((r) => setTimeout(r, 600));
    const screenshot = await this.captureScreenshot(65);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: data?.success ?? false,
      action: `click (${target})`,
      target,
      data,
      screenshot,
      latencyMs,
      durationMs: latencyMs,
    };
  }

  /**
   * Types text into an element with animated Ghost Cursor, intelligent fallbacks & Co-Pilot yield
   */
  public async type(target: string, value: string): Promise<BrowserActionResult> {
    const startTime = performance.now();
    await this.ensureConnected();
    await this.injectGhostCursor();
    await this.waitForHumanYield();

    const expr = `
      (function() {
        const target = ${JSON.stringify(target)};
        const value = ${JSON.stringify(value)};

        function findInput(sel) {
          // 1. Direct CSS selector
          try {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) return el;
          } catch {}

          const lower = sel.toLowerCase();

          // 2. Intelligent search box resolver (YouTube, Google, generic)
          const isSearch = lower.includes('search') || lower.includes('query') || lower === 'q' || lower.includes('input[name="q"]') || lower.includes('input[name=\'q\']') || lower.includes('ara');
          if (isSearch) {
            const searchCandidates = [
              'input#search',
              'input[name="search_query"]',
              'ytd-searchbox input',
              'textarea[name="q"]',
              'input[name="q"]',
              'input[type="search"]',
              'input[name="search"]',
              'input[role="combobox"]',
              'input[aria-label*="search" i]',
              'input[placeholder*="search" i]',
              'input[aria-label*="ara" i]',
              'input[placeholder*="ara" i]'
            ];
            for (const s of searchCandidates) {
              const el = document.querySelector(s);
              if (el && el.offsetParent !== null) return el;
            }
          }

          // 3. Fallback: match by attribute tokens across all inputs and textareas
          const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(i => i.offsetParent !== null);
          const cleanTokens = sel.replace(/[^a-zA-Z0-9_-]/g, ' ').trim().split(/\s+/).filter(Boolean);

          for (const token of cleanTokens) {
            const match = inputs.find(i => {
              const str = (i.id + ' ' + i.name + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '')).toLowerCase();
              return str.includes(token.toLowerCase());
            });
            if (match) return match;
          }

          return inputs.find(i => i.type === 'text' || i.type === 'search' || !i.type) || null;
        }

        const el = findInput(target);
        if (!el) return { success: false, error: 'Input element not found for selector: ' + target };

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (window.__animateGhostCursor) window.__animateGhostCursor(x, y, 'Type: ' + value);
        if (window.__pulseGhostClick) window.__pulseGhostClick(x, y);

        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        return { success: true, value, tag: el.tagName.toLowerCase() };
      })()
    `;

    const data = await this.evaluate(expr);
    const screenshot = await this.captureScreenshot(65);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: data?.success ?? false,
      action: `type "${value}" into (${target})`,
      target,
      data,
      screenshot,
      latencyMs,
      durationMs: latencyMs,
    };
  }

  /**
   * Captures simplified interactive DOM tree
   */
  public async getDom(): Promise<BrowserActionResult> {
    const startTime = performance.now();
    await this.ensureConnected();

    const expr = `
      (function() {
        const interactive = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"]'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
          })
          .slice(0, 40)
          .map((el, i) => {
            const rect = el.getBoundingClientRect();
            return {
              index: i,
              tag: el.tagName.toLowerCase(),
              type: el.type || undefined,
              text: (el.innerText || el.textContent || el.value || el.placeholder || '').trim().slice(0, 32),
              selector: el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()),
              x: Math.round(rect.left),
              y: Math.round(rect.top)
            };
          });

        return {
          title: document.title,
          url: location.href,
          elementsCount: interactive.length,
          elements: interactive
        };
      })()
    `;

    const data = await this.evaluate(expr);
    const latencyMs = Math.round(performance.now() - startTime);

    return {
      success: true,
      action: "get_dom",
      data,
      latencyMs,
      durationMs: latencyMs,
    };
  }

  /**
   * Unified Action Dispatcher supporting all macro, granular, and reverse scraping actions
   */
  public async executeAction(
    actionOrOptions:
      | string
      | { action: string; target?: string; value?: string; index?: number },
    targetSelector?: string,
    value?: string
  ): Promise<BrowserActionResult> {
    const action =
      typeof actionOrOptions === "object" ? actionOrOptions.action : actionOrOptions;
    const target =
      typeof actionOrOptions === "object" ? actionOrOptions.target : targetSelector;
    const val =
      typeof actionOrOptions === "object" ? actionOrOptions.value : value;
    const index =
      typeof actionOrOptions === "object" ? actionOrOptions.index : undefined;

    switch (action) {
      case "navigate": {
        const dest = target || val || "https://www.google.com";
        const snap = await this.navigate(dest);
        return {
          success: true,
          action: `navigate to ${dest}`,
          target: dest,
          screenshot: snap.screenshot,
          networkSummary: this.capturedApiExchanges.slice(-3),
          latencyMs: snap.latencyMs,
          durationMs: snap.latencyMs,
        };
      }

      case "search_and_select": {
        const query = val || target || "LLM Conductor";
        const targetUrl = target && target.startsWith("http") ? target : undefined;
        return await this.searchAndSelect(query, index, targetUrl);
      }

      case "control_media": {
        const mediaAction = (val || target || "play") as MediaControlAction;
        return await this.controlMedia(mediaAction);
      }

      case "extract_readable_text": {
        return await this.extractReadableText();
      }

      case "get_network_data": {
        const startTime = performance.now();
        const filter = val || target || undefined;
        const exchanges = this.getCapturedApiExchanges(filter);
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          success: true,
          action: `get_network_data${filter ? ` (filter: ${filter})` : ""}`,
          data: {
            totalExchanges: exchanges.length,
            exchanges: exchanges.slice(-10),
          },
          latencyMs,
          durationMs: latencyMs,
        };
      }

      case "scroll": {
        const dir = (target === "up" || val === "up" ? "up" : "down") as "up" | "down";
        const amt = val && !isNaN(Number(val)) ? Number(val) : 600;
        return await this.scroll(dir, amt);
      }

      case "click": {
        if (!target) throw new Error("Target selector or text required for click");
        return await this.click(target);
      }

      case "type": {
        if (!target) throw new Error("Target selector required for type");
        return await this.type(target, val || "");
      }

      case "screenshot": {
        const startTime = performance.now();
        await this.ensureConnected();
        const screenshot = await this.captureScreenshot(75);
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          success: Boolean(screenshot),
          action: "screenshot",
          screenshot,
          latencyMs,
          durationMs: latencyMs,
        };
      }

      case "get_dom": {
        return await this.getDom();
      }

      case "evaluate": {
        const startTime = performance.now();
        await this.ensureConnected();
        const evalRes = await this.evaluate(val || target || "document.title");
        const latencyMs = Math.round(performance.now() - startTime);
        return {
          success: true,
          action: "evaluate",
          data: evalRes,
          latencyMs,
          durationMs: latencyMs,
        };
      }

      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }
}

// Export singleton instance
export const fastBrowserEngine = new FastBrowserEngine();
