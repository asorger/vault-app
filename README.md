<div align="center">

# 🗄️ Vault

### Production-Grade, 100% Offline, Stateless Encrypted Desktop File Manager

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-blue?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.80+-orange?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Security: Air--Gapped](https://img.shields.io/badge/Security-100%25_Air--Gapped-red.svg)](#security--privacy-mandates)

<p align="center">
  A high-performance encrypted virtual filesystem and file manager designed with zero compromises on security, privacy, and memory hygiene.
</p>

</div>

---

## 🌟 Overview

**Vault** is a modern desktop application that allows you to store, browse, organize, preview, and stream sensitive files inside encrypted archives. Built from the ground up on **Tauri v2** with a high-performance **Rust** core and a **React 19** frontend, Vault guarantees that your data remains strictly confidential, tamper-proof, and completely isolated from the host operating system.

Unlike conventional archive utilities, Vault treats encrypted containers as live, interactive virtual filesystems: files can be previewed, audio/video streamed with random-access range seeking, reorganized, and searched without ever decrypting full files to temporary disk storage or flooding system RAM.

---

## 🔒 Key Architectural Mandates

### 1. Zero Whole-File RAM Buffering
- **Chunked Streaming I/O:** Every file is processed in sequential **4 MiB chunks** using `ChaCha20-Poly1305` AEAD (`aead::stream::EncryptorBE32` / `DecryptorBE32`).
- **Minimal Memory Footprint:** Encrypting, decrypting, or exporting a 50 GB file utilizes **less than 15 MB of RAM** at peak throughput.
- **No Temporary Plaintext Files:** Plaintext bytes never touch the physical disk during viewing, streaming, or extraction.

### 2. Transparent Zstandard (`zstd`) Compression
- **Chunk-Level Framing:** Optional toggleable compression with Zstandard (level 3) before encryption.
- **Adaptive Incompressible Fallback:** Chunks prepended with a 1-byte header (`0x01` compressed, `0x00` raw) avoid size inflation on pre-compressed data (e.g., JPEG, MP4, ZIP).
- **On-the-Fly RAM Decompression:** Decompression occurs in RAM per chunk during streaming or export, maintaining instantaneous random-access seek capabilities.

### 3. Single-File `.vault` Containers
- **Fully Self-Contained:** Stored as an autonomous single-file `<VaultName>.vault` container with zero companion folders, lockfiles, or external catalogs.
- **Portability:** Move or share `.vault` files across devices, external drives, or secure cloud storage.
- **Stateless Architecture:** Zero tracking or registry in `AppData` or host configuration folders.

### 4. Real SQLCipher Database Engine
- **Hardware-Accelerated Encryption:** Backed by `rusqlite` with `bundled-sqlcipher-vendored-openssl`.
- **Argon2id Key Derivation:** Master key derived via Argon2id with 16-byte cryptographically secure random salt embedded in the SQLCipher header.
- **Incremental Auto-Vacuum:** Utilizes `PRAGMA auto_vacuum = INCREMENTAL;` with explicit foreign-key indexes, preventing catastrophic page rewriting and ensuring sub-millisecond deletions.

### 5. In-App Media Streaming (HTTP 206 Partial Content)
- **Direct Container Playback:** Watch 4K MP4/WebM videos or listen to audio directly from inside encrypted containers.
- **Random-Access Range Seek:** Custom internal protocol decrypts only the specific 4 MiB chunk corresponding to the player's seek position without buffering the preceding contents.

### 6. Fault-Tolerant Ingestion
- **Per-File SQLite Savepoints:** Batch operations wrap each file in an isolated savepoint (`sp_ingest_file`).
- **Antivirus Resilience:** If Windows Defender or endpoint antivirus locks or quarantines a file mid-import (`os error 225` or `NotFound`), the batch continues seamlessly, rolling back only that file and reporting it in the skipped files summary.

### 7. Host File Shredding
- **Secure Deletion:** When importing with "Shred originals" enabled, original host files undergo multi-pass cryptographic zero-overwrite before removal.
- **In-Vault Instant Deletion:** Deleting items inside the vault drops records and destroys per-file encryption keys instantly, as encrypted chunks are already indistinguishable from random noise.

---

## 🛠️ Cryptographic Architecture

```
                                      Plaintext Source File
                                                │
                                       [ 4 MiB Chunk Stream ]
                                                │
                                                ▼
                                    Optional Zstd Compression
                                  (1-byte framing tag: 0x00/0x01)
                                                │
                                                ▼
                             ChaCha20-Poly1305 Stream Encryption
                               (BE32 chunk counter + 16-byte MAC)
                                                │
                                                ▼
                               SQLCipher Single-File Container
                     ┌──────────────────────────────────────────────────┐
                     │ 0..16: Argon2id Salt                             │
                     │ SQLCipher Encrypted Pages (AES-256-CBC + HMAC)   │
                     │  ├── virtual_folders                             │
                     │  ├── virtual_files (per-file random key)         │
                     │  └── blob_chunks (encrypted payload blocks)      │
                     └──────────────────────────────────────────────────┘
```

| Security Dimension | Primitives & Implementation |
|---|---|
| **Master Key Derivation** | `Argon2id` (memory: 64 MiB, iterations: 3, parallelism: 1, 16-byte random salt) |
| **Payload Encryption** | `ChaCha20-Poly1305` Authenticated Encryption with Associated Data (`StreamBE32`) |
| **Metadata Encryption** | SQLCipher `AES-256-CBC` with `HMAC-SHA512` / `HMAC-SHA1` page authentication |
| **Compression** | `zstd` (Zstandard v1.5.x, level 3) with chunk-level framing |
| **Memory Hygiene** | Sensitive keys and passwords wrapped in `zeroize::Zeroizing<T>` |
| **Network Security** | Offline Content Security Policy (`connect-src 'none'`), zero network telemetry |

---

## 🖥️ User Experience & Features

- **Frameless Native Top Bar:** Custom window header with multi-vault tab management, drag regions, and window controls.
- **WinRAR-Style Navigation:** Double-click `..` parent directory entry to traverse directories, or drop files directly onto `..` or breadcrumb pills to move items up the directory tree.
- **View Modes:** Toggle between customizable Grid View (Small, Medium, Large cards) and Table View with sortable and resizable columns.
- **Rubber-Band Marquee Selection:** Click and drag a selection rectangle across files and folders to select multiple items.
- **Universal Search:** Instant, non-flickering recursive search that scans nested subdirectories across the active vault.
- **Full Preview Suite:** Integrated viewers for images (with pan and zoom), video, audio, PDFs, text, Markdown, and code with syntax highlighting.
- **Native Context Menus:** Desktop context menus for items, empty canvas, vault tabs, and breadcrumbs, suppressing generic browser context menus.
- **System Drag & Drop:** Shift-drag host files into the vault to trigger a shred-confirmation workflow; drag items directly into Windows Explorer to export seamlessly.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd> + <kbd>A</kbd> | Select all items in current directory |
| <kbd>Delete</kbd> | Delete selected files and folders |
| <kbd>Backspace</kbd> / <kbd>Alt</kbd> + <kbd>←</kbd> | Navigate to parent directory (`..`) |
| <kbd>Alt</kbd> + <kbd>→</kbd> | Navigate forward in history |
| <kbd>Escape</kbd> | Clear selection / Close modals |
| <kbd>F5</kbd> / <kbd>Ctrl</kbd> + <kbd>R</kbd> | Refresh active directory |
| <kbd>Mouse Button 3 / 4</kbd> | Back / Forward folder navigation |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your development machine:

1. **Node.js:** v18 or higher ([nodejs.org](https://nodejs.org/))
2. **Rust:** Latest stable toolchain ([rustup.rs](https://rustup.rs/))
3. **C++ Build Tools:** Visual Studio C++ Build Tools (Windows)
4. **Perl:** Required by OpenSSL build scripts on Windows (e.g., [Strawberry Perl](https://strawberryperl.com/))

### Installation

Clone the repository and install frontend dependencies:

```bash
git clone https://github.com/idfkaxel/vault-app.git
cd vault-app
npm install
```

### Running in Development

Start the Vite dev server and launch the Tauri window:

```bash
npm run tauri dev
```

### Running Automated Tests

Run the backend integration test suite (covering single-file encryption, streaming, Zstandard round-trip, range seeking, and corrupt key rejection):

```bash
cd src-tauri
cargo test
```

### Building for Production

Compile optimized release binaries and installer packages:

```bash
npm run tauri build
```

Generated production artifacts:
- **Standalone Executable:** `src-tauri/target/release/vault-app.exe`
- **Windows NSIS Installer:** `src-tauri/target/release/bundle/nsis/Vault_0.1.0_x64-setup.exe`
- **Windows MSI Package:** `src-tauri/target/release/bundle/msi/Vault_0.1.0_x64_en-US.msi`

---

## 🛡️ Security & Privacy Mandates

- **100% Offline by Design:** Vault contains **no telemetry, no analytics, no external network calls, and no auto-update pings**.
- **Air-Gapped Operation:** The Content Security Policy enforces `connect-src 'none'`. All icons, fonts, and assets are bundled locally within the executable.
- **Clean Unmounts:** When closing a vault or terminating the application, Vault forces `PRAGMA wal_checkpoint(TRUNCATE);` and cleanly terminates SQLite handles, ensuring no orphaned WAL/SHM artifacts remain.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Developed by <b>Axel Sorger</b> • Built with precision, security, and performance.</sub>
</div>
