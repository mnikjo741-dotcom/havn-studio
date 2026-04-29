export const config = { runtime: "edge" };

// ---------------------------------------------------------------------------
// Bootstrap: resolve upstream origin once per isolate lifetime.
// Reading env at module scope avoids repeated lookups on hot paths.
// ---------------------------------------------------------------------------
const UPSTREAM = (process.env.CONTENT_API_ORIGIN || "").replace(/\/$/, "");

// Optional shared secret — set RELAY_TOKEN in Vercel env vars to require it.
// Leave unset to run without authentication (not recommended in production).
const ACCESS_TOKEN = process.env.RELAY_TOKEN || "";

// ---------------------------------------------------------------------------
// Headers that must not be forwarded to the upstream service.
// Includes standard hop-by-hop headers and platform-injected metadata.
// ---------------------------------------------------------------------------
const BLOCKED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

// Paths handled locally — never forwarded to the upstream service.
const LOCAL_PATHS = new Set(["/", "/about", "/work", "/services", "/contact", "/health", "/status"]);

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req) {
  const url = new URL(req.url);

  // ── Serve website pages for known local paths ─────────────────────────────
  if (req.method === "GET" && LOCAL_PATHS.has(url.pathname)) {

    // Liveness probe for uptime monitors
    if (url.pathname === "/health" || url.pathname === "/status") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // All other local paths serve the full website (SPA-style routing)
    return new Response(WEBSITE_HTML, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        // Standard security headers a real website would have
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  }

  // ── Guard: upstream origin must be configured ─────────────────────────────
  if (!UPSTREAM) {
    return new Response("Service Unavailable", { status: 503 });
  }

  // ── Optional token-based access control ───────────────────────────────────
  // Clients must pass the token as Bearer value in the Authorization header.
  if (ACCESS_TOKEN) {
    const auth = req.headers.get("authorization") || "";
    if (auth.replace("Bearer ", "").trim() !== ACCESS_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    // ── Build upstream URL ─────────────────────────────────────────────────
    // Extract path+query cheaply: skip "https://" (8 chars) then find first "/".
    const pathIndex = req.url.indexOf("/", 8);
    const upstreamUrl =
      pathIndex === -1
        ? UPSTREAM + "/"
        : UPSTREAM + req.url.slice(pathIndex);

    // ── Filter and forward request headers ────────────────────────────────
    const forwardHeaders = new Headers();
    let clientAddress = null;

    for (const [key, value] of req.headers) {
      // Drop hop-by-hop and platform-injected headers.
      if (BLOCKED_HEADERS.has(key)) continue;
      // Drop all Vercel-internal telemetry headers.
      if (key.startsWith("x-vercel-")) continue;

      // Collect real client IP; will be forwarded as x-forwarded-for.
      if (key === "x-real-ip") {
        clientAddress = value;
        continue;
      }
      if (key === "x-forwarded-for") {
        if (!clientAddress) clientAddress = value;
        continue;
      }

      forwardHeaders.set(key, value);
    }

    // Attach normalised client address so upstream can log the real IP.
    if (clientAddress) forwardHeaders.set("x-forwarded-for", clientAddress);

    // ── Proxy the request, streaming body in both directions ──────────────
    // GET and HEAD carry no body; everything else streams req.body directly.
    const method = req.method;
    const bodyPayload =
      method !== "GET" && method !== "HEAD" ? req.body : undefined;

    return await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      body: bodyPayload,
      // "half" duplex lets us write the request body while reading the
      // response body concurrently — required for streaming protocols.
      duplex: "half",
      // Preserve 3xx responses as-is; chasing redirects would break framing.
      redirect: "manual",
    });
  } catch (err) {
    // Log server-side for debugging; return a generic error to the client.
    console.error("[api] upstream error:", err?.message ?? err);
    return new Response("Bad Gateway", { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// Full website HTML — a convincing creative agency site.
// Served for all local paths to appear as a legitimate business to scanners.
// ---------------------------------------------------------------------------
const WEBSITE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Havn — Creative Agency</title>
  <meta name="description" content="Havn is a creative agency crafting brand identities, digital experiences, and visual narratives for forward-thinking companies." />
  <meta property="og:title" content="Havn — Creative Agency" />
  <meta property="og:description" content="Brand identity, digital design, and creative strategy." />
  <meta property="og:type" content="website" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Epilogue:ital,wght@0,300;0,400;1,300&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #f2efe9;
      --ink:      #111010;
      --mid:      #6b6760;
      --accent:   #c8502a;
      --light:    #e8e4dc;
      --white:    #faf8f4;
    }

    html { scroll-behavior: smooth; }

    body {
      background: var(--bg);
      color: var(--ink);
      font-family: 'Epilogue', sans-serif;
      font-weight: 300;
      line-height: 1.6;
      cursor: none;
    }

    /* ── Custom cursor ── */
    .cursor {
      position: fixed;
      width: 10px; height: 10px;
      background: var(--accent);
      border-radius: 50%;
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%,-50%);
      transition: transform 0.1s, width 0.3s, height 0.3s, background 0.3s;
    }
    .cursor-ring {
      position: fixed;
      width: 36px; height: 36px;
      border: 1px solid var(--ink);
      border-radius: 50%;
      pointer-events: none;
      z-index: 9998;
      transform: translate(-50%,-50%);
      transition: transform 0.12s ease, width 0.3s, height 0.3s, opacity 0.3s;
      opacity: 0.4;
    }
    body:hover .cursor { opacity: 1; }

    /* ── Nav ── */
    nav {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 100;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.8rem 3rem;
      mix-blend-mode: multiply;
    }
    .nav-logo {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
      color: var(--ink);
      text-decoration: none;
    }
    .nav-links {
      display: flex;
      gap: 2.5rem;
      list-style: none;
    }
    .nav-links a {
      font-family: 'Syne', sans-serif;
      font-size: 0.72rem;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--mid);
      text-decoration: none;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: var(--ink); }

    /* ── Hero ── */
    .hero {
      min-height: 100vh;
      display: grid;
      grid-template-rows: 1fr auto;
      padding: 0 3rem 3rem;
      position: relative;
      overflow: hidden;
    }

    .hero-content {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding-bottom: 4rem;
    }

    .hero-tag {
      font-family: 'Syne', sans-serif;
      font-size: 0.65rem;
      font-weight: 500;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 2rem;
      opacity: 0;
      animation: up 0.8s ease 0.2s forwards;
    }

    h1 {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: clamp(3.5rem, 9vw, 9rem);
      line-height: 0.9;
      letter-spacing: -0.03em;
      color: var(--ink);
      opacity: 0;
      animation: up 1s cubic-bezier(0.22,1,0.36,1) 0.35s forwards;
    }
    h1 .outline {
      -webkit-text-stroke: 2px var(--ink);
      color: transparent;
    }

    .hero-sub {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 4rem;
      opacity: 0;
      animation: up 0.8s ease 0.7s forwards;
    }
    .hero-desc {
      max-width: 36ch;
      font-size: 1rem;
      color: var(--mid);
      line-height: 1.7;
    }
    .hero-cta {
      display: inline-flex;
      align-items: center;
      gap: 0.8rem;
      font-family: 'Syne', sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink);
      text-decoration: none;
      border-bottom: 1px solid var(--ink);
      padding-bottom: 0.3rem;
      transition: gap 0.3s;
    }
    .hero-cta:hover { gap: 1.4rem; }
    .hero-cta::after { content: "→"; }

    /* Decorative large number */
    .hero-num {
      position: absolute;
      right: -0.05em;
      top: 50%;
      transform: translateY(-50%);
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 35vw;
      line-height: 1;
      color: var(--light);
      pointer-events: none;
      user-select: none;
      z-index: 0;
    }

    /* ── Ticker ── */
    .ticker {
      border-top: 1px solid var(--ink);
      border-bottom: 1px solid var(--ink);
      overflow: hidden;
      white-space: nowrap;
      padding: 0.9rem 0;
      background: var(--ink);
    }
    .ticker-inner {
      display: inline-flex;
      animation: ticker 18s linear infinite;
    }
    .ticker-item {
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 0.75rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--bg);
      padding: 0 3rem;
    }
    .ticker-dot {
      color: var(--accent);
      padding: 0 0.5rem;
    }

    /* ── Section shared ── */
    section { padding: 7rem 3rem; }

    .section-label {
      font-family: 'Syne', sans-serif;
      font-size: 0.62rem;
      font-weight: 500;
      letter-spacing: 0.35em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 3rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .section-label::before {
      content: '';
      display: inline-block;
      width: 2rem;
      height: 1px;
      background: var(--accent);
    }

    h2 {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: clamp(2rem, 5vw, 4rem);
      letter-spacing: -0.03em;
      line-height: 1.05;
      color: var(--ink);
    }

    /* ── About ── */
    .about {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6rem;
      align-items: center;
      background: var(--white);
    }
    .about-text p {
      margin-top: 2rem;
      font-size: 1.05rem;
      color: var(--mid);
      max-width: 42ch;
    }
    .about-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px;
    }
    .stat {
      background: var(--bg);
      padding: 2.5rem;
    }
    .stat-num {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 3rem;
      color: var(--ink);
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .stat-num span { color: var(--accent); }
    .stat-label {
      font-size: 0.78rem;
      color: var(--mid);
      margin-top: 0.5rem;
      letter-spacing: 0.05em;
    }

    /* ── Work ── */
    .work { background: var(--bg); }
    .work-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
      margin-top: 3rem;
    }
    .work-item {
      position: relative;
      overflow: hidden;
      background: var(--light);
      aspect-ratio: 4/5;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 2rem;
    }
    .work-item:first-child {
      grid-column: span 2;
      aspect-ratio: 16/9;
    }
    .work-bg {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 8rem;
      color: rgba(0,0,0,0.06);
      letter-spacing: -0.05em;
      pointer-events: none;
    }
    .work-item h3 {
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 1.1rem;
      color: var(--ink);
      position: relative;
    }
    .work-item p {
      font-size: 0.75rem;
      color: var(--mid);
      margin-top: 0.3rem;
      letter-spacing: 0.05em;
      position: relative;
    }
    .work-tag {
      display: inline-block;
      font-family: 'Syne', sans-serif;
      font-size: 0.58rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      background: var(--accent);
      color: white;
      padding: 0.25rem 0.6rem;
      margin-bottom: 1rem;
      position: relative;
    }

    /* ── Services ── */
    .services { background: var(--ink); }
    .services .section-label { color: var(--accent); }
    .services .section-label::before { background: var(--accent); }
    .services h2 { color: var(--bg); }
    .services-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      margin-top: 4rem;
      background: rgba(255,255,255,0.08);
    }
    .service {
      background: var(--ink);
      padding: 3rem 2.5rem;
      border-top: 1px solid rgba(255,255,255,0.08);
      transition: background 0.3s;
    }
    .service:hover { background: #1a1917; }
    .service-num {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 0.65rem;
      color: var(--accent);
      letter-spacing: 0.2em;
      margin-bottom: 2rem;
    }
    .service h3 {
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 1.2rem;
      color: var(--bg);
      margin-bottom: 1rem;
    }
    .service p {
      font-size: 0.85rem;
      color: rgba(242,239,233,0.45);
      line-height: 1.7;
    }

    /* ── Contact ── */
    .contact { background: var(--bg); }
    .contact-inner {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6rem;
      align-items: start;
    }
    .contact h2 { margin-bottom: 1.5rem; }
    .contact-desc {
      font-size: 1rem;
      color: var(--mid);
      max-width: 36ch;
      line-height: 1.7;
    }
    .contact-email {
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: clamp(1.2rem, 2.5vw, 2rem);
      color: var(--ink);
      text-decoration: none;
      border-bottom: 2px solid var(--accent);
      padding-bottom: 0.2rem;
      display: inline-block;
      margin-top: 2rem;
      transition: color 0.2s;
    }
    .contact-email:hover { color: var(--accent); }
    .contact-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .contact-form input,
    .contact-form textarea {
      background: var(--white);
      border: 1px solid var(--light);
      padding: 1rem 1.2rem;
      font-family: 'Epilogue', sans-serif;
      font-size: 0.85rem;
      color: var(--ink);
      outline: none;
      transition: border-color 0.2s;
      resize: none;
    }
    .contact-form input::placeholder,
    .contact-form textarea::placeholder { color: var(--mid); }
    .contact-form input:focus,
    .contact-form textarea:focus { border-color: var(--ink); }
    .contact-form textarea { min-height: 120px; }
    .btn-submit {
      background: var(--ink);
      color: var(--bg);
      border: none;
      padding: 1rem 2.5rem;
      font-family: 'Syne', sans-serif;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      cursor: none;
      align-self: flex-start;
      transition: background 0.3s;
    }
    .btn-submit:hover { background: var(--accent); }

    /* ── Footer ── */
    footer {
      background: var(--ink);
      padding: 3rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .footer-logo {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 1rem;
      color: var(--bg);
    }
    .footer-copy {
      font-size: 0.72rem;
      color: rgba(242,239,233,0.3);
      letter-spacing: 0.08em;
    }
    .footer-links {
      display: flex;
      gap: 2rem;
      list-style: none;
    }
    .footer-links a {
      font-family: 'Syne', sans-serif;
      font-size: 0.65rem;
      font-weight: 500;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(242,239,233,0.4);
      text-decoration: none;
      transition: color 0.2s;
    }
    .footer-links a:hover { color: var(--bg); }

    @keyframes up {
      from { opacity: 0; transform: translateY(30px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ticker {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }

    @media (max-width: 768px) {
      nav { padding: 1.5rem; }
      .nav-links { display: none; }
      .hero, section { padding-left: 1.5rem; padding-right: 1.5rem; }
      .about, .contact-inner { grid-template-columns: 1fr; gap: 3rem; }
      .work-grid { grid-template-columns: 1fr; }
      .work-item:first-child { grid-column: span 1; aspect-ratio: 4/3; }
      .services-grid { grid-template-columns: 1fr; }
      .hero-sub { flex-direction: column; align-items: flex-start; gap: 2rem; }
      .form-row { grid-template-columns: 1fr; }
      footer { flex-direction: column; align-items: flex-start; }
      .footer-links { display: none; }
      body { cursor: auto; }
    }
  </style>
</head>
<body>

  <div class="cursor" id="cursor"></div>
  <div class="cursor-ring" id="cursorRing"></div>

  <nav>
    <a href="/" class="nav-logo">Havn</a>
    <ul class="nav-links">
      <li><a href="#about">About</a></li>
      <li><a href="#work">Work</a></li>
      <li><a href="#services">Services</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-num">H</div>
    <div class="hero-content">
      <p class="hero-tag">Creative Agency — Est. 2019</p>
      <h1>We make<br /><span class="outline">brands</span><br />matter.</h1>
      <div class="hero-sub">
        <p class="hero-desc">
          Havn is a creative studio building brand identities,
          digital experiences, and visual systems for companies
          that want to be remembered.
        </p>
        <a href="#work" class="hero-cta">See our work</a>
      </div>
    </div>
  </section>

  <!-- Ticker -->
  <div class="ticker">
    <div class="ticker-inner">
      <span class="ticker-item">Brand Identity <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Web Design <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Visual Systems <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Motion Graphics <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Art Direction <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Strategy <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Brand Identity <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Web Design <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Visual Systems <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Motion Graphics <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Art Direction <span class="ticker-dot">✦</span></span>
      <span class="ticker-item">Strategy <span class="ticker-dot">✦</span></span>
    </div>
  </div>

  <!-- About -->
  <section class="about" id="about">
    <div class="about-text">
      <p class="section-label">About us</p>
      <h2>A small team.<br />Big ideas.</h2>
      <p>
        Founded in Amsterdam in 2019, Havn is an independent creative studio
        of designers, strategists, and storytellers. We partner with startups
        and established brands alike to craft identities that hold meaning.
      </p>
      <p style="margin-top:1rem">
        Our process is collaborative, our output is intentional, and our
        obsession is the detail that changes everything.
      </p>
    </div>
    <div class="about-stats">
      <div class="stat">
        <div class="stat-num">84<span>+</span></div>
        <div class="stat-label">Projects delivered</div>
      </div>
      <div class="stat">
        <div class="stat-num">6<span>yr</span></div>
        <div class="stat-label">In business</div>
      </div>
      <div class="stat">
        <div class="stat-num">12</div>
        <div class="stat-label">Team members</div>
      </div>
      <div class="stat">
        <div class="stat-num">3<span>×</span></div>
        <div class="stat-label">Award winner</div>
      </div>
    </div>
  </section>

  <!-- Work -->
  <section class="work" id="work">
    <p class="section-label">Selected work</p>
    <h2>What we've built.</h2>
    <div class="work-grid">
      <div class="work-item">
        <div class="work-bg">01</div>
        <span class="work-tag">Brand Identity</span>
        <h3>Solberg & Co.</h3>
        <p>Full brand refresh — identity, packaging, digital</p>
      </div>
      <div class="work-item">
        <div class="work-bg">02</div>
        <span class="work-tag">Web Design</span>
        <h3>Folia Studio</h3>
        <p>E-commerce & digital presence</p>
      </div>
      <div class="work-item">
        <div class="work-bg">03</div>
        <span class="work-tag">Art Direction</span>
        <h3>Mire Collective</h3>
        <p>Campaign direction & visual language</p>
      </div>
      <div class="work-item">
        <div class="work-bg">04</div>
        <span class="work-tag">Strategy</span>
        <h3>Tvedt Finance</h3>
        <p>Brand strategy & messaging</p>
      </div>
    </div>
  </section>

  <!-- Services -->
  <section class="services" id="services">
    <p class="section-label">What we do</p>
    <h2>Our services.</h2>
    <div class="services-grid">
      <div class="service">
        <p class="service-num">01</p>
        <h3>Brand Identity</h3>
        <p>Logo systems, colour palettes, typography, brand guidelines, and the full visual language your company needs to communicate with confidence.</p>
      </div>
      <div class="service">
        <p class="service-num">02</p>
        <h3>Digital Design</h3>
        <p>Websites, apps, and digital experiences designed from the ground up — with performance, accessibility, and aesthetics treated equally.</p>
      </div>
      <div class="service">
        <p class="service-num">03</p>
        <h3>Creative Strategy</h3>
        <p>Positioning, messaging, audience research, and competitive analysis. The thinking that makes the design work harder and last longer.</p>
      </div>
      <div class="service">
        <p class="service-num">04</p>
        <h3>Art Direction</h3>
        <p>Campaign concepts, photography direction, motion graphics, and visual storytelling across all channels and touchpoints.</p>
      </div>
      <div class="service">
        <p class="service-num">05</p>
        <h3>Print & Packaging</h3>
        <p>Editorial design, packaging systems, books, and printed collateral crafted for the physical world with the same care as the digital one.</p>
      </div>
      <div class="service">
        <p class="service-num">06</p>
        <h3>Retainer & Ongoing</h3>
        <p>Monthly creative partnership for brands that need a consistent, high-quality design team without the overhead of an in-house hire.</p>
      </div>
    </div>
  </section>

  <!-- Contact -->
  <section class="contact" id="contact">
    <div class="contact-inner">
      <div>
        <p class="section-label">Get in touch</p>
        <h2>Let's make something together.</h2>
        <p class="contact-desc">
          We're selective about the projects we take on so we can give
          each one the full attention it deserves. Tell us about yours.
        </p>
        <a href="mailto:hello@havn.studio" class="contact-email">hello@havn.studio</a>
      </div>
      <form class="contact-form" onsubmit="return false;">
        <div class="form-row">
          <input type="text" placeholder="Your name" />
          <input type="email" placeholder="Email address" />
        </div>
        <input type="text" placeholder="Company / Project" />
        <textarea placeholder="Tell us about your project…"></textarea>
        <button class="btn-submit" type="submit">Send message</button>
      </form>
    </div>
  </section>

  <footer>
    <div class="footer-logo">Havn</div>
    <ul class="footer-links">
      <li><a href="#about">About</a></li>
      <li><a href="#work">Work</a></li>
      <li><a href="#services">Services</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>
    <p class="footer-copy">© 2025 Havn Creative Studio. Amsterdam.</p>
  </footer>

  <script>
    // Custom cursor
    const cursor = document.getElementById('cursor');
    const ring = document.getElementById('cursorRing');
    let mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
    function animateCursor() {
      cursor.style.left = mx + 'px';
      cursor.style.top  = my + 'px';
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      ring.style.left = rx + 'px';
      ring.style.top  = ry + 'px';
      requestAnimationFrame(animateCursor);
    }
    animateCursor();
    document.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('mouseenter', () => {
        cursor.style.width = '18px'; cursor.style.height = '18px';
        ring.style.width = '52px'; ring.style.height = '52px';
      });
      el.addEventListener('mouseleave', () => {
        cursor.style.width = '10px'; cursor.style.height = '10px';
        ring.style.width = '36px'; ring.style.height = '36px';
      });
    });

    // Scroll-reveal
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.style.opacity = '1';
          e.target.style.transform = 'translateY(0)';
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.stat, .work-item, .service').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      obs.observe(el);
    });
  </script>
</body>
</html>`;
