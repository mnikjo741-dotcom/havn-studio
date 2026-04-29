# Havn Creative Studio

Official website for **Havn** — a creative agency based in Amsterdam specialising
in brand identity, digital design, and creative strategy.

Built as a single Vercel Edge Function for fast global delivery.

---

## Project Layout

```
.
├── api/index.js   # Edge function: website + content API
├── package.json   # Project metadata
├── vercel.json    # Routes all paths → /api/index
└── README.md
```

---

## Environment Variables

| Name                 | Example                            | Description                                    |
| -------------------- | ---------------------------------- | ---------------------------------------------- |
| `CONTENT_API_ORIGIN` | `https://api.internal.example.com` | Origin URL of the private content API backend. |
| `RELAY_TOKEN`        | `supersecrettoken`                 | (Optional) Bearer token for access control.    |

---

## Deployment

```bash
git clone <repo>
cd havn-studio
vercel --prod
```

---

## Pages

| Path        | Content                        |
| ----------- | ------------------------------ |
| `/`         | Homepage                       |
| `/about`    | About section                  |
| `/work`     | Selected work                  |
| `/services` | Services offered               |
| `/contact`  | Contact form                   |
| `/health`   | `{"ok":true}` liveness probe   |

---

## License

MIT.
