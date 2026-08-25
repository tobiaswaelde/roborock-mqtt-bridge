# MQTT contract

Account availability is `<topic>/connected`. Device data is published below `<topic>/devices/<device-id>/...`; sensitive keys are removed before publishing.

Allowlisted commands use `<topic>/set/json`:

```json
{ "deviceId": "ROBOROCK-DUID", "command": "start" }
```

Supported commands are `start`, `stop`, `pause`, `charge`, and `find`.

All command publications must be non-retained. The bridge clears a successfully received command topic with an empty payload.
