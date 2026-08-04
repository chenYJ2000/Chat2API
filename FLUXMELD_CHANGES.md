# FluxMeld changes

This document records the initial FluxMeld identity changes on top of the
retained upstream history.

- Renamed the product, package, Electron application ID, custom URL scheme, and
  configuration export type to FluxMeld.
- Moved application-owned data to `~/.fluxmeld/` and used a distinct local
  settings key so FluxMeld does not read or overwrite predecessor data.
- Replaced user-facing branding and added a new FluxMeld visual mark.
- Removed the inherited release publishing target. A FluxMeld maintainer must
  configure a new public repository and release feed before enabling updates.
- Preserved GPL-3.0, upstream attribution, and the complete retained Git
  history. See NOTICE and FORK_CHANGES.md.
