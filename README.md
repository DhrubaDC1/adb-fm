# DroidBridge

**DroidBridge** is a native, fast, lightweight desktop file manager for browsing, transferring, organizing, and managing files between your computer and Android devices via the Android Debug Bridge (ADB).

Built with **Tauri 2**, **Rust**, **React 19**, **TypeScript**, and **Tailwind CSS**.

---

## Key Features

- **Dual-Pane Desktop Architecture**: Browse your local computer filesystem on the left and Android device storage on the right simultaneously.
- **Full Wireless ADB Support (Android 11+)**:
  - Built-in guided pairing dialog with IP, pairing port, and 6-digit code entry.
  - Automatic connection endpoint detection.
  - Legacy ADB-over-TCP support (switch USB device to Wi-Fi mode with one click).
- **High-Performance Transfer Subsystem**:
  - Bidirectional transfers: Local ↔ Android, Android ↔ Android, Local ↔ Local.
  - Queued transfers with configurable concurrency (1, 2, or 4 concurrent workers).
  - Live progress monitoring: real-time transfer throughput (MB/s), estimated time remaining (ETA), and per-file/overall progress.
  - Safe cancellation without leaving corrupt destinations behind.
  - Conflict resolution: Overwrite, Skip, Auto-Rename, or Ask.
- **Robust Android Filesystem Parser**:
  - Handles spaces in filenames, non-ASCII Unicode (e.g. `拍照.jpg`), emojis, and symlinks (e.g. `/sdcard` → `/storage/emulated/0`).
  - Quick-access shortcuts: Internal Storage (`/sdcard`), Downloads, DCIM (Camera), Pictures, Documents, Music, Movies, Android Media.
- **Local Filesystem Management**:
  - Standard desktop shortcuts (Home, Downloads, Documents, Pictures, Music, Desktop).
  - Search and filter files in real time.
  - List view and Grid view toggles.
  - Create folders, rename, delete with confirmation, copy, cut, paste.
  - Interactive breadcrumb navigation with editable address bar.
- **Transfer History & Diagnostics**:
  - Embedded SQLite database records all past transfers, byte sizes, durations, and statuses.
  - Diagnostics modal with live redacted logging, ADB version inspection, and one-click JSON report export.
  - One-click ADB server restart if connections stall.
- **Privacy & Security**:
  - No cloud connections, zero telemetry; completely offline.
  - Remote shell command escaping prevents command injection vulnerabilities.
  - Redaction of pairing codes in diagnostic logs.
  - Never escalates privileges automatically.

---

## Quick Start Guide

### 1. Launch DroidBridge

Run the standalone executable or AppImage:
```bash
./src-tauri/target/release/bundle/appimage/DroidBridge_0.1.0_amd64.AppImage
# or
./src-tauri/target/release/droidbridge
```

### 2. Connect via USB

1. On your phone, go to **Settings → About Phone** and tap **Build Number** 7 times to enable **Developer Options**.
2. Go to **Settings → System → Developer Options** and enable **USB Debugging**.
3. Plug your phone into your computer using a USB cable.
4. When prompted on your phone screen, check **"Always allow from this computer"** and tap **Allow**.
5. DroidBridge will detect your phone immediately in the top device selector.

### 3. Connect Wirelessly (No Cable Required)

1. Connect your phone and computer to the **same Wi-Fi network**.
2. On your phone, open **Developer Options** and enable **Wireless debugging**.
3. Tap on **"Pair device with pairing code"** to view your Wi-Fi pairing code and port.
4. In DroidBridge, click **Wireless ADB** in the top bar.
5. Enter the **IP address**, **Pairing Port**, and **6-Digit Pairing Code**, then click **Pair Device**.
6. Switch to the **Connect** tab, enter the connection port shown on your phone's main Wireless Debugging screen, and click **Connect Wirelessly**.

---

## Supported Platforms

| Platform | Support Status | Package Formats |
| :--- | :--- | :--- |
| **Linux (Arch Linux / Ubuntu / Fedora)** | **Tier 1 Native** | Native Binary, AppImage, `.deb` |
| **Windows 10 & 11** | Supported (via CI/Tauri) | `.msi`, NSIS Installer (`.exe`) |
| **macOS (Apple Silicon & Intel)** | Supported (via CI/Tauri) | `.dmg`, `.app` bundle |

---

## Development & Building

### Prerequisites

- **Node.js**: v20 or v22+
- **pnpm**: v10+
- **Rust toolchain**: 1.80+ (`rustup default stable`)
- **ADB**: Android Debug Bridge installed (`android-tools` on Arch, `adb` on Ubuntu/Debian)
- **Linux libraries**: WebKit2GTK (`webkit2gtk-4.1` or `libwebkit2gtk-4.1-dev`), `libappindicator3-dev`, `librsvg2-dev`

### Development Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Run automated test suites
pnpm test                                 # Vitest frontend tests
cargo test --manifest-path src-tauri/Cargo.toml  # Rust backend tests

# 3. Start local development mode with hot reload
pnpm tauri dev
```

### Production Build & Packaging

```bash
# Build frontend and compile optimized release binary
pnpm tauri build --no-bundle
# Output binary: src-tauri/target/release/droidbridge

# Build standalone AppImage for Linux distribution
pnpm tauri build --bundles appimage
# Output package: src-tauri/target/release/bundle/appimage/DroidBridge_0.1.0_amd64.AppImage
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Enter` | Open directory |
| `Backspace` | Navigate to parent directory |
| `F2` | Rename selected item |
| `F5` | Refresh current directory |
| `Delete` | Delete selected items (with confirmation) |
| `Ctrl + A` / `Cmd + A` | Select all items |
| `Ctrl + C` / `Cmd + C` | Copy selected items |
| `Ctrl + X` / `Cmd + X` | Cut selected items |
| `Ctrl + V` / `Cmd + V` | Paste copied/cut items |
| `Escape` | Close open dialog or context menu |

---

## Troubleshooting

### Device shows as "Unauthorized"
- Check your phone screen. An authorization prompt should appear asking to "Allow USB debugging".
- Check "Always allow from this computer" and tap **OK**.
- If no prompt appears, unplug and replug the USB cable, or click **Restart ADB Server** in DroidBridge's Diagnostics modal.

### Device shows as "No Permissions" on Linux
- Your user may not have permission to access the raw USB device node.
- Install the `android-udev` package:
  - Arch Linux: `sudo pacman -S android-udev`
  - Ubuntu/Debian: `sudo apt install android-sdk-platform-tools-common`
- Unplug and re-attach the USB cable.

### Wireless ADB fails to pair
- Ensure your computer and Android device are on the exact same Wi-Fi subnet (some guest Wi-Fi networks block device-to-device communication).
- Note that the **pairing port** (shown in the popup pairing dialog) is distinct from the **connection port** (shown on the main Wireless Debugging screen).

---

## License

MIT License. See [LICENSE](LICENSE) for details.
