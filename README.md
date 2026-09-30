# Valorant Tournament Broadcast Overlay System 🎮🏆

A broadcast-grade, real-time graphics and overlay package for Valorant tournament live streams in OBS Studio, vMix, and Streamlabs.

---

## 🚀 Quick Start

1. **Launch the Server**:
   - Double-click `start.bat` in this folder, or open a terminal and run:
     ```bash
     node server.js
     ```
2. **Open the Operator Control Panel**:
   - Navigate to: **`http://localhost:3000/admin`**
   - Keep this open on your second monitor or laptop during the broadcast.

---

## 📺 Adding Overlays to OBS Studio

In OBS Studio, add a new **Browser Source** for each view you want:

| Overlay View | OBS Browser Source URL | Recommended Resolution | Description |
| :--- | :--- | :---: | :--- |
| **Top Match Scoreboard** | `http://localhost:3000/overlays/scoreboard` | `1920 x 1080` | Centered top HUD with team tags, round scores, series pips, map name, side badges (ATK/DEF), and timeout/match point alerts. |
| **Map Veto & Picks** | `http://localhost:3000/overlays/veto` | `1920 x 1080` | Full-screen map veto board showing Pick/Ban/Decider status for the tournament pool. |
| **Caster Lower Thirds** | `http://localhost:3000/overlays/casters` | `1920 x 1080` | Transparent lower-third banner introducing commentators with social handles. |
| **Versus / Intermission** | `http://localhost:3000/overlays/versus` | `1920 x 1080` | Pre-match / countdown screen with large team cards and series standings. |

> [!TIP]
> In the OBS Browser Source properties:
> - Set **Width**: `1920`
> - Set **Height**: `1080`
> - Check **"Shutdown source when not visible"** (optional, recommended for scene transitions)
> - Check **"Refresh browser when scene becomes active"**

---

## ⌨️ Operator Keyboard Shortcuts

When the Control Panel tab is active (and no input fields are focused):

| Hotkey | Action |
| :---: | :--- |
| `1` or `NumPad 1` | **Team A +1 Round** |
| `2` or `NumPad 2` | **Team B +1 Round** |
| `S` | **Swap Sides** (swaps Attackers & Defenders + colors) |
| `T` | **Trigger Tactical Timeout** (60s countdown) |

---

## 📱 Mobile / Second Device Access (LAN)

If you have a co-caster, friend, or producer on the same Wi-Fi network who wants to control the scores from their phone or tablet:
1. Find your computer's local IP address (e.g. `192.168.1.15`).
2. Have them open `http://<your-ip>:3000/admin` on their phone or tablet browser.
3. Every button they press will update your OBS stream in real time with zero latency!
