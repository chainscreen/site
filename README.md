# ChainScreen

Source for [chainscreen.io](https://chainscreen.io), a sanctions compliance research site for EU crypto firms. Published by DailyMind LTD.

The site covers MiCA, EBA restrictive-measures guidance, sanctions-screening workflows, audit evidence, and vendor selection. It publishes educational research; it is not legal advice or a hosted screening API.

## Research sections

- [Regulations](https://chainscreen.io/regulations/)
- [Operations](https://chainscreen.io/operations/)
- [Tools](https://chainscreen.io/tools/)
- [Technical](https://chainscreen.io/technical/)

## Local preview

The website uses static HTML, CSS, and JavaScript, with no build step. From the repository root:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. Cloudflare-specific redirects and headers require Cloudflare Pages to reproduce.

## Repository layout

- `index.html` — landing page.
- `regulations/`, `operations/`, `tools/`, `technical/` — research articles.
- `nav.js` — shared navigation and browser behavior.
- `_headers`, `_redirects` — Cloudflare Pages configuration.
- `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt` — discovery files.
- `workers/online-counter/` — visitor-counter Worker, deployed separately from the site.

## Contact

[info@chainscreen.io](mailto:info@chainscreen.io)
