# FPS Weapon System

**Request** — Evaluate Jeh3no "Godot Simple FPS Weapon System" as adopt/lift/reject candidate for DiceOfFate weapon layer (weapon.gd + player.gd).
**Verdict** — adopted: Jeh3no Godot Simple FPS Weapon System

**Candidates**
| Addon | Source | License | Godot | Language | Last activity | Notes |
|---|---|---|---|---|---|---|
| Godot Simple FPS Weapon System | [GitHub](https://github.com/Jeh3no/Godot-simple-FPS-weapon-system) / [Asset Library #4105](https://godotengine.org/asset-library/asset/4105) | MIT (Jeh3no 2024) | 4.4–4.6 explicit; 4.0–4.3 minor mods | 98.4% GDScript, 1.6% GDShader | ~2026-05 (active) | Resource-based; hitscan+projectile; state machine; shared ammo pools; sway/bob/tilt; decals; AnimationManager |

**Why** — MIT, Godot 4.6 confirmed, actively maintained, 98% GDScript. Covers all weapon features we currently lack (hitscan, WeaponResource schema, shared ammo pools, damage dropoff, sway/bob/tilt, decals, formal player state machine). Human accepted the integration cost: replacing `weapon.gd` and `player.gd` with the addon's WeaponManager + player_character_script.gd. Addon's scene tree requires dedicated child nodes (ShootManager/ReloadManager/AnimationManager) — existing weapon.gd and player.gd will be superseded.

**Install** — godot-dev task:

- Source: `https://github.com/Jeh3no/Godot-simple-FPS-weapon-system` — pin to latest tag or commit hash on main (~2026-05)
- Copy `addons/JehenoSimpleFPSWeaponSystem/` into `addons/JehenoSimpleFPSWeaponSystem/`
- Enable plugin in Project > Project Settings > Plugins
- Replace `entities/weapon/weapon.gd` + scene with addon's WeaponManager + WeaponSlot pattern
- Replace `entities/player/player.gd` CharacterBody3D with addon's `player_character_script.gd` (preserve our input action names: move_left/move_right/move_forward/move_back/jump)
- Wire existing signals (fired/ammo_changed/reload_started/reload_finished/kill_confirmed) to addon equivalents or re-expose via thin wrapper
- godot-verify should observe: weapon switching works, hitscan and projectile both fire, ammo HUD updates, reload animates, kill_confirmed still emits on enemy death

**Have vs. offers diff**

| Feature                                      | Our weapon.gd                       | Addon offers                             |
| -------------------------------------------- | ----------------------------------- | ---------------------------------------- |
| Projectile firing                            | Yes (Area3D bullet, spread, muzzle) | Yes                                      |
| Hitscan                                      | No                                  | Yes (ShootManager raycast)               |
| fire_rate / ammo / reload / spread / recoil  | Yes (@export vars)                  | Yes (WeaponResource fields)              |
| Muzzle flash / holster / draw tweens         | Yes (inline create_tween)           | Yes (AnimationManager + anim names)      |
| Signals: fired/ammo*changed/reload*_/swap\__ | Yes                                 | Yes                                      |
| WeaponResource typed schema                  | No                                  | Yes                                      |
| Shared ammo pools by type                    | No                                  | Yes (Light/Medium/Heavy/Shell/Explosive) |
| Damage dropoff curves + headshot multiplier  | No                                  | Yes                                      |
| Weapon sway / bob / tilt params              | No                                  | Yes                                      |
| Bullet decals                                | No                                  | Yes                                      |
| Player state machine                         | Flat bools                          | Formal (idle/walk/run/crouch/jump/inair) |
| Bundled test maps / targets / UI             | No                                  | Yes (ignore/delete)                      |

**Later**

- Bundled test content (`Maps/`, `Targets/`, demo UI) can be deleted after install — not needed in production.
- If addon's player state machine conflicts with our future `godot-first-person-controller` skill evolution, extract only WeaponManager + keep our player.gd.
