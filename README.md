# Roborock MQTT Bridge

[![CI](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/ci.yml) [![Docs](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/pages.yml/badge.svg)](https://tobiaswaelde.github.io/roborock-mqtt-bridge/) [![Deploy](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/deploy.yml/badge.svg)](https://github.com/tobiaswaelde/roborock-mqtt-bridge/actions/workflows/deploy.yml)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-tobiaswaelde-FFDD00?style=for-the-badge&logo=buymeacoffee)](https://www.buymeacoffee.com/tobiaswaelde)

NestJS bridge between Roborock vacuum accounts and MQTT. Full documentation: [tobiaswaelde.github.io/roborock-mqtt-bridge](https://tobiaswaelde.github.io/roborock-mqtt-bridge/).

## Quick start

```bash
cp config/config.example.yml config/config.yml
# edit config/config.yml
docker compose up -d
```

Minimal configuration:

```yaml
mqtt:
  host: mqtt.example.net
  clientId: roborock-mqtt-bridge
  username: mqtt-user
  password: change-me
http:
  port: 3000
logging:
  level: warn
instances:
  - id: home
    topic: home/roborock/home
    email: robot-account@example.com
    password: change-me
    region: auto
    updateInterval: 30000
```

`mqtt.clientId` may be empty; the bridge then generates a UUID for the running process.

Example command:

```bash
mosquitto_pub -h mqtt.example.net -t 'home/roborock/home/set/json' -m '{"deviceId":"ROBOROCK-DUID","command":"start"}'
```

See the [configuration](https://tobiaswaelde.github.io/roborock-mqtt-bridge/configuration), [MQTT contract](https://tobiaswaelde.github.io/roborock-mqtt-bridge/mqtt), [authentication](https://tobiaswaelde.github.io/roborock-mqtt-bridge/authentication), and [deployment guide](https://tobiaswaelde.github.io/roborock-mqtt-bridge/deployment).
