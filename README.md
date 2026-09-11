<div align="center">

# Gooncord `v1.7`

*A high-performance, lightweight Discord client modification.*

---

[Installation](#installation) &bull; [Building](#building-from-source) &bull; [Features](#features) &bull; [License](#license)

---

</div>

## Overview

Gooncord is a performance-focused modification for the Discord desktop client. It optimizes runtime execution, reduces memory consumption, and streamlines client responsiveness.

---

## Features

- **Direct Function Closures**: Replaces ES6 Proxies across module factories to eliminate V8 JIT inline cache overhead.
- **Hardware Acceleration**: Tuned Chromium flags for zero-copy GPU video decoding and hardware rasterization.
- **Privacy & Anti-Telemetry**: Disables Sentry reporting, analytics endpoints, and tracking routines.
- **Plugin Suite**: Built-in suite of 360+ plugins including MessageLoggerEnhanced, FakeNitro, ReviewDB, ShowHiddenChannels, and SpotifyCrack.

---

## Installation

```bash
# Build client bundle
pnpm build

# Inject into Discord
node scripts/runInstaller.mjs -- --install
```

---

## Building from Source

### Prerequisites

- Node.js 18 or higher
- pnpm 9 or higher

### Setup

```bash
git clone https://github.com/truevibecode/gooncord.git
cd gooncord
pnpm install
pnpm build
```

---

## License

Distributed under the GNU General Public License v3.0. See `LICENSE` for details.
