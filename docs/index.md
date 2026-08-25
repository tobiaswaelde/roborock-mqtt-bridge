---
layout: home

hero:
  name: Roborock MQTT Bridge
  text: Bring Roborock vacuum accounts to MQTT
  tagline: Authenticate cloud accounts, handle two-factor sign-in, and publish supported vacuum commands through MQTT.
  image:
    src: /logo.svg
    alt: Roborock MQTT Bridge logo
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Authentication
      link: /authentication

features:
  - title: Two-factor ready
    details: Complete login and verification through dedicated MQTT authentication topics without restarting the bridge.
  - title: Safe session persistence
    details: Persist only the local authentication session data needed to reconnect.
  - title: Vacuum commands
    details: Discover devices and send supported commands through a documented MQTT contract.
---

Every installation is defined in `config/config.yml`. Continue with [configuration](/configuration), [authentication](/authentication), or the [MQTT contract](/mqtt).

For local WLED controllers in the same MQTT installation, see the [WLED MQTT Bridge documentation](https://tobiaswaelde.github.io/wled-mqtt-bridge/).
