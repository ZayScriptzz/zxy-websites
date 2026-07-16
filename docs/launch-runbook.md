# /websites — Launch Runbook

The page is complete and LOCAL ONLY. This document makes launch a ~30-minute act
whenever Zay decides. Nothing here has been executed.

## 1 · Pre-flight (local, same day)
- [ ] `node tools/validate-i18n.mjs` + `python3 tools/validate-html.py` — both green
- [ ] Hard-refresh check at 1280 / 820 / 390, EN and FR (`?lang=fr`)
- [ ] Swap any remaining temp-graded media (search `websites.html` + `websites.css`
      for `temp grade`) — Zay's exports replace files under the SAME names:
      `dusk-street(.-sm).jpg · fireworks-bridge(-sm).jpg · espresso(-sm).jpg ·
      cafe-booth(-sm).jpg · skyline-downtown(-sm).jpg · aerial-reveal.mp4`
      then bump `?v=` once.

## 2 · Hosting
Options, in order of least friction:
1. **Same host as zxyframe.ca** (Framer can't host raw files → use option 2/3 under a subdomain, e.g. `sites.zxyframe.ca/websites` or path via reverse proxy).
2. **GitHub Pages** — push this repo to a private→public repo, enable Pages. Free, instant, custom domain OK.
3. **Netlify/Cloudflare Pages** — drag-the-folder deploy, free tier fine.
DNS: if a subdomain, one CNAME at the registrar. TTL 1h.

Deploy layout assumption: the page lives at `/websites/` with `assets/` beside it.
- [x] ~~FIX ON DEPLOY: favicon path~~ — fixed 2026-07-13: logo copied into `assets/logo.png`, icon href now repo-relative. Nothing to do on deploy.
- [ ] Verify `og:image` resolves: `https://<final-host>/websites/assets/skyline-downtown.jpg` (edit the meta if the path differs).

## 3 · The form (FormSubmit)
- [ ] First real submission to `formsubmit.co/zxypiczz@gmail.com` triggers an ACTIVATION email — send a test submission, click the activation link, then submit once more end-to-end.
- [ ] Confirm the `trade_detail` field arrives in the email.
- [ ] Decide: keep the FormSubmit default thank-you page or add `_next` hidden field → a `/merci` page (bilingual!).

## 4 · Smoke list (production URL)
- [ ] `?lang=fr` direct link renders French pre-paint (no flash of English)
- [ ] FR toggle persists across reload (localStorage `zxy-lang`)
- [ ] Fluid hero runs on desktop AND phones (lite tier — Equal Cut); static bloom only under reduced-motion/no-WebGL
- [ ] Confluence appears behind the form (desktop), kill-switch = `CONFLUENCE` in fluid-hero.js
- [ ] Band video: plays on scroll-in on desktop AND phones (720p rendition); poster-only under reduced-motion/data-saver/tier-down
- [ ] Form submits; SMS pill appears on phone mid-page; all anchors scroll
- [ ] Lighthouse pass: perf ≥ 90 mobile (budget: 315KB first view + fonts; video is play-gated)

## 5 · Cache strategy
Assets are immutable-by-name (`?v=N` on css/js; media swaps keep names → bump `?v=` to invalidate CSS-referenced images). Suggested headers if the host allows: `Cache-Control: public, max-age=31536000` for `assets/*`, `no-cache` for `websites.html`.

## 6 · Rollback
`git revert` the offending commit or `git checkout campaign2~N -- <file>`; every phase is one commit. The Boréal photo, band, tile, and figure are each one self-contained block (see PROVISIONAL BY DESIGN in the plan) — removable without touching structure.

## 6b · Main-site button (zxyframe.ca — Framer, Zay edits)
Once `/websites` resolves publicly, add the entry point on the Framer site:
- [ ] Nav item + a button in the hero/services area, linking to the live `/websites` URL
- [ ] Labels: EN **"WEBSITES →"** (or "GET A WEBSITE"), FR **« SITES WEB → »** — match the Framer site's existing nav style
- [ ] Open in the same tab (it's the same brand, not an external link)
- [ ] Check both language versions of the Framer site if it has them

## 7 · Day-after
- [ ] BCC yourself on form notifications for 2 weeks (FormSubmit `_cc` or inbox rule)
- [ ] Add the URL to the cold-call script + SMS pitch (Operation ZXY)
- [ ] Watch `?lang=fr` share links in the wild (og locale set to en_CA/fr_CA)
