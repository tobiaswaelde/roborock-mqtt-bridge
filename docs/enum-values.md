# Enum values

This page documents the stable numeric values published below `<topic>/devices/<device-id>/state/...`. The bridge keeps each numeric value and publishes a readable companion topic for documented values: for example, `state` is `2` and `state_human` is `Sleeping`. Availability is model- and firmware-dependent: a robot may omit a field or report a value added by newer firmware. Treat an unknown value as an unknown state rather than an error in the bridge.

## Activity state

`state` describes the robot's current activity.

| Code | Meaning |
| ---: | --- |
| 0 | Unknown |
| 1 | Initiating |
| 2 | Sleeping |
| 3 | Idle |
| 4 | Remote control |
| 5 | Cleaning |
| 6 | Returning to dock |
| 7 | Manual mode |
| 8 | Charging |
| 9 | Charging error |
| 10 | Paused |
| 11 | Spot cleaning |
| 12 | Error |
| 13 | Shutting down |
| 14 | Updating |
| 15 | Docking |
| 16 | Going to target |
| 17 | Zone cleaning |
| 18 | Room cleaning |
| 22 | Emptying dust container |
| 23 | Washing mop |
| 26 | Going to wash mop |
| 28 | In call |
| 29 | Mapping |
| 100 | Fully charged |

## Error code

`error_code` is `0` when no fault is reported.

| Code | Meaning |
| ---: | --- |
| -1, 20 | Unknown error |
| 0 | No error |
| 1 | Laser sensor fault |
| 2 | Collision sensor fault |
| 3 | Wheel floating |
| 4 | Cliff sensor fault |
| 5 | Main brush blocked |
| 6 | Side brush blocked |
| 7 | Wheel blocked |
| 8 | Robot stuck |
| 9 | Dust bin missing |
| 10 | Filter blocked |
| 11 | Magnetic field detected |
| 12 | Low battery |
| 13 | Charging problem |
| 14 | Battery failure |
| 15 | Wall sensor fault |
| 16 | Uneven surface |
| 17 | Side-brush failure |
| 18 | Suction-fan failure |
| 19 | Charging station has no power |
| 21 | Laser pressure sensor problem |
| 22 | Charge sensor problem |
| 23 | Dock problem |
| 24 | No-go zone or invisible wall detected |
| 254 | Dust bin full |
| 255 | Internal error |

## Suction power

`fan_power` is the raw Roborock setting and gets `fan_power_human`. The bridge also publishes the same number as `suction_power_code`, its label as `suction_power_code_human`, and its machine-readable equivalent as `suction_power`.

| Code | `suction_power` | Meaning |
| ---: | --- | --- |
| 101 | `silent` | Silent / quiet |
| 102 | `balanced` | Balanced |
| 103 | `turbo` | Turbo |
| 104 | `max` | Max |
| 105 | `off` | Off |
| 106 | `custom` | Custom mode |
| 108 | `max_plus` | Max+ |

These names are also the valid payloads for `command/suction_power`. A model only accepts the levels it supports.

## Mop and water level

The standard raw field is `mop_mode`; it describes the cleaning route. The bridge does not create a separate `mop_code` topic. If a model reports a raw `mop_code`, it is passed through unchanged and has no bridge-wide mapping yet.

| `mop_mode` | Meaning |
| ---: | --- |
| 300 | Standard |
| 301 | Deep |
| 303 | Deep+ |
| 304 | Fast |

`water_box_mode` and `water_box_custom_mode` describe the water or scrub intensity on models that expose them.

| Code | Meaning |
| ---: | --- |
| 200 | Off |
| 201 | Mild |
| 202 | Moderate |
| 203 | Intense |

## Dock type

`dock_type` identifies the dock reported by the robot.

| Code | Meaning |
| ---: | --- |
| 0 | Charging dock |
| 1 | Auto-empty dock |
| 2 | Empty, wash and fill dock |
| 3 | Empty, wash, fill and dry dock |
| 5 | Auto-empty dock (Q8 Max+) |
| 7 | Empty, wash, fill and dry dock (S8 Pro Ultra) |
| 8 | Empty, wash, fill and dry dock (Q Revo) |
| 9 | Empty, wash, fill and dry dock (Q Revo Pro) |
| 20 | Auto-empty dock (K1S / Qrevo CurvX) |

## Model-specific fields

Some fields, such as `charge_status`, `dry_status`, `dust_collection_status`, `wash_status`, `water_box_status`, and `dock_error_status`, are numeric but do not have one reliable mapping across all Roborock models. They remain available as raw values in `state/json` and their direct `state/<field>` topic. Use the model's documented API or observed values before automating against them.

The values above are based on the installed `homebridge-roborock-matter` client mappings. New values can appear with a Roborock firmware or client update.
