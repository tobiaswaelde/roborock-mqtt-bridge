# MQTT contract

All topics are grouped by their owner. Sensitive keys are removed before state is published.

```text
<topic>/bridge/connected
<topic>/bridge/auth/{request,verify,status}
<topic>/bridge/events/<event>/{json,...}
<topic>/devices/<device-id>/info/{model,name,productModel,serialNumber}
<topic>/devices/<device-id>/state/{json,...}
<topic>/devices/<device-id>/state/{suction_power,suction_power_code}
<topic>/devices/<device-id>/map/current/path
<topic>/devices/<device-id>/rooms/json
<topic>/devices/<device-id>/rooms/<room-id>/{json,...}
<topic>/devices/<device-id>/command/json
<topic>/devices/<device-id>/command/suction_power
```

`state/json` contains the normalized, sanitized status object; the remaining `state/...` topics contain only its direct named scalar values. Arrays and nested objects are not expanded into numeric topic segments. Room data is available separately under `rooms`. `suction_power` is a readable level, while `suction_power_code` is the original Roborock numeric value.

`map/current/path` is retained and contains the absolute path of the latest rendered PNG map. Each changed map is stored atomically below `MAP_STORAGE_PATH/<device-id>/<map-id>.png`, replacing the prior image for that map instead of accumulating files. If the client has not yet reported a map ID, the bridge uses `current.png` in the device directory. Other processes can therefore read the file without handling MQTT image payloads.

Allowlisted actions use a device-scoped JSON command:

```json
{ "command": "start" }
```

Publish it to `<topic>/devices/<device-id>/command/json`. Supported actions are `start`, `stop`, `pause`, `charge`, and `find`.

Set suction power by publishing one of `silent`, `balanced`, `turbo`, `max`, `max_plus`, `off`, or `custom` as a plain payload to `<topic>/devices/<device-id>/command/suction_power`. Available levels depend on the robot model.

All command publications must be non-retained.
